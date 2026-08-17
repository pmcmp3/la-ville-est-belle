// cameo.js — Soberland, DJ ami de l'artiste, planté au milieu de la route
// dans les 10 premières secondes de la course (demandé explicitement le
// 17 août 2026, photo fournie en référence : casquette, barbe, chemise à
// carreaux, casque, derrière une table de mixage). Purement DÉCORATIF — pas
// de collision, pas de créneau, pas de score.
//
// Silhouette REPRISE de pedestrians.js (retour direct : le premier jet
// "ressemble à rien", refaire sur le modèle des piétons) — même gabarit
// 16 px de large, même découpage tête/bras/buste/jambes, mêmes coordonnées
// pour tout ce qui n'est pas spécifique au personnage. Seuls la casquette
// (remplace les cheveux), la barbe, le casque audio et le motif à carreaux
// sont propres à Soberland ; la table de mixage est un ajout SOUS les pieds,
// pas un habillage qui masque la moitié du corps — la silhouette humaine
// doit rester lisible en premier.
//
// Position : même principe que finish.js (pas d'entité stockée, z recalculé
// chaque frame à partir du temps restant avant CAMEO_TIME_S × vitesse
// courante) — sauf qu'ici l'objet est FIXE tôt dans la course, pas au bout.
// Planté dans la voie centrale (road.laneX(1), le milieu à LANE_COUNT = 3),
// « en plein milieu de la route » comme demandé.
//
// ⚠️ Profondeur : ce module ne se peint PAS lui-même dans render() de
// main.js. `getZ()` expose sa profondeur courante, et entities-render.js le
// fusionne dans son propre algorithme du peintre (voir `extras` dans
// entities-render.js) — sans ça, il se serait toujours peint au même endroit
// de la séquence (avant/après TOUT le reste), quelle que soit sa profondeur
// réelle. C'est exactement le bug remonté en jeu : il apparaissait devant un
// pont pourtant plus proche.

import { clock } from "./clock.js";
import * as road from "./road.js";
import { blk } from "./voxel.js";

const SPRITE_W = 16; // identique à pedestrians.js : même gabarit, silhouette éprouvée
const SPRITE_H = 30; // 26 (piéton) + 4 pour la table de mixage sous les pieds

// Un peu plus grand qu'un piéton (HEIGHT_WORLD 2.0) : c'est un caméo, il doit
// se remarquer, pas se fondre dans le reste du décor d'obstacles.
const HEIGHT_WORLD = 2.2;

// Repère au sol (secondes de course) où Soberland est pile au niveau du
// joueur — le milieu de la fenêtre "10 premières secondes" demandée, pour
// laisser le temps de le voir approcher ET de le voir passer, tout ça avant
// la barre des 10 s.
const CAMEO_TIME_S = 7;
const SHOW_BEFORE = 6; // s : apparaît au loin avant d'arriver au niveau du joueur
const SHOW_AFTER = 0.6; // s : reste visible un instant après, comme la ligne d'arrivée

// --- Palette (charte du jeu + tons repris de pedestrians.js pour la peau) --
const CASQUETTE = "#1b2a4a";     // bleu marine (casquette du modèle photo)
const PEAU = "#c98a5b";
const BARBE = "#3a2415";         // brun chaud, distinct du casque (gris-noir) juste en dessous
const CASQUE = "#1c1c22";        // casque audio, oreillettes de chaque côté de la casquette
const CASQUE_HI = "#3a3a44";
const CHEMISE = "#e9dfc8";       // carreaux crème (photo : chemise beige/écrue)
const CHEMISE_LIGNE = "#b9ac8a"; // lignes du carreau
const PANTALON = "#22242b";
const SHOE = "#565a66";
const SHOE_SOLE = "#e8dcc0";
const TABLE_HAUT = "#2b2b33";
const TABLE_BAS = "#19191f";
const BOUTON_ROUGE = "#e13e26";
const BOUTON_BLANC = "#f0ead9";
const BOUTON_GRIS = "#55555f";

