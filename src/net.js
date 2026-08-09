// net.js — étape 7 : envoi/lecture des scores (Supabase PostgREST).
// Le jeu reste jouable sans ceci : tant que CONFIG.apiScores/apiScoresKey
// sont vides (avant que l'artiste fournisse le projet Supabase),
// postScore()/getTopScores() se désactivent silencieusement — jamais
// d'exception qui remonterait jusqu'à endGame() et casserait l'écran de fin.
// Aucun anti-triche (décision verrouillée, PLAN-ACTION.md §6) : POST simple,
// pas de HMAC ni de vérification de replay — la vérité du concours se fait
// au screenshot envoyé par le joueur. Schéma attendu côté Supabase : voir
// supabase-schema.sql à la racine.

import pkg from "../package.json";

function configured() {
  return Boolean(window.CONFIG.apiScores && window.CONFIG.apiScoresKey);
}

function headers(extra = {}) {
  return {
    apikey: window.CONFIG.apiScoresKey,
    Authorization: `Bearer ${window.CONFIG.apiScoresKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Envoie un score. `pseudo` est public (classement), `insta` est privé — il
// part dans la même ligne mais n'est jamais relu par le jeu : la lecture
// passe par la vue `scores_public`, qui ne contient pas cette colonne (voir
// supabase-schema.sql). Résout à true si l'envoi a abouti, false sinon
// (backend pas configuré, réseau coupé...).
export async function postScore(pseudo, insta, score) {
  if (!configured()) return false;
  try {
    const res = await fetch(window.CONFIG.apiScores, {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        pseudo,
        pseudo_insta: insta || null,
        score,
        game_version: pkg.version,
      }),
    });
    if (res.ok) return true;
    // Repli tant que la migration n'a pas été appliquée côté Supabase : la
    // colonne `pseudo` n'existe pas encore, PostgREST rejette la ligne. On
    // réessaie à l'ancien format pour ne perdre aucun score dans l'intervalle.
    const legacy = await fetch(window.CONFIG.apiScores, {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify({ pseudo_insta: pseudo, score, game_version: pkg.version }),
    });
    return legacy.ok;
  } catch {
    return false;
  }
}

// Top N scores. Lu sur `scores_public`, une VUE qui n'expose que pseudo +
// score : même quelqu'un qui récupère la clé anon du jeu (elle est forcément
// dans le bundle) ne peut pas remonter les comptes Instagram des joueurs.
// Masquer l'insta à l'affichage seulement n'aurait rien protégé.
// Repli sur la table `scores` si la vue n'existe pas encore côté Supabase
// (migration pas encore appliquée) : le classement continue de s'afficher.
export async function getTopScores(limit = window.CONFIG.apiScoresLimit || 10) {
  if (!configured()) return [];
  const publicUrl = window.CONFIG.apiScores.replace(/\/scores$/, "/scores_public");
  const rows = await fetchScores(publicUrl, "pseudo,score", limit);
  if (rows) return rows;
  return (await fetchScores(window.CONFIG.apiScores, "pseudo_insta,score", limit)) || [];
}

async function fetchScores(base, select, limit) {
  try {
    const url = `${base}?select=${select}&order=score.desc&limit=${limit}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null; // null = cette source n'existe pas, on tente le repli
    return await res.json();
  } catch {
    return null;
  }
}
