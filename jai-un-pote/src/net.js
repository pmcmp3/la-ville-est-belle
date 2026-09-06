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

export async function creerLigue(code, pseudo) {
  const ok = await post("ligues", { code, nom: `Ligue de ${pseudo}`, createur: pseudo });
  if (!ok) return false;
  return rejoindreLigue(code, pseudo);
}

// Adhésion idempotente (doublon ignoré). Renvoie la liste des membres, ou
// null si la ligue n'existe pas / pas de réseau.
export async function rejoindreLigue(code, pseudo) {
  const existe = await get("ligues", `?code=eq.${encodeURIComponent(code)}&select=code`);
  if (!existe || !existe.length) return null;
  await post("ligue_membres", { code, pseudo }, { Prefer: "return=minimal,resolution=ignore-duplicates" }, "?on_conflict=code,pseudo");
  return membres(code);
}

export async function membres(code) {
  const rows = await get("ligue_membres", `?code=eq.${encodeURIComponent(code)}&select=pseudo,created_at&order=created_at.asc&limit=50`);
  return rows ? rows.map((r) => r.pseudo) : null;
}

export function envoyerScore(code, pseudo, metres, potes) {
  return post("ligue_scores", { code, pseudo, metres: Math.floor(metres), potes });
}

export async function classement(code) {
  return get("ligue_classement", `?code=eq.${encodeURIComponent(code)}&select=pseudo,metres,potes,parties&order=metres.desc&limit=50`);
}