// `swap` (-1/0/1) anime les bras EN OPPOSITION, exactement le mécanisme des
// piétons qui marchent (pedestrians.js, paramètre `step`) — réutilisé tel
// quel plutôt que réinventé, pour un mouvement de bras qui se lit comme un
// vrai geste (ajuster un bouton/le casque) au lieu d'un membre figé.
function draw(ctx, swap) {
  // Casquette (remplace le bloc "cheveux" du piéton, mêmes proportions).
  blk(ctx, 5, 0, 6, 3, CASQUETTE);

  // Casque audio : oreillettes de chaque côté de la casquette, PAS autour du
  // cou — au premier jet, casque + barbe empilés sur 3 bandes fines se
  // confondaient. Ici les deux occupent des zones bien séparées.
  blk(ctx, 3, 1, 2, 3, CASQUE);
  blk(ctx, 3, 1, 2, 1, CASQUE_HI);
  blk(ctx, 11, 1, 2, 3, CASQUE);
  blk(ctx, 11, 1, 2, 1, CASQUE_HI);

  // Visage + barbe (reprend exactement la zone "tête" du piéton : peau puis
  // ombre sous le menton — seule la couleur de l'ombre change, brune au lieu
  // de gris, pour lire "barbe" plutôt qu'un simple ombrage).
  blk(ctx, 5, 3, 6, 4, PEAU);
  blk(ctx, 5, 7, 6, 1, BARBE);

  // Bras (identiques en position/dimension aux piétons, recolorés chemise +
  // peau) — décalés en opposition via `swap`, comme le cycle de marche.
  const armL = swap > 0 ? 1 : 0;
  const armR = swap < 0 ? 1 : 0;
  blk(ctx, 2, 9 + armL, 2, 6, CHEMISE);
  blk(ctx, 2, 15 + armL, 2, 2, PEAU);
  blk(ctx, 12, 9 + armR, 2, 6, CHEMISE);
  blk(ctx, 12, 15 + armR, 2, 2, PEAU);

  // Buste à carreaux (bloc identique au piéton ; carreaux = 1 ligne
  // horizontale + 2 lignes verticales fines, plutôt que la bande unique du
  // piéton, pour lire "chemise à carreaux" et pas "maillot").
  blk(ctx, 4, 8, 8, 9, CHEMISE);
  blk(ctx, 4, 12, 8, 1, CHEMISE_LIGNE);
  blk(ctx, 7, 8, 1, 9, CHEMISE_LIGNE);
  blk(ctx, 10, 8, 1, 9, CHEMISE_LIGNE);

  // Jambes + chaussures (identiques aux piétons, `swap` écarte l'une et
  // rapproche l'autre comme `step` chez eux).
  const legLx = 4 - swap;
  const legRx = 9 + swap;
  blk(ctx, legLx, 17, 3, 6, PANTALON);
  blk(ctx, legRx, 17, 3, 6, PANTALON);
  blk(ctx, legLx - 1, 23, 4, 2, SHOE);
  blk(ctx, legLx - 1, 25, 4, 1, SHOE_SOLE);
  blk(ctx, legRx, 23, 4, 2, SHOE);
  blk(ctx, legRx, 25, 4, 1, SHOE_SOLE);

  // Table de mixage : SOUS les pieds, ne masque que le bas des chaussures —
  // la silhouette (tête/bras/buste/jambes) reste entièrement visible
  // au-dessus. Boutons rouge/blanc/gris en façade, façon platines DJ.
  blk(ctx, 0, 26, 16, 2, TABLE_HAUT);
  blk(ctx, 0, 28, 16, 2, TABLE_BAS);
  blk(ctx, 1, 25, 1, 1, BOUTON_ROUGE);
  blk(ctx, 5, 25, 1, 1, BOUTON_BLANC);
  blk(ctx, 9, 25, 1, 1, BOUTON_GRIS);
  blk(ctx, 13, 25, 1, 1, BOUTON_ROUGE);
}

