// rows.js — La route, rangée par rangée, fonction pure de l'index et de la
// graine (sauf l'ARMEMENT des traversées, qui dépend du moment où le joueur
// arrive — voir armer()).
//   - « safe » : rien, ou une pièce, ou une brique de lait, ou une pièce ROUGE,
//     ou une flaque de boue sur une voie ;
//   - « statique » : animal / fermier / botte / voiture garée posé dans une
//     colonne — on le saute s'il est bas, on le contourne sinon ;
//   - « traverse » : un TRACTEUR qui traverse, ou une POULE LANCÉE par un
//     fermier posté au bord. ⚠️ Calés sur le passage du joueur (6 septembre
//     2026 : « quand il y a un tracteur qui traverse, il faut vraiment qu'il
//     traverse quand on est là ») : la traversée s'arme ~4 s avant l'arrivée
//     du joueur et vise une colonne au moment où il passe.
//
// ⚠️ GÉNÉRATEUR À QUOTAS depuis le 9 septembre 2026 (« par ligue, il faut que
// ce soit la même course [...] chaque ligue va avoir le même nombre de
// tracteurs, le même nombre de biomes »). La route est hachée par BLOCS de
// 24 rangées : chaque bloc porte un nombre EXACT de dangers (diffusion
// d'erreur sur la courbe de densité), les espèces sortent d'un PAQUET fixe
// mélangé par la graine, les pièces sont un quota exact des rangées
// éligibles, la boue une flaque tous les deux blocs, lait et pièce rouge sur
// des rangées RÉSERVÉES par leur index. Résultat : deux graines donnent deux
// routes différentes (positions, voies, ordre des espèces) mais exactement le
// même nombre de tracteurs, de poules, de pièces, de laits… Seule exception,
// rarissime (mesurée : 0 sur 40 graines × 1 100 rangées) : un lait ou une
// pièce rouge dont la rangée réservée ne peut pas être libérée d'un danger.

import { COLS, colU, ROAD_HALF } from "./iso.js";

export const KINDS = {
  // `vmax` = vitesse plafond d'une traversée armée (u/s). Tracteur ralenti
  // le 9 septembre 2026 (« réduis la vitesse des tracteurs, parfois c'est
  // difficile d'avancer ») : 9 → 3,2, et armé plus tôt (main.js, ARM_AHEAD_S).
  tracteur:  { traverse: true,  saut: false, cout: 3, vitesse: 2.2, vmax: 3.2, long: 2.4, larg: 1.05, h: 1.4, nom: "un tracteur" },
  poulelancee: { traverse: true, saut: true, cout: 1, vitesse: 4.5, vmax: 9, long: 0.55, larg: 0.5, h: 0.55, nom: "une poule lancée" },
  poule:    { traverse: false, saut: true,  cout: 1, long: 0.55, larg: 0.5,  h: 0.55, nom: "une poule" },
  chat:     { traverse: false, saut: true,  cout: 1, long: 0.6,  larg: 0.35, h: 0.4,  nom: "un chat" },
  chien:    { traverse: false, saut: true,  cout: 1, long: 0.8,  larg: 0.4,  h: 0.6,  nom: "un chien" },
  mouton:   { traverse: false, saut: true,  cout: 1, long: 0.9,  larg: 0.6,  h: 0.7,  nom: "un mouton" },
  botte:    { traverse: false, saut: true,  cout: 1, long: 0.9,  larg: 0.9,  h: 0.75, nom: "une botte de foin" },
  cochon:   { traverse: false, saut: false, cout: 2, long: 1.0,  larg: 0.6,  h: 0.7,  nom: "un cochon" },
  vache:    { traverse: false, saut: false, cout: 2, long: 1.5,  larg: 0.8,  h: 1.1,  nom: "une vache" },
  fermier:  { traverse: false, saut: false, cout: 2, long: 0.5,  larg: 0.5,  h: 1.8,  nom: "un fermier" },
  voiture:  { traverse: false, saut: false, cout: 2, long: 0.95, larg: 2.0,  h: 0.75, nom: "une voiture garée" },
};

export const GRACE_ROWS = 40;    // 10 → 40 (« laisse vraiment du temps au début ») : ~9 s sans rien
const RAMP_ROWS = 1000;
const P_DANGER_START = 0.10, P_DANGER_MAX = 0.30; // 0,42 → 0,30 (« trop d'informations en même temps »)
const GAP_MIN = 3;               // toujours 3 rangées sûres après un danger
export const BLOC = 24;          // taille d'un bloc de génération
const P_PIECE = 0.25;            // pièces sur 25 % des rangées éligibles (40 % avant : « beaucoup trop »)
const LAIT_EVERY = 48;           // brique de lait : rangées 24, 72, 120…
const ROUGE_EVERY = 70;          // pièce rouge : rangées 40, 110, 180…
const BOUE_DEBUT_T = 0.08;       // pas de boue avant 8 % de la rampe

