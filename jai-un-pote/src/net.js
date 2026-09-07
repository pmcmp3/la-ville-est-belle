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

// Adhésion idempotente (doublon ignoré). Renvoie { membres } ou { erreur }
// ("inexistante", "complete", "reseau").
export async function rejoindreLigue(code, pseudo, skin = null) {
  const existe = await get("ligues", `?code=eq.${encodeURIComponent(code)}&select=code`);
  if (!existe) return { erreur: "reseau" };
  if (!existe.length) return { erreur: "inexistante" };
  const avant = (await membres(code)) || [];
  if (!avant.includes(pseudo) && avant.length >= LIGUE_MAX) return { erreur: "complete" };
  // Adhésion (doublon ignoré) puis mise à jour du skin si la colonne existe.
  await post("ligue_membres", { code, pseudo, skin: skin ? JSON.stringify(skin) : null }, { Prefer: "return=minimal,resolution=merge-duplicates" }, "?on_conflict=code,pseudo");
  const liste = await membres(code);
  return liste ? { membres: liste } : { erreur: "reseau" };
}

// Membres = [{ nom, skin }] dans l'ordre d'arrivée.
export async function membres(code) {
  const rows = await get("ligue_membres", `?code=eq.${encodeURIComponent(code)}&select=pseudo,skin,created_at&order=created_at.asc&limit=50`);
  if (!rows) return null;
  return rows.map((r) => { let skin = null; try { skin = r.skin ? JSON.parse(r.skin) : null; } catch (e) { skin = null; } return { nom: r.pseudo, skin }; });
}

// Vagues : 5 ligues créées par semaine (lundi → dimanche), au-delà on attend lundi.
export async function liguesCetteSemaine() {
  const lundi = debutSemaine();
  const rows = await get("ligues", `?created_at=gte.${lundi.toISOString()}&code=neq.${window.CONFIG.ligueDemo || "PMCMP"}&select=code`);
  return rows ? rows.length : null;
}
export function debutSemaine(d = new Date()) {
  const x = new Date(d); const j = (x.getDay() + 6) % 7; x.setDate(x.getDate() - j); x.setHours(0, 0, 0, 0); return x;
}

export function envoyerScore(code, pseudo, metres, potes, mode = "course") {
  return post("ligue_scores", { code, pseudo, metres: Math.floor(metres), potes, mode });
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

// Préinscription au concert.
export function preinscrire(infos) { return post("preinscriptions_concert", infos); }
export async function nbPreinscrits() {
  if (!configured()) return null;
  try {
    const res = await fetch(url("preinscriptions_concert", "?select=id"), { headers: headers({ Prefer: "count=exact", Range: "0-0" }) // exact : petite table, appelée une fois par fin de course (planned renvoyait 400 sur une table vide) });
    const cr = res.headers.get("content-range") || "";
    const total = Number(cr.split("/")[1]);
    return Number.isFinite(total) ? total : null;
  } catch (e) { return null; }
}

export async function classement(code) {
  return get("ligue_classement", `?code=eq.${encodeURIComponent(code)}&select=pseudo,metres,potes,parties&order=metres.desc&limit=50`);
}
