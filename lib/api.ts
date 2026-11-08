export const BASE =
  process.env.INFO_FIN_API_BASE ??
  "https://www.info-financiere.gouv.fr/api/explore/v2.0";

export const DATASET = process.env.INFO_FIN_DATASET || "flux-amf-new-prod";

export type Json = Record<string, any>;

// Champs du jeu de données « flux-amf-new-prod » (relevés dans le catalogue de l'API).
export const F = {
  codeDif: "identificationdiffuseur_idi_cod_dif",
  uin: "uin_idt_uin",
  title: "informationdeposee_inf_tit_inf",
  company: "identificationsociete_iso_nom_soc",
  type: "type_d_information",
  typeCode: "informationdeposee_inf_stp_pri",
  subtype: "sous_type_d_information",
  sentAmf: "uin_dat_amf",
  sentIssuer: "informationdeposee_inf_dat_emt",
  url: "url_de_recuperation",
  lang: "informationdeposee_inf_lng_inf",
  status: "informationdeposee_inf_upg_inf_inf_upg_sts",
  isin: "identificationsociete_iso_cd_isi",
  lei: "identificationsociete_iso_cd_lei",
  country: "identificationsociete_iso_pay_ss",
  cac40: "name_cac40",
  file: "fichierdecontenu_inf_fic_nom",
} as const;

export async function getJson(path: string): Promise<Json> {
  const url = BASE + path;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `L’API a répondu ${res.status} sur ${url}${detail ? ` : ${detail.slice(0, 300)}` : ""}`
    );
  }
  return res.json();
}

// Réponse « plate » (results: [...]) ou imbriquée (records: [{ record: { fields } }]).
export function extractRows(data: Json): Json[] {
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.records)) {
    return data.records.map((r: Json) => r.record?.fields ?? r.fields ?? r);
  }
  return [];
}

export function str(fields: Json, key: string): string | undefined {
  const v = fields[key];
  if (v == null || typeof v === "object") return undefined;
  const s = String(v).trim();
  return s || undefined;
}

export type PublicationInsert = {
  source_id: string;
  company: string | null;
  isin: string | null;
  lei: string | null;
  country: string | null;
  title: string | null;
  type: string | null;
  type_code: string | null;
  subtype: string | null;
  language: string | null;
  status: string | null;
  sent_amf_at: string | null;
  issuer_sent_at: string | null;
  url: string | null;
  filename: string | null;
  cac40_name: string | null;
  raw: Json;
};

// Transforme un enregistrement de l'API en ligne de base. Renvoie null s'il n'a pas
// d'identifiant exploitable (on ne peut alors ni dédoublonner ni retrouver la publication).
export function toRow(fields: Json): PublicationInsert | null {
  const uin = str(fields, F.uin);
  const file = str(fields, F.file) ?? str(fields, "filename");
  const sourceId = uin
    ? `${str(fields, F.codeDif) ?? "?"}:${uin}`
    : file;
  if (!sourceId) return null;

  const rawUrl = str(fields, F.url);
  return {
    source_id: sourceId,
    company: str(fields, F.company) ?? null,
    isin: str(fields, F.isin) ?? null,
    lei: str(fields, F.lei) ?? null,
    country: str(fields, F.country) ?? null,
    title: str(fields, F.title) ?? null,
    type: str(fields, F.type) ?? null,
    type_code: str(fields, F.typeCode) ?? null,
    subtype: str(fields, F.subtype) ?? null,
    language: str(fields, F.lang) ?? null,
    status: str(fields, F.status) ?? null,
    sent_amf_at: str(fields, F.sentAmf) ?? null,
    issuer_sent_at: str(fields, F.sentIssuer) ?? null,
    url: rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null,
    filename: file ?? null,
    cac40_name: str(fields, F.cac40) ?? null,
    raw: fields,
  };
}

export function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
}

export function formatDay(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: "Europe/Paris",
  }).format(d);
}
