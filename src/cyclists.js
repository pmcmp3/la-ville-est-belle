// cyclists.js — Cyclistes en sens inverse. Ce sont de VRAIS OBSTACLES.
//
// ⚠️ Changement de statut (demandé explicitement : « on fait en sorte que les
// cyclistes deviennent tous des obstacles »). Ils étaient purement décoratifs
// jusqu'ici, avec leur propre générateur dans entities.js — d'où le retour de
// playtest « je passe à travers des cyclistes sans perdre de points ». Ils
// sont maintenant un 4e type d'obstacle tiré sur la MÊME grille rythmique que
// voiture/piéton/cône (voir OBSTACLE_WEIGHTS dans entities.js) : c'est ce qui
// leur donne gratuitement l'anti-chevauchement, le quota exact et un timing
// prévisible — trois choses qu'un obstacle doit avoir et qu'un décor n'avait
// pas besoin d'avoir.
//
// --- DA : rendu voxel, d'après deux références fournies par l'artiste -------
// Les références sont des rendus voxel/LEGO (cubes empilés, facettes
// éclairées), PAS du pixel art plat. On ne peut pas importer de vrai voxel 3D
// (CLAUDE.md verrouille Canvas 2D, aucun moteur 3D), donc on en reprend les
// SIGNAUX, qui tiennent tous à petite taille :
//   1. tout est construit en BLOCS, jamais en courbes — d'où blk() plus bas,
//      qui pose une arête haute éclaircie et des arêtes basse/droite
//      assombries sur chaque rectangle (c'est ce qui fait lire "cube extrudé"
//      plutôt que "rectangle de couleur") ;
//   2. des roues épaisses et CRANTÉES, le détail le plus reconnaissable des
//      deux images — les crampons sont de vrais blocs qui débordent de la
//      jante, en quinconce ;
//   3. sac à dos, casquette/bandeau et barbe, présents sur les références et
//      qui distinguent chaque variante au premier coup d'œil.
//
// Vus de FACE (ils arrivent en sens inverse) — c'était incohérent jusqu'ici :
// ils réutilisaient la géométrie de player.js, dessinée de dos, alors qu'ils
// roulent vers le joueur. Un obstacle doit se lire au premier regard.

const SPRITE_W = 30;
const SPRITE_H = 36;

// Quasiment la taille du joueur (HEIGHT_WORLD = 1.9 dans player.js) : c'est
// un obstacle qu'on doit prendre au sérieux, plus un figurant qu'on relègue
// au décor. Il était à 1.75 du temps où il n'était que décoratif.
export const HEIGHT_WORLD = 1.85;

// --- Palette commune -------------------------------------------------------
const TIRE_LO = "#33353d";
const HUB = "#c7c9d2";
const GRIP = "#2b2c33";

// 5 variantes. Les deux premières transposent directement les références
// (barbu casquette blanche / sac rouge, puis bandeau blanc / roues bleues) ;
// les trois autres recombinent la même grammaire pour qu'on ne voie jamais
// deux fois le même cycliste à l'écran sans multiplier les cas particuliers.
// `beard` (booléen) et `cap` (couleur, ou null si tête nue) sont ce qui
// change le plus la silhouette à petite taille — bien plus que la couleur du
// maillot, qui ne se distingue plus une fois l'objet loin.
const OUTFITS = [
  // Référence 1 : barbu, casquette blanche, débardeur blanc liseré rouge,
  // short moutarde, sac à dos rouge, grosses roues grises crantées.
  { top: "#f2ede2", trim: "#d8442c", shorts: "#c8963a", pack: "#d8544a",
    hair: "#3a2415", cap: "#f2ede2", wheel: "#6e727e", frame: "#33353d",
    shoe: "#b8402c", skin: "#d69a68", beard: true },
  // Référence 2 : bandeau blanc, maillot blanc, short bleu, roues bleues,
  // cadre clair, chaussures orange.
  { top: "#f4f1ea", trim: "#4a72c8", shorts: "#3f63b4", pack: "#4a72c8",
    hair: "#6b4426", cap: "#f4f1ea", wheel: "#4a72c8", frame: "#e8e5dc",
    shoe: "#e0742e", skin: "#e0b083", beard: false },
  { top: "#d8442c", trim: "#f2ede2", shorts: "#33353d", pack: "#2f6d4a",
    hair: "#241609", cap: null, wheel: "#5a5d68", frame: "#2b2c33",
    shoe: "#f2ede2", skin: "#8a5a33", beard: true },
  { top: "#2f6d4a", trim: "#f2ede2", shorts: "#c8963a", pack: "#d8442c",
    hair: "#3a2415", cap: null, wheel: "#6e727e", frame: "#33353d",
    shoe: "#33353d", skin: "#c98a5b", beard: false },
  { top: "#33353d", trim: "#c8963a", shorts: "#4a5260", pack: "#c8963a",
    hair: "#1c1108", cap: "#d8442c", wheel: "#4a4d57", frame: "#8a8d98",
    shoe: "#d8442c", skin: "#6f4526", beard: true },
];

