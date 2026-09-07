// props.js — Obstacles en cubes (iso.drawBox) : le tracteur qui traverse,
// et tout ce qui est POSÉ sur la route — poule, mouton, cochon, vache,
// fermier, botte de foin, voiture garée, avion (redessiné le 6 septembre
// 2026). Les animaux bougent sur place (un petit balancement) pour vivre
// sans traverser.

import { drawBox, drawShadow, drawFlat, project, getNight } from "./iso.js";
import { KINDS } from "./rows.js";

const WHITE = "#f4efe4", BLACK = "#1a1a1e", PINK = "#f0a0b0", ORANGE = "#e08a2a";

export function drawCrosser(ctx, kind, u, v, dir, t) {
  const K = KINDS[kind];
  if (kind === "poulelancee") { drawPouleVolante(ctx, u, v, dir, t); return; }
  // Tracteur : roues le long de u (il roule en travers). Poussière derrière
  // (« un klaxon avec la poussière ») et phares la nuit.
  const L = K.long, W = K.larg;
  const x = u - L / 2, y = v - W / 2;
  drawShadow(ctx, u, v, L / 2, W / 2);
  for (let i = 0; i < 5; i++) {
    const ph = (t * 3 + i * 1.3) % 1;
    const du = -dir * (0.9 + i * 0.55 + ph * 0.8);
    const sz = 0.22 + ph * 0.35;
    ctx.save(); ctx.globalAlpha = 0.35 * (1 - ph);
    drawBox(ctx, u + du - sz / 2, v - sz / 2 + Math.sin(i * 2.1) * 0.3, sz, sz, sz * 0.8, "#d8c8a8", 0.05 + ph * 0.4);
    ctx.restore();
  }
  if (getNight() > 0.2) {
    const a = 0.5 * Math.min(1, (getNight() - 0.2) / 0.4);
    ctx.save(); ctx.globalAlpha = a;
    const fx = dir > 0 ? u + L / 2 : u - L / 2 - 3.2;
    drawFlat(ctx, fx, v - 0.9, 3.2, 1.8, "#fff2b0", true);
    ctx.restore();
  }
  const bx = dir > 0 ? x : x + 0.6;
  drawBox(ctx, bx + 0.05, y - 0.05, 0.75, 0.35, 0.75, BLACK);
  drawBox(ctx, bx + 0.05, y + W - 0.3, 0.75, 0.35, 0.75, BLACK);
  drawBox(ctx, bx + 1.4, y, 0.45, 0.25, 0.45, BLACK);
  drawBox(ctx, bx + 1.4, y + W - 0.25, 0.45, 0.25, 0.45, BLACK);
  drawBox(ctx, bx + 0.1, y + 0.15, 1.9, W - 0.3, 0.5, "#3a8a3a", 0.45);
  drawBox(ctx, bx + 0.9, y + 0.2, 1.0, W - 0.4, 0.4, "#2f7a2f", 0.95);
  drawBox(ctx, bx + 0.1, y + 0.12, 0.8, W - 0.24, 0.7, "#2f7a2f", 0.95);
  drawBox(ctx, bx + 0.15, y + 0.17, 0.7, W - 0.34, 0.45, "#a8d8f0", 1.15);
  drawBox(ctx, bx + 1.55, y + 0.35, 0.1, 0.1, 0.7, "#3a3a40", 1.3);
}

