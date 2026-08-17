// cameo.js — Soberland, DJ ami de l'artiste, planté au milieu de la route
// dans les 10 premières secondes de la course (demandé explicitement le
// 17 août 2026, photo fournie en référence : casquette, lunettes rondes
// remontées sur la visière, barbe, chemise à carreaux, casque, derrière une
// table de mixage). Purement DÉCORATIF — pas de collision, pas de créneau,
// pas de score : le joueur passe à travers/à côté comme avec la ligne
// d'arrivée (finish.js), dont ce module reprend le principe telle quelle.
//
// Même technique que player.js/cyclists.js/pedestrians.js : voxel (blk(),
// voxel.js), pré-rendu une fois sur un canvas hors-écran, blit à l'échelle.
// Table de mixage dessinée APRÈS les jambes dans le même sprite pour les
// occulter (il est "derrière" sa table).
//
// Position : même principe que finish.js (pas d'entité stockée, z recalculé
// chaque frame à partir du temps restant avant CAMEO_TIME_S × vitesse
// courante) — sauf qu'ici l'objet est FIXE tôt dans la course, pas au bout.
// Planté dans la voie centrale (road.laneX(1), le milieu à LANE_COUNT = 3),
// « en plein milieu de la route » comme demandé.

import { clock } from "./clock.js";
import * as road from "./road.js";
import { blk } from "./voxel.js";

const SPRITE_W = 28;
const SPRITE_H = 42;

// Un peu plus grand qu'un piéton (HEIGHT_WORLD 2.0) : c'est un caméo, il doit
// se remarquer, pas se fondre dans le reste du décor d'obstacles.
const HEIGHT_WORLD = 2.3;

// Repère au sol (secondes de course) où Soberland est pile au niveau du
// joueur — le milieu de la fenêtre "10 premières secondes" demandée, pour
// laisser le temps de le voir approcher ET de le voir passer, tout ça avant
// la barre des 10 s.
const CAMEO_TIME_S = 7;
const SHOW_BEFORE = 6; // s : apparaît au loin avant d'arriver au niveau du joueur
const SHOW_AFTER = 0.6; // s : reste visible un instant après, comme la ligne d'arrivée

// --- Palette (charte du jeu : béton/bitume + rouge d'accent, cf. hud.js) ---
const CASQUETTE = "#1b2a4a";     // bleu marine (casquette du modèle photo)
const LUNETTES = "#c9962f";      // verres ambrés/dorés
const PEAU = "#c98a5b";
const BARBE = "#3a2415";         // brun chaud, distinct du casque (gris-noir) qui suit juste en dessous
const CASQUE = "#1c1c22";        // casque audio autour du cou
const CASQUE_HI = "#3a3a44";
const CHEMISE = "#e9dfc8";       // carreaux crème (photo : chemise beige/écrue)
const CHEMISE_LIGNE = "#b9ac8a"; // lignes du carreau
const TSHIRT = "#f5f0e2";
const PANTALON = "#22242b";
const TABLE_HAUT = "#2b2b33";
const TABLE_BAS = "#19191f";
const BOUTON_ROUGE = "#e13e26";
const BOUTON_BLANC = "#f0ead9";
const BOUTON_GRIS = "#55555f";

