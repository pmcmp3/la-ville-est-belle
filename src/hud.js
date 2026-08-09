// hud.js — Écrans hors-jeu : prompt de démarrage, HUD (score/vies/énergie),
// écran de fin. Regroupe ce qui vivait directement dans main.js (voir
// PLAN-ACTION.md §3) pour que main.js reste concentré sur la boucle/l'état,
// comme les autres modules de rendu (road.js, world.js, player.js,
// entities.js) déjà appelés depuis main.js de la même façon.

// --- Charte graphique (pochette de l'EP) -------------------------------
// Noir/blanc francs + un seul accent rouge, la police Stage Grotesk fournie
// par l'artiste. Les mêmes valeurs qu'index.html, dupliquées ici parce que
// le canvas ne lit pas les variables CSS : toute modif doit rester en phase
// avec :root dans index.html.
const BLANC = "#ffffff";
const ROUGE = "#e13e26";
const PANNEAU = "rgba(13,13,16,0.72)"; // fond des panneaux d'interface
const POLICE = '"Stage Grotesk", system-ui, sans-serif';

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Silhouette de cœur (approximation à 4 courbes de Bézier, technique
// standard en canvas) — plus lisible qu'un point de couleur pour distinguer
// une vie perdue d'une vie restante en un coup d'œil pendant la course.
// Ancré par son coin haut-gauche (x, y), occupe un carré de côté `s`.
function heartPath(c, x, y, s) {
  const topY = y + s * 0.3;
  c.beginPath();
  c.moveTo(x + s / 2, topY);
  c.bezierCurveTo(x + s / 2, y, x, y, x, topY);
  c.bezierCurveTo(x, y + s * 0.66, x + s / 2, y + s * 0.86, x + s / 2, y + s);
  c.bezierCurveTo(x + s / 2, y + s * 0.86, x + s, y + s * 0.66, x + s, topY);
  c.bezierCurveTo(x + s, y, x + s / 2, y, x + s / 2, topY);
  c.closePath();
}

// HUD de jeu : score, vies, énergie empilés VERTICALEMENT dans un seul
// panneau étroit ancré en haut à droite (demandé explicitement, pour un
// rendu plus "esthétique" qu'un bandeau horizontal large) — score tout en
// haut, cœurs un en dessous de l'autre, jauge d'énergie verticale en bas.
//
// 🐛 Playtest (hérité de l'ancienne mise en page horizontale, toujours vrai
// ici) : « la barre d'énergie et les cœurs bougent quand le score bouge, on
// ne comprend pas pourquoi ». Cause : la largeur/hauteur du panneau ne doit
// jamais dépendre du texte RÉEL du score (measureText), sinon chaque chiffre
// gagné redimensionne tout ce qui est en dessous. Correctif inchangé dans
// l'esprit : on réserve la place d'un nombre fixe de chiffres (SCORE_DIGITS),
// le score est simplement aligné à droite dans ce gabarit.
const PAD = 14;
const PAD_X = 14;
const PAD_Y = 14;
const GAP = 10;
const SCORE_SIZE = 20;
const HEART_SIZE = 13;
const HEART_GAP = 5;
const ENERGY_LABEL_GAP = 5;
const ENERGY_BAR_W = 8;
const ENERGY_BAR_H = 46;
const SCORE_DIGITS = 6;   // gabarit réservé au score (largeur figée)

export function renderHud(ctx, width, height, game) {
  const livesTotal = window.CONFIG.viesDepart;

  ctx.font = `900 ${SCORE_SIZE}px ${POLICE}`;
  const scoreText = `${game.score}`;
  // Largeur d'un gabarit de chiffres, jamais du score courant — voir en-tête.
  // "0"/"8" comme référence : Stage Grotesk Black n'a pas de chasse
  // tabulaire garantie, on prend donc le chiffre le plus large observé.
  const digitW = Math.max(
    ctx.measureText("0").width,
    ctx.measureText("8").width,
  );
  const scoreW = Math.max(SCORE_DIGITS, scoreText.length) * digitW;

  ctx.font = `900 7px ${POLICE}`;
  const energyLabelW = ctx.measureText("ÉNERGIE").width;

  const contentW = Math.max(scoreW, HEART_SIZE, energyLabelW, ENERGY_BAR_W);
  const panelW = contentW + PAD_X * 2;

  const heartsBlockH = livesTotal * HEART_SIZE + (livesTotal - 1) * HEART_GAP;
  const scoreRowH = Math.ceil(SCORE_SIZE * 1.15); // hauteur de ligne approx.
  const energyLabelRowH = 10;
  const panelH =
    PAD_Y + scoreRowH + GAP + heartsBlockH + GAP +
    energyLabelRowH + ENERGY_LABEL_GAP + ENERGY_BAR_H + PAD_Y;

  const panelLeft = width - PAD - panelW;
  const panelTop = PAD;
  const centerX = panelLeft + panelW / 2;

  ctx.fillStyle = PANNEAU;
  roundRect(ctx, panelLeft, panelTop, panelW, panelH, 18);
  ctx.fill();

  ctx.textBaseline = "top";
  let y = panelTop + PAD_Y;

  // Score, aligné à DROITE dans le gabarit réservé : les chiffres poussent
  // vers la gauche à l'intérieur du panneau au lieu de pousser le panneau.
  ctx.font = `900 ${SCORE_SIZE}px ${POLICE}`;
  ctx.fillStyle = BLANC;
  ctx.textAlign = "right";
  ctx.fillText(scoreText, panelLeft + PAD_X + scoreW, y);
  y += scoreRowH + GAP;

  // Vies : un cœur par vie de départ, empilés verticalement et centrés dans
  // la colonne — plein (rouge) tant qu'elle reste, vide (blanc translucide)
  // une fois perdue.
  ctx.textAlign = "left";
  for (let i = 0; i < livesTotal; i++) {
    ctx.fillStyle = i < game.lives ? ROUGE : "rgba(255,255,255,0.2)";
    heartPath(ctx, centerX - HEART_SIZE / 2, y, HEART_SIZE);
    ctx.fill();
    y += HEART_SIZE + (i < livesTotal - 1 ? HEART_GAP : 0);
  }
  y += GAP;

  // Énergie : jauge VERTICALE (plus horizontale), se lit de bas en haut
  // comme n'importe quelle jauge de vie/mana verticale — micro-libellé
  // au-dessus, sans quoi un simple trait qui descend ne dit rien du geste
  // (ramasser un bonus) qui le remplit.
  ctx.textAlign = "center";
  ctx.font = `900 7px ${POLICE}`;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fillText("ÉNERGIE", centerX, y);
  y += energyLabelRowH + ENERGY_LABEL_GAP;

  const barX = centerX - ENERGY_BAR_W / 2;
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(barX, y, ENERGY_BAR_W, ENERGY_BAR_H);
  const filledH = ENERGY_BAR_H * game.energy;
  ctx.fillStyle = BLANC;
  ctx.fillRect(barX, y + (ENERGY_BAR_H - filledH), ENERGY_BAR_W, filledH);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// Signalement discret quand la partie tourne sans le morceau (horloge de
// secours, voir main.js). Le jeu reste jouable, mais il faut que le joueur
// sache que le silence est un incident et pas le comportement normal — c'est
// tout l'objet du projet d'amener au morceau.
export function renderAudioWarning(ctx, width, height) {
  const text = "Son indisponible — recharge la page";
  ctx.font = `500 13px ${POLICE}`;
  const w = ctx.measureText(text).width + 24;
  const h = 28;
  const x = (width - w) / 2;
  // Au-dessus de la rangée #jump-button/#volume-control (72px + marge), sinon
  // le bandeau leur passe dessus sur un écran étroit.
  const y = height - h - 108;

  ctx.fillStyle = PANNEAU;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();

  ctx.fillStyle = ROUGE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, y + h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// L'indicateur de direction (ex-giro) a été retiré avec le gyroscope : la
// bande de pilotage tactile (#steer-control, index.html/input.js) est
// elle-même visible en permanence en bas de l'écran, son curseur affiche déjà
// la position courante — un second indicateur dans un coin serait redondant.

// Logique du concours (dates d'ouverture/fermeture, config.js) : le jeu
// reste jouable en dehors de la fenêtre, seul ce texte change ici — pas de
// backend pour l'instant (étape 7) donc rien n'est réellement bloqué. Le
// même calcul servira à l'étape 7 pour décider si un score envoyé compte.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function contestStatus() {
  const now = Date.now();
  const opens = new Date(window.CONFIG.dateOuverture).getTime();
  const closes = new Date(window.CONFIG.dateFermeture).getTime();
  if (now < opens) return { open: false, label: `Concours dès le ${dateFormatter.format(opens)}` };
  if (now > closes) return { open: false, label: "Concours terminé" };
  return { open: true, label: "Score valable pour le concours" };
}
