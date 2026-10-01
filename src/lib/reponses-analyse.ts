// Les réponses d'erreur communes aux routes de l'analyse « data analyst » (/api/analyse-commercial, /api/analyse-tm,
// /api/analyse-sales-rm) : mêmes messages que le brief, pour un échec de Gemini après tous les réessais.
import "server-only";
import type { AnalyseIaReponse } from "@/lib/brief-tm";
import type { EchecGemini } from "@/lib/gemini";

export function erreurAnalyse(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies AnalyseIaReponse, { status });
}

const MESSAGES: Record<EchecGemini, { message: string; status: number }> = {
  quota: { message: "Trop de demandes en peu de temps, patiente 1 minute et réessaie.", status: 429 },
  indisponible: { message: "Les serveurs de Google sont surchargés pour le moment, réessaie dans un instant.", status: 503 },
  illisible: { message: "Gemini a renvoyé une analyse incomplète. Réessaie.", status: 422 },
  images: { message: "Gemini a refusé la demande. Réessaie dans un instant.", status: 422 },
  cle: { message: "Clé Gemini refusée : vérifie GEMINI_API_KEY dans .env.local.", status: 500 },
  "aucun-modele": {
    message: "Aucun des modèles Gemini configurés n'est disponible pour ta clé : vérifie GEMINI_MODELS dans .env.local.",
    status: 500,
  },
};

export function echecAnalyse(raison: EchecGemini) {
  const { message, status } = MESSAGES[raison];
  return erreurAnalyse(message, status, raison === "indisponible" || raison === "illisible");
}

export const analyseOk = (analyseIa: AnalyseIaReponse & { ok: true }) => Response.json(analyseIa satisfies AnalyseIaReponse);