// Paquets d'espèces (12 dangers chacun), par phase du parcours : les deux
// premiers paquets sont doux, puis les gros animaux arrivent, puis les
// tracteurs doublent. Même composition pour toutes les graines.
const PAQUETS = [
  ["poule", "poule", "poule", "chat", "chat", "chien", "mouton", "mouton", "botte", "botte", "tracteur", "poulelancee"],
  ["poule", "poule", "chat", "chien", "mouton", "botte", "cochon", "vache", "fermier", "voiture", "tracteur", "poulelancee"],
  ["poule", "chat", "mouton", "botte", "cochon", "cochon", "vache", "fermier", "voiture", "tracteur", "tracteur", "poulelancee"],
];
function paquetPour(d) { return PAQUETS[d < 2 ? 0 : d < 5 ? 1 : 2]; }

// --- La route : une CLASSE (9 septembre 2026) ---------------------------------
// Tout l'état (graine, cache de rangées, fenêtre sûre, quotas, pièces prises,
// collisions résolues) vit dans une instance `Route`. Le jeu utilise
// l'instance `live` à travers les fonctions exportées plus bas ; la
// simulation du score parfait (simulation.js) crée SES PROPRES instances et
// ne touche jamais au parcours en cours — on peut la lancer pendant une
// course ou sur l'écran de fin sans faire disparaître une pièce ramassée.
export class Route {
  constructor(seed) {
    this.seed = seed !== undefined ? seed : Math.floor(Math.random() * 100000);
    this.cache = new Map();
    this.fenetreSure = null;   // [from, to] : rangées forcées sûres (turbo lait)
    this.piecesCumul = new Map();
    this.resolved = new Set();
    this.coins = new Set();
  }
  hash(n) {
    const x = Math.sin(n * 91.173 + this.seed * 0.731) * 43758.5453;
    return x - Math.floor(x);
  }
  reset() { this.cache.clear(); this.resolved.clear(); this.coins.clear(); this.piecesCumul.clear(); this.fenetreSure = null; }
  dansFenetre(r) { return this.fenetreSure !== null && r >= this.fenetreSure[0] && r <= this.fenetreSure[1]; }
  rangeeSure(r) {
    return { type: "safe", coins: r % 3 === 1 ? [Math.floor(this.hash(r * 11 + 4) * COLS)] : [], boue: null };
  }
  // TURBO LAIT (7 septembre 2026 : « quand ça va plus vite, il faudrait qu'à
  // ce moment il n'y ait pas d'obstacles, sinon personne ne voudra aller plus
  // vite ») : les rangées [from, to] deviennent sûres, avec une pièce sur
  // trois — même celles déjà hachées, tant qu'elles ne sont pas à l'écran.
  ouvrirFenetreSure(from, to) {
    this.fenetreSure = [from, to];
    for (let r = from; r <= to; r++) this.cache.set(r, this.rangeeSure(r));
  }

