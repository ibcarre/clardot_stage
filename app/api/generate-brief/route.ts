// app/api/generate-brief/route.ts
import { NextResponse } from "next/server";
import { generateBriefForPublication } from "@/lib/llm";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { publicationId } = await req.json();
    const db = supabaseAdmin();

    const { data: pub, error } = await db
      .from("publications")
      .select("*")
      .eq("id", publicationId)
      .single();

    if (error || !pub) {
      return NextResponse.json({ error: "Publication introuvable" }, { status: 404 });
    }

    const brief = await generateBriefForPublication(pub);

    return NextResponse.json({ success: true, brief });
  } catch (e: any) {
    console.error("Erreur LLM:", e);
    return NextResponse.json(
      { error: e.message || "Erreur de génération" },
      { status: 500 }
    );
  }
}
