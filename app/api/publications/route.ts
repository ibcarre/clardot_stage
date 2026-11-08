// app/api/publications/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { selectTopPublications } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = supabaseAdmin();

    // Récupération des publications classées par date d'envoi AMF (sent_amf_at) ou ID
    const { data: rawRows, error } = await db
      .from("publications")
      .select("*")
      .order("sent_amf_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Erreur Supabase /publications:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Normalisation des objets pour s'assurer que les propriétés requises par l'interface sont définies
    const normalizedRows = (rawRows || []).map((row: any) => ({
      ...row,
      publication_date: row.publication_date || row.sent_amf_at || "Date inconnue",
    }));

    // Application du scoring et sélection des tops brèves en mémoire
    const publications = selectTopPublications(normalizedRows, 4);

    return NextResponse.json({
      success: true,
      count: publications.length,
      data: publications,
    });
  } catch (e: any) {
    console.error("Erreur critique /publications:", e);
    return NextResponse.json(
      { error: e.message || "Erreur serveur lors de la récupération" },
      { status: 500 }
    );
  }
}
