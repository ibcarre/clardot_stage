"use client";

import { useState, useEffect } from "react";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr === "Date non disponible") return "Date inconnue";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return dateStr;
  }
}

export default function Page() {
  const [publications, setPublications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [searchCompany, setSearchCompany] = useState("");
  const [briefs, setBriefs] = useState<Record<string, any>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let timer: any;
    if (loadingId) {
      setElapsedTime(0);
      timer = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [loadingId]);

  const fetchPublications = async () => {
    try {
      const res = await fetch("/api/publications");
      const data = await res.json();
      if (data.success && data.data) {
        setPublications(data.data);
        return data.data;
      }
      return [];
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  useEffect(() => {
    async function init() {
      setLoading(true);
      const pubs = await fetchPublications();
      if (pubs.length === 0) {
        try {
          await fetch("/api/ingest");
          await fetchPublications();
        } catch (e) {
          console.error("Erreur ingestion auto", e);
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/ingest");
      await fetchPublications();
    } catch (e) {
      alert("Erreur lors de l'actualisation.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleGenerateBrief = async (publicationId: string) => {
    setLoadingId(publicationId);
    try {
      const res = await fetch("/api/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationId }),
      });
      const data = await res.json();
      if (data.success) {
        setBriefs((prev) => ({ ...prev, [publicationId]: data.brief }));
      } else {
        alert(data.error || "Erreur de génération");
      }
    } catch {
      alert("Erreur réseau");
    } finally {
      setLoadingId(null);
    }
  };

  const toggleAccordion = (id: string) => {
    setOpenAccordions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredPublications = publications.filter((p) => {
    const matchesSelected = selectedOnly ? p.selected_for_brief : true;
    const company = p.company || p.company_name || "";
    const matchesCompany =
      searchCompany.trim() === "" ||
      company.toLowerCase().includes(searchCompany.toLowerCase());
    return matchesSelected && matchesCompany;
  });

  return (
    <main className="min-h-screen bg-slate-50/50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8 font-sans antialiased">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                AMF Financial Briefs
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Veille réglementée et génération automatique de brèves par IA.
              </p>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center justify-center h-9 px-4 rounded-md text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
            >
              {refreshing ? "Mise à jour..." : "🔄 Actualiser"}
            </button>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Filtrer par entreprise (ex: Total, Sanofi)..."
                value={searchCompany}
                onChange={(e) => setSearchCompany(e.target.value)}
                className="w-full h-9 pl-3 pr-8 rounded-md border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 shadow-2xs"
              />
              {searchCompany && (
                <button
                  onClick={() => setSearchCompany("")}
                  className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <label className="flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 shadow-2xs cursor-pointer hover:bg-slate-50 shrink-0">
              <input
                type="checkbox"
                checked={selectedOnly}
                onChange={(e) => setSelectedOnly(e.target.checked)}
                className="rounded border-slate-300 text-slate-900 focus:ring-slate-400 h-3.5 w-3.5"
              />
              <span>Top sélection uniquement</span>
            </label>
          </div>
        </div>

        {/* Content List */}
        {loading ? (
          <div className="text-center py-16 text-xs text-slate-400">
            Chargement des publications...
          </div>
        ) : filteredPublications.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
            <p className="text-xs text-slate-500">Aucune publication trouvée.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPublications.map((pub) => {
              const brief = briefs[pub.id];
              const formattedDate = formatDate(pub.publication_date || pub.sent_amf_at);
              const companyName = pub.company || pub.company_name || "Société non précisée";
              const isOpen = openAccordions[pub.id] || false;
              const isThisLoading = loadingId === pub.id;

              return (
                <div
                  key={pub.id}
                  className={`bg-white rounded-xl border p-5 space-y-3.5 transition-all shadow-2xs ${
                    pub.selected_for_brief
                      ? "border-slate-300 ring-1 ring-slate-200"
                      : "border-slate-200/80"
                  }`}
                >
                  {/* Meta Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60">
                        {companyName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {pub.info_type}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">
                        {formattedDate}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                          pub.priority_level === "high"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                            : pub.priority_level === "medium"
                            ? "bg-amber-50 text-amber-700 border-amber-200/60"
                            : "bg-slate-50 text-slate-600 border-slate-200/60"
                        }`}
                      >
                        {pub.priority_label}
                      </span>
                    </div>
                  </div>

                  {/* TITRE CLIQUABLE EN BLEU PASTEL */}
                  <div>
                    <h2
                      onClick={() => toggleAccordion(pub.id)}
                      className="text-sm font-normal text-sky-700 hover:text-sky-900 cursor-pointer transition-colors leading-snug flex items-center justify-between gap-2 bg-sky-50/50 hover:bg-sky-50 px-3 py-2 rounded-lg border border-sky-100/60"
                    >
                      <span>{pub.title}</span>
                      <span className="text-[11px] text-sky-500 shrink-0 font-medium">{isOpen ? "▲" : "▼"}</span>
                    </h2>

                    {pub.source_url && (
                      <a
                        href={pub.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-1 text-[11px] font-medium text-slate-400 hover:text-slate-700 underline underline-offset-2 ml-1"
                      >
                        Document source AMF →
                      </a>
                    )}
                  </div>

                  {/* ACCORDÉON (Analyse + Bouton Générer) */}
                  {isOpen && (
                    <div className="mt-3 space-y-3 pt-3 border-t border-slate-100 bg-slate-50/60 p-3.5 rounded-lg">
                      {pub.selection_reason && (
                        <div className="text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-800">Analyse du score :</span>{" "}
                          {pub.selection_reason}
                        </div>
                      )}

                      {!brief && (
                        <div className="space-y-2 pt-1">
                          <button
                            onClick={() => handleGenerateBrief(pub.id)}
                            disabled={loadingId !== null}
                            className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                          >
                            {isThisLoading ? (
                              <>
                                <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                Génération en cours ({elapsedTime}s)...
                              </>
                            ) : (
                              "✨ Générer la brève IA"
                            )}
                          </button>

                          {isThisLoading && elapsedTime > 30 && (
                            <p className="text-[11px] text-amber-600 animate-pulse">
                              C'est normal, c'est la version gratuite de l'API, les serveurs mettent un peu de temps à répondre... Merci de patienter 🙏
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Brief Result */}
                  {brief && (
                    <div className="mt-3 bg-slate-50/80 rounded-lg p-4 border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Brève rédigée par Gemini
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-slate-900">{brief.title}</h3>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                        {brief.content}
                      </p>

                      <div
                        className={`mt-2 p-2.5 rounded-md text-[11px] flex items-start gap-2 border ${
                          brief.verified
                            ? "bg-emerald-50/60 text-emerald-800 border-emerald-200"
                            : "bg-amber-50/60 text-amber-800 border-amber-200"
                        }`}
                      >
                        <span className="text-xs">{brief.verified ? "✅" : "⚠️"}</span>
                        <div>
                          <span className="font-medium block">
                            {brief.verified
                              ? "Contrôle des données validé"
                              : "Contrôle à vérifier"}
                          </span>
                          <span className="text-[10px] opacity-90">
                            {brief.verification_notes}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

