import { createClient } from "@supabase/supabase-js";

function client(key: string | undefined, keyName: string) {
  const url = process.env.SUPABASE_URL;
  if (!url || !key) {
    throw new Error(
      `Configuration Supabase manquante : définis SUPABASE_URL et ${keyName} dans .env.local.`
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// Lecture (soumise à la RLS) : utilisée par la page.
export const supabaseAnon = () =>
  client(process.env.SUPABASE_ANON_KEY, "SUPABASE_ANON_KEY");

// Écriture : uniquement côté serveur, pour l'ingestion.
export const supabaseAdmin = () =>
  client(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
