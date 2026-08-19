// share.js — Image de partage carrée 1080×1080, à poster avec son score.
//
// Dernier élément du brief d'origine resté non fait (CLAUDE.md : « Image de
// partage 1080×1920 pixel art borne arcade 80s »). ⚠️ Deux points du brief ont
// été révisés le 19 août 2026 après avoir vu la première version tourner, sur
// retour direct de l'artiste — voir HAUTEUR juste en dessous pour le format, et
// dessinerAffiche() pour l'abandon de la borne dessinée. Ce qui ne change pas,
// c'est la raison d'être : c'est le seul vrai levier viral du projet — un score
// qu'on poste ramène des joueurs, là où un lien pressé de force ne fait que
// déplacer un clic déjà acquis.
//
// ⚠️ Deux contraintes techniques dictent l'architecture du fichier :
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

// ⚠️ CARRÉ, pas 9:16 — révision du 19 août 2026, sur retour direct après avoir
// vu la première version : « je pense pas que les gens vont mettre des stories,
// par contre sur TikTok ils vont mettre en commentaire ». Ça change tout, parce
// qu'une image en commentaire TikTok s'affiche en VIGNETTE, recadrée au carré :
// une 1080×1920 y perdrait son haut et son bas — donc le titre et le lien,
// c'est-à-dire tout ce qui permet de retrouver le jeu. Le carré passe partout
// (commentaire, fil, et même story, simplement centré).
export const LARGEUR = 1080;
export const HAUTEUR = 1080;

// Côté d'un « pixel » de l'illustration. Toutes les coordonnées de dessin sont
// des multiples de P : c'est ce qui donne l'aspect blocky sans avoir à rendre
// dans un canvas basse résolution puis à agrandir.
const P = 6;
const px = (n) => Math.round(n / P) * P;

// Charte du jeu (dupliquée ici pour la même raison qu'ailleurs : le canvas ne
// lit pas les variables CSS d'index.html).
const ROUGE = "#e13e26";
const CREME = "#f0ead9";
const JAUNE = "#ffcf2e";
const POLICE = '"Stage Grotesk", system-ui, sans-serif';

function rect(ctx, x, y, w, h, couleur) {
  ctx.fillStyle = couleur;
  ctx.fillRect(px(x), px(y), px(w), px(h));
}

function texte(ctx, contenu, x, y, taille, couleur, graisse = 900, align = "center") {
  ctx.font = `${graisse} ${taille}px ${POLICE}`;
  ctx.fillStyle = couleur;
  ctx.textAlign = align;
  ctx.fillText(contenu, x, y);
}

// Étoile du jeu (même silhouette que BONUS_ICONS dans entities-render.js :
// aplat jaune, contour sombre, deux yeux). Seul élément illustré qui reste sur
// l'image — c'est le symbole le plus reconnaissable du jeu, et il tient à
// n'importe quelle taille.
function etoile(ctx, cx, cy, r, couleur) {
  ctx.fillStyle = couleur;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rayon = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * rayon;
    const y = cy + Math.sin(angle) * rayon;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function etoileDuJeu(ctx, cx, cy, r) {
  etoile(ctx, cx, cy, r * 1.16, "#2b1a06"); // contour
  etoile(ctx, cx, cy, r, JAUNE);
  const ecart = r * 0.26, oeilY = cy - r * 0.02;
  for (const s of [-1, 1]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(cx + s * ecart, oeilY, r * 0.20, r * 0.31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2b1a06";
    ctx.beginPath();
    ctx.ellipse(cx + s * ecart, oeilY, r * 0.15, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Composition ----------------------------------------------------------
// ⚠️ REFAITE DE ZÉRO le 19 août 2026, sur retour direct après avoir vu la
// première version : « pas trop mal mais beaucoup trop lourd, faut le
// simplifier de fou ». Le premier jet dessinait une borne d'arcade complète —
// marquee, écran CRT avec le ciel/la route/le personnage, ligne de stats,
// joystick, boutons, fente à monnaie, pied de page. Tout ça se tient à 1080 px
// de large sur un écran, et disparaît en bouillie dans une vignette de
// commentaire, qui est justement l'usage visé (voir HAUTEUR plus haut).
//
// Ce qui reste tient en une phrase : un aplat rouge de charte, LE SCORE en
// énorme, et de quoi retrouver le jeu. Tout le reste a été retiré, y compris
// la borne elle-même — le brief d'origine disait « borne arcade 80s », mais
// une borne dessinée en entier ne survit pas au format d'usage. Ce qui en est
// gardé, c'est ce qui traverse la vignette : l'aplat rouge saturé qui accroche
// l'œil dans un fil, et le chiffre géant.
function dessinerAffiche(ctx, etat) {
  // Aplat rouge de charte : c'est lui qui rend l'image reconnaissable de loin,
  // avant même qu'on ait lu quoi que ce soit.
  rect(ctx, 0, 0, LARGEUR, HAUTEUR, ROUGE);

  // Filet crème : cadre l'image et l'empêche de se fondre dans un fond clair.
  const m = px(36);
  ctx.strokeStyle = "rgba(240,234,217,0.5)";
  ctx.lineWidth = P;
  ctx.strokeRect(m, m, LARGEUR - m * 2, HAUTEUR - m * 2);

  // Titre, discret : l'information principale est le score, pas le nom du jeu.
  ctx.textAlign = "center";
  texte(ctx, "LA VILLE EST BELLE", LARGEUR / 2, px(160), 46, CREME, 900);
  texte(ctx, "PMC", LARGEUR / 2, px(212), 30, "rgba(240,234,217,0.75)", 500);

  // Le pseudo, juste au-dessus du score : c'est la ligne qui personnalise le
  // partage (« c'est MON score »).
  if (etat.pseudo) {
    texte(ctx, `@${etat.pseudo}`, LARGEUR / 2, px(384), 44, "rgba(255,255,255,0.9)", 500);
  }

  // LE SCORE. Taille adaptée au nombre de chiffres pour qu'il remplisse
  // toujours la largeur sans jamais déborder du cadre.
  const chiffres = String(etat.score);
  const taille = chiffres.length >= 6 ? 210 : chiffres.length >= 5 ? 250 : 290;
  texte(ctx, chiffres, LARGEUR / 2, px(600), taille, "#ffffff", 900);
  texte(ctx, "POINTS", LARGEUR / 2, px(672), 38, "rgba(255,255,255,0.75)", 500);

  // Une seule ligne de contexte, encadrée de deux étoiles du jeu : assez pour
  // que le score veuille dire quelque chose, pas assez pour encombrer.
  const yStats = px(792);
  etoileDuJeu(ctx, px(300), yStats - px(14), px(30));
  etoileDuJeu(ctx, LARGEUR - px(300), yStats - px(14), px(30));
  texte(ctx, `${etat.etoiles}/${etat.etoilesTotal} étoiles`, LARGEUR / 2, yStats, 40, CREME, 900);

  // L'adresse du jeu : la seule chose qui transforme une capture en joueur
  // supplémentaire. En crème sur le rouge, pleine largeur, impossible à rater.
  texte(ctx, "BATS MON SCORE", LARGEUR / 2, px(936), 52, "#ffffff", 900);
  texte(ctx, "pmcmp3.github.io/la-ville-est-belle", LARGEUR / 2, px(996), 34, JAUNE, 500);
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
  dessinerAffiche(ctx, etat);
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
