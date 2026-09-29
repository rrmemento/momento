// Génère toutes les icônes de MOMENTO à partir du logo (« M qui monte » + point d'accent vert, cf. Logo.tsx).
// Lancer : npm run icones   (réécrit les fichiers ci-dessous ; à relancer seulement si le logo change)
//   src/app/favicon.ico            onglet du navigateur (16, 32, 48 px)
//   src/app/icon.png               favicon moderne (192 px)
//   src/app/apple-icon.png         écran d'accueil iPhone (180 px)
//   public/icon-192.png, icon-512.png   Android / appli installée (manifest)
//   src/app/opengraph-image.png    aperçu quand on partage le lien (1200 × 630)
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

// Couleurs MOMENTO (src/app/globals.css).
const CREME = "#f3f2ec";
const ENCRE = "#141613";
const VERT = "#1c4b39";

// Le logo, dans son repère d'origine (viewBox 0 0 44 44). `trait` : épaisseur du « M ».
const logo = (trait) => `
  <path d="M7 33 L7 14 L22 27 L37 8" fill="none" stroke="${ENCRE}" stroke-width="${trait}"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="37" cy="8" r="${4.2 + (trait - 3.6) / 2}" fill="${VERT}"/>`;

// Boîte englobante du logo (trait compris) pour le centrer : x 5→41,5 ; y 3,5→35.
const LOGO = { x: 5, y: 3.5, l: 36.5, h: 31.5 };

// Une icône carrée : fond crème (arrondi ou plein cadre), logo centré sur `part` de la largeur.
function iconeSvg(taille, { part, trait, arrondi }) {
  const echelle = (taille * part) / LOGO.l;
  const dx = (taille - LOGO.l * echelle) / 2 - LOGO.x * echelle;
  const dy = (taille - LOGO.h * echelle) / 2 - LOGO.y * echelle;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">
  <rect width="${taille}" height="${taille}" rx="${arrondi ? taille * 0.22 : 0}" fill="${CREME}"/>
  <g transform="translate(${dx} ${dy}) scale(${echelle})">${logo(trait)}</g>
</svg>`;
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

// Petites tailles (onglet) : logo plus grand et trait plus épais pour rester net.
const favicon = (t) => iconeSvg(t, { part: 0.8, trait: 4.8, arrondi: true });
// Écran d'accueil : plein cadre (iOS/Android arrondissent eux-mêmes), logo dans la zone sûre des icônes « maskable ».
const appli = (t) => iconeSvg(t, { part: 0.56, trait: 3.8, arrondi: false });

// .ico = en-tête + une entrée par taille + les PNG à la suite (format accepté par tous les navigateurs récents).
function ico(pngs) {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2);
  entete.writeUInt16LE(pngs.length, 4);
  let decalage = 6 + 16 * pngs.length;
  const entrees = pngs.map(({ taille, donnees }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(taille >= 256 ? 0 : taille, 0);
    e.writeUInt8(taille >= 256 ? 0 : taille, 1);
    e.writeUInt16LE(1, 4); // plans
    e.writeUInt16LE(32, 6); // bits par pixel
    e.writeUInt32LE(donnees.length, 8);
    e.writeUInt32LE(decalage, 12);
    decalage += donnees.length;
    return e;
  });
  return Buffer.concat([entete, ...entrees, ...pngs.map((p) => p.donnees)]);
}

// L'aperçu de partage : logo + « MOMENTO » + la promesse, sur fond crème.
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${CREME}"/>
  <rect x="0" y="600" width="1200" height="30" fill="${VERT}"/>
  <g transform="translate(150 150) scale(8.2)">${logo(3.8)}</g>
  <text x="520" y="318" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="112" font-weight="800"
        letter-spacing="-3" fill="${ENCRE}">MOMENTO</text>
  <text x="524" y="388" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="36" font-weight="500"
        fill="${VERT}">Les One-on-One qui font progresser</text>
</svg>`;

const tailles = [16, 32, 48];
const icoPngs = await Promise.all(tailles.map(async (taille) => ({ taille, donnees: await png(favicon(taille)) })));
await writeFile("src/app/favicon.ico", ico(icoPngs));
await writeFile("src/app/icon.png", await png(favicon(192)));
await writeFile("src/app/apple-icon.png", await png(appli(180)));
await writeFile("public/icon-192.png", await png(appli(192)));
await writeFile("public/icon-512.png", await png(appli(512)));
await writeFile("src/app/opengraph-image.png", await png(ogSvg));
console.log("Icônes MOMENTO générées : favicon.ico, icon.png, apple-icon.png, icon-192/512.png, opengraph-image.png");
