// fantome.js — Le FANTÔME du meilleur de la ligue (9 septembre 2026 :
// « comme dans Mario Kart, un fantôme du vainqueur [...] qu'on puisse voir
// tout son parcours, là où il est passé, là où il a sauté, avec un bonhomme
// transparent »). Deux moitiés :
//   - ENREGISTRER la course du joueur : un échantillon (u, v, hauteur) tous
//     les 1/HZ s, dans le temps de course `now` (0 = GO). Encodé compact en
//     texte (~15 Ko pour 170 s), envoyé avec le score s'il bat le record de
//     la ligue (screens.finLigue → net.envoyerScore).
//   - REJOUER une trace : position interpolée à l'instant `now`, dessinée par
//     main.js avec drawRider en transparence, sans ombre, étiquette « @pseudo ».
// Le parcours d'une ligue est le même pour tous (graine), et la vitesse ne
// dépend que du temps : le fantôme roule donc à côté du joueur, en avance
// ou en retard selon la boue et les laits.

export const HZ = 10;
const QU = 50, QV = 10, QH = 50; // quantification : 1/50 u, 1/10 rangée, 1/50 unité de hauteur

let trace = [];      // [[u, v, h], ...] en cours d'enregistrement
let dernierT = -Infinity;

export function demarrerEnregistrement() { trace = []; dernierT = -Infinity; }
// À appeler à chaque pas de simulation ; ne garde qu'un échantillon par 1/HZ s.
export function enregistrer(now, u, v, h) {
  if (now < 0) return;
  const k = Math.floor(now * HZ);
  if (k <= dernierT) return;
  // Les trous (pause, rejeu d'une frame lente) sont comblés par le dernier point.
  while (trace.length < k) trace.push(trace.length ? trace[trace.length - 1] : [u, v, h]);
  trace.push([u, v, h]);
  dernierT = k;
}
export function longueurEnregistree() { return trace.length; }

// Texte : "hz:10|u,v,h;u,v,h;…" avec u et h en deltas entiers (petits), v absolu.
export function encoder() {
  const parts = [];
  for (const [u, v, h] of trace) parts.push(`${Math.round(u * QU)},${Math.round(v * QV)},${Math.round(h * QH)}`);
  return `hz:${HZ}|${parts.join(";")}`;
}
export function decoder(txt) {
  if (!txt || typeof txt !== "string") return null;
  const [tete, corps] = txt.split("|");
  const hz = Number((tete || "").split(":")[1]) || HZ;
  if (!corps) return null;
  const pts = [];
  for (const p of corps.split(";")) {
    const [u, v, h] = p.split(",").map(Number);
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
    pts.push([u / QU, v / QV, (h || 0) / QH]);
  }
  return pts.length > 2 ? { hz, pts } : null;
}

// Position du fantôme à l'instant `now` (interpolation linéaire), ou null
// après la fin de sa course. `alpha` s'éteint sur la dernière seconde.
export function positionA(fant, now) {
  if (!fant || now < 0) return null;
  const x = now * fant.hz;
  const i = Math.floor(x);
  if (i >= fant.pts.length - 1) return null;
  const a = fant.pts[i], b = fant.pts[i + 1], f = x - i;
  const reste = (fant.pts.length - 1 - x) / fant.hz;
  return { u: a[0] + (b[0] - a[0]) * f, v: a[1] + (b[1] - a[1]) * f, h: a[2] + (b[2] - a[2]) * f, alpha: Math.min(1, reste) };
}
