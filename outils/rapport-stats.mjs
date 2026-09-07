#!/usr/bin/env node
// Rapport statistique « La ville est belle » — généré depuis Supabase.
//
//   node outils/rapport-stats.mjs            → rapports/rapport-AAAA-MM-JJ.txt
//   node outils/rapport-stats.mjs --stdout   → sur la sortie standard
//
// Ne lit QUE ce que la clé anon a le droit de lire (courses, clics_ep,
// scores_public). Aucun compte Instagram n'est rapatrié ni écrit : la vue
// scores_public ne sert que pseudo + score, et c'est voulu (voir
// supabase-migration-pseudo-insta.sql). Ne modifie jamais la base.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TZ = "Europe/Paris";

// --- Config lue directement dans config.js (source de vérité unique) --------
const src = readFileSync(resolve(RACINE, "config.js"), "utf8");
const lire = (cle) => (src.match(new RegExp(`${cle}\\s*:\\s*"([^"]+)"`)) || [])[1];
const BASE = lire("apiScores")?.replace(/\/scores$/, "");
const CLE = lire("apiScoresKey");
if (!BASE || !CLE) { console.error("config.js : apiScores/apiScoresKey introuvables."); process.exit(1); }

const entetes = (extra = {}) => ({ apikey: CLE, Authorization: `Bearer ${CLE}`, ...extra });

// Rapatrie une table entière, page par page (PostgREST plafonne à 1000).
async function tout(chemin, select, ordre) {
  const lignes = [];
  for (let debut = 0; ; debut += 1000) {
    const url = `${BASE}/${chemin}?select=${select}${ordre ? `&order=${ordre}` : ""}`;
    const res = await fetch(url, { headers: entetes({ Range: `${debut}-${debut + 999}` }) });
    if (!res.ok && res.status !== 206) break;
    const lot = await res.json();
    lignes.push(...lot);
    if (lot.length < 1000) break;
  }
  return lignes;
}

// Compte sans rapatrier (Content-Range). exact : c'est un outil hors ligne,
// pas le jeu — le coût d'un count complet est sans importance ici.
async function compter(chemin, filtre = "") {
  const res = await fetch(`${BASE}/${chemin}?select=id${filtre}`, {
    headers: entetes({ Prefer: "count=exact", Range: "0-0" }),
  });
  const r = res.headers.get("content-range") || "";
  const n = Number(r.split("/")[1]);
  return Number.isFinite(n) ? n : 0;
}

// --- Petite boîte à outils statistique -------------------------------------
const somme = (t) => t.reduce((a, b) => a + b, 0);
const moyenne = (t) => (t.length ? somme(t) / t.length : 0);
const median = (t) => quantile(t, 0.5);
function quantile(tri, q) {
  if (!tri.length) return 0;
  const i = (tri.length - 1) * q, bas = Math.floor(i), haut = Math.ceil(i);
  return bas === haut ? tri[bas] : tri[bas] + (tri[haut] - tri[bas]) * (i - bas);
}
function ecartType(t) {
  if (t.length < 2) return 0;
  const m = moyenne(t);
  return Math.sqrt(somme(t.map((x) => (x - m) ** 2)) / (t.length - 1));
}
const fr = (n, d = 0) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (a, b) => (b ? `${fr(100 * a / b, 1)} %` : "—");

// Parties datées d'un ISO → composantes en heure de Paris.
const partiesDate = (iso) => {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "long", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) % 24, jourSemaine: p.weekday, d };
};

// Histogramme texte.
function barres(entrees, largeur = 42) {
  const max = Math.max(1, ...entrees.map(([, v]) => v));
  const lg = Math.max(...entrees.map(([k]) => String(k).length));
  return entrees.map(([k, v]) => {
    const n = Math.round((v / max) * largeur);
    return `  ${String(k).padEnd(lg)}  ${"█".repeat(n)}${"·".repeat(largeur - n)}  ${String(fr(v)).padStart(6)}`;
  }).join("\n");
}

const groupe = (items, cle) => items.reduce((acc, x) => { const k = cle(x); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
const trieCle = (obj) => Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : 1));
const trieVal = (obj) => Object.entries(obj).sort(([, a], [, b]) => b - a);

// ---------------------------------------------------------------------------
const L = [];
const ecrire = (...l) => L.push(...l);
const titre = (t) => ecrire("", "═".repeat(78), `  ${t.toUpperCase()}`, "═".repeat(78), "");
const soustitre = (t) => ecrire("", `── ${t} ${"─".repeat(Math.max(0, 74 - t.length))}`, "");

