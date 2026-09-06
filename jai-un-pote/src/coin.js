// coin.js — La PIÈCE à l'effigie de PMC à vélo (retour du 6 septembre 2026 :
// « remplace les étoiles qui tournent en 3D par des pièces [...] avec le logo
// de moi en train de faire du vélo »). Un disque doré qui tourne autour de
// son axe vertical : la face porte le pictogramme du cycliste en pixel art,
// la tranche apparaît quand la pièce est de profil. Centrée sur l'origine
// du contexte (faire translate avant). R = rayon écran.

const FACE = "#ffcf2e", FACE_HI = "#ffe45e", RIM = "#c07f0c", EDGE = "#a86a08", INK = "#5a3a08";

// Cycliste vu de profil, 15×11 (# = encre). Deux roues, cadre, dos courbé,
// tête, casquette — le logo « moi en train de faire du vélo ».
const LOGO = [
  "........###....",
  "........####...",
  "......###......",
  ".....##........",
  ".....##.#......",
  "....#####......",
  "...#.#..#......",
  "..#..#..##.....",
  ".###.###.###...",
  "#...##.##...#..",
  ".###.....###...",
];
const LOGO_W = 15, LOGO_H = 11;

export function drawCoin(ctx, R, spin, rouge = false) {
  const c = Math.cos(spin);
  if (rouge) {
    // Pièce ROUGE rare = un pote direct : « il faut qu'elle brille énormément,
    // comme un soleil au milieu de la route ».
    const halo = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 3.2);
    halo.addColorStop(0, "rgba(255,90,60,0.75)");
    halo.addColorStop(0.5, "rgba(255,120,60,0.25)");
    halo.addColorStop(1, "rgba(255,140,60,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-R * 3.2, -R * 3.2, R * 6.4, R * 6.4);
  }
  const FACE_C = rouge ? "#ff4a2e" : FACE, FACE_HI_C = rouge ? "#ff8a72" : FACE_HI, RIM_C = rouge ? "#a12c1c" : RIM, EDGE_C = rouge ? "#7a1f12" : EDGE;
  const rx = Math.max(R * 0.08, R * Math.abs(c));
  const thick = R * 0.16;
  // Tranche : décalée du côté qui s'éloigne, visible surtout de profil.
  ctx.fillStyle = EDGE_C;
  ctx.beginPath();
  ctx.ellipse(-Math.sign(c) * thick * (1 - Math.abs(c)), 0, rx, R, 0, 0, Math.PI * 2);
  ctx.fill();
  // Face : disque doré, anneau, reflet.
  ctx.fillStyle = RIM_C;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, R, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FACE_C;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 0.82, R * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FACE_HI_C;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.25, -R * 0.3, rx * 0.35, R * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Logo, écrasé horizontalement avec l'angle, masqué de profil.
  if (window.CONFIG.piecesLogo && Math.abs(c) > 0.22) {
    const px = (R * 1.25) / LOGO_H;
    const sx = px * Math.abs(c), sy = px;
    ctx.fillStyle = INK;
    for (let y = 0; y < LOGO_H; y++) {
      const row = LOGO[y];
      for (let x = 0; x < LOGO_W; x++) {
        if (row[x] !== "#") continue;
        ctx.fillRect((x - LOGO_W / 2) * sx, (y - LOGO_H / 2) * sy, sx + 0.3, sy + 0.3);
      }
    }
  }
}
