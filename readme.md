# 📈 AMF Financial Briefs — Veille Réglementée & Synthèse IA

> **Projet déployé en ligne :** [https://clardot-stage.vercel.app/](https://clardot-stage.vercel.app/)  
> **Temps réel passé :** 2h45 (Début : 11h00 — Fin : 13h45)

Application Web moderne développée avec **Next.js (App Router)**, **TypeScript** et **Supabase**. Elle ingère automatiquement les flux d'informations financières réglementées de l'AMF (publiés via l'API OpenDataSoft de data.gouv.fr / info-financiere.gouv.fr), filtre le bruit du marché grâce à un algorithme de scoring, et génère des brèves synthétiques augmentées par IA (Google Gemini) avec contrôle d'exactitude des données financières.

---

## 🛠 1. Choix Techniques

* **Framework Full-stack :** **Next.js 15 (App Router)** pour une architecture hybride (Server Components pour les requêtes DB/API et Client Components pour l'UI réactive).
* **Base de données & Backend :** **Supabase (PostgreSQL)** avec accès sécurisé via client d'administration (`supabaseAdmin`) et anonyme (`supabaseAnon`). Clé unique basée sur l'identifiant source (`source_url` / `source_id`) pour un `upsert` idempotent sans doublons.
* **UI & Styling :** **Tailwind CSS** et composants d'accordéon réactifs (mise en page moderne avec indicateur de chargement dynamique pour l'IA).
* **Moteur d'IA :** **Google Gemini 2.5 Flash** (`@google/genai`) paramétré avec `responseSchema` pour forcer des sorties JSON structurées sans dérive de format.
* **Déploiement :** **Vercel** avec validation de build TypeScript stricte.

---

## 🔍 2. Compréhension de la Structure des Données

L'exploration de l'API OpenDataSoft (`https://www.info-financiere.gouv.fr/api/explore/v2.0` / dataset `flux-amf-new-prod` regroupant plus de 540 000 enregistrements) a révélé plusieurs spécificités et imperfections qu'il a fallu normaliser :

1. **Hétérogénéité des clés de nommage :** Le nom de la société varie selon les émetteurs ou les révisions (`company`, `company_name`, `identificationsociete_iso_nom_soc`, `nom_societe`, `societe`, `nom_emetteur`). Une chaîne de secours (`fallback`) assigne la valeur `"Société non précisée"` en dernier recours.
2. **Métadonnées vs Contenu :** Le flux ne fournit que les métadonnées de dépôt (`uin_dat_amf`, `informationdeposee_inf_tit_inf`, `type_d_information`). Le texte complet se situe dans le document rattaché via `url_de_recuperation`.
3. **Dates sentinelles :** Le champ `uin_dat_mar` contient parfois des dates fictives (`01/01/9999` ou `01/01/8888`) pour indiquer des diffusions réservées ou inconnues. L'ingestion trie et filtre exclusivement sur `uin_dat_amf` (date de dépôt effective à l'AMF).
4. **Types multivalués & Référentiel LOV :** Les types d'informations sont codés selon le référentiel LOV (`informationdeposee_inf_stp_inf`). Le système extrait en priorité le type principal (`informationdeposee_inf_stp_pri`).

---

## 🎯 3. Critère de Sélection des Publications (Scoring)

Afin d'éliminer le bruit quotidien et d'isoler les publications à fort impact pour un investisseur ou un journaliste financier, un système de scoring par règles (lisible et déterministe) a été implémenté (`lib/scoring.ts`) :

* **Priorité HAUTE (+50 pts) :** Résultats annuels/semestriels, opérations sur le capital, offres publiques (OPA/OPE), franchissements de seuil, communiqués d'information permanente stratégiques.
* **Priorité MOYENNE (+25 pts) :** Rapports financiers trimestriels, gouvernance, assemblées générales.
* **Priorité BASSE / Écartés (-30 pts) :** Droits de vote mensuels, descriptifs de programmes de rachat d'actions routiniers, déclarations de contrats de liquidité, honoraires des contrôleurs légaux.
* **Bonus contextuels :** Présence de chiffres clés/pourcentages dans le titre (+10 pts), entreprise du CAC 40 (+15 pts).

Seules les publications atteignant le seuil de sélection (`selected_for_brief: true`) sont proposées en priorité pour la génération de brèves IA.

---

## 📐 4. Contrôle de l'Exactitude des Chiffres (Fact-Checking)

Le module de vérification garantit que le LLM n'invente aucun chiffre (hallucination) lors de la rédaction de la brève :

1. **Extraction par Regex :** Détection automatique de tous les nombres, montants et pourcentages dans la brève générée (`/(\d+(?:[\.,]\d+)?\s*(?:%|M€|M$|milliards?|millions?|€|\$)?)/g`).
2. **Normalisation :** Harmonisation des formats numériques (convertissant `"1 234,5"` en `1234.5`, `"1,2 Md€"` en `1200M€`).
3. **Matching contextuel :** Validation de la présence de chaque valeur numérique dans le texte extrait du document source (`content_snippet` / extrait de publication).
4. **Attribution d'un statut :**
   * ✅ **Trouvé :** Chiffre directement confirmé dans la source.
   * ⚠️ **À vérifier / Non vérifiable :** Valeur recalculée (ex: variation en % calculée par l'IA), arrondi, ou document source au format PDF scanné sans texte brut.
   * ❌ **Absent :** Alerte d'hallucination potentielle.

---

## 🤖 5. Prompts Clés & Retour d'Expérience IA

### Prompt 1 : Extraction & Normalisation JSON de l'Ingestion
```text
Tu es un parseur de données financières strict. Reçois le payload brut d'une publication AMF et extrait :
- Nom exact de la société (regarde company, nom_emetteur ou iso_nom_soc)
- Type d'information et niveau d'importance (HIGH, MEDIUM, LOW)
Retourne UNIQUEMENT un objet JSON valide.
```

### Prompt 2 : Génération de la Brève Synthétique
```text
Tu es un rédacteur financier senior pour Bloomberg/Reuters. À partir du communiqué suivant, rédige une brève factuelle de 100 à 150 mots maximum.
Règles strictes :
1. Titre percutant incluant la société et l'événement clé.
2. Contenu en 2-3 paragraphes : les faits, les chiffres clés, les perspectives.
3. Ne cite QUE des chiffres présents dans le texte. Ne fais AUCUNE supposition.
```

### Prompt 3 : Contrôle de Cohérence et Extraction de Chiffres
```text
Compare la brève rédigée avec le document source original.
Pour chaque valeur chiffrée présente dans la brève, renvoie la phrase exacte du document source qui la justifie.
Si une donnée n'est pas directement trouvable, indique verified: false.
```

### 🔍 Erreur IA détectée durant le développement :
* **Problème d'unité (Facteur 1 000) :** Sur un communiqué de résultats, l'API Gemini a extrait un chiffre d'affaires affiché dans le document source à `"1 450 K€"` et a rédigé dans la brève `"un chiffre d'affaires de 1,45 million d'euros"`. Bien que la valeur mathématique soit exacte, le module de vérification strict par regex a initialement levé une alerte ⚠️ (*chiffre 1.45 absent de la source*) car la source écrivait `1 450`. Cela a nécessité d'ajouter une étape de normalisation d'unités ($K€ \rightarrow M€$) dans le parser.

---

## ⏱ 6. Bilan Horaire Réel (2h45)

| Étape | Temps prévu | Temps réel | Réalisations |
| :--- | :---: | :---: | :--- |
| **1. Exploration API & Schéma DB** | 30 min | **35 min** | Inspection API Opendatasoft AMF, cartographie des champs, création des types TS et tables Supabase. |
| **2. Ingestion & Normalisation** | 45 min | **40 min** | Écriture de `lib/ingest.ts`, gestion de la pagination par lots et déduplication `upsert`. |
| **3. UI / Filtres / Accordéons** | 45 min | **45 min** | Interface Next.js App Router, filtres par entreprise et type, animations d'accordéon et statut de chargement. |
| **4. Scoring & Brèves Gemini** | 45 min | **30 min** | Module `lib/scoring.ts`, route API `/api/generate-brief` avec prompt Gemini structuré. |
| **5. Build Vercel & Documentation** | 30 min | **15 min** | Correction des types TypeScript strict (`PublicationInsert`), déploiement Vercel et création du README. |

---

## 🚀 7. Pistes d'Amélioration (Avec plus de temps)

1. **Parser de documents PDF/HTML complexes :** Intégrer un OCR ou un parseur `pdf-parse` côté serveur pour extraire le texte intégral des fichiers PDF attachés (`url_de_recuperation`) plutôt que de se limiter aux extraits de métadonnées.
2. **File d'attente d'ingestion asynchrone (Background Workers) :** Utiliser Vercel Cron ou Upstash QStash pour exécuter l'ingestion périodiquement en arrière-plan sans bloquer les requêtes d'API UI.
3. **Cache des brèves générées :** Enregistrer les brèves générées directement dans Supabase (`brief_content`, `brief_verified`) pour éviter de reconsommer les quotas de l'API Gemini lors des visites ultérieures.