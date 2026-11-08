// lib/publications.ts
import { formatDateTime, DATASET, extractRows, getJson, toRow, type Json, type PublicationInsert } from "./api";
import { supabaseAnon } from "./supabase";

export type PublicationRow = {
  id: number;
  company: string | null;
  isin: string | null;
  lei: string | null;
  country: string | null;
  title: string | null;
  type: string | null;
  subtype: string | null;
  language: string | null;
  status: string | null;
  sent_amf_at: string | null;
  issuer_sent_at: string | null;
  url: string | null;
  filename: string | null;
  cac40_name: string | null;
};

export type Filters = { q?: string; type?: string; from?: string; to?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const validDay = (v?: string) => (v && DAY.test(v) ? v : undefined);

function nextDay(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function listPublications(f: Filters, limit = 50) {
  try {
    let query = supabaseAnon()
      .from("publications")
      .select(
        "id,company,isin,lei,country,title,type,subtype,language,status,sent_amf_at,issuer_sent_at,url,filename,cac40_name",
        { count: "exact" }
      )
      .order("sent_amf_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (f.q) query = query.ilike("company", `%${f.q.replace(/[%,()]/g, " ")}%`);
    if (f.type) query = query.eq("type", f.type);
    if (f.from) query = query.gte("sent_amf_at", f.from + "T00:00:00Z");
    if (f.to) query = query.lt("sent_amf_at", nextDay(f.to));

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as PublicationRow[], total: count ?? 0 };
  } catch (e) {
    return {
      rows: [] as PublicationRow[],
      total: 0,
      error: e instanceof Error ? e.message : "Erreur de lecture Supabase.",
    };
  }
}

export async function listTypes(): Promise<{ type: string; total: number }[]> {
  try {
    const { data } = await supabaseAnon()
      .from("publication_types")
      .select("type,total")
      .order("total", { ascending: false });
    return (data ?? []) as { type: string; total: number }[];
  } catch {
    return [];
  }
}

export function detailsOf(r: PublicationRow): [string, string][] {
  const candidates: [string, string | null | undefined][] = [
    ["Société", r.company],
    ["Type d’information", r.type],
    ["Sous-type", r.subtype],
    ["Envoyé à l’AMF", r.sent_amf_at && formatDateTime(r.sent_amf_at)],
    ["Transmis par l’émetteur", r.issuer_sent_at && formatDateTime(r.issuer_sent_at)],
    ["Langue", r.language],
    ["Statut", r.status],
    ["ISIN", r.isin],
    ["LEI", r.lei],
    ["Siège social", r.country],
    ["CAC 40", r.cac40_name],
    ["Fichier", r.filename],
  ];
  return candidates.filter((c): c is [string, string] => Boolean(c[1]));
}

/**
 * Récupère les publications récentes depuis l'API de l'AMF / data.gouv.fr
 */
export async function fetchAmfPublications(limit = 100): Promise<PublicationInsert[]> {
  try {
    const qs = new URLSearchParams({
      limit: String(limit),
      order_by: "uin_dat_amf desc",
    });

    const json = await getJson(`/catalog/datasets/${encodeURIComponent(DATASET)}/records?${qs}`);
    const rawRows = extractRows(json);

    const publications: PublicationInsert[] = [];

    for (const fields of rawRows) {
      const row = toRow(fields);
      if (row) {
        const company =
          (fields as any).company ||
          (fields as any).company_name ||
          (fields as any).nom_societe ||
          (fields as any).societe ||
          (fields as any).nom_emetteur ||
          "Société non précisée";

        publications.push({
          ...row,
          company,
        } as PublicationInsert);
      }
    }

    return publications;
  } catch (error) {
    console.error("Erreur lors de la récupération des publications AMF :", error);
    return [];
  }
}