// Statique centré sur (uCenter, r). `t` anime les animaux sur place.
export function drawStatic(ctx, kind, uCenter, r, t) {
  const K = KINDS[kind];
  const wob = Math.sin(t * 2.2 + r) * 0.06;
  const x = uCenter - K.long / 2, y = r - K.larg / 2;
  drawShadow(ctx, uCenter, r, K.long / 2, K.larg / 2, 0.22);
  if (kind === "poule") {
    const bob = Math.abs(Math.sin(t * 6 + r)) * 0.06;
    drawBox(ctx, x + 0.1, y + 0.1 + wob, 0.35, 0.3, 0.3, WHITE, 0.12 + bob);
    drawBox(ctx, x + 0.38, y + 0.15 + wob, 0.18, 0.2, 0.22, WHITE, 0.4 + bob);
    drawBox(ctx, x + 0.54, y + 0.2 + wob, 0.1, 0.08, 0.06, ORANGE, 0.48 + bob);
    drawBox(ctx, x + 0.42, y + 0.18 + wob, 0.1, 0.1, 0.07, "#e13e26", 0.62 + bob);
    drawBox(ctx, x + 0.18, y + 0.16, 0.06, 0.06, 0.12, ORANGE);
    drawBox(ctx, x + 0.3, y + 0.24, 0.06, 0.06, 0.12, ORANGE);
  } else if (kind === "mouton") {
    for (const [lx, ly] of [[0.12, 0.08], [0.12, 0.4], [0.66, 0.08], [0.66, 0.4]]) drawBox(ctx, x + lx, y + ly, 0.12, 0.12, 0.3, BLACK);
    drawBox(ctx, x + 0.02, y + wob, 0.86, 0.6, 0.42, "#f7f4ee", 0.3);
    drawBox(ctx, x + 0.1, y + 0.08 + wob, 0.7, 0.44, 0.1, "#ffffff", 0.72);
    drawBox(ctx, x + 0.8, y + 0.15 + wob, 0.25, 0.3, 0.28, BLACK, 0.42);
  } else if (kind === "cochon") {
    for (const [lx, ly] of [[0.12, 0.06], [0.12, 0.42], [0.72, 0.06], [0.72, 0.42]]) drawBox(ctx, x + lx, y + ly, 0.14, 0.12, 0.22, "#e08a9a");
    drawBox(ctx, x, y + wob, 1.0, 0.6, 0.45, PINK, 0.22);
    drawBox(ctx, x + 0.9, y + 0.12 + wob, 0.3, 0.36, 0.36, PINK, 0.3);
    drawBox(ctx, x + 1.15, y + 0.2 + wob, 0.1, 0.2, 0.16, "#e08a9a", 0.38);
    drawBox(ctx, x + 0.92, y + 0.06 + wob, 0.12, 0.1, 0.14, "#e08a9a", 0.66);
    drawBox(ctx, x + 0.92, y + 0.44 + wob, 0.12, 0.1, 0.14, "#e08a9a", 0.66);
  } else if (kind === "vache") {
    for (const [lx, ly] of [[0.15, 0.1], [0.15, 0.55], [1.1, 0.1], [1.1, 0.55]]) drawBox(ctx, x + lx, y + ly, 0.16, 0.16, 0.4, WHITE);
    drawBox(ctx, x + 0.05, y + 0.05 + wob, 1.3, 0.7, 0.55, WHITE, 0.4);
    drawBox(ctx, x + 0.3, y + 0.1 + wob, 0.4, 0.3, 0.2, BLACK, 0.95);
    drawBox(ctx, x + 0.9, y + 0.4 + wob, 0.3, 0.3, 0.2, BLACK, 0.95);
    drawBox(ctx, x + 1.25, y + 0.2 + wob, 0.4, 0.4, 0.4, WHITE, 0.6);
    drawBox(ctx, x + 1.3, y + 0.25 + wob, 0.3, 0.3, 0.12, PINK, 0.55);
  } else if (kind === "fermier") {
    // Salopette bleue, chemise à carreaux, chapeau de paille, fourche.
    drawBox(ctx, x + 0.1, y + 0.1, 0.14, 0.2, 0.55, "#2f4f9a");
    drawBox(ctx, x + 0.28, y + 0.1, 0.14, 0.2, 0.55, "#2f4f9a");
    drawBox(ctx, x + 0.05, y + 0.05, 0.42, 0.34, 0.6, "#2f4f9a", 0.55);
    drawBox(ctx, x - 0.02, y + 0.02, 0.56, 0.4, 0.3, "#b8402c", 0.9);
    drawBox(ctx, x + 0.1, y + 0.1, 0.32, 0.3, 0.32, "#d69a68", 1.2);
    drawBox(ctx, x + 0.02, y + 0.02, 0.48, 0.46, 0.08, "#e8c66a", 1.52);
    drawBox(ctx, x + 0.12, y + 0.12, 0.28, 0.26, 0.16, "#e8c66a", 1.58);
    drawBox(ctx, x + 0.5, y + 0.2, 0.06, 0.06, 1.6, "#6b4b2e");
    drawBox(ctx, x + 0.42, y + 0.18, 0.22, 0.08, 0.18, "#8a8d98", 1.55);
  } else if (kind === "botte") {
    drawBox(ctx, x, y, K.long, K.larg, K.h, "#d0a84a");
    drawBox(ctx, x, y, K.long, K.larg, 0.06, "#a8862f", K.h * 0.4);
  } else if (kind === "voiture") {
    // Garée le long de la route : longueur le long de v.
    const col = ["#2f5fb0", "#e13e26", "#e9e4d8", "#3a8f5c"][Math.abs(r) % 4];
    for (const [lx, ly] of [[-0.05, 0.25], [-0.05, 1.45], [K.long - 0.2, 0.25], [K.long - 0.2, 1.45]]) drawBox(ctx, x + lx, y + ly, 0.25, 0.35, 0.3, BLACK);
    drawBox(ctx, x, y, K.long, K.larg, 0.42, col, 0.18);
    drawBox(ctx, x + 0.08, y + 0.55, K.long - 0.16, 0.9, 0.36, "#a8d8f0", 0.6);
    drawBox(ctx, x + 0.1, y + 0.6, K.long - 0.2, 0.8, 0.06, col, 0.96);
  } else if (kind === "chat") {
    // Gris, blanc ou noir — plus d'orange (« trop proche des pièces »).
    const col = ["#8a8d98", "#f4efe4", "#1a1a1e"][Math.abs(r) % 3];
    drawBox(ctx, x + 0.05, y + wob * 0.5, 0.42, 0.28, 0.24, col, 0.1);
    drawBox(ctx, x + 0.4, y + 0.02 + wob * 0.5, 0.22, 0.24, 0.24, col, 0.2);
    drawBox(ctx, x + 0.42, y + 0.0, 0.06, 0.06, 0.1, col, 0.44);
    drawBox(ctx, x + 0.54, y + 0.2, 0.06, 0.06, 0.1, col, 0.44);
    drawBox(ctx, x - 0.1, y + 0.12, 0.16, 0.06, 0.06, col, 0.28 + Math.abs(wob) * 2);
    drawBox(ctx, x + 0.08, y + 0.02, 0.06, 0.06, 0.1, col); drawBox(ctx, x + 0.3, y + 0.2, 0.06, 0.06, 0.1, col);
  } else if (kind === "chien") {
    // Brun foncé ou noir et blanc — plus de fauve (« trop proche des pièces »).
    const col = Math.abs(r) % 2 ? "#5a3a22" : "#2a2a30";
    for (const [lx, ly] of [[0.08, 0.04], [0.08, 0.28], [0.5, 0.04], [0.5, 0.28]]) drawBox(ctx, x + lx, y + ly, 0.1, 0.1, 0.22, col);
    drawBox(ctx, x + 0.02, y + wob * 0.5, 0.62, 0.38, 0.3, col, 0.22);
    drawBox(ctx, x + 0.58, y + 0.04 + wob * 0.5, 0.28, 0.3, 0.3, col, 0.34);
    drawBox(ctx, x + 0.8, y + 0.12 + wob * 0.5, 0.1, 0.14, 0.12, "#1a1a1e", 0.4);
    drawBox(ctx, x + 0.6, y + 0.0, 0.08, 0.1, 0.12, "#8a6a3a", 0.6); drawBox(ctx, x + 0.6, y + 0.28, 0.08, 0.1, 0.12, "#8a6a3a", 0.6);
    drawBox(ctx, x - 0.12, y + 0.15, 0.16, 0.06, 0.06, col, 0.4 + Math.abs(wob) * 3);
  }
}

