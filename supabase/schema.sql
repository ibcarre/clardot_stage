-- À exécuter une fois dans Supabase : SQL Editor > New query > Run.

create table if not exists public.publications (
  id             bigint generated always as identity primary key,
  source_id      text not null unique,   -- « code diffuseur : identifiant d'unité d'information »
  company        text,
  isin           text,
  lei            text,
  country        text,
  title          text,
  type           text,
  type_code      text,
  subtype        text,
  language       text,
  status         text,
  sent_amf_at    timestamptz,
  issuer_sent_at timestamptz,
  url            text,
  filename       text,
  cac40_name     text,
  raw            jsonb,                  -- enregistrement brut de l'API, pour ne rien perdre
  ingested_at    timestamptz not null default now()
);

create index if not exists publications_sent_amf_idx on public.publications (sent_amf_at desc);
create index if not exists publications_type_idx     on public.publications (type);
create index if not exists publications_company_idx  on public.publications (company);

-- Lecture publique (clé anon), écriture réservée à la clé service_role (qui ignore la RLS).
alter table public.publications enable row level security;

drop policy if exists "lecture publique" on public.publications;
create policy "lecture publique" on public.publications for select using (true);

-- Liste des types pour le filtre.
create or replace view public.publication_types
  with (security_invoker = on) as
  select type, count(*)::int as total
  from public.publications
  where type is not null
  group by type;

grant select on public.publication_types to anon, authenticated;

-- Horodatage de la dernière ingestion, partagé entre tous les visiteurs (anti-rafale).
-- RLS activée sans politique : seule la clé service_role y accède.
create table if not exists public.ingest_state (
  id          int primary key default 1 check (id = 1),
  last_run_at timestamptz not null default 'epoch'
);
insert into public.ingest_state (id) values (1) on conflict do nothing;
alter table public.ingest_state enable row level security;
