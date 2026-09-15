// voxel.js — Primitif de cube extrudé partagé entre les sprites "voxel"
// (cyclists.js, player.js). Extrait de cyclists.js lors de l'unification de
// la DA joueur/cycliste (voir ARCHITECTURE.md §11) : zéro logique
// d'orientation ou de silhouette ici, seulement le rendu d'un rectangle
// comme un bloc éclairé d'en haut.

// Accepte hex ET "rgb(...)" : blk() ré-assombrit ce qu'on lui passe, donc une
// couleur déjà passée par shade() lui revient sous forme rgb(). Ne gérer que
// le hex donnait un parseInt NaN, un fillStyle invalide silencieusement
// ignoré par Canvas, et donc un bloc peint avec la couleur précédente.
export function parseColor(c) {
  if (c[0] === "#") {
    const n = parseInt(c.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return c.match(/\d+/g).map(Number);
}

export function shade(color, amount) {
  const [r, g, b] = parseColor(color);
  const c = (v) => Math.max(0, Math.min(255, v + amount));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// Rectangle rendu comme un cube extrudé. Arête haute éclaircie (la lumière
// vient d'en haut), arêtes basse et droite assombries (faces dans l'ombre).
// C'est ce seul détail qui fait la différence entre "pixel art plat" et
// "voxel" à petite taille.
export function blk(ctx, x, y, w, h, base) {
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
