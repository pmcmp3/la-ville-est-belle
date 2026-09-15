// regles.js — Formules PARTAGÉES entre la course (main.js) et la simulation
// du score parfait (simulation.js), pour qu'elles ne divergent jamais :
// courbe de vitesse, multiplicateur, durée réelle de la course, graine de
// la ligue. Aucun état ici.

export const V_UNIT = 2.6;          // rangées/s par unité de « vitesse » de config.js
export const V_DOUBLING_S = 70;     // la vitesse double toutes les 70 s (jusqu'au plafond)
export const LEAD_IN = 3.3;         // décompte avant le GO (ancré sur la grille du morceau)

export function targetSpeed(t) {
  const { vitesseBase, vitesseMax } = window.CONFIG;
  return V_UNIT * Math.min(vitesseMax, vitesseBase * Math.pow(2, Math.max(0, t) / V_DOUBLING_S));
}
export function multiplicateur(potes, turbo) {
  return (1 + window.CONFIG.potesBonusMetres * potes) * (turbo ? 2 : 1);
}
// Durée de course effective : le morceau moins le temps du GO (le départ est
// posé sur un temps du morceau, ≥ LEAD_IN après la position de lecture — ici
// la position 0, cas du premier départ et du REJOUER).
export function dureeCourse() {
  const pas = 60 / window.CONFIG.bpm;
  const go = Math.ceil(LEAD_IN / pas) * pas;
  return window.CONFIG.dureeMorceau - go;
}

// ⚠️ VERSION DU PARCOURS : à incrémenter dès que le générateur (rows.js) ou
// les règles changent la route — les scores et fantômes d'une ligue sont
// filtrés sur la graine, une nouvelle version repart donc sur un classement
// vierge sans rien supprimer en base.
export const VERSION_COURSE = 2;
export function graineDepuisTexte(txt) {
  let h = 7;
  for (const ch of String(txt)) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h;
}
// Une ligue = UNE course (9 septembre 2026 : « une ligue est créée, donc une
// course est générée, et tout le monde doit pouvoir jouer la même »).
export function graineLigue(code) { return graineDepuisTexte(`${code}#v${VERSION_COURSE}`); }
