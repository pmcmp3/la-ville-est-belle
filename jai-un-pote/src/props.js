// props.js — Rendu des obstacles en cubes (iso.drawBox) : traversants et
// statiques. Tout est construit en blocs, jamais en courbes — la grammaire
// Minecraft demandée. `u`/`v` = coin AVANT-GAUCHE de l'empreinte.

import { drawBox, drawShadow } from "./iso.js";
import { KINDS } from "./rows.js";

export function drawCrosser(ctx, kind, u, v, dir, t) {
  const K = KINDS[kind];
  const L = K.long, W = K.larg;
  const x = u - L / 2, y = v - W / 2;
  drawShadow(ctx, u, v, L / 2, W / 2);
  if (kind === "poule") {
    const bob = Math.abs(Math.sin(t * 9 + u)) * 0.08;
    drawBox(ctx, x + 0.12, y + 0.1, 0.35, 0.3, 0.32, "#f4efe4", 0.12 + bob);
    drawBox(ctx, dir > 0 ? x + 0.4 : x, y + 0.14, 0.18, 0.2, 0.22, "#f4efe4", 0.4 + bob);
    drawBox(ctx, dir > 0 ? x + 0.56 : x - 0.06, y + 0.2, 0.1, 0.08, 0.06, "#e08a2a", 0.48 + bob);
    drawBox(ctx, dir > 0 ? x + 0.44 : x + 0.04, y + 0.18, 0.1, 0.1, 0.07, "#e13e26", 0.62 + bob);
    drawBox(ctx, x + 0.18, y + 0.16, 0.06, 0.06, 0.12, "#e08a2a");
    drawBox(ctx, x + 0.32, y + 0.24, 0.06, 0.06, 0.12, "#e08a2a");
  } else if (kind === "vache") {
    for (const [lx, ly] of [[0.15, 0.1], [0.15, 0.55], [1.1, 0.1], [1.1, 0.55]]) drawBox(ctx, x + lx, y + ly, 0.16, 0.16, 0.4, "#f4efe4");
    drawBox(ctx, x + 0.05, y + 0.05, 1.3, 0.7, 0.55, "#f4efe4", 0.4);
    drawBox(ctx, x + 0.3, y + 0.1, 0.4, 0.3, 0.2, "#1a1a1e", 0.95);
    drawBox(ctx, x + 0.9, y + 0.4, 0.3, 0.3, 0.2, "#1a1a1e", 0.95);
    const hx = dir > 0 ? x + 1.25 : x - 0.15;
    drawBox(ctx, hx, y + 0.2, 0.4, 0.4, 0.4, "#f4efe4", 0.6);
    drawBox(ctx, hx + 0.05, y + 0.25, 0.3, 0.3, 0.12, "#f0a0b0", 0.55);
  } else if (kind === "voiture") {
    const col = ["#2f5fb0", "#e13e26", "#e9e4d8", "#3a8f5c", "#c8963a"][Math.abs(Math.round(u * 7)) % 5];
    for (const [lx, ly] of [[0.25, -0.05], [1.45, -0.05], [0.25, W - 0.2], [1.45, W - 0.2]]) drawBox(ctx, x + lx, y + ly, 0.35, 0.25, 0.3, "#1a1a1e");
    drawBox(ctx, x, y, L, W, 0.42, col, 0.18);
    drawBox(ctx, x + 0.55, y + 0.08, 0.9, W - 0.16, 0.36, "#a8d8f0", 0.6);
    drawBox(ctx, x + 0.6, y + 0.1, 0.8, W - 0.2, 0.06, col, 0.96);
    drawBox(ctx, dir > 0 ? x + L - 0.06 : x, y + 0.12, 0.06, 0.18, 0.12, "#fff4c0", 0.42);
    drawBox(ctx, dir > 0 ? x + L - 0.06 : x, y + W - 0.3, 0.06, 0.18, 0.12, "#fff4c0", 0.42);
  } else if (kind === "tracteur") {
    const bx = dir > 0 ? x : x + 0.6;
    drawBox(ctx, bx + 0.05, y - 0.05, 0.75, 0.35, 0.75, "#1a1a1e");          // grande roue
    drawBox(ctx, bx + 0.05, y + W - 0.3, 0.75, 0.35, 0.75, "#1a1a1e");
    drawBox(ctx, bx + 1.4, y, 0.45, 0.25, 0.45, "#1a1a1e");                   // petite roue
    drawBox(ctx, bx + 1.4, y + W - 0.25, 0.45, 0.25, 0.45, "#1a1a1e");
    drawBox(ctx, bx + 0.1, y + 0.15, 1.9, W - 0.3, 0.5, "#3a8a3a", 0.45);     // châssis
    drawBox(ctx, bx + 0.9, y + 0.2, 1.0, W - 0.4, 0.4, "#2f7a2f", 0.95);      // capot
    drawBox(ctx, bx + 0.1, y + 0.12, 0.8, W - 0.24, 0.7, "#2f7a2f", 0.95);    // cabine
    drawBox(ctx, bx + 0.15, y + 0.17, 0.7, W - 0.34, 0.45, "#a8d8f0", 1.15);
    drawBox(ctx, bx + 1.55, y + 0.35, 0.1, 0.1, 0.7, "#3a3a40", 1.3);         // échappement
  }
}

