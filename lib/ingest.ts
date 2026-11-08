import { DATASET, extractRows, getJson, toRow, type Json, type PublicationInsert } from "./api";
import { supabaseAdmin } from "./supabase";
import { selectTopPublications } from "./scoring"; // Import du module de scoring

const PAGE = 100; // maximum accepté par l'endpoint /records
const PARALLEL = 5; // pages demandées en même temps
const DEFAULT_DAYS = 3; // fenêtre utilisée quand la base est vide

async function fetchPage(since: string, offset: number): Promise<Json> {
  const qs = new URLSearchParams({
    limit: String(PAGE),
    offset: String(offset),
    order_by: "uin_dat_amf desc",
    where: `uin_dat_amf >= date'${since}'`,
  });
  return getJson(`/catalog/datasets/${encodeURIComponent(DATASET)}/records?${qs}`);
}

/**
 * Récupère les publications récentes, applique le scoring/sélection, et les insère (upsert) dans Supabase.
 * - `days` fourni : on remonte de `days` jours (utilisé par la route /api/ingest).
 * - sinon : on repart de la dernière publication connue (moins un jour de marge),
 *   ce qui rend l'appel léger quand on le fait à chaque rechargement de page.
 */
export async function ingest({
  days,
  maxRows = 3000,
}: { days?: number; maxRows?: number } = {}) {
  const db = supabaseAdmin();

  let sinceDate: Date;
  if (days) {
    sinceDate = new Date(Date.now() - days * 86_400_000);
  } else {
    const { data } = await db
      .from("publications")
      .select("sent_amf_at")
      .not("sent_amf_at", "is", null)
      .order("sent_amf_at", { ascending: false })
      .limit(1);
    const last = data?.[0]?.sent_amf_at as string | undefined;
    sinceDate = last
      ? new Date(new Date(last).getTime() - 86_400_000)
      : new Date(Date.now() - DEFAULT_DAYS * 86_400_000);
  }
  const since = sinceDate.toISOString().slice(0, 10);

  // Première page : elle donne aussi le nombre total à récupérer.
  const first = await fetchPage(since, 0);
  const batches: Json[][] = [extractRows(first)];
  const total = Math.min(Number(first.total_count) || batches[0].length, maxRows);

  // Pages suivantes, par groupes parallèles.
  const offsets: number[] = [];
  for (let o = PAGE; o < total; o += PAGE) offsets.push(o);
  for (let i = 0; i < offsets.length; i += PARALLEL) {
    const group = await Promise.all(
      offsets.slice(i, i + PARALLEL).map(async (o) => extractRows(await fetchPage(since, o)))
    );
    batches.push(...group);
  }

  const bySource = new Map<string, PublicationInsert>();
  let fetched = 0;
  let skipped = 0;
  for (const batch of batches) {
    fetched += batch.length;
    for (const fields of batch) {
      const row = toRow(fields);
      if (row) bySource.set(row.source_id, row);
      else skipped++;
    }
  }

  const rows = [...bySource.values()];

  // Application du scoring et de la sélection automatique des brèves
  // (Assure-toi que les colonnes score et selected_for_brief existent dans ta table Supabase si tu les stockes)
  const scoredRows = selectTopPublications(rows, 4);

  for (let i = 0; i < scoredRows.length; i += 500) {
    const { error } = await db
      .from("publications")
      // On met ignoreDuplicates à false pour mettre à jour les scores et statuts si nécessaire
      .upsert(scoredRows.slice(i, i + 500), { onConflict: "source_id", ignoreDuplicates: false });
    if (error) throw new Error(`Supabase : ${error.message}`);
  }

  return {
    since,
    fetched,
    upserted: scoredRows.length,
    skipped,
    selectedCount: scoredRows.filter((p: any) => p.selected_for_brief).length
  };
}

/**
 * Lance `ingest()` au plus une fois toutes les `minIntervalSec` secondes, tous visiteurs
 * confondus (l'horodatage est stocké en base). La « réservation » est atomique : si deux
 * visiteurs arrivent en même temps, un seul déclenche l'ingestion.
 */
export async function ingestIfStale(
  minIntervalSec = Number(process.env.INGEST_MIN_INTERVAL_SECONDS ?? 300)
) {
  const db = supabaseAdmin();

  const { data } = await db
    .from("ingest_state")
    .select("last_run_at")
    .eq("id", 1)
    .maybeSingle();
  const prev = data?.last_run_at as string | undefined;

  if (prev && Date.now() - new Date(prev).getTime() < minIntervalSec * 1000) {
    return { skipped: true as const };
  }

  const now = new Date().toISOString();
  const claim = prev
    ? db.from("ingest_state").update({ last_run_at: now }).eq("id", 1).eq("last_run_at", prev).select()
    : db.from("ingest_state").upsert({ id: 1, last_run_at: now }).select();
  const { data: claimed, error } = await claim;
  if (error || !claimed?.length) return { skipped: true as const };

  try {
    return { skipped: false as const, ...(await ingest()) };
  } catch (e) {
    // Échec : on rend la main pour que le prochain visiteur réessaie.
    if (prev) await db.from("ingest_state").update({ last_run_at: prev }).eq("id", 1);
    throw e;
  }
}