const courses = await tout("courses", "cree_le", "cree_le.asc");
const clics = await tout("clics_ep", "cree_le,plateforme", "cree_le.asc");
const scores = await tout("scores_public", "pseudo,score", "score.desc");
// Compteurs optionnels (tables créées plus tard — 0 si absentes).
const clicsSuivre = await tout("clics_suivre", "cree_le").catch(() => []);
const tuto = await tout("tutoriel", "cree_le,etape,termine,partie").catch(() => []);

const maintenant = new Date();
const SORTIE = new Date("2026-08-28T01:00:00+02:00"); // sortie de l'album

const cJours = groupe(courses.map((c) => partiesDate(c.cree_le)), (p) => p.jour);
const clJours = groupe(clics.map((c) => partiesDate(c.cree_le)), (p) => p.jour);
const cHeures = groupe(courses.map((c) => partiesDate(c.cree_le)), (p) => p.heure);
const cSemaine = groupe(courses.map((c) => partiesDate(c.cree_le)), (p) => p.jourSemaine);
const jours = trieCle(cJours);
const valeursScores = scores.map((s) => s.score).sort((a, b) => a - b);

const depuisSortie = (t) => t.filter((x) => new Date(x.cree_le) >= SORTIE).length;
const coursesDepuis = depuisSortie(courses);
const clicsDepuis = depuisSortie(clics);

ecrire(
  "╔" + "═".repeat(76) + "╗",
  "║" + "  LA VILLE EST BELLE — RAPPORT STATISTIQUE".padEnd(76) + "║",
  "║" + `  Généré le ${maintenant.toLocaleString("fr-FR", { timeZone: TZ })} (heure de Paris)`.padEnd(76) + "║",
  "║" + "  Source : Supabase (tables courses, clics_ep, scores_public)".padEnd(76) + "║",
  "╚" + "═".repeat(76) + "╝",
  "",
  "Toutes les dates et heures de ce rapport sont en heure de Paris.",
  "Ce rapport est lisible tel quel ET conçu pour être ré-analysé par un outil :",
  "les tableaux sont à colonnes fixes, les nombres bruts sont en fin de ligne.",
);

titre("1. Vue d'ensemble");
const premiere = courses.length ? partiesDate(courses[0].cree_le) : null;
const derniere = courses.length ? partiesDate(courses.at(-1).cree_le) : null;
const nbJours = jours.length;
ecrire(
  `  Parties terminées (total)              ${fr(courses.length).padStart(10)}`,
  `  Joueurs identifiés au classement       ${fr(scores.length).padStart(10)}`,
  `  Clics vers l'album (total)             ${fr(clics.length).padStart(10)}`,
  `  Clics « s'abonner à PMC »              ${fr(clicsSuivre.length).padStart(10)}`,
  "",
  `  Première partie enregistrée            ${premiere ? premiere.jour : "—"}`,
  `  Dernière partie enregistrée            ${derniere ? derniere.jour : "—"}`,
  `  Jours d'activité                       ${fr(nbJours).padStart(10)}`,
  "",
  `  Parties par joueur (moyenne)           ${fr(courses.length / Math.max(1, scores.length), 2).padStart(10)}`,
  `  Parties par jour (moyenne)             ${fr(courses.length / Math.max(1, nbJours), 1).padStart(10)}`,
  `  Parties par jour (médiane)             ${fr(median(Object.values(cJours).sort((a, b) => a - b)), 1).padStart(10)}`,
  `  Jour le plus actif                     ${trieVal(cJours)[0]?.[0] || "—"} (${fr(trieVal(cJours)[0]?.[1] || 0)} parties)`,
  "",
  "  — Depuis la sortie de l'album (28/08/2026 01:00) —",
  `  Parties                                ${fr(coursesDepuis).padStart(10)}   soit ${pct(coursesDepuis, courses.length)} du total`,
  `  Clics vers l'album                     ${fr(clicsDepuis).padStart(10)}   soit ${pct(clicsDepuis, clics.length)} du total`,
  `  Taux de clic sur la période            ${pct(clicsDepuis, coursesDepuis).padStart(10)}   (clics / parties)`,
);

titre("2. Activité jour par jour");
ecrire("  JOUR         PARTIES   CLICS   TAUX      CUMUL PARTIES");
ecrire("  " + "-".repeat(60));
let cumul = 0;
for (const [j, n] of jours) {
  cumul += n;
  const c = clJours[j] || 0;
  ecrire(`  ${j}   ${String(fr(n)).padStart(7)}  ${String(fr(c)).padStart(6)}  ${pct(c, n).padStart(7)}   ${String(fr(cumul)).padStart(9)}`);
}
soustitre("Parties par jour (histogramme)");
ecrire(barres(jours));