export const OUTFIT_COUNT = OUTFITS.length;

// Éclaircit/assombrit une couleur d'un delta RGB. Sert uniquement aux arêtes
// des blocs — la palette elle-même reste écrite en dur, pour garder la main
// sur les teintes exactes des références.
// Accepte hex ET "rgb(...)" : blk() ré-assombrit ce qu'on lui passe, donc une
// couleur déjà passée par shade() lui revient sous forme rgb(). Ne gérer que
// le hex donnait un parseInt NaN, un fillStyle invalide silencieusement
// ignoré par Canvas, et donc un bloc peint avec la couleur précédente.
function parseColor(c) {
  if (c[0] === "#") {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return c.match(/\d+/g).map(Number);
}

function shade(color, amount) {
  const [r, g, b] = parseColor(color);
  const c = (v) => Math.max(0, Math.min(255, v + amount));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// LE primitif de tout ce fichier : un rectangle rendu comme un cube extrudé.
// Arête haute éclaircie (la lumière vient d'en haut), arêtes basse et droite
// assombries (faces dans l'ombre). C'est ce seul détail qui fait la
// différence entre "pixel art plat" et "voxel" à cette taille — sans lui, on
// retombe exactement sur l'ancien sprite.
function blk(ctx, x, y, w, h, base) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  if (h >= 3) {
    ctx.fillStyle = shade(base, 30);
    ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = shade(base, -34);
    ctx.fillRect(x, y + h - 1, w, 1);
  }
  if (w >= 3) {
    ctx.fillStyle = shade(base, -22);
    ctx.fillRect(x + w - 1, y, 1, h);
  }
}

// Roue avant vue de face : étroite, haute, avec des CRAMPONS en quinconce qui
// débordent de part et d'autre. Les crampons sont le détail le plus
// identifiable des deux références — sans eux la roue redevient une simple
// barre sombre. Peinte en DERNIER dans draw() : sur un vélo qui vient vers
// nous, la roue avant est l'élément le plus proche.
function wheel(ctx, cx, yTop, yBot, color) {
  ctx.fillStyle = shade(color, -46);
  for (let y = yTop + 2; y < yBot - 2; y += 4) {
    ctx.fillRect(cx - 5, y, 2, 3);
    ctx.fillRect(cx + 3, y + 2, 2, 3);
  }
  blk(ctx, cx - 3, yTop, 6, yBot - yTop, color);   // pneu
  blk(ctx, cx - 2, yTop + 3, 4, yBot - yTop - 6, TIRE_LO); // jante
  ctx.fillStyle = HUB;                              // moyeu
  ctx.fillRect(cx - 2, (yTop + yBot) / 2 - 2, 4, 4);
}

// Une jambe : cuisse + tibia + chaussure. `lift` remonte le bas de la jambe
// pour l'animation de pédalage. Posée à l'EXTÉRIEUR de la roue, sinon elle
// disparaît derrière elle une fois la roue peinte par-dessus.
function leg(ctx, x, lift, outfit) {
  blk(ctx, x, 22, 5, 6, outfit.shorts);            // cuisse
  blk(ctx, x + 1, 28 - lift, 3, 5, outfit.skin);   // tibia
  blk(ctx, x, 32 - lift, 5, 3, outfit.shoe);       // chaussure
}

function draw(ctx, outfit, liftLeft, liftRight) {
  const cx = 15;

  // Ordre de peinture = ordre de profondeur, du plus loin au plus proche :
  // sac à dos → tête/torse → guidon → mains → jambes → roue avant.

  // --- Tête ----------------------------------------------------------------
  blk(ctx, 11, 2, 8, 8, outfit.skin);
  if (outfit.beard) blk(ctx, 11, 6, 8, 4, outfit.hair);
  blk(ctx, 10, 1, 10, 3, outfit.hair);              // cheveux
  if (outfit.cap) {
    blk(ctx, 10, 0, 10, 3, outfit.cap);             // calotte
    blk(ctx, 9, 3, 12, 2, shade(outfit.cap, -20));  // visière, 1 px de débord de chaque côté
  }
  ctx.fillStyle = "#1c1108";                        // yeux : le regard fait le "il vient vers moi"
  ctx.fillRect(12, 5, 2, 2);
  ctx.fillRect(16, 5, 2, 2);

  // --- Torse : épaules plus larges que la tête -----------------------------
  blk(ctx, 9, 11, 12, 11, outfit.top);
  // Col en petit V au ras du cou. PAS une bande sur toute la largeur : elle
  // s'alignait avec le sac à dos et l'ensemble se lisait comme un gros "T"
  // barrant les épaules, qui écrasait le maillot.
  ctx.fillStyle = outfit.trim;
  ctx.fillRect(13, 11, 4, 2);
  // Bretelles : vues de face, c'est TOUT ce qu'on voit d'un sac à dos. Les
  // deux références en ont un, mais le dessiner en volume derrière les
  // épaules ne marche pas de face — ça se lit comme des sacoches.
  ctx.fillStyle = outfit.pack;
  ctx.fillRect(11, 12, 2, 10);
  ctx.fillRect(17, 12, 2, 10);

  // --- Guidon : TOUJOURS sombre, jamais de la couleur du maillot (sinon il
  // fusionne avec le torse et l'ensemble se lit comme un "T"). Nettement
  // sous les épaules, à hauteur des mains.
  blk(ctx, 4, 20, 22, 2, GRIP);
  blk(ctx, 3, 19, 3, 4, shade(GRIP, -14));          // poignée gauche
  blk(ctx, 24, 19, 3, 4, shade(GRIP, -14));         // poignée droite
  blk(ctx, cx - 1, 21, 3, 5, outfit.frame);         // potence + fourche

  // --- Bras : de l'épaule vers la poignée, en deux marches (le "escalier"
  // est justement ce qui fait voxel plutôt que trait diagonal).
  blk(ctx, 6, 14, 4, 4, outfit.skin);
  blk(ctx, 4, 17, 4, 4, outfit.skin);
  blk(ctx, 20, 14, 4, 4, outfit.skin);
  blk(ctx, 22, 17, 4, 4, outfit.skin);

  // --- Jambes, de part et d'autre de la roue -------------------------------
  leg(ctx, 6, liftLeft, outfit);
  leg(ctx, 19, liftRight, outfit);

  // --- Roue avant, au premier plan -----------------------------------------
  wheel(ctx, cx, 23, 35, outfit.wheel);
}

function makeSprite(outfit, liftLeft, liftRight) {
  const c = document.createElement("canvas");
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const cctx = c.getContext("2d");
  cctx.imageSmoothingEnabled = false;
  draw(cctx, outfit, liftLeft, liftRight);
  return c;
}

// 2 frames par variante (jambe gauche haute / jambe droite haute).
// 5 variantes × 2 = 10 petits canvas, pré-rendus une fois au chargement du
// module — aucun dessin par frame en jeu, juste un drawImage.
const FRAMES = OUTFITS.map((o) => [makeSprite(o, 3, 0), makeSprite(o, 0, 3)]);

const PEDAL_RATE = 3.2; // cycles/s — ils pédalent vite, ils viennent vers nous

// Dessine un cycliste ancré par le bas (contact roue/sol). Même signature
// qu'avant le passage en obstacle : entities.js appelle ça exactement comme
// il appelle le dessinateur de piéton.
export function render(ctx, outfitIndex, x, groundY, pxPerWorldUnit, time = 0) {
  const frames = FRAMES[outfitIndex % FRAMES.length];
  const frame = frames[Math.floor(Math.abs(time) * PEDAL_RATE) % frames.length];
  const scale = (HEIGHT_WORLD / SPRITE_H) * pxPerWorldUnit;
  const w = SPRITE_W * scale;
  const h = SPRITE_H * scale;

  // Ombre de contact au sol — même traitement que le joueur et les piétons.
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.ellipse(x, groundY - w * 0.02, w * 0.22, w * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(frame, x - w / 2, groundY - h, w, h);
  ctx.restore();
}
