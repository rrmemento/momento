// Lecture automatique des captures Power BI par Gemini.
// Reçoit 3 images (formulaire multipart, champ « images », dans l'ordre A, B, C)
// et renvoie les chiffres lus, commercial par commercial.
// La clé GEMINI_API_KEY n'est lue qu'ici, côté serveur : elle n'est jamais renvoyée au navigateur.
import { type EchecGemini, genererAvecSecours } from "@/lib/gemini";
import { CAPTURES_BI, lireReponseGemini, TAILLE_MAX_IMAGE, TYPES_IMAGE, type LectureBiReponse } from "@/lib/lecture-bi";
import { getCurrentManager } from "@/lib/managers";
import { createClient } from "@/lib/supabase/server";

// Réessais + modèles de secours peuvent prendre jusqu'à ~3 min quand Google est surchargé.
export const maxDuration = 180;

const PROMPT = `Tu reçois 3 captures d'écran d'un outil Power BI de performance commerciale. Chaque capture est un tableau où chaque LIGNE est un commercial (identifié par son nom, ex: "Kelly Hochet", "Bastien Geiger"). Extrais les indicateurs de chaque commercial en croisant les 3 images par le NOM.

IMAGE A — "Performance Overview" : colonnes à lire par commercial :
- Installations -> install
- Pace (installed) -> iPace   (colonne "Pace (installed)", en %)
- Installation Backlog -> backlog
- Quick Installation -> quick
- Sales (Signed) -> ventes
- Send Back -> sendback
- Pace (signed) -> vPace   (colonne "Pace (signed)", en %)
- Avg Rate Sold -> taux
- POS Sales -> posSales
- POS Installations -> posInst
- POS Share% (Signed) -> posShare
- POS Upfront Avg -> posUpfront

IMAGE B — "Installation Performance" : par commercial :
- Installs # -> confirme install
- Avg. days to install -> avgDays   (INDICATEUR CLÉ, à lire pour CHAQUE commercial : délai moyen en jours entre la vente et la pose, nombre décimal, ex: 10.6 pour "10,6")
- Quick Installation -> confirme quick
- Total Installation backlog -> confirme backlog

IMAGE C — "Sales Performance" : par commercial :
- Sales OG -> og
- IH CR % -> ihcr
- IH Quick % -> ihQuick
- Send Back -> confirme sendback

FACULTATIF, SEULEMENT SI C'EST AFFICHÉ dans l'une des images (sinon null, ne jamais deviner) :
- Séniorité / ancienneté / tenure / level du commercial (ex: "M1", "M3", "M6", "3 mois") -> seniorite, recopiée telle quelle en texte
- Budget / objectif / target mensuel de ventes ou d'installations du commercial -> budget (nombre)

Si une même donnée apparaît dans 2 images, prends la valeur non vide la plus précise. Une case vide = null. Ne calcule rien, recopie ce qui est affiché. Ignore les lignes de synthèse (France, Sud Est, Total, et la ligne au nom du manager). Réponds UNIQUEMENT avec le JSON, rien d'autre.

FORMAT DE SORTIE : un objet JSON valide (pas de texte autour), de cette forme :
{
  "commerciaux": [
    {
      "nom": "Kelly Hochet",
      "ventes": 20, "vPace": 133, "og": 12, "taux": 0.76,
      "install": 19, "iPace": 127, "backlog": null, "avgDays": 10.6, "quick": 57.9,
      "posSales": 4, "posInst": 3, "posShare": 20.0, "posUpfront": 1375,
      "sendback": 19.2, "ihcr": 23, "ihQuick": 60,
      "seniorite": null, "budget": null
    }
  ]
}
Règles : un objet par commercial. Toute valeur non lisible ou absente = null (jamais inventer). Les pourcentages en nombre sans le signe % (ex: 133 pour "133 %"). Le taux "Avg Rate Sold" est un petit pourcentage, le garder tel quel en nombre (ex: 0.76 pour "0,76 %"). Les euros sans symbole (ex: 1375 pour "€ 1 375"). Ignorer les lignes de total (France, Sud Est, Total, nom du manager). Décimales avec un point.`;

function erreur(message: string, status: number, reessayable = false) {
  return Response.json({ ok: false, error: message, reessayable } satisfies LectureBiReponse, { status });
}

// Échec après tous les réessais et tous les modèles → message compréhensible.
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
  // Le proxy bloque déjà les visiteurs non connectés ; on revérifie ici par sécurité.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return erreur("Tu n'es plus connecté. Recharge la page et reconnecte-toi.", 401);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return erreur("Lecture automatique indisponible : clé Gemini non configurée.", 500);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return erreur("Envoi invalide : les captures doivent être envoyées en formulaire.", 400);
  }

  const images = form.getAll("images").filter((v): v is File => v instanceof File);
  if (images.length !== CAPTURES_BI.length) return erreur(`Il faut exactement ${CAPTURES_BI.length} captures.`, 400);
  for (const image of images) {
    if (!TYPES_IMAGE.includes(image.type)) return erreur(`« ${image.name} » n'est pas une image PNG, JPEG ou WebP.`, 400);
    if (image.size > TAILLE_MAX_IMAGE) return erreur(`« ${image.name} » dépasse 5 Mo.`, 400);
  }

  // Chaque image est précédée de son libellé, pour que Gemini sache laquelle est A, B ou C.
  const parts = [{ text: PROMPT }];
  const imageParts = await Promise.all(
    images.map(async (image) => ({
      inlineData: { mimeType: image.type, data: Buffer.from(await image.arrayBuffer()).toString("base64") },
    })),
  );
  const contenu = CAPTURES_BI.flatMap((c, i) => [{ text: `IMAGE ${c.code} — "${c.titre}" :` }, imageParts[i]]);

  // Le détail des échecs est journalisé côté serveur ; le navigateur ne reçoit qu'un message clair.
  const manager = await getCurrentManager();
  const lecture = await genererAvecSecours(apiKey, [{ role: "user", parts: [...parts, ...contenu] }], (texte) =>
    lireReponseGemini(texte, manager?.nom),
  );
  if (!lecture.ok) {
    const { message, status } = MESSAGES[lecture.raison];
    return erreur(message, status, lecture.raison === "indisponible");
  }
  console.info(`[lecture-bi] Captures lues par ${lecture.modele}`);

  const commerciaux = lecture.valeur;
  if (commerciaux.length === 0) {
    return erreur(
      "Aucun commercial trouvé sur les captures. Vérifie que ce sont bien les 3 tableaux Power BI, lisibles et non coupés.",
      422,
    );
  }
  if (commerciaux.every((c) => Object.values(c.valeurs).every((v) => v == null))) {
    return erreur("Les noms ont été lus, mais aucun chiffre n'est lisible. Refais des captures plus nettes.", 422);
  }

  return Response.json({ ok: true, commerciaux } satisfies LectureBiReponse);
}
