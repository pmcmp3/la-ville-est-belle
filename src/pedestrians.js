// pedestrians.js — Piétons qui traversent la chaussée.
//
// ⚠️ Même direction artistique que le cycliste (demandé explicitement : « que
// ce soit la même DA que mon perso, parce que là ça marche pas »). La version
// précédente les dessinait en vectoriel à la volée (rectangles + arcs à la
// taille écran, contours lissés, t-shirts bleu/jaune hors charte) : à côté du
// sprite pixel art du joueur, ça se lisait comme deux jeux différents.
//
// Même technique que player.js, donc :
//   - dessin en pixels entiers sur un canvas hors-écran basse résolution,
//   - pré-rendu UNE fois au chargement (pas de dessin par frame),
//   - blit à l'échelle avec imageSmoothingEnabled = false (pas de flou),
//   - palette dérivée de celle du cycliste (peau, cheveux, pantalon, semelle
//     claire) + le rouge de charte pour les hauts.
// Les piétons sont des obstacles : le rouge de charte domine les outfits pour
// que le signal "danger" reste lisible, comme les autres obstacles.

const SPRITE_W = 16;
const SPRITE_H = 26;

// Dimensions dans le monde (unités). Doublées à la demande (« on grossit
// aussi la taille » des objets rouges) : à 2 unités, le piéton dépasse
// légèrement le cycliste (HEIGHT_WORLD = 1.9), ce qui est juste — un piéton
// debout est plus haut qu'un cycliste assis — et il se repère de loin.
const PEDESTRIAN_WIDTH = 0.8;
const PEDESTRIAN_HEIGHT = 2.0;

// Palette commune avec player.js (mêmes valeurs, recopiées plutôt
// qu'importées : player.js ne les exporte pas et c'est le seul lien entre les
// deux modules — si la charte bouge, les deux sont à mettre à jour).
const SKIN = "#c98a5b";
const SKIN_DARK = "#a86f45";
const HAIR = "#241609";
const PANTS = "#22242b";
const SHOE = "#565a66";
const SHOE_SOLE = "#e8dcc0";
const ROUGE = "#e13e26";
const ROUGE_SOMBRE = "#a12c1c";
const CREME = "#f0ead9";

// Outfits : haut / bas / cheveux. Tous dans la charte (rouge, crème, noir) —
// plus de bleu ni de jaune, qui n'existent nulle part ailleurs dans le jeu.
export const PEDESTRIAN_ICONS = {
  rouge:  { top: ROUGE, topShade: ROUGE_SOMBRE, stripe: CREME, pants: PANTS, hair: HAIR },
  creme:  { top: CREME, topShade: "#c9c2ac", stripe: ROUGE, pants: PANTS, hair: HAIR },
  sombre: { top: "#2b2b33", topShade: "#1b1b21", stripe: ROUGE, pants: ROUGE_SOMBRE, hair: HAIR },
  brique: { top: ROUGE_SOMBRE, topShade: "#7d2011", stripe: CREME, pants: PANTS, hair: "#3c2712" },
};

const OUTFIT_TYPES = Object.keys(PEDESTRIAN_ICONS);

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Vue de face/dos, jambes écartées selon `step` (-1, 0, +1) : c'est le seul
// paramètre du cycle de marche. Deux frames extrêmes + une neutre suffisent à
// cette taille — au-delà, l'animation ne se lit plus, exactement comme le
// cycle de pédalage à 4 frames du cycliste.
function draw(ctx, outfit, step) {
  // Cheveux + tête
  px(ctx, 5, 1, 6, 3, outfit.hair);
  px(ctx, 5, 4, 6, 4, SKIN);
  px(ctx, 5, 7, 6, 1, SKIN_DARK);   // ombre sous le menton

  // Bras (le long du corps, décalés en opposition avec les jambes)
  const armL = step > 0 ? 1 : 0;
  const armR = step < 0 ? 1 : 0;
  px(ctx, 2, 9 + armL, 2, 6, outfit.top);
  px(ctx, 2, 15 + armL, 2, 2, SKIN);
  px(ctx, 12, 9 + armR, 2, 6, outfit.top);
  px(ctx, 12, 15 + armR, 2, 2, SKIN);

  // Buste + bande claire horizontale (écho du maillot rayé du cycliste, et
  // signal type "gilet de sécurité" sur un obstacle à éviter)
  px(ctx, 4, 8, 8, 9, outfit.top);
  px(ctx, 4, 12, 8, 2, outfit.stripe);
  px(ctx, 4, 16, 8, 1, outfit.topShade);

  // Jambes : `step` écarte l'une et rapproche l'autre
  const legLx = 4 - step;
  const legRx = 9 + step;
  px(ctx, legLx, 17, 3, 6, outfit.pants);
  px(ctx, legRx, 17, 3, 6, outfit.pants);

  // Chaussures : semelle claire, comme sur le cycliste — c'est ce qui détache
  // les pieds du bitume sombre.
  px(ctx, legLx - 1, 23, 4, 2, SHOE);
  px(ctx, legLx - 1, 25, 4, 1, SHOE_SOLE);
  px(ctx, legRx, 23, 4, 2, SHOE);
  px(ctx, legRx, 25, 4, 1, SHOE_SOLE);
}

function makeSprite(outfit, step) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, outfit, step);
  return c;
}

// Toutes les frames pré-rendues au chargement du module : 4 outfits × 4 pas
// (droite → neutre → gauche → neutre), soit 16 petits canvas de 16×26. Coût
// négligeable en mémoire, zéro dessin pendant la partie.
const WALK_STEPS = [1, 0, -1, 0];
const FRAMES = {};
for (const [name, outfit] of Object.entries(PEDESTRIAN_ICONS)) {
  FRAMES[name] = WALK_STEPS.map((step) => makeSprite(outfit, step));
}

const WALK_RATE = 6; // pas par seconde (cadence de marche)

// Même signature qu'avant (entities.js l'appelle tel quel) : renvoie une
// fonction de dessin. `y` est le SOL, sous les pieds du piéton.
export function makePedestrianIcon(outfitType = "rouge", time = 0) {
  const frames = FRAMES[outfitType] || FRAMES.rouge;
  const frame = frames[Math.floor(Math.abs(time) * WALK_RATE) % frames.length];

  return (ctx, x, y, scale = 1) => {
    // scale = pixels par unité-monde (voir road.project) : on convertit la
    // hauteur monde en pixels, puis on en déduit la largeur pour garder les
    // proportions du sprite.
    const h = PEDESTRIAN_HEIGHT * scale;
    const w = (SPRITE_W / SPRITE_H) * h;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, x - w / 2, y - h, w, h);
    ctx.restore();
  };
}

export function getRandomOutfit() {
  return OUTFIT_TYPES[Math.floor(Math.random() * OUTFIT_TYPES.length)];
}

export const PEDESTRIAN_WIDTH_WORLD = PEDESTRIAN_WIDTH;
export const PEDESTRIAN_HEIGHT_WORLD = PEDESTRIAN_HEIGHT;
