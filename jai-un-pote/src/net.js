// net.js — Ligues entre potes (7 septembre 2026 : « une compétition avec les
// gens qu'on connaît, un code de ligue [...] si la personne E joue dans la
// ligue, toutes les autres lettres rejoignent sa partie »). Supabase REST,
// même projet que le premier jeu (config.apiBase / apiKey), tables de
// supabase-migration-ligues.sql. Jamais bloquant : sans réseau ou sans
// table, tout renvoie null et le jeu tourne avec les prénoms par défaut.

function configured() { return Boolean(window.CONFIG.apiBase && window.CONFIG.apiKey); }
function url(table, query = "") { return `${window.CONFIG.apiBase}/${table}${query}`; }
function headers(extra = {}) {
  return { "Content-Type": "application/json", apikey: window.CONFIG.apiKey, Authorization: `Bearer ${window.CONFIG.apiKey}`, ...extra };
}
async function get(table, query) {
  if (!configured()) return null;
  try {
    const res = await fetch(url(table, query), { headers: headers() });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { return null; }
}
async function post(table, body, extra = {}, query = "") {
  if (!configured()) return false;
  try {
    const res = await fetch(url(table, query), { method: "POST", headers: headers({ Prefer: "return=minimal", ...extra }), body: JSON.stringify(body) });
    return res.ok;
  } catch (e) { return false; }
}

export function estConfigure() { return configured(); }
export function normaliserCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }

// Code à 5 lettres sans ambiguïté (pas de O/0, I/1).
export function genererCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)];
  return c;
}

export async function creerLigue(code, pseudo, skin = null) {
  const n = await liguesCetteSemaine();
  if (n !== null && n >= (window.CONFIG.liguesParVague || 5)) return { erreur: "vague" };
  const ok = await post("ligues", { code, nom: `Ligue de ${pseudo}`, createur: pseudo });
  if (!ok) return { erreur: "reseau" };
  return rejoindreLigue(code, pseudo, skin);
}

export const LIGUE_MAX = 6; // « limiter une ligue à 6 personnes pour l'instant »
// La bêta fermée (16 septembre 2026) a son propre plafond, porté par la
// colonne `ligues.plafond` (supabase-migration-beta.sql). Repli sur 6 si la
// migration n'est pas passée.
export function estBeta(code) { return Boolean(window.CONFIG.ligueBeta) && code === window.CONFIG.ligueBeta; }
export function plafondLigue(code) { return estBeta(code) ? (window.CONFIG.ligueBetaPlafond || 60) : LIGUE_MAX; }

// Adhésion idempotente (doublon ignoré). Renvoie { membres } ou { erreur }
// ("inexistante", "complete", "reseau").
export async function rejoindreLigue(code, pseudo, skin = null) {
  // `select=*` (et pas `code`) : la colonne `plafond` n'existe pas avant la
  // migration bêta, et PostgREST refuserait un select la nommant.
  const existe = await get("ligues", `?code=eq.${encodeURIComponent(code)}&select=*`);
  if (!existe) return { erreur: "reseau" };
  if (!existe.length) return { erreur: "inexistante" };
  const cap = Number(existe[0] && existe[0].plafond) || plafondLigue(code);
  const avant = (await membres(code)) || [];
  if (!avant.some((m) => m.nom === pseudo) && avant.length >= cap) return { erreur: "complete" };
  // Adhésion (doublon ignoré) puis mise à jour du skin si la colonne existe.
  await post("ligue_membres", { code, pseudo, skin: skin ? JSON.stringify(skin) : null }, { Prefer: "return=minimal,resolution=merge-duplicates" }, "?on_conflict=code,pseudo");
  const liste = await membres(code);
  return liste ? { membres: liste } : { erreur: "reseau" };
}

// Membres = [{ nom, skin }] dans l'ordre d'arrivée.
export async function membres(code) {
  const rows = await get("ligue_membres", `?code=eq.${encodeURIComponent(code)}&select=pseudo,skin,created_at&order=created_at.asc&limit=200`);
  if (!rows) return null;
  return rows.map((r) => { let skin = null; try { skin = r.skin ? JSON.parse(r.skin) : null; } catch (e) { skin = null; } return { nom: r.pseudo, skin }; });
}

// Vagues : 5 ligues créées par semaine (lundi → dimanche), au-delà on attend lundi.
export async function liguesCetteSemaine() {
  const lundi = debutSemaine();
  const exclus = [window.CONFIG.ligueDemo || "PMCMP", window.CONFIG.ligueBeta || "BETA"].join(",");
  const rows = await get("ligues", `?created_at=gte.${lundi.toISOString()}&code=not.in.(${exclus})&select=code`);
  return rows ? rows.length : null;
}
export function debutSemaine(d = new Date()) {
  const x = new Date(d); const j = (x.getDay() + 6) % 7; x.setDate(x.getDate() - j); x.setHours(0, 0, 0, 0); return x;
}

