// rows.js — La route, rangée par rangée. Chaque rangée entière `r` (1 unité
// de profondeur) est une fonction pure de son index et de la graine :
//   - « safe » : rien ne traverse, des étoiles sur 1 ou 2 colonnes ;
//   - une TRAVERSÉE : poules / vaches / voitures / tracteurs qui passent d'un
//     bord à l'autre de la route, à vitesse constante, espacés d'une période —
//     leur position est une fonction du TEMPS (rien de stocké, comme Crossy) ;
//   - un STATIQUE posé dans une ou deux colonnes (botte, piano, baignoire,
//     canapé, avion) : on le saute s'il est bas, on le contourne sinon.
// Les collisions se résolvent par instance (rangée + rang dans la file), une
// seule fois, pour le joueur ET pour chaque pote (main.js/friends.js).

import { COLS, colU, ROAD_HALF } from "./iso.js";

export const KINDS = {
  // Traversants. `saut` = franchissable au saut. `cout` = potes perdus.
  poule:    { traverse: true,  saut: true,  cout: 1, vitesse: 1.7, long: 0.55, larg: 0.5,  h: 0.55, nom: "une poule" },
  vache:    { traverse: true,  saut: false, cout: 2, vitesse: 1.0, long: 1.5,  larg: 0.8,  h: 1.1,  nom: "une vache" },
  voiture:  { traverse: true,  saut: false, cout: 2, vitesse: 4.2, long: 2.0,  larg: 0.95, h: 0.75, nom: "une voiture" },
  tracteur: { traverse: true,  saut: false, cout: 3, vitesse: 2.0, long: 2.4,  larg: 1.05, h: 1.4,  nom: "un tracteur" },
  // Statiques.
  botte:    { traverse: false, saut: true,  cout: 1, long: 0.9, larg: 0.9, h: 0.75, nom: "une botte de foin" },
  canape:   { traverse: false, saut: true,  cout: 1, long: 1.1, larg: 0.8, h: 0.8,  nom: "un canapé" },
  baignoire:{ traverse: false, saut: false, cout: 2, long: 1.1, larg: 0.8, h: 0.7,  nom: "une baignoire" },
  piano:    { traverse: false, saut: false, cout: 2, long: 1.1, larg: 0.9, h: 1.2,  nom: "un piano" },
  avion:    { traverse: false, saut: false, cout: 3, long: 2.3, larg: 1.0, h: 1.2,  nom: "un avion" },
};

const GRACE_ROWS = 8;
const RAMP_ROWS = 700;          // ~2 min de course : pleine difficulté
const P_DANGER_START = 0.36, P_DANGER_MAX = 0.74;

let runSeed = 0;
export function reseed() { runSeed = Math.floor(Math.random() * 100000); }
reseed();
function hash(n) {
  const x = Math.sin(n * 91.173 + runSeed * 0.731) * 43758.5453;
  return x - Math.floor(x);
}

const cache = new Map();
export function reset() { cache.clear(); resolved.clear(); stars.clear(); }

function pick(list, h) {
  let total = 0;
  for (const [, w] of list) total += w;
  let r = h * total;
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return list[0][0];
}

