// graffiti.js — Le tag « la ville est belle » peint SUR la chaussée, qui
// passe sous le joueur à GRAFFITI_TIME_S de course (demandé le 4 septembre
// 2026 : « tu peux graffer ça au bout de 30 secondes sur la route par terre
// en mode graffe »). Le logo PNG blanc fourni (2076×3019, transparent) est
// servi en WebP 560 px / 52 Ko (`public/assets/graffiti.webp`), chargé
// PARESSEUSEMENT 12 s avant son passage — jamais au chargement de la page.
//
// Rendu : le canvas 2D ne sait pas texturer un trapèze, donc l'image est
// découpée en STRIPS bandes horizontales, chacune projetée à sa profondeur
// (largeur = sa propre échelle) — le classique « mode 7 » des runners 2D.
// Purement décoratif : aucune collision, aucun créneau, aucun score.

import * as road from "./road.js";

const GRAFFITI_TIME_S = 30;
const WIDTH_U = 6.4;      // largeur du tag sur la chaussée (la route fait 8)
const STRIPS = 28;
const PRELOAD_S = 12;

let img = null;
let ready = false;

function ensureLoaded() {
  if (img) return;
  img = new Image();
  img.onload = () => { ready = true; };
  img.onerror = () => { ready = false; };
  img.src = "assets/graffiti.webp";
}

export function render(ctx, width, height, now) {
  const dt = GRAFFITI_TIME_S - now; // secondes avant que le centre du tag passe le joueur
  if (dt < PRELOAD_S && dt > -20 && !img) ensureLoaded();
  if (!ready) return;
  const speed = road.getSpeed();
  const lengthU = WIDTH_U * (img.height / img.width);
  const zCenter = road.PLAYER_NEAR_Z + dt * speed;
  const zFar = zCenter + lengthU / 2;
  const zNear = zCenter - lengthU / 2;
  if (zFar < 1 || zNear > road.HORIZON_Z - 6) return;

  ctx.save();
  ctx.globalAlpha = 0.92;
  for (let i = 0; i < STRIPS; i++) {
    const z1 = zFar - (i / STRIPS) * lengthU;       // bord lointain de la bande
    const z0 = zFar - ((i + 1) / STRIPS) * lengthU; // bord proche
    if (z0 < 0.8) break;
    if (z1 > road.HORIZON_Z - 6) continue;
    const pFar = road.project(0, z1, width, height);
    const pNear = road.project(0, z0, width, height);
    const h = pNear.y - pFar.y;
    if (h < 0.4) continue;
    const w = WIDTH_U * (pFar.scale + pNear.scale) / 2;
    const sy = (i / STRIPS) * img.height;
    const sh = img.height / STRIPS;
    ctx.drawImage(img, 0, sy, img.width, sh, pFar.x - w / 2, pFar.y, w, h + 0.8);
  }
  ctx.restore();
}
