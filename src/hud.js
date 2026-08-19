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
// Jaune des étoiles (STAR_FILL dans entities-render.js) : le multiplicateur de
// combo le reprend, demandé explicitement « pour que ce soit cohérent en termes
// de couleurs ». Dupliqué ici plutôt qu'importé — hud.js ne dépend d'aucun
// module de rendu du monde, et ce fichier duplique déjà toute la charte pour
// la même raison (le canvas ne lit pas les variables CSS).
const JAUNE_ETOILE = "#ffcf2e";
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

// HUD de jeu : score centré tout en haut, cœurs en ligne en haut à droite
// (retour explicite : « il faut centraliser, l'alignement est super bizarre
// — tu mets le score au centre de l'image tout en haut, et à droite les
// cœurs »). Jauge d'énergie retirée (elle ne pilotait plus rien), fond
// flouté retiré à son tour (« enlève l'effet de flou ») : plus de panneau du
// tout, juste une ombre portée sur le texte/les cœurs pour se détacher du
// décor — même traitement que le décompte ou l'ancien indicateur de
// direction. Bénéfice de la séparation score/cœurs en deux blocs
// indépendants : le vieux bug "les cœurs bougent quand le score bouge"
// (les deux partageaient une même colonne dimensionnée par le score) devient
// structurellement impossible, plus besoin de réserver un gabarit de chiffres.
const PAD = 16;
// Score + cœurs grossis de 20 % le 12 août 2026 (demandé explicitement,
// « leur place est très bien » — donc PAD inchangé, seules les tailles
// bougent : le score reste ancré à `width/2, PAD`, la rangée de cœurs reste
// ancrée à `width - PAD` par la droite, voir plus bas).
// 26 → 31 (+20 %) → 38 le 19 août 2026 (« j'aimerais que le système de score
// soit un tout petit peu plus gros »). Toujours ancré à `width/2, PAD` : seule
// la taille bouge, la place est validée depuis longtemps.
const SCORE_SIZE = 38;
// Cœurs déjà agrandis une première fois (demandé explicitement : « pour que
// les gens comprennent qu'ils ont trois cœurs ») — 13 → 20px. Puis +20 % le
// 12 août 2026, même demande que le score.
const HEART_SIZE = 24;   // 20 → 24 (+20 %)
const HEART_GAP = 10;    // 8 → 10 (+20 %, garde le même rythme visuel)
const HUD_SHADOW = "rgba(0,0,0,0.5)";
const HUD_SHADOW_BLUR = 6;

