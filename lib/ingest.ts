// lib/ingest.ts
import { DATASET, extractRows, getJson, toRow, type Json, type PublicationInsert } from "./api";
import { supabaseAdmin } from "./supabase";
import { selectTopPublications } from "./scoring";

const PAGE = 100;
const PARALLEL = 5;
const DEFAULT_DAYS = 3;

async function fetchPage(since: string, offset: number): Promise<Json> {
  const qs = new URLSearchParams({
    limit: String(PAGE),
    offset: String(offset),
    order_by: "uin_dat_amf desc",
    where: `uin_dat_amf >= date'${since}'`,
  });
  return getJson(`/catalog/datasets/${encodeURIComponent(DATASET)}/records?${qs}`);
}

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

  const first = await fetchPage(since, 0);
  const batches: Json[][] = [extractRows(first)];
  const total = Math.min(Number(first.total_count) || batches[0].length, maxRows);

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
      if (row) {
        const company =
          (row as any).company ||
          (fields as any).company_name ||
          (fields as any).nom_societe ||
          (fields as any).societe ||
          (fields as any).nom_emetteur ||
          "Société non précisée";

        bySource.set(row.source_id, {
          ...row,
          company,
        });
      } else {
        skipped++;
      }
    }
  }

  const rows = [...bySource.values()];

  // Fix type error via un cast explicite pour le scoring
  const scoredRows = selectTopPublications(rows as any, 4);

  for (let i = 0; i < scoredRows.length; i += 500) {
    const { error } = await db
      .from("publications")
      .upsert(scoredRows.slice(i, i + 500), { onConflict: "source_id", ignoreDuplicates: false });
    if (error) throw new Error(`Supabase : ${error.message}`);
  }

  return {
    since,
    fetched,
    upserted: scoredRows.length,
    skipped,
    selectedCount: scoredRows.filter((p: any) => p.selected_for_brief).length,
  };
}

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
    if (prev) await db.from("ingest_state").update({ last_run_at: prev }).eq("id", 1);
    throw e;
  }
}
