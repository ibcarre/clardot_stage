// lib/llm.ts
import { GoogleGenAI, Type } from "@google/genai";

export interface BriefGenerationResult {
  title: string;
  content: string;
  key_figures: string[];
  verified: boolean;
  verification_notes: string;
}

export async function generateBriefForPublication(pub: {
  title: string;
  company_name: string;
  info_type: string;
  content_snippet?: string;
}): Promise<BriefGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Clé GEMINI_API_KEY manquante dans .env.local");
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
En tant que journaliste financier expert, rédige une brève d'actualité de 100 à 150 mots en français basée sur cette publication réglementée de l'AMF :

Société : ${pub.company_name}
Type : ${pub.info_type}
Titre : ${pub.title}
Extrait / Détails : ${pub.content_snippet || 'Non disponible'}

Règles impératives :
1. La brève doit contenir un titre accrocheur, les faits clés et les chiffres principaux s'ils existent dans l'extrait.
2. Liste explicitement les chiffres (montants, pourcentages, dates) mentionnés dans ta brève dans le champ key_figures.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            key_figures: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["title", "content", "key_figures"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Réponse vide de Gemini");
    }

    const result = JSON.parse(resultText);

    // Contrôle croisé des chiffres dans l'extrait source
    const sourceText = `${pub.title} ${pub.content_snippet || ""}`.toLowerCase();
    let allFiguresVerified = true;
    let notes = "Tous les chiffres clés figurent dans le document source.";

    for (const fig of result.key_figures || []) {
      if (!sourceText.includes(String(fig).toLowerCase())) {
        allFiguresVerified = false;
        notes = `Attention : Le chiffre/terme "${fig}" généré par l'IA n'a pas été trouvé textuellement dans l'extrait source.`;
        break;
      }
    }

    return {
      title: result.title,
      content: result.content,
      key_figures: result.key_figures || [],
      verified: allFiguresVerified,
      verification_notes: notes,
    };
  } catch (error: any) {
    console.error("Erreur Gemini API :", error);
    throw new Error(error.message || "Erreur de génération avec Gemini");
  }
}