soustitre("Évolution jour à jour");
for (let i = 1; i < jours.length; i++) {
  const [j, n] = jours[i], prec = jours[i - 1][1];
  const delta = n - prec;
  const signe = delta > 0 ? "+" : "";
  ecrire(`  ${j}   ${String(fr(n)).padStart(6)}   ${(signe + fr(delta)).padStart(7)}   ${(signe + (prec ? (100 * delta / prec).toFixed(0) : "—")).padStart(5)} %`);
}

titre("3. Rythme de jeu (heures et jours de la semaine)");
soustitre("Parties par heure de la journée (toutes dates confondues)");
ecrire(barres(Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2, "0")} h`, cHeures[h] || 0])));
const heurePic = trieVal(cHeures)[0];
ecrire("", `  Heure de pointe : ${String(heurePic?.[0]).padStart(2, "0")} h (${fr(heurePic?.[1] || 0)} parties)`);
const nuit = somme([0, 1, 2, 3, 4, 5].map((h) => cHeures[h] || 0));
ecrire(`  Parties entre minuit et 6 h : ${fr(nuit)} (${pct(nuit, courses.length)})`);

soustitre("Parties par jour de la semaine");
const ordreSem = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
ecrire(barres(ordreSem.map((j) => [j, cSemaine[j] || 0])));

titre("4. Scores");
const moy = moyenne(valeursScores), med = median(valeursScores), et = ecartType(valeursScores);
ecrire(
  `  Joueurs classés                        ${fr(scores.length).padStart(12)}`,
  `  Score moyen                            ${fr(moy).padStart(12)}`,
  `  Score médian                           ${fr(med).padStart(12)}`,
  `  Écart-type                             ${fr(et).padStart(12)}`,
  `  Coefficient de variation               ${fr(moy ? et / moy : 0, 2).padStart(12)}`,
  `  Score minimum                          ${fr(valeursScores[0] || 0).padStart(12)}`,
  `  Score maximum                          ${fr(valeursScores.at(-1) || 0).padStart(12)}`,
  `  Étendue                                ${fr((valeursScores.at(-1) || 0) - (valeursScores[0] || 0)).padStart(12)}`,
  `  Somme de tous les scores               ${fr(somme(valeursScores)).padStart(12)}`,
);
soustitre("Percentiles");
for (const q of [0.01, 0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99, 0.999]) {
  ecrire(`  P${String((q * 100).toFixed(1)).padStart(5)}   ${String(fr(quantile(valeursScores, q))).padStart(12)}`);
}
const q1 = quantile(valeursScores, 0.25), q3 = quantile(valeursScores, 0.75);
ecrire("", `  Écart interquartile (Q3−Q1)            ${fr(q3 - q1).padStart(12)}`);
ecrire(`  Moustache haute (Q3 + 1,5×EIQ)         ${fr(q3 + 1.5 * (q3 - q1)).padStart(12)}`);
ecrire(`  Joueurs au-dessus (« hors normes »)    ${fr(valeursScores.filter((s) => s > q3 + 1.5 * (q3 - q1)).length).padStart(12)}`);

soustitre("Distribution par tranche");
const tranches = [0, 1000, 5000, 12000, 25000, 50000, 100000, 250000, 500000, 1000000, Infinity];
const nomsTranches = tranches.slice(0, -1).map((t, i) => {
  const h = tranches[i + 1];
  return h === Infinity ? `≥ ${fr(t)}` : `${fr(t)} – ${fr(h - 1)}`;
});
const parTranche = nomsTranches.map((nom, i) =>
  [nom, valeursScores.filter((s) => s >= tranches[i] && s < tranches[i + 1]).length]);
ecrire(barres(parTranche));

soustitre("Seuils de gameplay");
const franchi = (s) => valeursScores.filter((v) => v >= s).length;
for (const [nom, seuil] of [
  ["Premier palier (bandeau en course)", 12000],
  ["50 000", 50000],
  ["100 000", 100000],
  ["Easter egg vocal PMC", 500000],
  ["1 million", 1000000],
]) {
  ecrire(`  ${nom.padEnd(38)} ${String(fr(seuil)).padStart(9)}   ${String(fr(franchi(seuil))).padStart(4)} joueurs   ${pct(franchi(seuil), scores.length).padStart(7)}`);
}

soustitre("Top 20");
ecrire("  RANG  PSEUDO                          SCORE      % DU MAX");
ecrire("  " + "-".repeat(60));
const max = valeursScores.at(-1) || 1;
scores.slice(0, 20).forEach((s, i) => {
  ecrire(`  ${String(i + 1).padStart(4)}  ${String(s.pseudo).slice(0, 28).padEnd(30)} ${String(fr(s.score)).padStart(10)}   ${pct(s.score, max).padStart(7)}`);
});

soustitre("Concentration");
const totalPts = somme(valeursScores) || 1;
for (const n of [1, 3, 10, 50, 100]) {
  const part = somme(scores.slice(0, n).map((s) => s.score));
  ecrire(`  Les ${String(n).padStart(3)} meilleurs joueurs pèsent ${pct(part, totalPts).padStart(7)} des points cumulés`);
}
const sousMoyenne = valeursScores.filter((s) => s < moy).length;
ecrire("", `  Joueurs sous la moyenne : ${fr(sousMoyenne)} (${pct(sousMoyenne, scores.length)}) — signe d'une distribution très asymétrique.`);