  // Mélange de Fisher-Yates seedé (paquet d'espèces, pièces).
  melange(liste, k) {
    const a = liste.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.hash(k * 131 + i * 17 + 5) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  especeDanger(i) { const d = Math.floor(i / 12); return this.melange(paquetPour(d), 1000 + d)[i % 12]; }

  // Répartit `libres` rangées libres dans n+1 trous (bâtons et étoiles seedés).
  trous(n, libres, k) {
    const coupes = [];
    for (let i = 0; i < n; i++) coupes.push(Math.floor(this.hash(k * 7 + i * 13 + 2) * (libres + 1)));
    coupes.sort((a, b) => a - b);
    const g = [];
    let prev = 0;
    for (const c of coupes) { g.push(c - prev); prev = c; }
    g.push(libres - prev);
    return g;
  }

  // Positions des n dangers dans le bloc (rangées relatives 0..23), chaque
  // danger suivi de GAP_MIN rangées sûres, jamais sur une rangée réservée.
  positionsDangers(b, n) {
    const r0 = GRACE_ROWS + b * BLOC;
    const libres = BLOC - n * (1 + GAP_MIN);
    let pos = [];
    for (let essai = 0; essai < 30; essai++) {
      const g = this.trous(n, libres, b * 97 + essai);
      pos = [];
      let cur = g[0];
      for (let i = 0; i < n; i++) { pos.push(cur); cur += 1 + GAP_MIN + g[i + 1]; }
      if (pos.every((p) => !estReservee(r0 + p))) return pos;
    }
    // Repli (jamais mesuré) : le lait / la pièce rouge de la rangée réservée
    // saute pour cette graine.
    return pos;
  }

  // Un bloc complet : dangers, pièces, boue, lait, pièce rouge.
  genererBloc(b) {
    const r0 = GRACE_ROWS + b * BLOC;
    const n = nbDangersBloc(b);
    const pos = this.positionsDangers(b, n);
    const base = indexDangerBase(b);
    const rowsBloc = new Array(BLOC);
    const apresDanger = new Set();
    pos.forEach((p, j) => {
      const r = r0 + p;
      const kind = this.especeDanger(base + j);
      const K = KINDS[kind];
      apresDanger.add(p + 1);
      if (K.traverse) {
        const dir = this.hash(r * 19 + 8) < 0.5 ? -1 : 1;
        // Colonne visée au moment où le joueur passe : le tracteur couvre deux
        // voies, la poule une seule — il reste toujours de quoi passer.
        const cible = Math.floor(this.hash(r * 23 + 9) * COLS);
        rowsBloc[p] = { type: "traverse", kind, dir, cible, armed: false, t0: 0, u0: 0, vitesse: K.vitesse, coins: [], boue: null };
      } else {
        rowsBloc[p] = { type: "statique", kind, cols: [Math.floor(this.hash(r * 19 + 8) * COLS)], coins: [], boue: null };
      }
    });
    for (let p = 0; p < BLOC; p++) if (!rowsBloc[p]) rowsBloc[p] = { type: "safe", coins: [], boue: null };
    // Lait et pièce rouge sur leurs rangées réservées (si elles sont sûres).
    for (let p = 0; p < BLOC; p++) {
      const r = r0 + p, row = rowsBloc[p];
      if (row.type !== "safe") continue;
      if (r % LAIT_EVERY === LAIT_EVERY / 2) row.lait = Math.floor(this.hash(r * 53 + 2) * COLS);
      else if (r % ROUGE_EVERY === 40) row.rouge = Math.floor(this.hash(r * 59 + 3) * COLS);
    }
    // Pièces : quota exact (diffusion d'erreur) sur les rangées éligibles —
    // sûres, pas juste après un danger (une chose à la fois), sans lait ni rouge.
    const eligibles = [];
    for (let p = 0; p < BLOC; p++) { const row = rowsBloc[p]; if (row.type === "safe" && !apresDanger.has(p) && row.lait === undefined && row.rouge === undefined) eligibles.push(p); }
    const nPieces = this.nbPiecesBloc(b, eligibles.length);
    for (const p of this.melange(eligibles, 2000 + b).slice(0, nPieces)) rowsBloc[p].coins = [Math.floor(this.hash((r0 + p) * 11 + 4) * COLS)];
    // Boue : une flaque de 3 rangées sur une voie, tous les deux blocs.
    if (b % 2 === 1 && tBloc(b) > BOUE_DEBUT_T) {
      const departs = [];
      for (let p = 0; p + 2 < BLOC; p++) if (rowsBloc[p].type === "safe" && rowsBloc[p + 1].type === "safe" && rowsBloc[p + 2].type === "safe") departs.push(p);
      if (departs.length) {
        const p = departs[Math.floor(this.hash(b * 43 + 6) * departs.length)];
        const voie = Math.floor(this.hash(b * 47 + 1) * COLS);
        for (let i = 0; i < 3; i++) rowsBloc[p + i].boue = voie;
      }
    }
    for (let p = 0; p < BLOC; p++) { const r = r0 + p; if (!this.cache.has(r) && !this.dansFenetre(r)) this.cache.set(r, rowsBloc[p]); }
  }
  // Quota de pièces cumulé : P_PIECE × rangées éligibles, arrondi par diffusion.
  nbPiecesBloc(b, nElig) {
    const avant = b > 0 ? (this.piecesCumul.get(b - 1) || 0) : 0;
    const cumul = avant + P_PIECE * nElig;
    this.piecesCumul.set(b, cumul);
    return Math.round(cumul) - Math.round(avant);
  }

  rowAt(r) {
    const hit = this.cache.get(r);
    if (hit) return hit;
    if (r < GRACE_ROWS || this.dansFenetre(r)) { const row = this.rangeeSure(r); this.cache.set(r, row); return row; }
    const b = Math.floor((r - GRACE_ROWS) / BLOC);
    // Les blocs se génèrent dans l'ordre (le quota de pièces se diffuse).
    for (let k = 0; k <= b; k++) if (!this.piecesCumul.has(k)) this.genererBloc(k);
    return this.cache.get(r);
  }

  coinTaken(r, c) { return this.coins.has(`${r}:${c}`); }
  bonusTaken(r, kind) { return this.coins.has(`${r}:${kind}`); }

  checkMember(id, u, v, airborne, t) {
    const r = Math.floor(v + 0.5);
    const row = this.rowAt(r);
    const events = [];
    for (const c of row.coins) {
      if (this.coins.has(`${r}:${c}`)) continue;
      if (Math.abs(u - colU(c)) < 0.55 && Math.abs(v - r) < 0.45) {
        this.coins.add(`${r}:${c}`);
        events.push({ type: "piece", r, c });
      }
    }
    for (const kind of ["lait", "rouge"]) {
      if (row[kind] === undefined || this.coins.has(`${r}:${kind}`)) continue;
      if (Math.abs(u - colU(row[kind])) < 0.55 && Math.abs(v - r) < 0.45) {
        this.coins.add(`${r}:${kind}`);
        events.push({ type: kind, r, c: row[kind] });
      }
    }
    if (row.type === "traverse") {
      for (const inst of crossersAt(r, row, t)) {
        const key = `${inst.id}:${id}`;
        if (this.resolved.has(key)) continue;
        if (Math.abs(inst.u - u) < inst.K.long / 2 + 0.3 && Math.abs(v - r) < 0.5) {
          this.resolved.add(key);
          if (!(airborne && inst.K.saut)) events.push({ type: "obstacle", kind: inst.kind, cout: inst.K.cout, saut: inst.K.saut });
        }
      }
    } else if (row.type === "statique") {
      const key = `s${r}:${id}`;
      if (!this.resolved.has(key)) {
        const K = KINDS[row.kind];
        for (const c of row.cols) {
          if (Math.abs(u - colU(c)) < 0.58 && Math.abs(v - r) < K.larg / 2 + 0.15) {
            this.resolved.add(key);
            if (!(airborne && K.saut)) events.push({ type: "obstacle", kind: row.kind, cout: K.cout, saut: K.saut });
            break;
          }
        }
      }
    }
    return events;
  }
}

// --- Densité et quotas (indépendants de la graine) ------------------------------
// Densité EFFECTIVE de dangers (dangers par rangée) : l'ancien tirage à
// probabilité p suivi de 3 rangées sûres donnait p / (1 + 3p), soit 7,7 % au
// départ → 15,8 % au bout de la rampe. Même courbe, mais en quota exact.
function densiteDanger(t) { const p = P_DANGER_START + (P_DANGER_MAX - P_DANGER_START) * t; return p / (1 + GAP_MIN * p); }
function tBloc(b) { return Math.min(1, Math.max(0, (GRACE_ROWS + b * BLOC) / RAMP_ROWS)); }
function cumulDangers(b) { let s = 0; for (let k = 0; k <= b; k++) s += BLOC * densiteDanger(tBloc(k)); return s; }
export function nbDangersBloc(b) { return b < 0 ? 0 : Math.round(cumulDangers(b)) - (b > 0 ? Math.round(cumulDangers(b - 1)) : 0); }
function indexDangerBase(b) { return b > 0 ? Math.round(cumulDangers(b - 1)) : 0; }
function estReservee(r) { return r % LAIT_EVERY === LAIT_EVERY / 2 || r % ROUGE_EVERY === 40; }

// Armement d'une traversée : elle part du bord et atteint la colonne visée
// exactement à `tArrivee` (instant où le joueur sera sur la rangée), dans la
// limite de sa vitesse plafond (le tracteur reste lent et lisible).
export function armer(row, now, tArrivee) {
  if (row.armed) return;
  row.armed = true;
  row.t0 = now;
  row.u0 = -row.dir * (ROAD_HALF + 6.0); // part hors champ (l'écran montre ~±8 unités)
  const dist = Math.abs(colU(row.cible) - row.u0);
  const dt = Math.max(0.6, tArrivee - now);
  const K = KINDS[row.kind];
  row.vitesse = Math.max(1.8, Math.min(K.vmax || 9, dist / dt));
}

// Instance visible d'une traversée à l'instant t (une seule par rangée).
export function crossersAt(r, row, t) {
  if (!row.armed) return [];
  const K = KINDS[row.kind];
  const u = row.u0 + row.dir * row.vitesse * (t - row.t0);
  if (Math.abs(u) > ROAD_HALF + 6.4) return [];
  return [{ id: r * 100003, r, u, dir: row.dir, kind: row.kind, K }];
}

// --- L'instance VIVANTE (celle du jeu) et son API historique ----------------------
let live = new Route();
export function getSeed() { return live.seed; }
export function reseed(force) { live = new Route(force); }
export function reset() { live.reset(); }
export function ouvrirFenetreSure(from, to) { live.ouvrirFenetreSure(from, to); }
export function rowAt(r) { return live.rowAt(r); }
export function coinTaken(r, c) { return live.coinTaken(r, c); }
export function bonusTaken(r, kind) { return live.bonusTaken(r, kind); }
export function checkMember(id, u, v, airborne, t) { return live.checkMember(id, u, v, airborne, t); }
