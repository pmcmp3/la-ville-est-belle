// share.js — Image de partage 1080×1920, pixel art « borne arcade 80s ».
//
// Dernier élément du brief d'origine resté non fait (CLAUDE.md : « Image de
// partage 1080×1920 pixel art borne arcade 80s — pas encore faite »). C'est le
// vrai levier viral du projet : un score qu'on poste en story ramène des
// joueurs, là où un lien pressé de force ne fait que déplacer un clic déjà
// acquis. Format 9:16 exact, calé sur les stories Instagram.
//
// ⚠️ Deux contraintes techniques dictent toute l'architecture de ce fichier :
//
// 1. `navigator.share()` DOIT être appelé dans la pile d'appel du geste
//    utilisateur — même règle qu'`AudioContext` sur iOS (voir audio.js). Or
//    `canvas.toBlob()` est asynchrone : un `await` avant le partage fait
//    perdre le geste et iOS refuse silencieusement. D'où la séparation en deux
//    temps : `prepare()` fabrique l'image DÈS l'affichage de l'écran de fin
//    (on a tout le temps), `partager()` ne fait plus que la passer au système,
//    de façon synchrone, au clic.
// 2. Le canvas ne participe pas au chargement des polices du document (piège
//    n°8, ARCHITECTURE.md) : on force `document.fonts.load()` avant de peindre,
//    sinon le score sort en police système sur l'image partagée.
//
// Style : tout est tracé sur une grille de PIXELS de 6 px (constante `P`), donc
// aucune arête intermédiaire, aucun dégradé lisse — les fondus sont des BANDES
// empilées, comme un écran 80s. Les seuls éléments hors grille sont les textes,
// rendus dans la police du jeu : c'est exactement le mélange que le jeu utilise
// déjà à l'écran (sprites en pixel art + Stage Grotesk pour le HUD), donc
// l'image reste cohérente avec ce que le joueur vient de voir.

import * as player from "./player.js";

export const LARGEUR = 1080;
export const HAUTEUR = 1920;

// Côté d'un « pixel » de l'illustration. Toutes les coordonnées de dessin sont
// des multiples de P : c'est ce qui donne l'aspect blocky sans avoir à rendre
// dans un canvas basse résolution puis à agrandir.
const P = 6;
const px = (n) => Math.round(n / P) * P;

// Charte du jeu (dupliquée ici pour la même raison qu'ailleurs : le canvas ne
// lit pas les variables CSS d'index.html).
const ROUGE = "#e13e26";
const ROUGE_SOMBRE = "#8f2415";
const ROUGE_CLAIR = "#ff6a4a";
const CREME = "#f0ead9";
const CREME_OMBRE = "#c9c2ac";
const NOIR = "#0d0d10";
const ENCRE = "#141419";
const JAUNE = "#ffcf2e";
const POLICE = '"Stage Grotesk", system-ui, sans-serif';

// Ciel du jeu, en BANDES (pas un dégradé lisse) : c'est la même descente
// bleu nuit → bleu → orange → rouge → nuit que road.js, quantifiée.
const CIEL = [
  "#04225e", "#073071", "#0d5cae", "#2f7fc4", "#4f9fd6",
  "#8fb2c8", "#d98f5a", "#f0813c", "#e6602e", "#e13e26", "#8f2f22", "#12101f",
];

function rect(ctx, x, y, w, h, couleur) {
  ctx.fillStyle = couleur;
  ctx.fillRect(px(x), px(y), px(w), px(h));
}

// Bloc en volume : face pleine + arête haute claire + arête basse sombre.
// Même grammaire que blk() (voxel.js), transposée à l'échelle de l'affiche.
function bloc(ctx, x, y, w, h, base, clair, sombre) {
  rect(ctx, x, y, w, h, base);
  rect(ctx, x, y, w, P, clair);
  rect(ctx, x, y + h - P, w, P, sombre);
  rect(ctx, x + w - P, y, P, h, sombre);
}

