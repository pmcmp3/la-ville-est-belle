// cameo.js — Soberland, DJ ami de l'artiste, planté au milieu de la route
// dans les 10 premières secondes de la course (demandé explicitement le
// 17 août 2026, photo fournie en référence : casquette, barbe, chemise à
// carreaux, casque, derrière une table de mixage). Purement DÉCORATIF — pas
// de collision, pas de créneau, pas de score.
//
// Silhouette REPRISE de pedestrians.js (retour direct : le premier jet
// "ressemble à rien", refaire sur le modèle des piétons) — même gabarit
// 16 px de large, même découpage tête/bras/buste/jambes, mêmes coordonnées
// pour tout ce qui n'est pas spécifique au personnage. Casquette (remplace
// les cheveux), barbe, casque audio et motif à carreaux sont propres à
// Soberland ; le reste est identique au piéton, jambes/chaussures pleinement
// visibles — la silhouette humaine doit rester lisible avant tout.
//
// Table de mixage EN PROP SÉPARÉ (demandé le 17 août 2026, après un premier
// jet où elle était collée sous ses pieds et se lisait mal) : sa propre
// profondeur, légèrement plus proche du joueur que Soberland — « devant lui »
// depuis son point de vue à lui, puisqu'il fait face au joueur.
//
// Position : même principe que finish.js (pas d'entité stockée, z recalculé
// chaque frame à partir du temps restant avant CAMEO_TIME_S × vitesse
// courante) — sauf qu'ici l'objet est FIXE tôt dans la course, pas au bout.
// Planté dans la voie centrale (road.laneX(1), le milieu à LANE_COUNT = 3),
// « en plein milieu de la route » comme demandé.
//
// ⚠️ Profondeur : ce module ne se peint PAS lui-même dans render() de
// main.js. `getExtras()` expose Soberland ET sa table, chacun avec sa propre
// profondeur, et entities-render.js les fusionne dans son propre algorithme
// du peintre (voir `extras` dans entities-render.js) — sans ça, ils se
// seraient toujours peints au même endroit de la séquence (avant/après TOUT
// le reste), quelle que soit leur profondeur réelle. C'est exactement le bug
// remonté en jeu : Soberland apparaissait devant un pont pourtant plus proche.

import { clock } from "./clock.js";
import * as road from "./road.js";
import { blk } from "./voxel.js";
// Dépendance à SENS UNIQUE vers entities.js (même règle que crosstraffic.js) :
// on ne lit que finishTime(), pour poser le second caméo sur la ligne
// d'arrivée. entities.js n'importe jamais ce module.
import { finishTime } from "./entities.js";

const SPRITE_W = 16; // identique à pedestrians.js : même gabarit, silhouette éprouvée
const SPRITE_H = 26; // identique à pedestrians.js, jambes/chaussures pleinement visibles

// Un peu plus grand qu'un piéton (HEIGHT_WORLD 2.0) : c'est un caméo, il doit
// se remarquer, pas se fondre dans le reste du décor d'obstacles.
const HEIGHT_WORLD = 2.2;

// Repère au sol (secondes de course) où Soberland est pile au niveau du
// joueur. ⚠️ 7 → 3 le 21 août 2026 (« je veux que Soberland soit au tout
// début et que y ait rien autour de lui, j'insiste ») : à 7 s il apparaissait
// en PLEIN dans la fenêtre où le premier obstacle réel (un cycliste forcé,
// voir OPENING_KIND_OVERRIDE dans entities.js) venait aussi d'apparaître —
// confusion lue comme « difficile à esquiver » alors qu'il n'a aucune
// collision. À 3 s, avec SHOW_BEFORE = 6 s, il est visible dès la toute
// première frame de la course (remaining = 3 ≤ 6) : c'est littéralement la
// première chose que le joueur voit. La période de grâce a été étirée en
// vis-à-vis (GRACE_BEATS, entities.js) pour qu'aucun obstacle ne partage
// jamais l'écran avec lui.
const CAMEO_TIME_S = 3;
// ⚠️ 6 → 7 (revue de code du 21 août 2026) : l'horloge de course démarre à
// −LEAD_IN (≈ −3,3 s, voir entities.js) — à SHOW_BEFORE = 6, `remaining`
// valait ~6,3 s à la toute première frame et Soberland n'apparaissait que
// ~0,4 s plus tard. À 7, il est là dès la frame 1 (z ≈ 137, dans le champ).
const SHOW_BEFORE = 7; // s : apparaît au loin avant d'arriver au niveau du joueur
const SHOW_AFTER = 0.6; // s : reste visible un instant après, comme la ligne d'arrivée