export function drawStatic(ctx, kind, uCenter, r) {
  const K = KINDS[kind];
  const x = uCenter - K.long / 2, y = r - K.larg / 2 + 0.5 - 0.5;
  drawShadow(ctx, uCenter, r, K.long / 2, K.larg / 2, 0.22);
  if (kind === "botte") {
    drawBox(ctx, x, y, K.long, K.larg, K.h, "#d0a84a");
    drawBox(ctx, x, y, K.long, K.larg, 0.06, "#a8862f", K.h * 0.4);
  } else if (kind === "canape") {
    drawBox(ctx, x, y, K.long, K.larg, 0.4, "#c8442c", 0.1);
    drawBox(ctx, x, y + K.larg - 0.25, K.long, 0.25, 0.8, "#e05a3c", 0.1);
    drawBox(ctx, x, y, 0.2, K.larg, 0.6, "#a83a26", 0.1);
    drawBox(ctx, x + K.long - 0.2, y, 0.2, K.larg, 0.6, "#a83a26", 0.1);
  } else if (kind === "baignoire") {
    drawBox(ctx, x, y, K.long, K.larg, 0.6, "#f4f1ea", 0.1);
    drawBox(ctx, x + 0.08, y + 0.08, K.long - 0.16, K.larg - 0.16, 0.04, "#8fc7e6", 0.62);
    drawBox(ctx, x + K.long - 0.2, y + K.larg / 2 - 0.04, 0.08, 0.08, 0.35, "#8a8d98", 0.7);
  } else if (kind === "piano") {
    drawBox(ctx, x, y, K.long, K.larg, K.h, "#151517");
    drawBox(ctx, x + 0.05, y - 0.12, K.long - 0.1, 0.16, 0.08, "#f4f1ea", 0.72);
    for (let i = 0; i < 6; i++) drawBox(ctx, x + 0.12 + i * 0.17, y - 0.12, 0.05, 0.1, 0.09, "#0d0d10", 0.73);
  } else if (kind === "avion") {
    drawBox(ctx, x + 0.3, y + 0.1, 1.7, 0.55, 0.55, "#f4f1ea", 0.25);     // fuselage (le long de la route)
    drawBox(ctx, x - 0.4, y + 0.25, 3.1, 0.25, 0.1, "#f4f1ea", 0.6);      // aile en travers
    drawBox(ctx, x + 0.9, y + 0.15, 0.5, 0.45, 0.3, "#8fc7e6", 0.8);      // verrière
    drawBox(ctx, x + 0.3, y + 0.3, 0.2, 0.15, 0.5, "#e13e26", 0.75);      // dérive
    drawBox(ctx, x + 0.5, y + 0.05, 0.12, 0.12, 0.25, "#3a3a40");          // roues
    drawBox(ctx, x + 1.6, y + 0.05, 0.12, 0.12, 0.25, "#3a3a40");
  }
}
