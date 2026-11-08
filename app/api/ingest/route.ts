import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchAmfPublications } from "@/lib/publications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = supabaseAdmin();
    const rawPublications = await fetchAmfPublications();

    if (!rawPublications || rawPublications.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "Aucune nouvelle publication récupérée depuis l'API AMF.",
      });
    }

    let insertedCount = 0;

    for (const item of rawPublications) {
      // Récupération et normalisation robuste du champ company
      const company =
        item.company ||
        item.company_name ||
        item.nom_societe ||
        item.societe ||
        item.nom_emetteur ||
        "Société non précisée";

      const title = item.title || item.titre || "Sans titre";
      const info_type = item.info_type || item.type_information || item.type || "Information générale";
      const sent_amf_at = item.publication_date || item.sent_amf_at || item.date || new Date().toISOString();
      const source_url = item.source_url || item.url || "";
      const content_snippet = item.content_snippet || item.extrait || item.description || "";

      const { error } = await db.from("publications").upsert(
        {
          company,
          title,
          info_type,
          sent_amf_at,
          source_url,
          content_snippet,
        },
        { onConflict: "source_url" }
      );

      if (!error) {
        insertedCount++;
      } else {
        console.error("Erreur insertion Supabase :", error.message);
      }
    }

    return NextResponse.json({
      success: true,
      count: insertedCount,
      message: `Ingestion réussie : ${insertedCount} publications traitées.`,
    });
  } catch (error: any) {
    console.error("Erreur critique /api/ingest:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erreur serveur lors de l'ingestion" },
      { status: 500 }
    );
  }
}