function texte(ctx, contenu, x, y, taille, couleur, graisse = 900, align = "center") {
  ctx.font = `${graisse} ${taille}px ${POLICE}`;
  ctx.fillStyle = couleur;
  ctx.textAlign = align;
  ctx.fillText(contenu, x, y);
}

// --- Écran de la borne : la petite scène de jeu ---------------------------
// Reprend les éléments que le joueur vient de voir (ciel couchant, route qui
// fuit, le cycliste) plutôt qu'une illustration inventée : l'image de partage
// doit être reconnaissable comme CE jeu.
function dessinerScene(ctx, x, y, w, h, etat) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Ciel en bandes empilées
  const hBande = Math.ceil(h * 0.52 / CIEL.length);
  for (let i = 0; i < CIEL.length; i++) {
    rect(ctx, x, y + i * hBande, w, hBande + P, CIEL[i]);
  }
  const yHorizon = y + CIEL.length * hBande;

  // Façades de part et d'autre, en simple silhouette : sur une image fixe, le
  // détail haussmannien du jeu ne se lirait pas à cette taille.
  const palette = ["#d69666", "#c17f52", "#e3ac7a"];
  for (let i = 0; i < 5; i++) {
    const largeur = px(w * (0.10 + (i % 2) * 0.03));
    const hauteur = px(h * (0.20 + ((i * 7) % 3) * 0.06));
    rect(ctx, x + i * largeur * 0.62, yHorizon - hauteur, largeur, hauteur, palette[i % 3]);
    rect(ctx, x + w - (i + 1) * largeur * 0.62, yHorizon - hauteur, largeur, hauteur, palette[(i + 1) % 3]);
    // Quelques fenêtres allumées, le seul détail qui survit à cette échelle
    for (let f = 0; f < 3; f++) {
      const fy = yHorizon - hauteur + P * 3 + f * P * 5;
      if (fy > yHorizon - P * 3) continue;
      rect(ctx, x + i * largeur * 0.62 + P * 2, fy, P * 2, P * 2, (i + f) % 4 === 0 ? "#ff5a34" : "#1c2350");
      rect(ctx, x + w - (i + 1) * largeur * 0.62 + P * 2, fy, P * 2, P * 2, (i + f) % 3 === 0 ? "#ff5a34" : "#1c2350");
    }
  }

  // Sol + chaussée qui fuit vers l'horizon, en marches d'escalier (une rangée
  // de pixels par palier) plutôt qu'un trapèze lissé.
  rect(ctx, x, yHorizon, w, y + h - yHorizon, "#5c5349");
  const rangees = Math.ceil((y + h - yHorizon) / P);
  for (let r = 0; r < rangees; r++) {
    const t = r / rangees;
    const demiLargeur = px(w * (0.06 + t * 0.42));
    const cy = yHorizon + r * P;
    rect(ctx, x + w / 2 - demiLargeur, cy, demiLargeur * 2, P, t < 0.5 ? "#1b1b22" : "#141419");
    // Pointillés centraux, une bande sur deux
    if (r % 6 < 3 && t > 0.15) {
      rect(ctx, x + w / 2 - P, cy, P * 2, P, "#ffffff");
    }
  }

  // Le cycliste, avec le vrai sprite du jeu — pas un dessin refait pour
  // l'occasion, sinon l'image de partage montrerait un autre personnage que
  // celui qu'on incarne.
  // ⚠️ Posé au-dessus du bandeau de score (qui couvre le bas de l'écran, voir
  // dessinerBorne) : au premier jet il était calé sur le bas de la scène, donc
  // entièrement caché derrière le bandeau — vérifié à l'écran.
  const hauteurPerso = h * 0.26;
  player.render(ctx, x + w / 2, y + h - px(h * 0.40), hauteurPerso / player.HEIGHT_WORLD, 0, 1.2);

  // Lignes de balayage : le signal « écran cathodique » le plus économique.
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#000000";
  for (let sy = y; sy < y + h; sy += P * 2) ctx.fillRect(x, sy, w, P);
  ctx.globalAlpha = 1;

  ctx.restore();
}