export function renderHud(ctx, width, height, game) {
  const livesTotal = window.CONFIG.viesDepart;
  const scoreText = `${game.score}`;
  // Game over (mort, pas "parcours terminé") : toujours 0 cœur affiché,
  // même si `game.lives` ne valait pas exactement 0 pile au moment de la
  // mort. Défensif — signalé au playtest : « il reste un cœur qui clignote
  // alors qu'il y a marqué game over », pas de cause certaine trouvée à la
  // relecture, donc on force l'affichage plutôt que de compter sur le calcul
  // amont. N'affecte pas "Parcours terminé", où il reste correct de montrer
  // les vies restantes.
  const displayLives = game.ended && game.endReason === "gameover" ? 0 : game.lives;

  ctx.textBaseline = "top";
  ctx.shadowColor = HUD_SHADOW;
  ctx.shadowBlur = HUD_SHADOW_BLUR;

  // Score : centré horizontalement, tout en haut.
  ctx.font = `900 ${SCORE_SIZE}px ${POLICE}`;
  ctx.fillStyle = BLANC;
  ctx.textAlign = "center";
  ctx.fillText(scoreText, width / 2, PAD);

  // Pénalité de collision (demandée le 12 août 2026 : « on perd un cœur et ça
  // fait perdre 500 points, il faudrait qu'il écrive -500 qui apparaît
  // 3 secondes en dessous du score »). Rouge de charte, juste sous le score,
  // avec un fondu sur la dernière seconde plutôt qu'une disparition sèche —
  // et une remontée lente, pour que l'œil l'attrape même en pleine course.
  if (game.penaltyTimer > 0) {
    const age = window.CONFIG.penaliteDuree - game.penaltyTimer; // 0 → fraîche
    ctx.font = `900 ${Math.round(SCORE_SIZE * 0.62)}px ${POLICE}`;
    ctx.fillStyle = ROUGE;
    ctx.globalAlpha = Math.min(1, game.penaltyTimer); // fondu sur la dernière seconde
    ctx.fillText(`-${game.penaltyAmount}`, width / 2, PAD + SCORE_SIZE * 1.2 - age * 4);
    ctx.globalAlpha = 1;
  }

  // Combo (demandé le 17 août 2026 : « 5 étoiles d'affilée multiplie le score
  // par 1,5, encore 5 après fois 2, etc. », voir comboMultiplier() dans
  // main.js). Affiché tant que le palier est actif, même position que la
  // pénalité ci-dessus — jamais les deux en même temps dans les faits : un
  // obstacle touché remet `streak` à 0 au même instant où il déclenche la
  // pénalité (main.js), donc dès que l'un s'affiche l'autre est à son état
  // neutre. Blanc, pas rouge : le rouge de charte est réservé au négatif
  // (pénalité), le combo est une récompense.
  // ⚠️ Deuxième révision le 19 août 2026, le même jour que le passage en tag —
  // qui était « beaucoup trop gros » (« j'ai peut-être un peu abusé »). Retour
  // à un texte nu, sans pastille, plus petit, et surtout RÉDUIT AU
  // MULTIPLICATEUR SEUL : « au lieu d'écrire COMBO, tu mets juste ×2,5 en
  // dessous du score ». Le mot n'apprenait rien qu'un « ×2,5 » sous un score
  // ne dise déjà — et l'annonce de PALIER, elle, s'affiche au-dessus du
  // personnage au moment où ça change (main.js), là où l'information est utile.
  // Jaune des étoiles plutôt que blanc, demandé explicitement « pour que ce
  // soit cohérent en termes de couleurs » : c'est la teinte du gain, quand le
  // rouge de charte reste celle du malus juste au-dessus.
  if (game.streak >= window.CONFIG.comboSeuil) {
    const palier = Math.floor(game.streak / window.CONFIG.comboSeuil);
    const multiplier = 1 + window.CONFIG.comboBonusParPalier * palier;
    ctx.font = `900 ${Math.round(SCORE_SIZE * 0.42)}px ${POLICE}`;
    ctx.fillStyle = JAUNE_ETOILE;
    ctx.fillText(`×${String(multiplier).replace(".", ",")}`, width / 2, PAD + SCORE_SIZE * 1.1);
  }

  // Cœurs : en ligne, ancrés en haut à droite, alignés verticalement sur le
  // score. Plein (rouge) tant que la vie reste, vide (blanc translucide) une
  // fois perdue.
  const heartsRowW = livesTotal * HEART_SIZE + (livesTotal - 1) * HEART_GAP;
  const heartY = PAD + (SCORE_SIZE * 1.15 - HEART_SIZE) / 2;
  let hx = width - PAD - heartsRowW;
  for (let i = 0; i < livesTotal; i++) {
    ctx.fillStyle = i < displayLives ? ROUGE : "rgba(255,255,255,0.25)";
    heartPath(ctx, hx, heartY, HEART_SIZE);
    ctx.fill();
    hx += HEART_SIZE + HEART_GAP;
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

// Bandeau de palier : passe quelques secondes puis s'efface, sans jamais
// interrompre la course (voir MILESTONE_SCORE dans main.js pour l'arbitrage
// complet — c'est la version non bloquante du « mur » demandé). Posé BAS dans
// l'écran, loin de l'axe de lecture de la route : à ce stade de la partie le
// joueur est en pleine action, un panneau au milieu lui coûterait une vie.
export function renderMilestone(ctx, width, height, game) {
  if (!game.milestoneTimer || game.milestoneTimer <= 0) return;
  const texteHaut = `${game.milestoneShown} POINTS`;
  const texteBas = "le morceau t'attend à l'arrivée";

  ctx.save();
  // Fondu sur la dernière seconde plutôt qu'une disparition sèche.
  ctx.globalAlpha = Math.min(1, game.milestoneTimer);
  ctx.font = `500 15px ${POLICE}`;
  const largeur = Math.max(ctx.measureText(texteBas).width, 190) + 40;
  const hauteur = 62;
  const x = (width - largeur) / 2;
  // 0,72 → 0,78 : à 0,72 le bandeau mordait sur les pieds du personnage
  // (vérifié à l'écran). Assez bas pour ne rien cacher de la route à lire.
  const y = height * 0.78;

  ctx.fillStyle = PANNEAU;
  roundRect(ctx, x, y, largeur, hauteur, 16);
  ctx.fill();
  ctx.fillStyle = JAUNE_ETOILE;
  roundRect(ctx, x, y, largeur, 3, 2);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `900 22px ${POLICE}`;
  ctx.fillStyle = JAUNE_ETOILE;
  ctx.fillText(texteHaut, width / 2, y + 12);
  ctx.font = `500 14px ${POLICE}`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fillText(texteBas, width / 2, y + 38);
  ctx.restore();
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