// Distance FIXE (unités-monde) entre Soberland et sa table, toujours plus
// proche du joueur que lui — une simple soustraction sur z, pas une horloge
// séparée : la table suit donc Soberland pas à pas, sans jamais pouvoir se
// désynchroniser de lui. 1,3 → 2,2 : à 1,3 la table (plus proche, donc
// projetée plus grande) montait jusqu'à la poitrine du personnage au lieu de
// s'arrêter à la taille — vérifié à l'écran, corrigé par plus de recul ET
// une hauteur revue (TABLE_HEIGHT_WORLD plus bas).
const TABLE_OFFSET_Z = 2.2;

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
  // rapproche l'autre comme `step` chez eux) — entièrement visibles,
  // plus de table qui les masque (voir drawTable, un prop séparé).
  const legLx = 4 - swap;
  const legRx = 9 + swap;
  blk(ctx, legLx, 17, 3, 6, PANTALON);
  blk(ctx, legRx, 17, 3, 6, PANTALON);
  blk(ctx, legLx - 1, 23, 4, 2, SHOE);
  blk(ctx, legLx - 1, 25, 4, 1, SHOE_SOLE);
  blk(ctx, legRx, 23, 4, 2, SHOE);
  blk(ctx, legRx, 25, 4, 1, SHOE_SOLE);
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

// --- Table de mixage (prop séparé, voir TABLE_OFFSET_Z) --------------------
// Plus large que le personnage (elle est posée AU SOL, devant lui, pas
// portée) : deux platines carrées (plutôt que rondes — la grammaire voxel de
// tout le jeu n'utilise que des blocs, jamais de courbes, voir voxel.js) de
// part et d'autre d'une console centrale à boutons.
const TABLE_W = 22;
const TABLE_H = 12;
const TABLE_HAUT = "#2b2b33";
const TABLE_BAS = "#19191f";
const PLATINE = "#3a3a44";
const PLATINE_CENTRE = "#55555f";
const BOUTON_ROUGE = "#e13e26";
const BOUTON_BLANC = "#f0ead9";
const BOUTON_GRIS = "#55555f";

function drawTable(ctx) {
  blk(ctx, 0, 0, TABLE_W, 5, TABLE_HAUT); // plateau
  blk(ctx, 0, 5, TABLE_W, 7, TABLE_BAS);  // façade

  // Platines carrées, gauche et droite.
  blk(ctx, 1, 1, 6, 3, PLATINE);
  blk(ctx, 3, 2, 2, 1, PLATINE_CENTRE);
  blk(ctx, TABLE_W - 7, 1, 6, 3, PLATINE);
  blk(ctx, TABLE_W - 5, 2, 2, 1, PLATINE_CENTRE);

  // Console centrale : rangée de boutons/faders.
  blk(ctx, 9, 1, 4, 3, "#20202a");
  blk(ctx, 10, 6, 1, 1, BOUTON_ROUGE);
  blk(ctx, 12, 6, 1, 1, BOUTON_BLANC);
  blk(ctx, 14, 6, 1, 1, BOUTON_GRIS);
  blk(ctx, 6, 6, 1, 1, BOUTON_GRIS);
  blk(ctx, 17, 6, 1, 1, BOUTON_ROUGE);
}

const TABLE_SPRITE = (() => {
  const c = document.createElement("canvas");
  c.width = TABLE_W;
  c.height = TABLE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  drawTable(cctx);
  return c;
})();

// --- Étiquette "@soberland" flottant au-dessus de la tête -------------------
// « comme ça on sait qui c'est » (demandé le 17 août 2026). Petite, police du
// jeu (Stage Grotesk — même famille que hud.js, dupliquée ici pour la même
// raison qu'ailleurs : le canvas ne lit pas les variables CSS), ombre portée
// légère pour rester lisible aussi bien sur le ciel clair que sur les
// façades sombres.
const LABEL_POLICE = '"Stage Grotesk", system-ui, sans-serif';