// Contenu d'une rangée. Jamais plus de 2 rangées dangereuses d'affilée avant
// 1 min, 3 ensuite ; les traversées voisines vont en sens opposé (lisible).
export function rowAt(r) {
  if (cache.has(r)) return cache.get(r);
  let row;
  const t = Math.min(1, Math.max(0, r) / RAMP_ROWS);
  if (r < GRACE_ROWS) {
    row = { type: "safe", stars: r % 2 === 0 ? [1] : [hash(r * 3) < 0.5 ? 0 : 2] };
  } else {
    const prev1 = rowAt(r - 1), prev2 = rowAt(r - 2), prev3 = rowAt(r - 3);
    const streak = [prev1, prev2, prev3].filter((p) => p.type !== "safe").length;
    const maxStreak = t < 0.4 ? 2 : 3;
    const pDanger = P_DANGER_START + (P_DANGER_MAX - P_DANGER_START) * t;
    const danger = streak < maxStreak && (streak === 0 ? true : prev1.type !== "safe") && hash(r * 7 + 1) < pDanger
      || (streak === 0 && hash(r * 7 + 1) < pDanger);
    if (!danger) {
      // Une rangée sûre sur deux porte une étoile (rarement deux) : les
      // étoiles doivent se mériter, pas tapisser la route.
      const h = hash(r * 5 + 2);
      const c0 = Math.floor(hash(r * 11 + 4) * COLS);
      const stars = h < 0.45 ? [] : h < 0.88 ? [c0] : [c0, (c0 + 1 + Math.floor(hash(r * 13 + 6) * (COLS - 1))) % COLS];
      row = { type: "safe", stars };
    } else {
      const late = 1 + t * 2;
      const kind = pick([
        ["poule", 3], ["vache", 1.2 * late], ["voiture", 1.4 * late], ["tracteur", 0.5 * late],
        ["botte", 1.6], ["canape", 0.9], ["baignoire", 0.7 * late], ["piano", 0.6 * late], ["avion", 0.3 * late],
      ], hash(r * 17 + 3));
      const K = KINDS[kind];
      if (K.traverse) {
        // Sens opposé à la traversée précédente si elle est voisine.
        const dirPrev = prev1.type === "traverse" ? prev1.dir : 0;
        const dir = dirPrev ? -dirPrev : (hash(r * 19 + 8) < 0.5 ? -1 : 1);
        // Période : plus serrée avec la difficulté, jamais moins que 2 longueurs.
        const period = Math.max(K.long * 2.2, (K.vitesse * 2.2 + 3) * (1.2 - 0.5 * t));
        row = { type: "traverse", kind, dir, vitesse: K.vitesse * (0.85 + hash(r * 23 + 9) * 0.5), period, phase: hash(r * 29 + 5) * period,
          stars: hash(r * 31 + 7) < 0.25 ? [Math.floor(hash(r * 37 + 2) * COLS)] : [] };
      } else {
        const c = Math.floor(hash(r * 19 + 8) * COLS);
        const cols = kind === "avion" ? [c, (c + 1) % COLS] : [c];
        // Une étoile dans une colonne libre, parfois.
        const libres = [0, 1, 2].filter((x) => !cols.includes(x));
        row = { type: "statique", kind, cols, stars: hash(r * 31 + 7) < 0.3 ? [libres[Math.floor(hash(r * 37 + 2) * libres.length)]] : [] };
      }
    }
  }
  cache.set(r, row);
  return row;
}

// Instances d'une traversée à l'instant t : positions u des véhicules dans la
// fenêtre [-LIMIT, LIMIT], avec un identifiant stable par véhicule.
const LIMIT = ROAD_HALF + 4.5;
export function crossersAt(r, row, t) {
  const out = [];
  const K = KINDS[row.kind];
  const head = row.phase + row.dir * row.vitesse * t; // position du véhicule n°0
  const kMin = Math.ceil((-LIMIT - head) / row.period), kMax = Math.floor((LIMIT - head) / row.period);
  for (let k = kMin; k <= kMax; k++) {
    const u = head + k * row.period;
    out.push({ id: r * 100003 + k, r, u, dir: row.dir, kind: row.kind, K });
  }
  return out;
}

// --- Résolution ------------------------------------------------------------------
const resolved = new Set();   // instances déjà comptées (par membre : id + membre)
const stars = new Set();      // étoiles ramassées : "r:c"
export function starTaken(r, c) { return stars.has(`${r}:${c}`); }

// Un membre (joueur ou pote) à la position (u, v), au sol ou en l'air.
// Renvoie l'événement de collision ou de ramassage, ou null.
export function checkMember(id, u, v, airborne, t) {
  const r = Math.floor(v + 0.5);
  const row = rowAt(r);
  const events = [];
  // Étoiles : on est dans la rangée, dans la colonne.
  for (const c of row.stars) {
    if (stars.has(`${r}:${c}`)) continue;
    if (Math.abs(u - colU(c)) < 0.55 && Math.abs(v - r) < 0.45) {
      stars.add(`${r}:${c}`);
      events.push({ type: "etoile", r, c });
    }
  }
  if (row.type === "traverse") {
    for (const inst of crossersAt(r, row, t)) {
      const key = `${inst.id}:${id}`;
      if (resolved.has(key)) continue;
      if (Math.abs(inst.u - u) < inst.K.long / 2 + 0.35 && Math.abs(v - r) < 0.5) {
        resolved.add(key);
        if (!(airborne && inst.K.saut)) events.push({ type: "obstacle", kind: inst.kind, cout: inst.K.cout, saut: inst.K.saut });
      }
    }
  } else if (row.type === "statique") {
    const key = `s${r}:${id}`;
    if (!resolved.has(key)) {
      for (const c of row.cols) {
        if (Math.abs(u - colU(c)) < 0.62 && Math.abs(v - r) < 0.5) {
          resolved.add(key);
          const K = KINDS[row.kind];
          if (!(airborne && K.saut)) events.push({ type: "obstacle", kind: row.kind, cout: K.cout, saut: K.saut });
          break;
        }
      }
    }
  }
  return events;
}
