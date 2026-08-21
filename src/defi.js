// defi.js — « Défie un ami » : un lien qui embarque un score à battre.
//
// Idée retenue le 21 août 2026 parmi une liste de leviers de conversion
// (« le défi à un ami »). Le partage existant (share.js) dit déjà « bats mon
// score » dans son texte, mais personne ne le mesure : le destinataire joue
// une partie ordinaire et compare à la main. Ici le jeu porte la cible —
// bandeau au menu, jauge en course, verdict sur l'écran de fin.
//
// ⚠️ Aucune vérification, par construction : la cible voyage en clair dans
// l'URL (`?defi=23102&de=pol`), n'importe qui peut la réécrire. C'est
// cohérent avec la règle du projet (« aucun anti-triche, la vérité du
// concours se fait au screenshot ») — un défi truqué ne salit que le duel
// entre deux amis, jamais le classement Supabase, qui ne lit rien d'ici.
//
// ⚠️ La cible est lue UNE fois au chargement du module et ne change plus :
// rejouer garde le même défi (c'est le but — on réessaie jusqu'à le battre),
// et rien ne réécrit l'URL en cours de partie.

const MAX_PSEUDO = 18;
const MAX_SCORE = 9999999;

// Adresse officielle du jeu (CLAUDE.md). Sert à FABRIQUER le lien de défi :
// on ne peut pas se contenter de location.href, qui peut déjà porter un
// `?defi=` reçu de quelqu'un d'autre — le relayer tel quel enverrait le
// score du défiant précédent.
const BASE = "https://la-ville-est-belle-pmc.fr/";

function lireCible() {
  let params;
  try { params = new URLSearchParams(window.location.search); } catch (e) { return null; }
  const brut = params.get("defi");
  if (!brut) return null;
  const score = Math.floor(Number(brut));
  if (!Number.isFinite(score) || score <= 0 || score > MAX_SCORE) return null;
  // Le pseudo n'est que décoratif : il s'affiche, il ne sert à rien d'autre.
  // Nettoyé quand même (il finit dans du textContent, jamais dans du HTML,
  // mais un pseudo à rallonge casserait la mise en page du bandeau).
  const pseudo = (params.get("de") || "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, MAX_PSEUDO);
  return { score, pseudo: pseudo || "un ami" };
}

const cibleCourante = lireCible();

export function cible() {
  return cibleCourante;
}

// Vrai dès que le score courant dépasse la cible. Strictement supérieur :
// faire exactement le même score n'est pas « battre ».
export function battu(score) {
  return cibleCourante !== null && score > cibleCourante.score;
}

// Lien à envoyer. Le pseudo est facultatif (personne n'oblige à en avoir un
// au moment du partage) : sans lui, le destinataire lit « un ami te défie ».
export function lien(score, pseudo) {
  const p = new URLSearchParams();
  p.set("defi", String(Math.max(0, Math.floor(score))));
  if (pseudo) p.set("de", pseudo.slice(0, MAX_PSEUDO));
  return `${BASE}?${p.toString()}`;
}

// Texte du partage, SANS le lien : `navigator.share` reçoit l'URL dans son
// champ `url` (aucun fichier joint ici, contrairement à share.js — le champ
// est donc bien honoré et donne un aperçu de lien propre). Le repli
// presse-papiers, lui, recolle les deux.
export function texte(score, pseudo) {
  const qui = pseudo || "Un ami";
  return `${qui} a fait ${score} points sur La ville est belle (PMC). À toi de faire mieux.`;
}