function drawLabel(ctx, x, y, scale) {
  const size = Math.max(9, Math.min(15, scale * 3.6));
  ctx.save();
  ctx.font = `500 ${size}px ${LABEL_POLICE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3;
  ctx.fillStyle = "#f0ead9";
  ctx.fillText("@soberland", x, y);
  ctx.restore();
}

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

function renderCharacter(ctx, width, height, now, z, x, hauteurMonde = HEIGHT_WORLD) {
  const p = road.project(x, z, width, height);

  // 🐛 Modulo NORMALISÉ (revue de code du 21 août 2026) : l'horloge de course
  // démarre à −LEAD_IN, et depuis que Soberland est visible dès la première
  // frame, `now` est NÉGATIF ici — or en JS `-6 % 4 === -2`, donc
  // FRAMES[-2] = undefined et drawImage plantait TOUTE la boucle de rendu au
  // départ de course. Trouvé par le balayage §12 (étendu à t = −LEAD_IN),
  // invisible tant que le balayage partait de t = 0.
  const brut = Math.floor(now * ANIM_RATE) % FRAMES.length;
  const frame = FRAMES[(brut + FRAMES.length) % FRAMES.length];
  const h = hauteurMonde * p.scale;
  const w = (SPRITE_W / SPRITE_H) * h;

  renderNotes(ctx, p.x, p.y, p.scale, now);
  // ⚠️ 4 → 0,35 unité-monde au-dessus de la tête (19 août 2026, retour direct :
  // « le nom de Soberland est beaucoup trop haut écrit dans le ciel, il doit
  // être juste au-dessus du personnage »). À 4 unités, l'étiquette flottait à
  // près de 3 fois sa hauteur au-dessus de lui — donc en plein ciel, où elle se
  // superposait aux façades ET perdait tout lien avec le personnage qu'elle est
  // censée nommer. La redescendre règle du même coup le second reproche
  // (« il ne doit pas passer devant les bâtiments ») : l'étiquette vit
  // désormais au ras de la route, dans la zone que le personnage occupe déjà.
  // Le reste de l'ordre de profondeur était déjà correct — l'étiquette est
  // peinte DANS le draw du personnage, donc à sa profondeur : une voiture ou un
  // pont plus proche que lui se peint par-dessus (voir getExtras / le mécanisme
  // `extras` d'entities-render.js).
  drawLabel(ctx, p.x, p.y - h - 0.35 * p.scale, p.scale);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, p.x - w / 2, p.y - h, w, h);
  ctx.restore();
}

// Hauteur MONDE de la table, indépendante de HEIGHT_WORLD (personnage) —
// une table de mixage arrive à hauteur de taille, pas de poitrine. Constante
// à part plutôt que dérivée du ratio TABLE_H/SPRITE_H : les deux sprites
// n'ont pas la même échelle interne (16×26 monde-personnage vs 22×12
// monde-table), les confondre avait produit une table bien trop haute au
// premier jet (elle montait jusqu'à la poitrine).
const TABLE_HEIGHT_WORLD = 0.75;

function renderTable(ctx, width, height, z, x, hauteurMonde = TABLE_HEIGHT_WORLD) {
  const p = road.project(x, z, width, height);

  const h = hauteurMonde * p.scale;
  const w = (TABLE_W / TABLE_H) * h;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(TABLE_SPRITE, p.x - w / 2, p.y - h, w, h);
  ctx.restore();
}

// Profondeur du personnage à l'instant `now`, ou `null` si hors fenêtre de
// visibilité (avant/après) ou au-delà de l'horizon courbe. `repere` = seconde
// de course où il est pile au niveau du joueur (CAMEO_TIME_S au départ,
// finishTime() à l'arrivée).
function characterZ(now, repere, avant = SHOW_BEFORE, apres = SHOW_AFTER) {
  const remaining = repere - now;
  if (remaining > avant || remaining < -apres) return null;
  const speed = road.getSpeed();
  const z = Math.max(0.3, road.PLAYER_NEAR_Z + remaining * speed);
  if (z > road.HORIZON_Z) return null;
  return z;
}

// --- Second caméo : Soberland sur la LIGNE D'ARRIVÉE (22 août 2026) --------
// « Je veux Soberland qui apparaît à nouveau sur la ligne d'arrivée en train
// de mixer. » Même personnage, même table, même étiquette — seule la position
// change : il est SUR LE TROTTOIR (x = ROAD_HALF_WIDTH + 0,6, entre la bordure et le pied
// des façades, voir SIDEWALK_W dans world.js) et non au milieu de
// la route, pour deux raisons :
//   - la voie centrale est occupée par le portique et par le joueur qui
//     franchit la ligne à pleine vitesse : l'y planter donnerait à lire un
//     obstacle, alors qu'il n'a aucune collision (comme au départ) ;
//   - vu de la route, il encadre l'arrivée au lieu de la boucher — il joue
//     l'arrivée du coureur, c'est ce qu'on veut.
// Il reste visible un peu plus longtemps après le passage (SHOW_AFTER_FINISH)
// que le Soberland du départ : la caméra freine sur la ligne (voir finishing
// dans main.js), il a le temps d'être vu en passant à côté de lui.
const FINISH_X = road.ROAD_HALF_WIDTH + 0.6;
const SHOW_AFTER_FINISH = 1.6;
// ⚠️ Un peu plus grand qu'au départ (2,2 → 2,6 unités-monde), et ce n'est pas
// de la coquetterie : à l'arrivée la course file à sa vitesse plafond, or
// TOUT objet de bord de route n'entre dans la fenêtre visible qu'à
// HORIZON_Z ≈ 209, soit ~2 s avant le joueur à cette vitesse (le portique de
// la ligne d'arrivée lui-même n'apparaît pas plus tôt). Mesuré à 2,2 : 11 px
// de haut à −2 s, 92 px à −0,1 s ; à 2,6 : 13 px puis 109 px. Ces 2 secondes
// sont tout ce qu'on a, il faut qu'il s'y voie.
const FINISH_HEIGHT_WORLD = 2.6;
// La table est décalée VERS LA ROUTE (donc vers le joueur qui arrive) plutôt
// que devant lui en profondeur : sur le côté, un décalage en z seul l'aurait
// noyée dans le trottoir. Il mixe face à la piste, comme un DJ face au public.
const FINISH_TABLE_X = road.ROAD_HALF_WIDTH + 0.1;
const FINISH_TABLE_HEIGHT_WORLD = TABLE_HEIGHT_WORLD * (FINISH_HEIGHT_WORLD / HEIGHT_WORLD);

// Éléments à peindre pour cette frame, chacun avec sa propre profondeur —
// consommé par main.js et fusionné dans l'algorithme du peintre
// d'entities-render.js (voir le commentaire de tête). `now` en paramètre
// (pas clock.now() en dur) : reste testable hors ligne comme le reste du
// projet (voir ARCHITECTURE.md §12), même si en jeu l'appelant passe
// toujours clock.now().
export function getExtras(ctx, width, height, now = clock.now()) {
  const out = [];

  // 1. Le caméo du DÉPART, au milieu de la route (CAMEO_TIME_S).
  const laneX = road.laneX(1); // voie centrale à LANE_COUNT = 3 : "en plein milieu de la route"
  const z = characterZ(now, CAMEO_TIME_S);
  if (z != null) {
    const tableZ = Math.max(0.3, z - TABLE_OFFSET_Z);
    out.push({ z, draw: () => renderCharacter(ctx, width, height, now, z, laneX) });
    out.push({ z: tableZ, draw: () => renderTable(ctx, width, height, tableZ, laneX) });
  }

  // 2. Le caméo de l'ARRIVÉE, sur le trottoir (voir FINISH_X). Même fenêtre
  //    d'apparition que la ligne elle-même, à peu de chose près : il est là
  //    quand elle sort de l'horizon.
  const zFin = characterZ(now, finishTime(), SHOW_BEFORE, SHOW_AFTER_FINISH);
  if (zFin != null) {
    out.push({ z: zFin, draw: () => renderCharacter(ctx, width, height, now, zFin, FINISH_X, FINISH_HEIGHT_WORLD) });
    out.push({ z: zFin - 0.01, draw: () => renderTable(ctx, width, height, zFin, FINISH_TABLE_X, FINISH_TABLE_HEIGHT_WORLD) });
  }

  return out;
}