// Fermier posté au bord de la route, qui LANCE des poules (6 septembre 2026 :
// « des fermiers qui lancent des poules »). `arme` = la poule est partie.
export function drawLanceur(ctx, u, r, t, dir, arme) {
  const x = u - 0.25, y = r - 0.25;
  const bras = arme ? Math.max(0, 1 - ((t * 2) % 2)) : 0.5 + Math.sin(t * 3) * 0.2;
  drawBox(ctx, x + 0.1, y + 0.1, 0.14, 0.2, 0.55, "#2f4f9a");
  drawBox(ctx, x + 0.28, y + 0.1, 0.14, 0.2, 0.55, "#2f4f9a");
  drawBox(ctx, x + 0.05, y + 0.05, 0.42, 0.34, 0.6, "#2f4f9a", 0.55);
  drawBox(ctx, x - 0.02, y + 0.02, 0.56, 0.4, 0.3, "#b8402c", 0.9);
  drawBox(ctx, x + 0.1, y + 0.1, 0.32, 0.3, 0.32, "#d69a68", 1.2);
  drawBox(ctx, x + 0.02, y + 0.02, 0.48, 0.46, 0.08, "#e8c66a", 1.52);
  drawBox(ctx, x + 0.12, y + 0.12, 0.28, 0.26, 0.16, "#e8c66a", 1.58);
  // Bras tendu vers la route, une poule dans la main quand il n'a pas lancé.
  const ax = dir > 0 ? x + 0.5 : x - 0.4;
  drawBox(ctx, ax, y + 0.18, 0.4, 0.12, 0.12, "#d69a68", 1.0 + bras * 0.5);
  if (!arme) drawBox(ctx, dir > 0 ? ax + 0.3 : ax - 0.1, y + 0.1, 0.25, 0.25, 0.25, WHITE, 1.1 + bras * 0.5);
}

function drawPouleVolante(ctx, u, v, dir, t) {
  const flap = Math.abs(Math.sin(t * 22)) * 0.2;
  const lift = 0.6 + Math.abs(Math.sin(t * 4)) * 0.25;
  drawShadow(ctx, u, v, 0.3, 0.25, 0.2);
  const x = u - 0.28, y = v - 0.2;
  drawBox(ctx, x + 0.1, y + 0.1, 0.35, 0.3, 0.3, WHITE, lift);
  drawBox(ctx, dir > 0 ? x + 0.4 : x - 0.05, y + 0.15, 0.18, 0.2, 0.22, WHITE, lift + 0.25);
  drawBox(ctx, dir > 0 ? x + 0.56 : x - 0.1, y + 0.2, 0.1, 0.08, 0.06, ORANGE, lift + 0.33);
  drawBox(ctx, x + 0.05, y - 0.15, 0.4, 0.14, 0.05, WHITE, lift + 0.3 + flap);
  drawBox(ctx, x + 0.05, y + 0.42, 0.4, 0.14, 0.05, WHITE, lift + 0.3 + flap);
}