// Bras levé (main près de l'oreille, geste d'ajuster le casque/mixer) animé
// sur 3 positions ; bras avant (sur la table) glisse légèrement en miroir —
// lu comme "en train de mixer" plutôt qu'un simple bras figé.
function draw(ctx, armLift) {
  // Casquette (crâne seul — pas de visière en vue de face, elle ne se lirait
  // pas de front). Les lunettes forment leur PROPRE bande sous la casquette,
  // jamais superposée à sa couleur, sinon les deux se mélangent (vu au
  // premier jet : la bande dorée traversait le bleu marine).
  blk(ctx, 6, 0, 16, 4, CASQUETTE);

  // Lunettes remontées, posées sur le front (référence photo) : deux verres
  // séparés par un pont couleur peau (le front, entre les deux), pas par une
  // monture séparée — plus simple à lire à cette taille.
  blk(ctx, 7, 4, 4, 2, LUNETTES);
  blk(ctx, 17, 4, 4, 2, LUNETTES);

  // Visage
  blk(ctx, 8, 6, 12, 5, PEAU);

  // Barbe : brune, nettement plus épaisse qu'un simple filet d'ombre pour se
  // voir distinctement de la casquette au-dessus et du casque en dessous.
  blk(ctx, 8, 11, 12, 4, BARBE);

  // Casque audio autour du cou (sous le menton, oreillettes de chaque côté) —
  // un cran plus bas qu'avant pour ne plus toucher la barbe.
  blk(ctx, 7, 16, 14, 2, CASQUE);
  blk(ctx, 5, 15, 3, 4, CASQUE);
  blk(ctx, 5, 16, 3, 1, CASQUE_HI);
  blk(ctx, 20, 15, 3, 4, CASQUE);
  blk(ctx, 20, 16, 3, 1, CASQUE_HI);

  // Chemise à carreaux (buste), t-shirt blanc au col
  blk(ctx, 11, 18, 6, 3, TSHIRT);
  blk(ctx, 7, 20, 14, 11, CHEMISE);
  blk(ctx, 7, 24, 14, 1, CHEMISE_LIGNE);
  blk(ctx, 12, 20, 1, 11, CHEMISE_LIGNE);
  blk(ctx, 17, 20, 1, 11, CHEMISE_LIGNE);

  // Bras avant gauche : épaule → avant-bras posé sur la table, glisse d'1 px
  // en opposition avec le bras levé pour lire un mouvement de mix.
  blk(ctx, 4, 21, 4, 5, CHEMISE);
  blk(ctx, 3 - Math.round(armLift * 0.4), 25, 4, 4, PEAU);

  // Bras levé droit, main près de l'oreille — hauteur pilotée par `armLift`
  // (0..2 px, cycle d'animation).
  blk(ctx, 20, 19, 4, 5, CHEMISE);
  blk(ctx, 21, 16 - armLift, 3, 5, PEAU);

  // Pantalon — juste un col qui dépasse au-dessus de la table, le reste est
  // masqué par elle (il se tient DERRIÈRE).
  blk(ctx, 10, 31, 8, 4, PANTALON);

  // Table de mixage — dessinée APRÈS les jambes pour les occulter, boutons/
  // faders au sommet façon platines DJ.
  blk(ctx, 0, 33, 28, 3, TABLE_HAUT);
  blk(ctx, 0, 36, 28, 6, TABLE_BAS);
  blk(ctx, 3, 31, 2, 2, BOUTON_ROUGE);
  blk(ctx, 8, 31, 1, 2, BOUTON_GRIS);
  blk(ctx, 13, 31, 2, 2, BOUTON_BLANC);
  blk(ctx, 18, 31, 1, 2, BOUTON_GRIS);
  blk(ctx, 22, 31, 2, 2, BOUTON_ROUGE);
}

function makeSprite(armLift) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, armLift);
  return c;
}

// 3 frames, va-et-vient (0 → 2 → 0...) : un aller-retour suffit à lire "en
// train de mixer" à cette taille, comme le cycle de marche des piétons.
const FRAMES = [makeSprite(0), makeSprite(1), makeSprite(2), makeSprite(1)];
const ANIM_RATE = 1.6; // cycles complets par seconde — geste posé, pas frénétique

// --- Notes de musique qui montent vers le ciel -----------------------------
// Callback "il part des notes de musique de lui et qui vont vers le ciel" :
// 3 notes en boucle, décalées de phase pour qu'il y en ait toujours au moins
// une à l'écran, dérivant vers le haut en s'estompant (même famille
// d'enveloppe que renderPickupGlow dans player.js, réappropriée ici pour une
// dérive verticale plutôt qu'un flash ponctuel).
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

// `now` en paramètre (pas clock.now() en dur) : purement pour rester
// testable hors ligne comme le reste du projet (voir ARCHITECTURE.md §12),
// même si en jeu l'appelant passe toujours clock.now().
export function render(ctx, width, height, now = clock.now()) {
  const remaining = CAMEO_TIME_S - now;
  if (remaining > SHOW_BEFORE) return;   // pas encore visible
  if (remaining < -SHOW_AFTER) return;   // déjà passé, on nettoie

  const speed = road.getSpeed();
  const z = Math.max(0.3, road.PLAYER_NEAR_Z + remaining * speed);
  if (z > road.HORIZON_Z) return; // au-delà de la courbe, rien à projeter

  const laneX = road.laneX(1); // voie centrale à LANE_COUNT = 3 : "en plein milieu de la route"
  const p = road.project(laneX, z, width, height);
  if (!p) return;

  const frame = FRAMES[Math.floor(now * ANIM_RATE) % FRAMES.length];
  const h = HEIGHT_WORLD * p.scale;
  const w = (SPRITE_W / SPRITE_H) * h;

  renderNotes(ctx, p.x, p.y, p.scale, now);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, p.x - w / 2, p.y - h, w, h);
  ctx.restore();
}
