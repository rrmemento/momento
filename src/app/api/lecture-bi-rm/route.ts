// Lecture des 2 captures du BI RM par Gemini (réservée aux RM).
// Reçoit 2 images (formulaire multipart, champ « images », dans l'ordre : screen 2 avec les noms, puis screen 1),
// assemble ligne N avec ligne N, puis reconnaît les TM du RM et leurs sales. Rien n'est enregistré ici.
import { getCommerciauxDesTM } from "@/lib/commerciaux";
import { type EchecGemini, genererAvecSecours } from "@/lib/gemini";
import { TAILLE_MAX_IMAGE, TYPES_IMAGE } from "@/lib/lecture-bi";
import {
  assemblerReponse,
  CAPTURES_BI_RM,
  type LectureBiRmReponse,
  type LigneBiRm,
  PROMPT_BI_RM,
  reconnaitreLignes,
} from "@/lib/lecture-bi-rm";
import { getCurrentManager, getMesTM } from "@/lib/managers";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

function erreur(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies LectureBiRmReponse, { status });
}

// Mêmes messages que l'import des TM.
const MESSAGES: Record<EchecGemini, { message: string; status: number }> = {
  quota: { message: "Trop de demandes en peu de temps, patiente 1 minute et réessaie.", status: 429 },
  indisponible: { message: "Les serveurs de Google sont surchargés pour le moment (erreur 503).", status: 503 },
  illisible: {
    message: "Gemini n'a pas réussi à lire les tableaux. Réessaie, ou refais des captures plus nettes et complètes.",
    status: 422,
  },
  images: {
    message: "Gemini a refusé les captures. Vérifie que ce sont bien des images nettes et réessaie.",
    status: 422,
  },
  cle: { message: "Clé Gemini refusée : vérifie GEMINI_API_KEY dans .env.local.", status: 500 },
  "aucun-modele": {
    message: "Aucun des modèles Gemini configurés n'est disponible pour ta clé : vérifie GEMINI_MODELS dans .env.local.",
    status: 500,
  },
};

export async function POST(request: Request) {
  // Le proxy bloque déjà les visiteurs non connectés ; ici on vérifie en plus que c'est un RM.
  const manager = await getCurrentManager();
  if (!manager) return erreur("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);
  if (manager.role !== "RM") return erreur("Import réservé aux RM.", 403);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreur("Lecture automatique indisponible : clé Gemini non configurée.", 500);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return erreur("Envoi invalide : les captures doivent être envoyées en formulaire.", 400);
  }

  const images = form.getAll("images").filter((v): v is File => v instanceof File);
  if (images.length !== CAPTURES_BI_RM.length) return erreur(`Il faut exactement ${CAPTURES_BI_RM.length} captures.`, 400);
  for (const image of images) {
    if (!TYPES_IMAGE.includes(image.type)) return erreur(`« ${image.name} » n'est pas une image PNG, JPEG ou WebP.`, 400);
    if (image.size > TAILLE_MAX_IMAGE) return erreur(`« ${image.name} » dépasse 5 Mo.`, 400);
  }

  // Chaque image est précédée de son libellé, pour que Gemini sache laquelle est l'IMAGE 2 (noms) et l'IMAGE 1.
  const imageParts = await Promise.all(
    images.map(async (image) => ({
      inlineData: { mimeType: image.type, data: Buffer.from(await image.arrayBuffer()).toString("base64") },
    })),
  );
  const contenu = CAPTURES_BI_RM.flatMap((c, i) => [{ text: `IMAGE ${c.code} — "${c.titre}" :` }, imageParts[i]]);

  // Un nombre de lignes différent entre les 2 captures est une vraie réponse (pas une panne) : on le garde pour le dire.
  const lu: { decalage: [number, number] | null } = { decalage: null };
  const lecture = await genererAvecSecours(apiKey, [{ role: "user", parts: [{ text: PROMPT_BI_RM }, ...contenu] }], (texte) => {
    const r = assemblerReponse(texte);
    if (r && "decalage" in r) {
      lu.decalage = r.decalage;
      return [] as LigneBiRm[];
    }
    return r;
  });
  if (!lecture.ok) {
    const { message, status } = MESSAGES[lecture.raison];
    return erreur(message, status, lecture.raison === "indisponible");
  }
  console.info(`[lecture-bi-rm] Captures lues par ${lecture.modele}`);

  if (lu.decalage) {
    const [n2, n1] = lu.decalage;
    return erreur(
      `Les 2 captures n'ont pas le même nombre de lignes (${n2} avec les noms, ${n1} sans). Elles doivent montrer exactement les mêmes lignes, dans le même ordre : refais-les sur le même filtre, sans rien replier.`,
      422,
    );
  }
  const lignes = lecture.valeur;
  if (lignes.length === 0) return erreur("Aucune ligne trouvée sur les captures. Vérifie qu'elles sont lisibles et non coupées.", 422);
  if (lignes.every((l) => !l.nom)) return erreur("Aucun nom lisible sur la capture avec les noms. Refais-la plus nette.", 422);

  // Reconnaissance : tes TM, et les commerciaux de chacun.
  const tms = await getMesTM();
  const commerciaux = await getCommerciauxDesTM(tms.map((t) => t.id));
  const parTm: Record<string, { id: string; nom: string }[]> = {};
  for (const c of commerciaux) (parTm[c.managerId] ??= []).push({ id: c.id, nom: c.nom });

  return Response.json({ ok: true, lignes: reconnaitreLignes(lignes, tms, parTm) } satisfies LectureBiRmReponse);
}