// Score d'une course. `extra` = { graine, trace } (9 septembre 2026 : la
// graine de la route, et la trace du fantôme quand la course bat le record
// de la ligue). ⚠️ Repli sans ces colonnes si la migration
// supabase-migration-ligues.sql (troisième partie) n'est pas passée :
// PostgREST refuse un insert portant une colonne inconnue, et le score doit
// partir quand même.
export async function envoyerScore(code, pseudo, metres, potes, mode = "course", extra = null) {
  const base = { code, pseudo, metres: Math.floor(metres), potes, mode };
  if (extra && extra.graine !== undefined && extra.graine !== null) {
    const ok = await post("ligue_scores", { ...base, graine: extra.graine, trace: extra.trace || null });
    if (ok) return true;
  }
  return post("ligue_scores", base);
}

// Le FANTÔME de la ligue : la meilleure course (avec trace) sur CETTE route.
export async function fantome(code, graine) {
  const rows = await get("ligue_scores", `?code=eq.${encodeURIComponent(code)}&mode=eq.course&graine=eq.${graine}&trace=not.is.null&select=pseudo,metres,trace&order=metres.desc&limit=1`);
  return rows && rows.length ? rows[0] : null;
}

// Relais de ligue : mètres cumulés de la semaine (vue ligue_relais).
export async function relais(code) {
  const rows = await get("ligue_relais", `?code=eq.${encodeURIComponent(code)}&select=metres,parties`);
  return rows && rows.length ? rows[0] : { metres: 0, parties: 0 };
}

// Sprint du dimanche : classement du jour, toutes ligues confondues.
export function jourSprint(d = new Date()) { return d.toISOString().slice(0, 10); }
export function sprintOuvert(d = new Date()) { return d.getDay() === 0 && d.getHours() >= 12; }
export async function classementSprint(jour) {
  return get("ligue_scores", `?mode=eq.sprint&created_at=gte.${jour}T00:00:00&select=pseudo,code,metres&order=metres.desc&limit=20`);
}

// Événements du funnel : fire-and-forget.
export function evenement(type, infos = {}) {
  if (!configured()) return;
  post("evenements", { type, ...infos }).then(() => {}, () => {});
}

// Retour d'un testeur (bêta fermée, 16 septembre 2026) : écrit depuis
// l'écran de fin, lié au pseudo, jamais relu par le jeu (table retours_beta,
// insert-only, lue dans le tableau de bord Supabase).
// ⚠️ Renvoie le DÉTAIL de l'échec (statut HTTP ou message PostgREST) : le
// premier retour de la bêta n'est jamais arrivé en base et rien à l'écran ne
// disait pourquoi. Le tiroir affiche ce détail.
export async function envoyerRetour(infos) {
  if (!configured()) return { ok: false, detail: "hors ligne" };
  try {
    const res = await fetch(url("retours_beta"), { method: "POST", headers: headers({ Prefer: "return=minimal" }), body: JSON.stringify(infos) });
    if (res.ok) return { ok: true };
    let detail = `erreur ${res.status}`;
    try { const j = await res.json(); if (j && j.message) detail += ` · ${j.message}`; } catch (e) { /* corps vide */ }
    return { ok: false, detail };
  } catch (e) { return { ok: false, detail: "pas de réseau" }; }
}

// Classement de la ligue. Avec `graine` : seules les courses de CETTE route
// comptent (les scores d'une ancienne version du parcours restent en base
// mais sortent du classement), meilleure course par pseudo, agrégée ici —
// six membres, quelques dizaines de lignes. Sans graine (ou colonne absente) :
// la vue historique.
export async function classement(code, graine) {
  if (graine !== undefined && graine !== null) {
    const rows = await get("ligue_scores", `?code=eq.${encodeURIComponent(code)}&mode=eq.course&graine=eq.${graine}&select=pseudo,metres,potes&order=metres.desc&limit=500`);
    if (rows) {
      const par = new Map();
      for (const r of rows) {
        const m = par.get(r.pseudo) || { pseudo: r.pseudo, metres: 0, potes: 0, parties: 0 };
        m.metres = Math.max(m.metres, Number(r.metres) || 0);
        m.potes = Math.max(m.potes, Number(r.potes) || 0);
        m.parties += 1;
        par.set(r.pseudo, m);
      }
      return [...par.values()].sort((a, b) => b.metres - a.metres);
    }
  }
  return get("ligue_classement", `?code=eq.${encodeURIComponent(code)}&select=pseudo,metres,potes,parties&order=metres.desc&limit=50`);
}