function makeSprite(swap) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, swap);
  return c;
}

// Va-et-vient -1 → 0 → 1 → 0..., même rythme que le cycle de marche des
// piétons (WALK_STEPS) : suffisant pour lire "en train de mixer" à cette
// taille, pas besoin de plus de frames.
const FRAMES = [makeSprite(-1), makeSprite(0), makeSprite(1), makeSprite(0)];
const ANIM_RATE = 1.6; // cycles complets par seconde — geste posé, pas frénétique

// --- Notes de musique qui montent vers le ciel -----------------------------
// « il part des notes de musique de lui et qui vont vers le ciel » : 3 notes
// en boucle, décalées de phase pour qu'il y en ait toujours au moins une à
// l'écran, dérivant vers le haut en s'estompant (même famille d'enveloppe
// que renderPickupGlow dans player.js, réappropriée ici pour une dérive
// verticale plutôt qu'un flash ponctuel).
const NOTE_COUNT = 3;
const NOTE_LOOP_S = 1.8; // durée d'une montée complète
const NOTE_RISE_WORLD = 1.6; // hauteur montée, en unités-monde

function drawNote(ctx, x, y, scale, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#f0ead9";
  const s = Math.max(1, scale * 0.09);
  // Tête (carrée, cohérent avec la grammaire voxel) + hampe.
  ctx.fillRect(x, y - s * 2, s * 1.6, s * 1.6);
  ctx.fillRect(x + s * 1.2, y - s * 5, s * 0.5, s * 3.6);
  ctx.fillRect(x + s * 1.2, y - s * 5, s * 1.6, s * 0.5); // petit drapeau
  ctx.globalAlpha = 1;
}

function renderNotes(ctx, x, groundY, scale, time) {
  for (let i = 0; i < NOTE_COUNT; i++) {
    const phase = ((time / NOTE_LOOP_S + i / NOTE_COUNT) % 1 + 1) % 1;
    const rise = phase * NOTE_RISE_WORLD * scale;
    const jitter = (i - 1) * scale * 0.35; // 3 colonnes légèrement écartées
    const alpha = 0.7 * (1 - phase); // plein à l'émission, s'efface en montant
    drawNote(ctx, x + jitter, groundY - HEIGHT_WORLD * scale * 0.85 - rise, scale, alpha);
  }
}

// Profondeur courante, ou `null` si hors fenêtre de visibilité (avant/après)
// ou au-delà de l'horizon courbe. Consommé par main.js pour construire
// l'`extra` passé à entities-render.render() — voir le commentaire de tête.
export function getZ(now = clock.now()) {
  const remaining = CAMEO_TIME_S - now;
  if (remaining > SHOW_BEFORE || remaining < -SHOW_AFTER) return null;
  const speed = road.getSpeed();
  const z = Math.max(0.3, road.PLAYER_NEAR_Z + remaining * speed);
  if (z > road.HORIZON_Z) return null;
  return z;
}

// `now` en paramètre (pas clock.now() en dur) : purement pour rester
// testable hors ligne comme le reste du projet (voir ARCHITECTURE.md §12),
// même si en jeu l'appelant passe toujours clock.now(). Garde-fou : si
// appelé hors fenêtre (ne devrait pas arriver, l'appelant teste getZ()
// avant), ne dessine simplement rien plutôt que de planter.
export function render(ctx, width, height, now = clock.now()) {
  const z = getZ(now);
  if (z == null) return;

  const laneX = road.laneX(1); // voie centrale à LANE_COUNT = 3 : "en plein milieu de la route"
  const p = road.project(laneX, z, width, height);

  const frame = FRAMES[Math.floor(now * ANIM_RATE) % FRAMES.length];
  const h = HEIGHT_WORLD * p.scale;
  const w = (SPRITE_W / SPRITE_H) * h;

  renderNotes(ctx, p.x, p.y, p.scale, now);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, p.x - w / 2, p.y - h, w, h);
  ctx.restore();
}