titre("5. Clics vers l'album");
const parPlateforme = groupe(clics, (c) => c.plateforme || "(non étiqueté)");
ecrire(`  Total des clics                        ${fr(clics.length).padStart(10)}`);
ecrire(`  Clics par partie (toute la période)    ${fr(clics.length / Math.max(1, courses.length), 3).padStart(10)}`);
ecrire(`  Clics par joueur classé                ${fr(clics.length / Math.max(1, scores.length), 3).padStart(10)}`);
soustitre("Répartition par plateforme");
ecrire(barres(trieVal(parPlateforme)));
ecrire("");
for (const [p, n] of trieVal(parPlateforme)) {
  ecrire(`  ${p.padEnd(20)} ${String(fr(n)).padStart(5)}   ${pct(n, clics.length).padStart(7)}`);
}
soustitre("Clics par heure de la journée");
const clHeures = groupe(clics.map((c) => partiesDate(c.cree_le)), (p) => p.heure);
ecrire(barres(Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2, "0")} h`, clHeures[h] || 0])));

soustitre("Délai entre deux clics consécutifs");
const delais = [];
for (let i = 1; i < clics.length; i++) {
  delais.push((new Date(clics[i].cree_le) - new Date(clics[i - 1].cree_le)) / 60000);
}
const delaisTries = [...delais].sort((a, b) => a - b);
if (delais.length) ecrire(
  `  Délai moyen                            ${fr(moyenne(delais), 1).padStart(10)} min`,
  `  Délai médian                           ${fr(median(delaisTries), 1).padStart(10)} min`,
  `  Délai le plus court                    ${fr(delaisTries[0], 1).padStart(10)} min`,
  `  Délai le plus long                     ${fr(delaisTries.at(-1), 1).padStart(10)} min`,
);

titre("6. Compteurs récents (0 tant que la migration n'est pas passée)");
ecrire(
  `  Clics « s'abonner à PMC » (palier 2)   ${fr(clicsSuivre.length).padStart(10)}`,
  `  Événements tutoriel enregistrés        ${fr(tuto.length).padStart(10)}`,
);
if (tuto.length) {
  const demarres = tuto.filter((t) => t.etape === 0).length;
  const termines = tuto.filter((t) => t.termine).length;
  ecrire("", `  Tutoriels démarrés                     ${fr(demarres).padStart(10)}`);
  ecrire(`  Tutoriels terminés                     ${fr(termines).padStart(10)}`);
  ecrire(`  Taux d'achèvement                      ${pct(termines, demarres).padStart(10)}`);
  soustitre("Abandons par étape");
  const parEtape = groupe(tuto.filter((t) => !t.termine), (t) => `étape ${t.etape}`);
  ecrire(barres(trieCle(parEtape)));
}
if (!clicsSuivre.length && !tuto.length) {
  ecrire("", "  Aucune donnée : exécute supabase-migration-tracking.sql côté Supabase,",
    "  puis redéploie le jeu. Les chiffres apparaîtront ici d'eux-mêmes.");
}

