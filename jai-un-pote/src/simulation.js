// simulation.js — Le SCORE PARFAIT d'une course (9 septembre 2026 : « ce que
// j'aimerais beaucoup, c'est que tu me donnes le score maximum à atteindre »).
// Rejoue la course d'une graine avec un joueur idéal : toutes les pièces,
// tous les laits, toutes les pièces rouges, jamais un pote perdu, jamais
// freiné par la boue — avec les MÊMES formules que main.js (regles.js) et sa
// propre instance de Route (le parcours en cours n'est jamais touché).
// Le joueur idéal reste soumis à la physique des voies (LANE_TWEEN) : une
// pièce à 4 voies de la précédente, sur la rangée suivante, n'est pas prise.
// Les obstacles sont ignorés (on suppose qu'il les évite tous).
// ~20 000 pas de 1/120 s : quelques millisecondes.

import { Route } from "./rows.js";
import { ROWS_AHEAD, COLS, COL_CENTRE, colU } from "./iso.js";
import { V_UNIT, targetSpeed, multiplicateur, dureeCourse } from "./regles.js";

export const LANE_TWEEN = 11; // même constante que main.js

export function scoreParfait(seed, potesMax) {
  const C = window.CONFIG;
  const route = new Route(seed);
  const dt = 1 / 120, T = dureeCourse();
  const paliers = C.potesPaliers || [];
  let v = 0, u = colU(COL_CENTRE), col = COL_CENTRE, speed = V_UNIT * C.vitesseBase;
  let metres = 0, points = 0, potesGagnes = 0, potes = 0, turbo = 0;
  const stats = { pieces: 0, piecesManquees: 0, laits: 0, rouges: 0, rangees: 0 };
  const pris = new Set();
  for (let now = 0; now < T; now += dt) {
    if (turbo > 0) { turbo -= dt; if (turbo <= 0) turbo = 0; }
    speed += (targetSpeed(now) - speed) * Math.min(1, 3 * dt);
    const vitesse = speed * (turbo > 0 ? (C.laitVitesse || 1.2) : 1);
    const dv = vitesse * dt;
    v += dv;
    metres += dv * C.metresParUnite * multiplicateur(potes, turbo > 0);
    const r = Math.floor(v + 0.5);
    // Le joueur idéal vise la voie du prochain bonus visible (rangée r ou r+1).
    for (const rr of [r, r + 1]) {
      const row = route.rowAt(Math.max(0, rr));
      const cible = row.coins.length ? row.coins[0] : row.lait !== undefined ? row.lait : row.rouge !== undefined ? row.rouge : null;
      if (cible !== null && !pris.has(rr)) { col = cible; break; }
    }
    u += (colU(col) - u) * Math.min(1, LANE_TWEEN * dt);
    if (Math.abs(v - r) < 0.45 && !pris.has(r)) {
      const row = route.rowAt(Math.max(0, r));
      const bonus = row.coins.length ? { kind: "piece", c: row.coins[0] } : row.lait !== undefined ? { kind: "lait", c: row.lait } : row.rouge !== undefined ? { kind: "rouge", c: row.rouge } : null;
      if (bonus && Math.abs(u - colU(bonus.c)) < 0.55) {
        pris.add(r);
        const mult = multiplicateur(potes, turbo > 0);
        if (bonus.kind === "piece") {
          stats.pieces += 1; points += 1; metres += C.pieceMetres * mult;
          while (potesGagnes < paliers.length && points >= paliers[potesGagnes]) { potesGagnes += 1; if (potes < potesMax) potes += 1; }
        } else if (bonus.kind === "lait") {
          stats.laits += 1; turbo = C.laitDureeS || 5;
          const r0 = r + ROWS_AHEAD + 1;
          route.ouvrirFenetreSure(r0, r0 + Math.ceil(speed * (C.laitVitesse || 1.2) * (C.laitDureeS || 5)) + 12);
        } else {
          stats.rouges += 1;
          if (potes < potesMax) potes += 1; else metres += 40 * mult;
        }
      } else if (bonus && v - r > 0.4) {
        pris.add(r); stats.piecesManquees += 1; // hors de portée (voie trop loin)
      }
    }
  }
  stats.rangees = Math.floor(v);
  stats.potes = potes;
  return { score: Math.floor(metres), ...stats };
}

// Recensement d'une course : combien de chaque espèce, de pièces, de laits…
// sur `nRangees` rangées. Sert à vérifier que deux graines ont les MÊMES
// quotas (outil de mesure, aussi appelé par l'overlay ?debug).
export function recenser(seed, nRangees = 1100) {
  const route = new Route(seed);
  const n = { dangers: 0, pieces: 0, laits: 0, rouges: 0, boue: 0 };
  for (let r = 0; r < nRangees; r++) {
    const row = route.rowAt(r);
    if (row.type !== "safe") { n.dangers += 1; n[row.kind] = (n[row.kind] || 0) + 1; }
    if (row.coins.length) n.pieces += 1;
    if (row.lait !== undefined) n.laits += 1;
    if (row.rouge !== undefined) n.rouges += 1;
    if (row.boue !== null && row.boue !== undefined) n.boue += 1;
  }
  return n;
}