// --- La borne elle-même ----------------------------------------------------
function dessinerBorne(ctx, etat) {
  // Fond : nuit profonde + halo rouge derrière la borne, comme une salle
  // d'arcade éclairée par son propre néon.
  rect(ctx, 0, 0, LARGEUR, HAUTEUR, "#0a0a12");
  const halo = ctx.createRadialGradient(LARGEUR / 2, HAUTEUR * 0.42, 0, LARGEUR / 2, HAUTEUR * 0.42, LARGEUR * 0.75);
  halo.addColorStop(0, "rgba(225,62,38,0.30)");
  halo.addColorStop(1, "rgba(225,62,38,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

  const bx = px(102), bw = px(876);

  // Corps de la borne
  bloc(ctx, bx, px(150), bw, px(1500), ROUGE, ROUGE_CLAIR, ROUGE_SOMBRE);
  // Flancs plus sombres : donne l'épaisseur du meuble
  rect(ctx, bx, px(150), P * 4, px(1500), ROUGE_SOMBRE);
  rect(ctx, bx + bw - P * 4, px(150), P * 4, px(1500), ROUGE_SOMBRE);

  // --- Marquee (le bandeau lumineux du haut) -------------------------------
  const mx = bx + px(48), mw = bw - px(96);
  bloc(ctx, mx, px(198), mw, px(186), CREME, "#ffffff", CREME_OMBRE);
  texte(ctx, "LA VILLE EST BELLE", LARGEUR / 2, px(300), 62, ENCRE);
  texte(ctx, "P M C", LARGEUR / 2, px(354), 26, ROUGE, 900);

  // --- Écran ---------------------------------------------------------------
  const ex = bx + px(48), ey = px(420), ew = bw - px(96), eh = px(720);
  bloc(ctx, ex - P * 3, ey - P * 3, ew + P * 6, eh + P * 6, ENCRE, "#2a2a34", "#000000");
  dessinerScene(ctx, ex, ey, ew, eh, etat);

  // --- Bandeau de score, posé sur le bas de l'écran ------------------------
  const sy = ey + eh - px(258);
  ctx.globalAlpha = 0.82;
  rect(ctx, ex, sy, ew, px(258), "#0b0b14");
  ctx.globalAlpha = 1;
  rect(ctx, ex, sy, ew, P, ROUGE);

  texte(ctx, etat.pseudo ? `@${etat.pseudo}` : "ANONYME", LARGEUR / 2, sy + px(60), 34, CREME, 500);
  texte(ctx, `${etat.score}`, LARGEUR / 2, sy + px(162), 128, "#ffffff");
  texte(ctx, "POINTS", LARGEUR / 2, sy + px(216), 28, "rgba(255,255,255,0.55)", 500);

  // --- Ligne de stats ------------------------------------------------------
  const ly = ey + eh + px(66);
  const stats = [
    { valeur: `${etat.etoiles}/${etat.etoilesTotal}`, libelle: "ÉTOILES" },
    { valeur: `×${String(etat.meilleurCombo).replace(".", ",")}`, libelle: "COMBO MAX" },
    { valeur: etat.termine ? "ARRIVÉE" : "K.O.", libelle: "FIN" },
  ];
  stats.forEach((s, i) => {
    const cx = bx + bw * (0.22 + i * 0.28);
    texte(ctx, s.valeur, cx, ly, 46, i === 1 ? JAUNE : CREME);
    texte(ctx, s.libelle, cx, ly + px(42), 22, "rgba(240,234,217,0.6)", 500);
  });

  // --- Panneau de contrôle : joystick + boutons ----------------------------
  const py = px(1290);
  bloc(ctx, bx + px(48), py, bw - px(96), px(210), "#1c1c22", "#3a3a44", "#000000");
  // Manche du joystick
  rect(ctx, bx + px(186), py + px(48), P * 5, px(84), "#55555f");
  ctx.fillStyle = ROUGE;
  ctx.beginPath();
  ctx.arc(bx + px(198), py + px(48), px(36), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ROUGE_CLAIR;
  ctx.beginPath();
  ctx.arc(bx + px(192), py + px(42), px(12), 0, Math.PI * 2);
  ctx.fill();
  // Boutons
  const boutons = [JAUNE, CREME, ROUGE];
  boutons.forEach((couleur, i) => {
    ctx.fillStyle = couleur;
    ctx.beginPath();
    ctx.arc(bx + px(470) + i * px(120), py + px(96), px(38), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(bx + px(470) + i * px(120), py + px(108), px(38), 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.fill();
  });

  // --- Fente à monnaie + appel à l'action ---------------------------------
  const cy2 = px(1548);
  bloc(ctx, bx + px(288), cy2, px(300), px(78), "#1c1c22", "#3a3a44", "#000000");
  rect(ctx, bx + px(378), cy2 + px(24), px(120), px(18), "#000000");
  texte(ctx, "1 CRÉDIT — 1 COURSE", LARGEUR / 2, cy2 + px(140), 26, "rgba(255,255,255,0.6)", 500);

  // --- Pied de l'image ------------------------------------------------------
  texte(ctx, "BATS MON SCORE", LARGEUR / 2, px(1732), 52, "#ffffff");
  texte(ctx, "pmcmp3.github.io/la-ville-est-belle", LARGEUR / 2, px(1798), 32, JAUNE, 500);
  // Guillemets français évités : dans Stage Grotesk ils sortent en chevrons
  // doubles très ouverts, qui se lisent comme des flèches sur l'image finale.
  texte(ctx, "un jeu PMC pour écouter le morceau", LARGEUR / 2, px(1856), 26, "rgba(255,255,255,0.5)", 500);
}

let fichierPret = null; // File prêt à partager (voir l'en-tête : le geste iOS)
let dernierEtat = null;

function dessiner(etat) {
  const canvas = document.createElement("canvas");
  canvas.width = LARGEUR;
  canvas.height = HAUTEUR;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false; // pixel art : jamais de lissage
  ctx.textBaseline = "alphabetic";
  dessinerBorne(ctx, etat);
  return canvas;
}

// Fabrique l'image et la garde sous le coude. À appeler dès l'affichage de
// l'écran de fin : au moment du clic, il ne doit plus rester une seule
// opération asynchrone avant navigator.share() (voir l'en-tête).
export async function prepare(etat) {
  dernierEtat = etat;
  fichierPret = null;
  try {
    if (document.fonts && document.fonts.load) {
      await Promise.all([
        document.fonts.load('900 128px "Stage Grotesk"'),
        document.fonts.load('500 32px "Stage Grotesk"'),
      ]);
    }
  } catch (e) { /* police système en repli, l'image reste correcte */ }

  const canvas = dessiner(etat);
  await new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) {
        fichierPret = new File([blob], "la-ville-est-belle.png", { type: "image/png" });
      }
      resolve();
    }, "image/png");
  });
}

export function estPret() {
  return fichierPret !== null;
}

// Appelée DANS le handler de clic, sans await avant : c'est la condition pour
// qu'iOS accepte d'ouvrir la feuille de partage. Repli en téléchargement quand
// le partage de fichiers n'existe pas (desktop, navigateurs anciens).
export function partager() {
  if (!fichierPret) return false;
  const donnees = {
    files: [fichierPret],
    title: "La ville est belle",
    text: dernierEtat && dernierEtat.score
      ? `J'ai fait ${dernierEtat.score} points sur La ville est belle. Bats-moi.`
      : "La ville est belle",
  };
  if (navigator.canShare && navigator.canShare({ files: [fichierPret] }) && navigator.share) {
    navigator.share(donnees).catch(() => { /* partage annulé : rien à signaler */ });
    return true;
  }
  telecharger();
  return true;
}

function telecharger() {
  const url = URL.createObjectURL(fichierPret);
  const a = document.createElement("a");
  a.href = url;
  a.download = "la-ville-est-belle.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
