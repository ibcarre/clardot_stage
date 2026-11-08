// app/api/ingest/route.ts
import { NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await ingest();
    return NextResponse.json({
      success: true,
      ...result,
      message: `Ingestion réussie : ${result.upserted} publications traitées.`,
    });
  } catch (error: any) {
    console.error("Erreur critique /api/ingest:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erreur serveur lors de l'ingestion" },
      { status: 500 }
    );
  }
}
