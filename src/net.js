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

// Ne jamais lever reste la règle — mais échouer en SILENCE a coûté une
// session entière : « le classement n'apparaît pas chez moi » pouvait aussi
// bien être un backend cassé, un réseau coupé, un bloqueur de contenu iOS
// mangeant le domaine supabase.co, ou simplement une table vide. Les quatre
// donnaient exactement le même écran. On garde donc la trace du dernier échec,
// que l'écran de fin peut afficher (voir renderLeaderboard dans main.js).
let lastError = null;

export function getLastError() {
  return lastError;
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
  if (!configured()) {
    lastError = "backend non configuré";
    return [];
  }
  lastError = null; // état propre pour CET appel, sans traîner l'échec du précédent
  const publicUrl = window.CONFIG.apiScores.replace(/\/scores$/, "/scores_public");

  const rows = await fetchScores(publicUrl, "pseudo,score", limit);
  if (rows && rows.length) return rows;

  // Piège à ne pas réintroduire : la RLS interdit le SELECT direct sur
  // `scores`, qui répond donc **200 avec un tableau vide** — un succès aux
  // yeux du code. Tester `legacy` seul effacerait la raison de l'échec de la
  // vue et on retomberait sur l'écran muet qu'on cherche justement à éliminer.
  // Seul un repli qui ramène VRAIMENT des lignes compte comme un succès.
  const legacy = await fetchScores(window.CONFIG.apiScores, "pseudo_insta,score", limit);
  if (legacy && legacy.length) {
    lastError = null;
    return legacy;
  }

  // Rien à afficher. Si une des deux sources a échoué, lastError porte la
  // raison ; si les deux ont répondu vide pour de bon, il vaut null et
  // l'écran de fin reste muet — c'est le cas du tout premier joueur.
  return rows || legacy || [];
}

async function fetchScores(base, select, limit) {
  const url = `${base}?select=${select}&order=score.desc&limit=${limit}`;
  try {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      // null = cette source n'existe pas, on tente le repli.
      lastError = `HTTP ${res.status} sur ${base.split("/").pop()}`;
      console.warn(`[net] ${lastError}`, await res.text().catch(() => ""));
      return null;
    }
    return await res.json();
  } catch (err) {
    // Ici, la requête n'a même pas abouti : réseau coupé, DNS, CORS, ou
    // bloqueur de contenu. C'est le cas qu'on ne pouvait pas distinguer avant.
    lastError = `requête bloquée (${err.name || "erreur"})`;
    console.warn(`[net] ${lastError} sur ${url}`, err);
    return null;
  }
}
