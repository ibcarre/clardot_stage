// lib/scoring.ts

export interface Publication {
  id: string;
  company_name: string;
  info_type: string;
  title: string;
  publication_date: string;
  source_url: string;
  content_snippet?: string;
}

export interface ScoredPublication extends Publication {
  score: number;
  priority_label: string;
  priority_level: "high" | "medium" | "low";
  selected_for_brief: boolean;
  selection_reason: string;
}

const TYPE_WEIGHTS: Record<string, number> = {
  "Résultats annuels": 60,
  "Résultats semestriels": 55,
  "Information financière trimestrielle": 45,
  "Opération sur capital": 40,
  "Franchissement de seuil": 35,
  "Gouvernance": 25,
  "Communiqué divers": 10,
};

const HIGH_IMPACT_KEYWORDS = [
  "bénéfice",
  "perte",
  "chiffre d'affaires",
  "croissance",
  "opa",
  "acquisition",
  "cession",
  "dividende",
  "profit warning",
  "avertissement",
  "reprise",
];

export function evaluatePublication(pub: Publication): ScoredPublication {
  const displayType = pub.info_type && pub.info_type.trim() !== "" ? pub.info_type : "Information générale";
  const typeWeight = TYPE_WEIGHTS[displayType] ?? 15;

  let score = typeWeight;
  const textToCheck = `${pub.title} ${pub.content_snippet || ""}`.toLowerCase();
  const matchedKeywords: string[] = [];

  for (const keyword of HIGH_IMPACT_KEYWORDS) {
    if (textToCheck.includes(keyword)) {
      matchedKeywords.push(keyword);
      score += 10;
    }
  }

  score = Math.min(score, 100);

  // Qualification lisible du niveau de priorité
  let priority_label = "Information standard";
  let priority_level: "high" | "medium" | "low" = "low";

  if (score >= 60) {
    priority_label = "Priorité haute";
    priority_level = "high";
  } else if (score >= 35) {
    priority_label = "Information importante";
    priority_level = "medium";
  }

  let selection_reason = `Publication classée ${priority_label.toLowerCase()} [Type : ${displayType}]`;
  if (matchedKeywords.length > 0) {
    selection_reason += ` — Mots-clés repérés : ${matchedKeywords.join(", ")}`;
  }

  return {
    ...pub,
    info_type: displayType,
    score,
    priority_label,
    priority_level,
    selected_for_brief: false,
    selection_reason,
  };
}

export function selectTopPublications(
  publications: Publication[],
  limit: number = 4
): ScoredPublication[] {
  const scored = publications.map(evaluatePublication);
  scored.sort((a, b) => b.score - a.score);

  return scored.map((pub, index) => ({
    ...pub,
    selected_for_brief: index < limit && pub.score >= 30,
  }));
}