titre("7. Statistiques inutiles mais amusantes");
const pseudos = scores.map((s) => String(s.pseudo || ""));
const longueurs = pseudos.map((p) => p.length).sort((a, b) => a - b);
const avecChiffre = pseudos.filter((p) => /\d/.test(p)).length;
const majuscule = pseudos.filter((p) => /^[A-ZÀ-Ý]/.test(p)).length;
const toutMinuscule = pseudos.filter((p) => p === p.toLowerCase()).length;
const avecPoint = pseudos.filter((p) => p.includes(".")).length;
const avecUnderscore = pseudos.filter((p) => p.includes("_")).length;
ecrire(
  `  Longueur moyenne des pseudos           ${fr(moyenne(longueurs), 2).padStart(10)} caractères`,
  `  Longueur médiane                       ${fr(median(longueurs), 1).padStart(10)} caractères`,
  `  Pseudo le plus court                   ${(pseudos.find((p) => p.length === longueurs[0]) || "—").padStart(10)}`,
  `  Pseudo le plus long                    ${(pseudos.find((p) => p.length === longueurs.at(-1)) || "—")}`,
  `  Pseudos contenant un chiffre           ${fr(avecChiffre).padStart(10)}   ${pct(avecChiffre, pseudos.length)}`,
  `  Pseudos commençant par une majuscule   ${fr(majuscule).padStart(10)}   ${pct(majuscule, pseudos.length)}`,
  `  Pseudos entièrement en minuscules      ${fr(toutMinuscule).padStart(10)}   ${pct(toutMinuscule, pseudos.length)}`,
  `  Pseudos avec un point                  ${fr(avecPoint).padStart(10)}   ${pct(avecPoint, pseudos.length)}`,
  `  Pseudos avec un underscore             ${fr(avecUnderscore).padStart(10)}   ${pct(avecUnderscore, pseudos.length)}`,
);
soustitre("Première lettre des pseudos");
const lettres = groupe(pseudos.filter((p) => p), (p) => p[0].toLowerCase());
ecrire(barres(trieVal(lettres).slice(0, 12)));

soustitre("Loi de Benford sur les scores (premier chiffre)");
ecrire("  Théorie : dans une série « naturelle », le 1 sort ~30 % du temps, le 9 ~4,6 %.");
ecrire("");
const benford = groupe(valeursScores.filter((s) => s > 0), (s) => String(s)[0]);
for (let c = 1; c <= 9; c++) {
  const obs = benford[c] || 0;
  const attendu = Math.log10(1 + 1 / c) * valeursScores.filter((s) => s > 0).length;
  ecrire(`  chiffre ${c}   observé ${String(fr(obs)).padStart(5)} (${pct(obs, valeursScores.length).padStart(6)})   attendu ${String(fr(attendu, 0)).padStart(5)} (${fr(100 * Math.log10(1 + 1 / c), 1)} %)`);
}
soustitre("Divers")
const ronds = valeursScores.filter((s) => s % 1000 === 0).length;
const pairs = valeursScores.filter((s) => s % 2 === 0).length;
ecrire(
  `  Scores multiples de 1000               ${fr(ronds).padStart(10)}   ${pct(ronds, valeursScores.length)}`,
  `  Scores pairs                           ${fr(pairs).padStart(10)}   ${pct(pairs, valeursScores.length)}`,
  `  Somme de tous les scores               ${fr(somme(valeursScores)).padStart(10)}`,
  `  Si chaque point valait 1 centime       ${fr(somme(valeursScores) / 100, 2).padStart(10)} €`,
  `  Durée cumulée estimée des parties      ${fr(courses.length * 90 / 3600, 1).padStart(10)} heures  (à 90 s/partie, ESTIMATION grossière)`,
);

titre("8. Ce que ce rapport ne peut pas dire");
ecrire(
  "  Ces angles morts sont dus au tracking, pas au calcul. Ils disparaîtront",
  "  au fur et à mesure que les compteurs de la section 6 se remplissent.",
  "",
  "  • Visiteurs uniques : aucun analytics de page n'est branché sur le site.",
  "  • Joueurs par jour : la table `scores` n'expose pas de date à la clé anon,",
  "    et le trigger « meilleur score » réécrit created_at à chaque record.",
  "  • Clics dédupliqués : tant que la colonne `joueur` n'est pas remplie,",
  "    82 clics peuvent venir de 82 personnes comme de 20.",
  "  • Abandons : `courses` ne compte que les parties TERMINÉES. Quelqu'un qui",
  "    ouvre le jeu et ferme l'onglet n'apparaît nulle part.",
  "  • Durée réelle des parties : non enregistrée avant la migration tracking.",
  "",
  "═".repeat(78),
  "  Fin du rapport.",
  "═".repeat(78),
);

const texte = L.join("\n") + "\n";
if (process.argv.includes("--stdout")) {
  process.stdout.write(texte);
} else {
  const jour = new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, dateStyle: "short" }).format(maintenant);
  const chemin = resolve(RACINE, "rapports", `rapport-${jour}.txt`);
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, texte);
  console.log(`Rapport écrit : ${chemin} (${texte.split("\n").length} lignes)`);
}
