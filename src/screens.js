// screens.js — Écrans hors-jeu : menu/onboarding (pseudo → jouer), décompte,
// panneau son, menu pause, écran de fin + classement. Extrait de main.js
// (dette documentée dans ARCHITECTURE.md §11 : "à découper — comme passe
// séparée, jamais mélangé à un changement de gameplay") : ce module ne
// contient QUE du câblage DOM et de la présentation, jamais de physique ni de
// boucle de jeu. Aucun changement de comportement voulu dans cette
// extraction — le code est déplacé tel quel, seules les frontières entre
// fichiers sont nouvelles.
//
// main.js reste le seul propriétaire de l'état de partie (`game`,
// `playerState`, `jump`, l'horloge, la boucle à pas fixe) : ce module lui
// emprunte une référence à `game` (lecture seule en pratique : score/pseudo
// affichés) et reçoit en retour, via init(), les quelques actions qui doivent
// rester décidées par main.js (démarrer réellement la course, rejouer, entrer/
// sortir de la pause) — jamais l'inverse, pour ne pas créer de dépendance
// circulaire (aucun module ne doit importer main.js, voir ARCHITECTURE.md §4).

import * as audio from "./audio.js";
import * as net from "./net.js";
import * as debugOverlay from "./debug.js";
import * as tutorial from "./tutorial.js";
import * as defi from "./defi.js";

let deps = null;

// --- Écrans hors-jeu (menu de démarrage / fin de partie) -----------------
// Le même conteneur DOM sert aux deux, avec fondu à l'ouverture comme à la
// fermeture. Il a remplacé le « touche l'écran pour jouer » dessiné dans le
// canvas : au playtest, personne ne savait où démarrer une fois l'inclinaison
// activée, parce que la zone de départ était l'écran entier et donc invisible.
// Une action = un bouton.
const overlay = document.getElementById("overlay");
// Le résultat de la partie s'affiche désormais dans l'eyebrow du bandeau de
// la carte de fin (même emplacement que "Étape 1/2 — Ton pseudo" sur le
// menu), et plus dans #menu-title, qui garde le titre du jeu sur tous les
// écrans — cohérence avec le design system du premier écran (demandé).
const endEyebrow = document.getElementById("end-eyebrow");
const scoreNum = document.getElementById("score-num");
const leaderboard = document.getElementById("leaderboard");
const leaderboardList = document.getElementById("leaderboard-list");
const leaderboardExpand = document.getElementById("leaderboard-expand");
const leaderboardSheet = document.getElementById("leaderboard-sheet");
const leaderboardSheetVeil = document.getElementById("leaderboard-sheet-veil");
const leaderboardSheetList = document.getElementById("leaderboard-sheet-list");
const leaderboardSheetClose = document.getElementById("leaderboard-sheet-close");
const playButton = document.getElementById("play-button");
const replayButton = document.getElementById("replay-button");
const loadingBlock = document.getElementById("loading");
const loadingFill = document.getElementById("loading-fill");
const loadingLabel = document.getElementById("loading-label");
const ctaLink = document.getElementById("cta-link");
// Même lien, deux emplacements : le CTA flottant (menu) et l'action principale
// de la carte de fin. C'est toujours config.js qui fait foi (lienEP).
const endCta = document.getElementById("end-cta");
const fanNote = document.getElementById("fan-note");
const runsCount = document.getElementById("runs-count");
const runsCountNum = document.getElementById("runs-count-num");
// Panneau de seconde chance à la mort (voir openReviveSheet).
const reviveSheet = document.getElementById("revive-sheet");
const reviveArc = document.getElementById("revive-arc");
const reviveTimer = document.getElementById("revive-timer");
const reviveTimerNum = document.getElementById("revive-timer-num");
const reviveTitle = document.getElementById("revive-title");
const reviveText = document.getElementById("revive-text");
const reviveCta = document.getElementById("revive-cta");
const reviveCtaLabel = document.getElementById("revive-cta-label");
const reviveCtaIcone = document.getElementById("revive-cta-icone");
const reviveDecline = document.getElementById("revive-decline");
const reviveReplay = document.getElementById("revive-replay");
// Tiroir de conversion (23 août 2026, quatrième passe) — voir #gate-sheet
// dans index.html et la section « Tiroir de conversion » plus bas.
const gateSheet = document.getElementById("gate-sheet");
const gateVeil = document.getElementById("gate-veil");
const gateEyebrow = document.getElementById("gate-eyebrow");
const gateTimer = document.getElementById("gate-timer");
const gateTimerNum = document.getElementById("gate-timer-num");
const gateArc = document.getElementById("gate-arc");
const gateTitle = document.getElementById("gate-title");
const gateText = document.getElementById("gate-text");
const gateCta = document.getElementById("gate-cta");
const gateCtaLabel = document.getElementById("gate-cta-label");
const gateGo = document.getElementById("gate-go");
const gateLater = document.getElementById("gate-later");
const changePseudoBtn = document.getElementById("change-pseudo");
// Course parfaite + défi d'un ami (21 août 2026, voir defi.js).
const perfectNote = document.getElementById("perfect-note");
const defiResult = document.getElementById("defi-result");
const defiBanner = document.getElementById("defi-banner");
const defiBannerQui = document.getElementById("defi-banner-qui");
const defiBannerNum = document.getElementById("defi-banner-num");
const defiButton = document.getElementById("defi-button");
// ⚠️ Le libellé vit dans un SPAN dédié, JAMAIS sur le bouton lui-même : le
// bouton contient aussi la rangée d'icônes WhatsApp/Messages/Snap, et écrire
// dans son `textContent` détruisait ces SVG en les remplaçant par du texte
// brut (« DÉFIER UN AMI WhatsApp Messages Snapchat », capture à l'appui le
// 23 août 2026 — `textContent` d'un bouton concatène aussi les <title> des
// SVG qu'il contient, puis les écrase tous à la réécriture).
const defiLabel = document.getElementById("defi-label");
// Libellé d'origine, mémorisé avant tout remplacement temporaire (« Lien
// copié ! » du repli presse-papiers).
const DEFI_LABEL = defiLabel.textContent.trim();
const instaLink = document.getElementById("insta-link");

// --- Verrou de rejeu (19 août 2026) --------------------------------------
// Version retenue du « mur » demandé par l'artiste : il voulait mettre la
// partie en pause à 50 000 points pour forcer un passage sur le lien du
// morceau. Deux problèmes rédhibitoires à cet endroit-là — le seuil n'était
// quasiment jamais atteignable (maximum théorique 61 400), et quitter la page
// en pleine course sur mobile fait perdre le run (onglet rechargé, ou morceau
// rembobiné au-delà de pauseDeriveMax). Le mur est donc posé ICI, sur l'écran
// de fin : il n'y a plus de partie à casser, et c'est déjà une pause naturelle.
// Mémorisé une fois pour toutes : on ne redemande pas à chaque game over.
const CLE_MORCEAU_OUVERT = "morceauOuvert";
// Deuxième palier de conversion : suivre PMC sur Spotify (clic = levée,
// mémorisé à vie). ⚠️ Il ne conditionne PLUS REJOUER depuis le 23 août 2026
// (le seuil SEUIL_SUIVRE = 3 parties a disparu avec le verrou) : il sert
// uniquement à choisir le palier de la carte de mort — voir openReviveSheet.
const CLE_PMC_SUIVI = "pmcSuivi";
const CLE_PARTIES = "partiesJouees";

// ⚠️ VÉRIFICATION DU TUNNEL DE CONVERSION — `?neuf` dans l'URL (24 août 2026).
// L'artiste a cliqué ses propres liens des dizaines de fois en testant : son
// navigateur le classe donc « libre » (les deux paliers franchis) et le tiroir
// ne s'ouvre PLUS JAMAIS chez lui. Vu de son téléphone, la demande de
// pré-sauvegarde a l'air d'avoir disparu — alors qu'elle s'affiche pour tout
// joueur neuf. Ce drapeau remet les DEUX paliers à zéro, et RIEN d'autre : le
// pseudo, l'insta et le compteur de parties (donc le tutoriel) sont conservés.
// À poser AVANT `fanCache` plus bas, qui lit l'état une fois pour toutes au
// chargement du module.
try {
  if (new URLSearchParams(location.search).has("neuf")) {
    localStorage.removeItem(CLE_MORCEAU_OUVERT);
    localStorage.removeItem(CLE_PMC_SUIVI);
    // ⚠️ Le drapeau se RETIRE de l'URL aussitôt consommé : sans ça, il reste
    // dans la barre d'adresse et REJOUE sa remise à zéro à chaque
    // rechargement (retour de Spotify compris) — le palier de pré-sauvegarde
    // qu'on vient de franchir serait effacé en boucle, et le tunnel semblerait
    // tourner en rond sur le premier palier.
    try {
      const url = new URL(location.href);
      url.searchParams.delete("neuf");
      history.replaceState(null, "", url.toString());
    } catch (e) { /* history indisponible : au pire le reset se rejoue */ }
  }
} catch (e) { /* navigation privée : il n'y a rien à remettre à zéro */ }

function morceauDejaOuvert() {
  try { return localStorage.getItem(CLE_MORCEAU_OUVERT) === "1"; } catch (e) { return true; }
}

// Boost fan (+10 % de score, voir main.js) : la même info que le verrou,
// exposée à la boucle de jeu. Mise en cache — lue à chaque étoile ramassée,
// pas question de taper localStorage dans la boucle.
let fanCache = morceauDejaOuvert();
export function estFan() { return fanCache; }

function pmcDejaSuivi() {
  try { return localStorage.getItem(CLE_PMC_SUIVI) === "1"; } catch (e) { return true; }
}

function partiesJouees() {
  try { return Number(localStorage.getItem(CLE_PARTIES)) || 0; } catch (e) { return 0; }
}

function marquerMorceauOuvert() {
  try { localStorage.setItem(CLE_MORCEAU_OUVERT, "1"); } catch (e) { /* navigation privée : on n'insiste pas */ }
  fanCache = true;
  fanNote.classList.add("hidden"); // la promesse est tenue, plus rien à annoncer
}

function marquerPmcSuivi() {
  try { localStorage.setItem(CLE_PMC_SUIVI, "1"); } catch (e) { /* idem */ }
}

// ⚠️ VERROU DE REJEU SUPPRIMÉ le 23 août 2026. Il conditionnait REJOUER (écran
// de fin) à l'ajout du morceau, puis au suivi de PMC après 3 parties, via un
// panneau #unlock-sheet — supprimé avec lui.
//
// Ce que ça produisait, mesuré sur un joueur neuf : la carte de mort n'offrait
// que le lien Spotify ou « Voir mon score » ; « Voir mon score » menait à
// l'écran de fin où REJOUER était verrouillé ; le panneau de verrou se fermait
// par « Plus tard » sans rien relancer. Autrement dit AUCUN chemin vers une
// deuxième course sans cliquer le lien — le joueur fermait l'onglet.
//
// La demande de conversion n'a pas disparu, elle a changé de contrepartie
// (« ajouter le morceau pour continuer la partie, mais que ce soit digeste
// dans un CTA ») : elle vit désormais uniquement sur la carte de mort
// (openReviveSheet), où elle achète la CONTINUATION de la course en cours —
// garder son score et son combo, ce qui a une vraie valeur à cet instant
// précis. Repartir de zéro est toujours gratuit, partout. L'escalade à trois
// paliers (morceau → suivre → attente) survit intacte, mais sur cette carte-là.
//
// L'écran de fin garde ses demandes NON bloquantes : le bouton AJOUTER LE
// MORCEAU en secondaire, la promesse de boost fan (+10 %), le bandeau
// « Tu écoutes La ville est belle ».
//
// ⚠️ Le verrou se levait au CLIC sur le lien, jamais sur une preuve d'ajout
// (impossible à obtenir) — cette règle-là reste vraie pour la carte de mort et
// pour le boost fan : voir marquerMorceauOuvert ci-dessus.

export function showOverlay() {
  overlay.classList.add("visible");
}

// --- Seconde chance à la mort + tiroir de conversion -----------------------
// Présentation seulement : la décision de l'offrir, le gel de la partie et la
// reprise vivent dans main.js (offerRevive) — ce module reçoit les issues en
// callbacks, comme tout le reste de l'API screens.
//
// ⚠️ MODÈLE REFONDU LE 23 AOÛT 2026 (quatrième passe, demandé : « quand une
// personne arrive pour la première fois, fait une partie et échoue, il faut
// deux boutons — continuer la partie, rejouer — [...] tu dois d'abord
// pré-sauvegarder l'album de PMC sur Spotify [...] pareil pour le rejouer, il
// faut que ce soit exactement les mêmes conditions »).
//
// La carte de mort ne porte PLUS de lien Spotify : elle pose le choix, et
// rien d'autre.
//   [ CONTINUER LA PARTIE ]  (garde le score et le combo)
//   [ REJOUER ]              (course neuve)
//   « Voir mon score »
//
// Les DEUX boutons passent par exactement la même porte — c'est le point de
// la demande — et cette porte est un TIROIR qui se soulève d'en bas
// (#gate-sheet), avec l'échelle à trois paliers :
//   "presave" — album jamais ouvert : le CTA est CONFIG.lienAlbum. ⚠️ La clé
//               garde son nom d'origine (elle datait de la pré-sauvegarde),
//               mais depuis le 28 août 2026 — jour de la sortie — la demande
//               est « écoute l'album et ajoute-le à ta bibliothèque » ;
//   "suivre"  — album ouvert mais pas encore abonné : CTA CONFIG.lienSuivre ;
//   "libre"   — les deux paliers sont franchis : le tiroir ne s'ouvre PLUS
//               JAMAIS, les deux actions partent au premier tap.
// Le même tiroir garde REJOUER sur l'écran de fin : sans ça la porte de la
// carte de mort se contournerait en un tap (« Voir mon score » puis REJOUER)
// et ne demanderait plus rien à personne.
//
// ⚠️ RENVERSEMENT ASSUMÉ du 23 août 2026 (troisième passe), qui avait rendu
// REJOUER gratuit PARTOUT après avoir mesuré une impasse sur un joueur neuf.
// Ce qui change et évite de la reproduire : le palier se lève AU CLIC sur le
// lien, définitivement, et le tiroir arme lui-même l'action demandée au retour
// de Spotify — il y a donc toujours un chemin vers la course suivante. Le
// joueur qui refuse le lien, lui, n'en a plus : c'est la contrepartie voulue.
//
// ⚠️ Le décompte survit au détour par Spotify : chaque tick soustrait au
// maximum REVIVE_TICK_MAX_S — même quand iOS suspend totalement les timers en
// arrière-plan (aucun tick ne tourne avec document.hidden, donc le garde
// document.hidden seul ne suffisait pas : au retour, le premier tick voyait
// TOUTE l'absence dans son delta et vidait la fenêtre d'un coup — bug trouvé
// à la revue du 21 août 2026).
// ⚠️ La conversion se donne AU CLIC, jamais sur une preuve d'ajout ou
// d'abonnement (impossible à obtenir depuis une page web).
const REVIVE_DELAI_S = 10;
const REVIVE_TICK_MAX_S = 0.3; // plafond de temps décompté par tick (voir ci-dessus)
const REVIVE_ARC_LONGUEUR = 2 * Math.PI * 33; // r=33, voir #revive-arc dans index.html

// L'échelle de conversion, en UN seul endroit : la carte de mort, le tiroir et
// l'écran de fin doivent rester d'accord, sans quoi un joueur pourrait voir
// « abonne-toi » alors qu'il n'a pas encore pré-sauvegardé.
// ⚠️ Les clés localStorage sont celles d'avant (CLE_MORCEAU_OUVERT,
// CLE_PMC_SUIVI) : les joueurs déjà convertis ne sont PAS remis à zéro par ce
// changement de modèle.
// Exposé pour l'overlay `?debug` (main.js → debug.js) : sur un téléphone il
// n'y a ni console ni localStorage inspectable, et c'est LA donnée qui explique
// pourquoi le tiroir s'ouvre ou pas. Un palier resté à "libre" d'une session de
// test précédente est indiscernable d'un tunnel cassé sans cette ligne.
export function niveauConversionCourant() { return niveauConversion(); }

function niveauConversion() {
  if (!morceauDejaOuvert()) return "presave";
  if (!pmcDejaSuivi()) return "suivre";
  return "libre";
}

// Décompte circulaire, partagé par la carte de mort et le tiroir : un seul
// endroit qui tienne le plafond par tick, le gel quand l'onglet part, ET
// l'ouverture du filtre de la boucle du début — les trois doivent rester
// d'accord.
//
// ⚠️ L'INTENSITÉ DE LA BOUCLE SUIT LE CHRONO (22 août 2026, demandé : « un
// filtre passe-bas qui remonte au fur et à mesure du chrono, donc on a le
// décompte et la loop du début se défiltre »). 0 au premier tick, 1 quand le
// décompte touche zéro — le son dit donc, sans un mot, combien de temps il
// reste. Sans effet quand la boucle ne tourne pas (audio.setReviveIntensity
// sort tout de suite) : le tiroir peut donc s'ouvrir depuis l'écran de fin.
function creerDecompte(boite, num, arc) {
  let id = 0;
  let restant = 0;
  let total = 1;
  const maj = () => {
    num.textContent = `${Math.max(0, Math.ceil(restant))}`;
    const t = Math.max(0, restant) / total;
    arc.style.strokeDashoffset = `${REVIVE_ARC_LONGUEUR * (1 - t)}`;
  };
  return {
    get restant() { return restant; },
    arreter() { clearInterval(id); id = 0; },
    cacher() { clearInterval(id); id = 0; boite.classList.add("hidden"); },
    demarrer(duree, onZero) {
      clearInterval(id);
      total = duree;
      restant = duree;
      boite.classList.remove("hidden");
      maj();
      audio.setReviveIntensity(0);
      let precedent = performance.now();
      id = setInterval(() => {
        const maintenant = performance.now();
        // Plafond par tick : la seule protection qui tienne aussi quand iOS a
        // suspendu le timer pendant tout le détour Spotify (voir l'en-tête).
        const ecoule = Math.min((maintenant - precedent) / 1000, REVIVE_TICK_MAX_S);
        precedent = maintenant;
        if (document.hidden) return; // figé pendant le détour (desktop/Android)
        restant -= ecoule;
        maj();
        audio.setReviveIntensity(1 - Math.max(0, restant) / total);
        if (restant <= 0) {
          clearInterval(id);
          id = 0;
          onZero();
        }
      }, 100);
    },
  };
}

const decompteRevive = creerDecompte(reviveTimer, reviveTimerNum, reviveArc);
const decompteGate = creerDecompte(gateTimer, gateTimerNum, gateArc);

// Reconstruit « préfixe <strong>score</strong> points. » sans innerHTML (un
// innerHTML détacherait les nœuds et laisserait des références mortes).
function poserTexteScore(cible, prefixe, score) {
  cible.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = `${score}`;
  cible.append(prefixe, strong, " points.");
}

// --- Carte de mort ---------------------------------------------------------

let reviveCallbacks = null;
let reviveScoreCourant = 0;

// Le CTA de la carte de mort n'est plus un lien sortant : c'est le bouton
// CONTINUER LA PARTIE. Le href est retiré ici, à l'ouverture — jamais pendant
// le dispatch d'un clic, ce qui annulerait une navigation (voir gateCta).
function reviveCtaEnBouton() {
  reviveCtaLabel.textContent = "CONTINUER LA PARTIE";
  reviveCtaIcone.style.display = "none";
  reviveCta.removeAttribute("href");
  reviveCta.removeAttribute("target");
  reviveCta.classList.remove("locked");
}

export function openReviveSheet({ score, onAccept, onDecline, onReplay }) {
  reviveCallbacks = { onAccept, onDecline, onReplay };
  reviveScoreCourant = score;
  reviveTitle.textContent = "Ta course n'est pas finie !";
  poserTexteScore(reviveText, "Reprends PILE ici, avec tes ", score);
  reviveCtaEnBouton();
  reviveSheet.classList.add("visible");
  reviveSheet.setAttribute("aria-hidden", "false");
  // Le décompte reste une fenêtre de DÉCISION : expiré sans choix → écran de
  // fin. Il est GELÉ pendant que le tiroir de conversion est ouvert par-dessus
  // (voir les handlers dans init) — sinon la carte déciderait toute seule
  // pendant que le joueur lit la demande.
  decompteRevive.demarrer(REVIVE_DELAI_S, () => reviveResoudre("onDecline"));
}

function reprendreDecompteRevive(restant) {
  if (!reviveCallbacks) return;
  if (restant <= 0) { reviveResoudre("onDecline"); return; }
  decompteRevive.demarrer(restant, () => reviveResoudre("onDecline"));
}

function closeReviveSheet() {
  decompteRevive.arreter();
  reviveSheet.classList.remove("visible");
  reviveSheet.setAttribute("aria-hidden", "true");
}

function reviveResoudre(issue) {
  if (!reviveCallbacks) return;
  const cb = reviveCallbacks[issue];
  reviveCallbacks = null;
  closeReviveSheet();
  cb();
}

// --- Tiroir de conversion (#gate-sheet) ------------------------------------
// Phases, reprises telles quelles de la carte de mort du 22 août 2026 (elles
// avaient été écrites pour ce détour-là, elles vivent maintenant ici) :
//   "demande" → décompte de 10 s, le CTA Spotify est offert
//   "absence" → le joueur est parti sur Spotify : plus de décompte, la boucle
//               tourne au plus filtré et au plus bas, on l'attend
//   "retour"  → il est revenu : décompte 5-4-3-2-1 qui rouvre le filtre
//   "pret"    → le bouton d'action est armé, il ne reste qu'un tap
// ⚠️ La reprise reste un TAP explicite (invariant verrouillé) : ce décompte
// prépare la main et l'oreille, il ne relance jamais la course tout seul dans
// le dos de quelqu'un qui aurait posé son téléphone.
//
// ⚠️ LE TIROIR N'EXPIRE PAS (mesuré au banc d'essai le 23 août 2026, sur le
// premier jet qui lui donnait sa propre fenêtre de 10 s) : la fenêtre courait
// pendant que le joueur LISAIT la demande, expirait, rendait la main à la
// carte de mort dont le décompte reprenait — et le jetait sur l'écran de fin
// sans qu'il ait rien fait de mal. Les 10 s appartiennent à la carte de mort,
// qui offre une seconde chance limitée dans le temps ; le tiroir, lui, pose
// une demande : il attend, et la seule sortie est « Plus tard ».
let gateEtat = null; // { action, onUnlocked, onCancel, niveau, phase }
let gateRetourTimer = 0;

function gateRetourDelai() {
  const v = Number(window.CONFIG.loopMortRetour);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

// Toute la copie du tiroir en un seul endroit : deux actions × deux paliers.
// Le surtitre dit CE QUE la demande débloque, le titre dit L'ACTION à faire —
// jamais l'inverse, sans quoi la demande se lit comme un péage posé au hasard.
function gateTextes(action, niveau) {
  const continuer = action === "continuer";
  const presave = niveau === "presave";
  return {
    eyebrow: continuer ? "POUR CONTINUER TA PARTIE" : "POUR REJOUER",
    titre: presave ? "Ajoute l'album à ta bibliothèque" : "Abonne-toi à PMC",
    prefixe: presave
      ? (continuer
        ? "L'album est sorti : écoute-le et ajoute-le à ta bibliothèque, puis reprends ta course avec tes "
        : "L'album est sorti : écoute-le et ajoute-le à ta bibliothèque pour relancer une course. Score en cours : ")
      : (continuer
        ? "Dernière étape : abonne-toi à PMC sur Spotify et rejoue autant que tu veux. Tu reprends avec tes "
        : "Dernière étape : abonne-toi à PMC sur Spotify et rejoue autant que tu veux. Score en cours : "),
    ctaLabel: presave ? "ÉCOUTER L'ALBUM" : "S'ABONNER À PMC",
    href: presave
      ? (window.CONFIG.lienAlbum || window.CONFIG.lienEP)
      : (window.CONFIG.lienSuivre || window.CONFIG.lienEP),
    goLabel: continuer ? "CONTINUER MA PARTIE" : "REJOUER",
  };
}

// ⚠️ Point d'entrée UNIQUE des deux actions : elles franchissent exactement
// les mêmes paliers, et « libre » les laisse toutes les deux partir au premier
// tap. Toute nouvelle action qui doit se mériter passe par ici, jamais par un
// test de palier recopié ailleurs.
function exigerConversion({ action, score, onOk, onCancel }) {
  if (niveauConversion() === "libre") { onOk(); return; }
  ouvrirGate({ action, score, onUnlocked: onOk, onCancel });
}

function ouvrirGate({ action, score, onUnlocked, onCancel }) {
  const niveau = niveauConversion();
  const t = gateTextes(action, niveau);
  gateEtat = { action, onUnlocked, onCancel, niveau, phase: "demande" };
  gateEyebrow.textContent = t.eyebrow;
  gateTitle.textContent = t.titre;
  poserTexteScore(gateText, t.prefixe, score);
  gateCtaLabel.textContent = t.ctaLabel;
  gateCta.href = t.href;
  gateCta.target = "_blank";
  gateCta.classList.remove("hidden");
  gateGo.textContent = t.goLabel;
  gateGo.classList.add("hidden");
  gateGo.classList.add("locked");
  gateLater.textContent = "Plus tard";
  // Le décompte n'apparaît qu'au RETOUR de Spotify (5-4-3-2-1) : en phase de
  // demande, rien ne court (voir la note ci-dessus).
  decompteGate.cacher();
  gateSheet.classList.add("visible");
  gateSheet.setAttribute("aria-hidden", "false");
}

// Il vient de cliquer le lien : on ne sait pas s'il revient dans 5 secondes ou
// dans 3 minutes. Plus de décompte (rien ne doit expirer pendant qu'il est
// chez Spotify), la boucle du début retombe au plus filtré et au plus bas.
function gatePhaseAbsence() {
  if (!gateEtat) return;
  gateEtat.phase = "absence";
  decompteGate.cacher();
  gateTitle.textContent = gateEtat.niveau === "presave" ? "Bonne écoute, merci !" : "Abonnement enregistré, merci !";
  gateText.textContent = "Reviens dans le jeu quand tu veux — c'est débloqué.";
  gateCta.classList.add("hidden");
  gateGo.classList.remove("hidden");
  gateGo.classList.add("locked");
  audio.setReviveIntensity(0);
  // Filet : sur un navigateur qui ouvre le lien sans jamais masquer la page
  // (nouvel onglet en arrière-plan sur desktop), aucun visibilitychange
  // n'arrivera — sans ça le joueur resterait bloqué sur un bouton verrouillé.
  clearTimeout(gateRetourTimer);
  gateRetourTimer = setTimeout(() => {
    if (gateEtat && gateEtat.phase === "absence" && !document.hidden) gatePhaseRetour();
  }, 1800);
}

// ⚠️ Le décompte 5-4-3-2-1 du retour a été SUPPRIMÉ le 24 août 2026 (retour
// direct après mise en ligne : « faut quand même attendre 10 secondes ») :
// au retour de Spotify, le bouton d'action est armé IMMÉDIATEMENT — l'attente
// imposée était la friction de trop sur un joueur qui vient déjà de rendre
// service. Le filtre de la boucle se rouvre en une rampe courte (audio.js,
// setReviveIntensity lisse déjà sur ~0,25 s) au lieu de suivre un chrono. La
// reprise reste un TAP explicite (invariant verrouillé) : rien ne repart tout
// seul, il n'y a juste plus rien à attendre avant de pouvoir taper.
function gatePhaseRetour() {
  if (!gateEtat) return;
  gatePhasePret();
}

function gatePhasePret() {
  if (!gateEtat) return;
  clearTimeout(gateRetourTimer);
  gateEtat.phase = "pret";
  decompteGate.cacher();
  audio.setReviveIntensity(1); // la boucle est en clair : la course peut repartir
  gateTitle.textContent = "C'est reparti !";
  gateText.textContent = gateEtat.action === "continuer"
    ? "Ta course t'attend — reprends quand tu es prêt."
    : "Nouvelle course, quand tu veux.";
  gateCta.classList.add("hidden");
  gateGo.classList.remove("hidden");
  gateGo.classList.remove("locked");
}

function fermerGate() {
  decompteGate.arreter();
  clearTimeout(gateRetourTimer);
  gateSheet.classList.remove("visible");
  gateSheet.setAttribute("aria-hidden", "true");
}

function gateResoudre(issue) {
  if (!gateEtat) return;
  const cb = issue === "onUnlocked" ? gateEtat.onUnlocked : gateEtat.onCancel;
  gateEtat = null;
  fermerGate();
  if (cb) cb();
}

// --- Compteur de parties, en temps réel ------------------------------------
// « Un compteur en temps réel qui dit le nombre de parties faites depuis le
// lancement » (21 août 2026). Le total est relu périodiquement tant que
// l'écran de fin est affiché : quelqu'un qui reste sur cet écran (il y a ~114 s
// de morceau à écouter) voit le chiffre monter pendant que d'autres jouent.
// ⚠️ L'intervalle est ARRÊTÉ dès que l'overlay se ferme — même piège que la
// boucle de l'equalizer, qui avait tourné toute une course en arrière-plan
// (voir hideOverlay). Un compteur invisible n'a aucune raison d'interroger le
// réseau.
// 5 s → 20 s (revue du 21 août 2026) : chaque tick est une requête Supabase
// par joueur sur l'écran de fin — à l'échelle d'une campagne qui marche, 5 s
// multipliait la charge par 4 pour un chiffre qui bouge à l'unité près. Le
// point rouge qui bat suffit à vendre le « temps réel ».
const RUNS_REFRESH_MS = 20000;
// Plancher de preuve sociale (garde SUPPRIMÉE PAR ERREUR dans la refonte
// temps réel, restaurée à la revue du 21 août 2026) : sous ce total, un
// compteur fait vide plutôt que preuve — « ● 3 parties jouées » ferait fuir.
const RUNS_MIN_AFFICHE = 20;
// ⚠️ DÉCLARATION MANQUANTE, corrigée le 21 août 2026 — elle avait sauté dans
// la refonte « compteur assaini » de la vingt-quatrième passe. Un module ES
// est en mode strict : lire/écrire un identifiant non déclaré lève un
// ReferenceError. arreterCompteurCourses() plantait donc à CHAQUE appel, et
// comme hideOverlay() l'appelle AVANT que beginRun() ne demande le démarrage
// de la course, l'exception tuait le handler du clic sur JOUER : overlay
// masqué, décor qui défile, musique qui tourne — et une partie qui ne
// démarrait jamais, sur tous les appareils. Voir la vingt-sixième passe.
let runsTimer = null;

async function majCompteurCourses() {
  if (document.hidden) return; // pas de requête pour un écran que personne ne regarde
  const total = await net.getRunsCount();
  // null = table absente, réseau coupé ou bloqueur de contenu : on laisse la
  // ligne dans l'état où elle est plutôt que de faire clignoter un vide.
  if (total === null || total < RUNS_MIN_AFFICHE) return;
  runsCountNum.textContent = total.toLocaleString("fr-FR");
  runsCount.classList.remove("hidden");
}

function demarrerCompteurCourses() {
  arreterCompteurCourses();
  runsCount.classList.add("hidden"); // jamais le chiffre de la partie précédente
  majCompteurCourses();
  runsTimer = setInterval(majCompteurCourses, RUNS_REFRESH_MS);
}

function arreterCompteurCourses() {
  clearInterval(runsTimer);
  runsTimer = null;
}

export function hideOverlay() {
  overlay.classList.remove("visible");
  // ⚠️ REJOUER depuis l'écran de fin ne change PAS currentView : il ne fait
  // que masquer l'overlay. Tout ce qui tourne en boucle sur cet écran doit
  // donc être coupé ICI, sinon ça continue pendant toute la course suivante —
  // c'est ce qui était arrivé à la boucle rAF de l'equalizer (retiré depuis).
  arreterCompteurCourses();
}

// Le menu monte en fondu sur la scène déjà dessinée plutôt que sur du noir :
// on laisse passer une frame pour que la route soit peinte derrière lui.
export function showOverlayOnLoad() {
  requestAnimationFrame(() => requestAnimationFrame(showOverlay));
}

// --- Accueil en 2 vues : onboarding (pseudo → jouer) → décompte → écran ---
// de fin. Une seule "vue" active à la fois dans #overlay, et à l'intérieur
// de l'onboarding une seule "étape" à la fois. L'étape "inclinaison" a été
// retirée avec le gyroscope (voir input.js) — le tutoriel du contrôle
// tactile se fait maintenant pendant le tutoriel interactif (runTutorial()).
const onboardingEl = document.getElementById("onboarding");
const countdownEl = document.getElementById("countdown");
const endScreenEl = document.getElementById("end-screen");
const countdownNum = document.getElementById("countdown-num");
const countdownCaption = document.getElementById("countdown-caption");
const skipCountdownBtn = document.getElementById("skip-countdown");

const stepEls = {
  pseudo: document.querySelector('.menu-step[data-step="pseudo"]'),
  play: document.querySelector('.menu-step[data-step="play"]'),
};
const stepOrder = ["pseudo", "play"];
const stepDotEls = document.querySelectorAll(".step-dot");
let stepIndex = 0;
let currentView = "onboarding";

// Le CTA morceau ne s'affiche que là où il ne dispute la place à aucune
// autre décision : la dernière étape de l'onboarding (à côté de JOUER, comme
// avant) et l'écran de fin. Caché pendant les étapes 1/2 et pendant le
// décompte.
// ⚠️ Plus affiché sur l'écran de fin depuis le 12 août 2026 : le lien y est
// devenu l'action PRINCIPALE, dans la carte elle-même (#end-cta), donc le CTA
// flottant en bas d'écran ferait doublon avec lui.
function refreshCtaVisibility() {
  const onPlayStep = currentView === "onboarding" && stepOrder[stepIndex] === "play";
  ctaLink.style.display = onPlayStep ? "" : "none";
}

function showStep(i) {
  stepIndex = i;
  stepOrder.forEach((name, idx) => {
    stepEls[name].classList.toggle("active", idx === i);
  });
  stepDotEls.forEach((dot, idx) => dot.classList.toggle("active", idx === i));
  // Titre du jeu masqué sur l'étape "JOUER" (retour explicite : « à partir du
  // moment où on passe à l'étape 2, tu peux enlever le titre ») — même
  // traitement que pendant le décompte (#overlay.countdown-view), qui cache
  // déjà #menu-title pour la même raison (écran encombré).
  overlay.classList.toggle("play-step-view", stepOrder[i] === "play");
  refreshCtaVisibility();
}

function nextStep() {
  if (stepIndex < stepOrder.length - 1) showStep(stepIndex + 1);
  // Musique en fond de menu à partir de l'étape 2 (playtest : « le morceau
  // se lance dès qu'on quitte le premier écran, pour qu'il tourne pendant
  // qu'ils choisissent leur pseudo/volume »). Le tap "Suivant" est un vrai
  // geste utilisateur — la seule fenêtre où iOS accepte d'ouvrir la sortie
  // audio. On unlock ET on demande la lecture ici ; audio.play() attend
  // internement que le buffer soit décodé, la musique commence donc dès que
  // le chargement se termine, sans nouvelle interaction requise.
  audio.unlock();
  audio.play();
}

// --- Equalizer de l'écran de fin (20 août 2026) ---------------------------
// « Un égaliseur dynamique qui marche par rapport à la musique [...] même
// modèle que le Dynamic Island : les basses à gauche, les aigus à droite. »
function setView(view) {
  currentView = view;
  onboardingEl.classList.toggle("active", view === "onboarding");
  countdownEl.classList.toggle("active", view === "countdown");
  endScreenEl.classList.toggle("active", view === "end");
  // Voile allégé pendant le décompte : le personnage doit rester visible
  // derrière (demandé explicitement), pas noyé sous le fond sombre standard.
  overlay.classList.toggle("countdown-view", view === "countdown");
  // Vue de fin : le titre du jeu est masqué et l'overlay devient défilable —
  // la carte (score + classement + 3 boutons) est le plus grand écran du jeu
  // et débordait du cadre sur iPhone (voir #overlay.end-view dans index.html).
  overlay.classList.toggle("end-view", view === "end");
  refreshCtaVisibility();
}

// --- Tutoriel interactif avant course --------------------------------------
// ⚠️ Remplace le compte à rebours « 20 → 1 » le 19 août 2026 (demandé : « on
// peut remplacer les 20 secondes de début avec des exemples de swipe, comme un
// jeu Mario »). La vue DOM du décompte est réutilisée telle quelle — même
// voile, même légende, même bouton « Passer l'intro » — mais le contenu est
// piloté par tutorial.js : le joueur fait VRAIMENT les gestes (l'overlay est
// déjà en pointer-events:none, donc les swipes atteignent le canvas), et
// chaque étape se valide quand le geste est fait, pas quand le temps passe.
// Le gros chiffre devient la progression (« 1/4 »).
//
// Plafond de sécurité : un joueur qui n'arrive à rien part quand même en
// course au bout de TUTO_PLAFOND_S — un tutoriel ne doit jamais être un mur.
const TUTO_PLAFOND_S = 30;
let tutoDeadline = 0;
let tutoDernierTexte = "";
// Nombre de parties pendant lesquelles le tutoriel se rejoue (21 août 2026).
const TUTO_PARTIES = 3;
// Bouton "Passer l'intro" (demandé explicitement, pour qui a déjà joué).
// ⚠️ Le délai ne s'applique qu'à la TOUTE PREMIÈRE partie : un vrai débutant
// doit voir la première consigne avant qu'on lui propose de sauter. Dès la
// 2e, le bouton est là immédiatement — quelqu'un qui revoit le tutoriel pour
// la 2e ou 3e fois sait déjà s'il veut le refaire, le faire attendre 4 s
// serait exactement le frein que ce bouton existe pour retirer.
const SKIP_BUTTON_DELAY = 4000;
let skipButtonTimer = null;

function runTutorial() {
  setView("countdown");
  tutorial.demarrer();
  tutoDeadline = performance.now() + TUTO_PLAFOND_S * 1000;
  tutoDernierTexte = "";
  countdownCaption.classList.remove("hidden");
  clearTimeout(skipButtonTimer);
  if (partiesJouees() > 0) {
    skipCountdownBtn.classList.add("visible"); // revoyure : sortie immédiate
  } else {
    skipCountdownBtn.classList.remove("visible");
    skipButtonTimer = setTimeout(() => skipCountdownBtn.classList.add("visible"), SKIP_BUTTON_DELAY);
  }
}

// Appelée à chaque frame par main.js (comme syncLoadingUi) : reflète l'état du
// tutoriel dans le DOM du décompte, et déclenche la course quand il est fini.
// ⚠️ Transitions revues le 20 août 2026 (« revois toutes les transitions entre
// les phrases ») : le texte changeait d'un coup, sec. Maintenant chaque
// changement de consigne passe par un fondu sortie → remplacement → fondu
// entrée (transition CSS 0,2 s de #countdown-caption), et le « 1/4 » rejoue
// une petite animation d'échelle à chaque changement d'étape (.step-pop).
let captionSwapTimer = null;

export function syncTutorialUi() {
  if (!tutorial.estActif()) return;

  if (tutorial.estFini() || performance.now() >= tutoDeadline) {
    tutorial.arreter();
    beginRun();
    return;
  }

  const a = tutorial.affichage();
  if (!a) return;
  const num = `${a.index}/${a.total}`;
  if (num !== countdownNum.textContent) {
    countdownNum.textContent = num;
    // Retirer puis reposer la classe (avec un reflow entre les deux) rejoue
    // l'animation CSS à chaque changement — technique standard.
    countdownNum.classList.remove("step-pop");
    void countdownNum.offsetWidth;
    countdownNum.classList.add("step-pop");
  }
  if (a.texte !== tutoDernierTexte) {
    tutoDernierTexte = a.texte;
    clearTimeout(captionSwapTimer);
    countdownCaption.classList.add("hidden");
    // Le remplacement attend la fin du fondu de sortie ; si une autre consigne
    // arrive entre-temps, le timer est remplacé et c'est la dernière qui gagne.
    captionSwapTimer = setTimeout(() => {
      countdownCaption.textContent = a.texte;
      countdownCaption.style.color = a.couleur;
      countdownCaption.classList.remove("hidden");
    }, 200);
  }
}

// Sur clic : coupe le tutoriel en cours et enchaîne directement sur la course.
function skipCountdown() {
  if (!tutorial.estActif()) return; // déjà fini ou pas démarré
  tutorial.arreter();
  beginRun();
}

function beginRun() {
  // ⚠️ ORDRE VOLONTAIRE, appris à la dure le 21 août 2026 : le démarrage
  // RÉEL de la course passe EN PREMIER, avant toute manipulation du DOM.
  // Avant ce changement, hideOverlay() était appelé en tête — et une simple
  // ReferenceError dedans (runsTimer non déclaré, voir plus haut) tuait le
  // handler du clic AVANT requestGameStart() : l'overlay disparaissait, le
  // décor défilait, la musique tournait, et la partie ne démarrait jamais.
  // Un ratage cosmétique ne doit jamais pouvoir empêcher la course de
  // partir ; l'inverse est acceptable. Même raison pour le try/catch : ce
  // bloc n'a que des effets d'affichage.
  deps.requestGameStart();
  try {
    clearTimeout(skipButtonTimer);
    hideOverlay();
    showPauseButton();
    skipCountdownBtn.classList.remove("visible");
  } catch (e) {
    debugOverlay.signaler("beginRun", e);
  }
  // audio.play() N'est PLUS appelé ici — le morceau tourne depuis nextStep()
  // (étape pseudo → étape volume), on ne veut surtout pas le relancer et
  // perdre la position courante (le score dépend de la position musicale).
  // Le VRAI démarrage de la course (startRequested/startRequestedAt) reste
  // décidé par main.js — c'est lui qui pilote la boucle de jeu (appelé tout
  // en haut de cette fonction, voir le commentaire d'ordre).
}

function startGame() {
  if (deps.isGameStartRequested() || tutorial.estActif()) return;
  // ⚠️ unlock/play REFAITS ici depuis que l'étape pseudo peut être SAUTÉE
  // (joueur connu → atterrissage direct sur JOUER, voir init) : le
  // déverrouillage iOS vivait sur le clic « Suivant », qui n'a alors jamais
  // lieu — sans ces deux appels, la partie démarrait muette sur l'horloge de
  // secours. Les deux sont idempotents (armed = true dès le 1er appel,
  // play() attend le buffer), les refaire après un vrai nextStep() est sans
  // effet.
  audio.unlock();
  audio.play();
  //
  // ⚠️ Tutoriel sur les TROIS PREMIÈRES parties (21 août 2026, demandé :
  // « mets le tuto en place pour les 3 premiers atterrissages sur le site
  // avec possibilité de skip »). Il était d'abord sauté dès la 2e partie
  // (« ceux qui se sont déjà connectés peuvent pas avoir le tuto ») — trop
  // radical : ce qu'il enseigne (le pont, où sauter TUE) ne rentre pas en une
  // fois, et une seule exposition ne suffisait pas. Trois passages, et le
  // bouton « Passer l'intro » pour qui a déjà compris — c'est lui qui règle
  // le problème du frein, pas la suppression du tuto.
  //
  // Toujours pas de nouvelle clé : `partiesJouees` (incrémenté à chaque écran
  // de fin) répond déjà à la question. Conséquence voulue : quelqu'un qui
  // abandonne avant la fin ne consomme pas son quota, et le repli à 0 en
  // navigation privée redonne le tutoriel plutôt que de le retirer à un vrai
  // débutant.
  //
  // Pas de nouvelle clé : `partiesJouees` (incrémenté à chaque écran de fin,
  // voir renderEndScreen) répond déjà exactement à la question posée — il
  // vaut 0 tant qu'aucune course n'est allée à son terme. Conséquence voulue :
  // quelqu'un qui abandonne sa toute première course avant la fin la revoit,
  // et le repli de partiesJouees() en navigation privée (0) redonne le
  // tutoriel plutôt que de le retirer à un vrai débutant.
  if (partiesJouees() >= TUTO_PARTIES) {
    beginRun();
    return;
  }
  runTutorial();
}

// --- Progression du chargement --------------------------------------------
// Poussée dans la barre à chaque frame tant que le morceau n'est pas prêt. Le
// bouton JOUER reste désactivé jusqu'à 100 % : on ne peut de toute façon rien
// lancer avant, autant que ça se voie.
let loadingDone = false;

export function syncLoadingUi() {
  if (loadingDone) return;

  // Échec de chargement du morceau (réseau coupé, fichier absent, décodage
  // impossible) : `progress` n'atteindra jamais 1, donc sans cette sortie le
  // bouton JOUER restait désactivé indéfiniment derrière une barre figée,
  // sans un mot d'explication. On débloque la partie — elle sait tourner sans
  // le morceau (horloge de secours, main.js, qui affiche déjà son propre
  // bandeau en jeu) — et on dit ce qui se passe. Même principe que partout
  // ailleurs dans ce projet : un jeu muet reste jouable, un jeu figé non.
  if (audio.getLoadError()) {
    loadingDone = true;
    loadingBlock.classList.add("failed"); // pas `done` : ça masque le bloc, or on a justement quelque chose à dire
    loadingLabel.textContent = "Son indisponible, le jeu reste jouable";
    playButton.disabled = false;
    return;
  }

  // `isReadyToStart()` plutôt que la seule progression : le téléchargement
  // peut être fini (90 %) avec un décodage repoussé au geste — il n'y a alors
  // plus rien à attendre, et compter sur `getProgress()` seul laissait la
  // barre plantée à 90 % indéfiniment (voir audio.js).
  const p = audio.isReadyToStart() ? 1 : audio.getProgress();
  loadingFill.style.width = `${Math.round(p * 100)}%`;
  loadingLabel.textContent = `${Math.round(p * 100)} %`;
  if (p >= 1) {
    loadingDone = true;
    loadingBlock.classList.add("done");
    playButton.disabled = false;
  }
}

// --- Son pendant la partie ----------------------------------------------
// Le curseur vertical collé au bord droit n'était « pas très intuitif »
// (playtest) : il est remonté dans le menu, à l'horizontale. Ne reste en jeu
// qu'une bascule son, hors de l'axe de lecture de la route.
// Le curseur a quitté le menu d'avant-partie (demandé : « on supprime dans le
// menu avant de commencer la partie ») pour devenir un petit MENU DÉPLIANT en
// haut à gauche : on règle le son quand on l'entend, pas avant. Un tap sur le
// bouton ouvre/ferme le panneau ; un tap ailleurs le referme.
const soundControl = document.getElementById("sound-control");
const soundPanel = document.getElementById("sound-panel");
const volumeSlider = document.getElementById("volume-slider");
const muteButton = document.getElementById("mute-button");

function syncMuteIcon() {
  const coupe = audio.getVolume() <= 0;
  muteButton.classList.toggle("muted", coupe);
  muteButton.textContent = coupe ? "✕" : "♪";
}

function setSoundPanelOpen(open) {
  soundPanel.hidden = !open;
  muteButton.setAttribute("aria-expanded", String(open));
}

// --- Menu pause -----------------------------------------------------------
// Demandé explicitement : « mets un menu pause avec le volume ». Bouton
// dédié (visible uniquement en cours de course — showPauseButton()/
// hidePauseButton() sont appelées depuis main.js : beginRun()/restartGame()/
// endGame()/beginFinish()) plutôt qu'un tap sur l'écran : même règle que
// partout ailleurs dans le jeu, une action = un bouton visible.
//
// Retour : « le bouton Pause, il faut le mettre à la place du bouton Volume ».
// Les deux boutons occupent maintenant le MÊME coin (haut gauche, voir CSS) et
// ne sont jamais affichés en même temps : Pause remplace la bascule son
// pendant la course (le menu pause contient déjà le volume, plus besoin d'un
// second contrôle) ; la bascule son revient sur les écrans hors-jeu (menu,
// décompte, fin), exactement comme avant.
const pauseButton = document.getElementById("pause-button");
const pauseScreen = document.getElementById("pause-screen");
const pauseVolumeSlider = document.getElementById("pause-volume-slider");
// Vue « Règles & points » de la carte pause (voir setPauseRulesOpen).
const pauseMain = document.getElementById("pause-main");
const pauseRules = document.getElementById("pause-rules");
const pauseEyebrow = document.getElementById("pause-eyebrow");
const pauseRulesBtn = document.getElementById("pause-rules-btn");
const pauseRulesBack = document.getElementById("pause-rules-back");
const resumeButton = document.getElementById("resume-button");
const pauseReplayButton = document.getElementById("pause-replay-button");

export function showPauseButton() {
  pauseButton.hidden = false;
  soundControl.hidden = true;
  setSoundPanelOpen(false); // referme le panneau volume s'il traînait ouvert
}
export function hidePauseButton() {
  pauseButton.hidden = true;
  soundControl.hidden = false;
  // Le bouton disparaît (fin de partie, séquence d'arrivée...) : referme le
  // panneau s'il était resté ouvert, sinon la pause resterait active pour
  // toujours (plus aucun bouton "Reprendre" à l'écran pour en sortir).
  if (deps.isManuallyPaused()) closePauseMenu();
}

// Vue « Règles & points » de la carte pause (21 août 2026, demandé). Une
// seule carte, deux vues basculées : la liste remplace volume+boutons, le
// bandeau change de titre, et le zoom ×1,2 de la carte pause saute (classe
// rules-open) — la liste est trop haute pour survivre à l'agrandissement.
function setPauseRulesOpen(open) {
  pauseMain.classList.toggle("hidden", open);
  pauseRules.classList.toggle("hidden", !open);
  pauseScreen.classList.toggle("rules-open", open);
  pauseEyebrow.textContent = open ? "Règles & points" : "Pause";
}

function openPauseMenu() {
  if (deps.isManuallyPaused() || pauseButton.hidden) return;
  deps.openPause(); // manualPaused = true côté main.js + applyPauseState()
  pauseVolumeSlider.value = volumeSlider.value; // reflète le volume courant à l'ouverture
  setSoundPanelOpen(false); // évite les deux panneaux ouverts en même temps
  setPauseRulesOpen(false); // toujours rouvrir sur la vue principale
  pauseScreen.classList.add("visible");
}

function closePauseMenu() {
  if (!deps.isManuallyPaused()) return;
  deps.closePause(); // manualPaused = false côté main.js + applyPauseState()
  pauseScreen.classList.remove("visible");
}

// --- Pseudo Instagram (étape 7) -----------------------------------------
// Identifiant du classement (jamais un email, décision verrouillée). Purement
// facultatif : la partie reste jouable sans, seul l'envoi du score au
// backend est sauté (voir endGame() dans main.js). Persisté en localStorage
// pour ne pas le retaper à chaque partie.
// Deux champs séparés depuis le playtest : « il faut demander pseudo ET
// insta, et on affiche à la fin le pseudo seulement, parce que l'Instagram
// c'est que pour moi — sinon tout le monde va voir l'insta du gagnant ».
//   - pseudo : OBLIGATOIRE, c'est la seule chose publiée au classement.
//   - insta  : optionnel à l'affichage, sert uniquement à l'artiste pour
//              contacter le gagnant. Il n'est jamais affiché, et n'est même
//              pas LISIBLE par le jeu : le classement passe par une vue
//              publique qui ne l'expose pas (voir supabase-schema.sql / net.js).
const pseudoInput = document.getElementById("pseudo-input");
const instaInput = document.getElementById("insta-input");
const pseudoNext = document.getElementById("pseudo-next");
function cleanPseudo() { return pseudoInput.value.trim(); }
function cleanInsta() { return instaInput.value.trim().replace(/^@+/, ""); }

export function getPseudo() { return cleanPseudo(); }
export function getInsta() { return cleanInsta(); }

function syncPseudoStep() {
  // Les DEUX champs sont désormais obligatoires (retour de terrain : un
  // joueur a rempli son pseudo mais pas son Insta — PMC n'a alors aucun
  // moyen de le retrouver pour le contacter s'il gagne, un pseudo affiché
  // seul au classement ne suffit pas). On bloque l'étape plutôt que de
  // laisser jouer puis de découvrir un score orphelin au moment de remettre
  // le lot.
  pseudoNext.disabled = cleanPseudo().length === 0 || cleanInsta().length === 0;
}

// --- Classement (étape 7) --------------------------------------------------
// Demandé explicitement au playtest ("j'espère qu'il y a un tableau avec les
// classements à la fin"). Masqué tant qu'il n'y a rien à montrer — backend
// pas encore configuré (CONFIG.apiScores vide, voir net.js) ou requête
// vide/en échec : jamais bloquant, jamais d'erreur visible, le pire cas est
// un bloc absent comme avant.
// Dernière réponse réseau reçue (jusqu'à CONFIG.apiScoresLimit lignes) —
// gardée pour que le panneau « classement complet » (23 août 2026) n'ait
// jamais besoin d'un second appel à net.getTopScores : la carte compacte et
// le panneau lisent la MÊME liste, juste rendue différemment.
let dernierClassement = [];

// Construit une ligne <li> de classement (rang + pseudo + score), en
// surlignant la ligne du joueur courant. Partagé entre la carte compacte
// (#leaderboard-list) et le panneau complet (#leaderboard-sheet-list) — même
// DOM, même comportement, juste deux conteneurs différents (23 août 2026).
function construireLigneClassement(s, rank, pseudoJoueur) {
  const li = document.createElement("li");
  const rangEl = document.createElement("span");
  rangEl.className = "rank";
  rangEl.textContent = `${rank}`;
  const pseudo = document.createElement("span");
  pseudo.className = "pseudo";
  // Le classement ne connaît QUE le pseudo public : la vue Supabase
  // n'expose pas la colonne insta (voir net.js). Repli sur pseudo_insta
  // pour les lignes écrites avant la séparation des deux champs.
  const displayPseudo = (s.pseudo || s.pseudo_insta || "?").replace(/^@+/, "");
  pseudo.textContent = displayPseudo;
  const points = document.createElement("span");
  points.className = "points";
  points.textContent = `${s.score}`;
  li.append(rangEl, pseudo, points);
  // Surligner le score du joueur courant. Le test est prudent : même pseudo
  // + même score, pour éviter de surligner des homonymes avec un score
  // différent.
  if (pseudoJoueur && displayPseudo === pseudoJoueur && s.score === deps.game.score) {
    li.classList.add("current-score");
  }
  return li;
}

// Refonte du 23 août 2026 (« écran de fin trop chargé, ça respire pas ») :
// la carte ne montre plus qu'un TOP 3 fixe, sans scroll — plus, si le joueur
// est classé en dehors, SA ligne juste en dessous (séparée par un filet
// pointillé, .self-gap) avec son VRAI rang. Le classement complet (jusqu'à
// 50) part dans #leaderboard-sheet, ouvert au clic sur « Voir le classement
// complet » — jamais affiché s'il n'y a que ces 3-4 lignes à voir.
export function renderLeaderboard(scores) {
  leaderboardList.innerHTML = "";
  dernierClassement = scores;
  if (!scores.length) {
    // Table réellement vide (premier joueur du concours) : rien à montrer, on
    // masque comme avant. Mais si la requête a ÉCHOUÉ, se taire était le vrai
    // problème — « le classement n'apparaît pas chez moi » était
    // indistinguable d'un classement vide. On le dit, et on donne la raison
    // technique en mode ?debug (sur téléphone, c'est la seule console qu'on
    // ait). Voir net.getLastError().
    const raison = net.getLastError();
    if (!raison) {
      leaderboard.classList.add("hidden");
      leaderboardExpand.classList.add("hidden");
      return;
    }
    const li = document.createElement("li");
    li.className = "board-message";
    li.textContent = debugOverlay.isEnabled()
      ? `Classement indisponible — ${raison}`
      : "Classement indisponible pour le moment";
    leaderboardList.appendChild(li);
    leaderboard.classList.remove("hidden");
    leaderboardExpand.classList.add("hidden");
    return;
  }
  const pseudoJoueur = cleanPseudo();
  const top = scores.slice(0, 3);
  top.forEach((s, i) => leaderboardList.appendChild(construireLigneClassement(s, i + 1, pseudoJoueur)));
  const selfIndex = scores.findIndex((s) => {
    const displayPseudo = (s.pseudo || s.pseudo_insta || "?").replace(/^@+/, "");
    return pseudoJoueur && displayPseudo === pseudoJoueur && s.score === deps.game.score;
  });
  if (selfIndex >= 3) {
    const ligneJoueur = construireLigneClassement(scores[selfIndex], selfIndex + 1, pseudoJoueur);
    ligneJoueur.classList.add("self-gap");
    leaderboardList.appendChild(ligneJoueur);
  }
  leaderboard.classList.remove("hidden");
  // Pas la peine d'ouvrir un panneau pour voir 3 lignes qu'on voit déjà.
  leaderboardExpand.classList.toggle("hidden", scores.length <= 3);
}

function ouvrirClassementComplet() {
  leaderboardSheetList.innerHTML = "";
  const pseudoJoueur = cleanPseudo();
  let current = null;
  for (const [i, s] of dernierClassement.entries()) {
    const li = construireLigneClassement(s, i + 1, pseudoJoueur);
    if (li.classList.contains("current-score")) current = li;
    leaderboardSheetList.appendChild(li);
  }
  leaderboardSheet.classList.add("visible");
  leaderboardSheet.setAttribute("aria-hidden", "false");
  scrollCurrentScoreIntoView(current, leaderboardSheetList);
}

function fermerClassementComplet() {
  leaderboardSheet.classList.remove("visible");
  leaderboardSheet.setAttribute("aria-hidden", "true");
}

// « Je suis 8e, je veux que ma ligne arrive au milieu de mon écran et qu'elle
// soit surlignée. » Le panneau complet affiche jusqu'à 50 entrées dans une
// liste qui défile (CONFIG.apiScoresLimit).
// `scrollIntoView({block:"center"})` est volontairement évité : sur Safari
// iOS il fait aussi remonter l'ANCÊTRE scrollable (donc la page entière, qui
// est en overflow:hidden ici) et provoque des sauts de mise en page. On
// positionne donc le scroll de la liste à la main.
function scrollCurrentScoreIntoView(li, liste) {
  if (!li) return;
  // Après le repaint : tant que le conteneur est encore invisible,
  // offsetTop/clientHeight valent 0 et le calcul serait faux.
  requestAnimationFrame(() => {
    // Position de la ligne DANS le contenu défilant. `li.offsetTop` ne
    // convient pas : il se mesure depuis le premier ancêtre positionné, qui
    // n'est pas la liste (bug constaté — la ligne finissait hors champ).
    const rectListe = liste.getBoundingClientRect();
    const haut = li.getBoundingClientRect().top - rectListe.top + liste.scrollTop;
    const centre = haut - (liste.clientHeight - li.offsetHeight) / 2;
    // ⚠️ Borné au contenu réel, SANS padding artificiel (revu le 20 août 2026,
    // capture à l'appui) : l'ancien code ajoutait du padding-bottom pour
    // rendre le centrage atteignable quand le joueur est en fin de classement
    // — mais la liste est en box-sizing par défaut (content-box), donc ce
    // padding s'AJOUTAIT à sa hauteur visible : un grand blanc apparaissait
    // sous la dernière ligne, dans la carte. Une ligne parmi les dernières
    // s'affiche donc près du bas de la fenêtre plutôt qu'au milieu — elle
    // reste surlignée et visible, c'est ce qui compte.
    const maxScroll = liste.scrollHeight - liste.clientHeight;
    liste.scrollTop = Math.min(Math.max(0, centre), Math.max(0, maxScroll));
  });
}

// --- Défi d'un ami (21 août 2026) ----------------------------------------
// Le jeu porte la cible d'un bout à l'autre : bandeau au menu (« pol te
// défie »), jauge en course (hud.renderDefi), verdict ici. Voir defi.js pour
// la lecture de l'URL et l'absence assumée de vérification.

function syncDefiBanner() {
  const cible = defi.cible();
  defiBanner.classList.toggle("hidden", !cible);
  if (!cible) return;
  defiBannerQui.textContent = cible.pseudo;
  defiBannerNum.textContent = String(cible.score);
  // Boost de départ (23 août 2026) : annoncé ici, AVANT le bouton JOUER —
  // c'est l'appât du lien. Le multiplicateur est recalculé depuis config.js
  // (defiBoostPaliers × comboBonusParPalier), jamais écrit en dur dans le
  // HTML, pour survivre à un futur réglage.
  const boostEl = document.getElementById("defi-banner-boost");
  const paliers = window.CONFIG.defiBoostPaliers || 0;
  if (boostEl) {
    const mult = 1 + window.CONFIG.comboBonusParPalier * paliers;
    boostEl.textContent = paliers > 0
      ? `Cadeau : tu démarres avec un combo ×${String(mult).replace(".", ",")}`
      : "";
  }
}

function afficherResultatDefi() {
  const cible = defi.cible();
  defiResult.classList.toggle("hidden", !cible);
  defiResult.classList.remove("gagne");
  if (!cible) return;
  const score = deps.game.score;
  if (score > cible.score) {
    defiResult.classList.add("gagne");
    defiResult.textContent = `DÉFI RELEVÉ — tu bats ${cible.pseudo} (${cible.score})`;
  } else {
    // L'écart plutôt que le score adverse : c'est le chiffre qui donne envie
    // de relancer tout de suite (« il m'en manquait 400 »).
    const ecart = cible.score - score + 1;
    defiResult.textContent = `Défi manqué : il te manquait ${ecart} points pour battre ${cible.pseudo}`;
  }
}

// Partage du défi. Pas de fichier joint (contrairement à PARTAGER MON
// SCORE) : ici l'objet du partage est le LIEN, qui doit rester cliquable
// dans une conversation. Synchrone, comme tout partage — la règle du geste
// iOS vaut aussi pour navigator.share sans fichier.
function partagerDefi() {
  const score = deps.game.score;
  const pseudo = getPseudo();
  const url = defi.lien(score, pseudo);
  const texte = defi.texte(score, pseudo);
  if (navigator.share) {
    navigator.share({ title: "La ville est belle", text: texte, url })
      .catch(() => { /* partage annulé : rien à signaler */ });
    return;
  }
  // Repli desktop : le lien dans le presse-papiers, avec un retour visible —
  // sans ça, le bouton ne ferait rien du tout et passerait pour cassé.
  const complet = `${texte} ${url}`;
  const fini = () => {
    defiLabel.textContent = "Lien copié !";
    setTimeout(() => { defiLabel.textContent = DEFI_LABEL; }, 2500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(complet).then(fini).catch(() => {
      window.prompt("Copie ce lien et envoie-le :", complet);
    });
  } else {
    window.prompt("Copie ce lien et envoie-le :", complet);
  }
}

// Fin de partie : le menu revient en fondu, réutilisé tel quel — le titre
// devient le résultat, le bouton principal devient « Rejouer ». Un léger
// retard laisse la scène se figer à l'écran avant que l'overlay ne monte,
// sinon la transition écrase l'instant où on comprend ce qui vient d'arriver.
// L'envoi du score et la relecture du classement restent décidés par
// main.js (endGame()) : ce module ne fait qu'afficher le résultat.
export function showEndScreen(reason) {
  const finished = reason === "finished";
  // « Votre score » plutôt que « Game Over » (20 août 2026, demandé) : le
  // bandeau annonce ce que la carte montre, le constat d'échec n'apportait
  // rien — un parcours terminé garde son bandeau de victoire.
  // Course parfaite : elle mérite mieux que « Parcours terminé » — c'est le
  // seul cas où le bandeau annonce une performance plutôt qu'un état.
  const parfait = finished && deps.game.sansFaute;
  endEyebrow.textContent = parfait
    ? "Course parfaite"
    : finished ? "Parcours terminé" : "Votre score";
  scoreNum.textContent = `${deps.game.score}`;
  perfectNote.classList.toggle("hidden", !parfait);
  afficherResultatDefi();
  // Défier avec 0 point n'a pas de sens — et le lien serait de toute façon
  // rejeté à la lecture (defi.js n'accepte qu'une cible strictement positive).
  defiButton.classList.toggle("hidden", deps.game.score <= 0);
  defiLabel.textContent = DEFI_LABEL;

  // Compteur de parties : nourrit le verrou « suivre PMC » (3 parties).
  try { localStorage.setItem(CLE_PARTIES, String(partiesJouees() + 1)); } catch (e) { /* rien */ }

  // Boost fan : annoncé tant que le morceau n'a pas été ajouté — le moment le
  // plus lisible, c'est justement la fin de la première partie (« pour jouer,
  // si tu ajoutes le morceau, tu gagnes un boost fan »).
  fanNote.classList.toggle("hidden", estFan());

  // Preuve sociale : total des parties jouées (toutes personnes confondues),
  // rafraîchi en continu tant que cet écran est ouvert — voir plus bas.
  demarrerCompteurCourses();
  // (L'ancienne bascule `cta-minimal` du CTA flottant a disparu avec lui :
  // sur l'écran de fin, le lien est maintenant le bouton principal de la
  // carte, aussi bien après un game over qu'après un parcours terminé.)
  // La bascule son n'est plus masquée ici : elle reste affichée sur TOUS les
  // écrans (demandé explicitement). Le morceau continue de tourner sur
  // l'écran de fin — c'est justement là qu'on peut vouloir le couper.
  leaderboard.classList.add("hidden"); // masqué le temps de la requête, évite d'afficher le classement de la partie précédente

  setTimeout(() => { setView("end"); showOverlay(); }, 600);
}

// deps = { game, requestGameStart, isGameStartRequested, restartGame,
//          openPause, closePause, isManuallyPaused }
// Voir l'en-tête du fichier pour le rôle exact de chaque callback.
export function init(d) {
  deps = d;

  ctaLink.href = window.CONFIG.lienEP;
  endCta.href = window.CONFIG.lienEP;
  // Instagram de l'artiste sur l'écran de fin (config.js fait foi, comme
  // pour lienEP/lienSuivre).
  instaLink.href = window.CONFIG.lienInsta;

  // Défi reçu par lien : le bandeau se pose une fois pour toutes au menu.
  syncDefiBanner();
  defiButton.addEventListener("click", (e) => {
    e.stopPropagation();
    partagerDefi(); // synchrone : même règle de geste que le partage d'image
  });

  leaderboardExpand.addEventListener("click", ouvrirClassementComplet);
  leaderboardSheetClose.addEventListener("click", fermerClassementComplet);
  leaderboardSheetVeil.addEventListener("click", fermerClassementComplet);

  // --- Carte de mort : les deux boutons passent par la MÊME porte ---------
  // ⚠️ Le décompte de la carte est GELÉ pendant que le tiroir est ouvert
  // par-dessus, et REPRIS là où il en était si le joueur referme le tiroir
  // par « Plus tard » — sans ça la carte déciderait toute seule (onDecline)
  // pendant qu'il lit la demande, ou pire, pendant qu'il est chez Spotify.
  function porteDepuisCarteDeMort(action, issue) {
    if (!reviveCallbacks) return;
    const restant = decompteRevive.restant;
    decompteRevive.arreter();
    exigerConversion({
      action,
      score: reviveScoreCourant,
      onOk: () => reviveResoudre(issue),
      onCancel: () => reprendreDecompteRevive(restant),
    });
  }

  reviveCta.addEventListener("click", () => porteDepuisCarteDeMort("continuer", "onAccept"));
  reviveReplay.addEventListener("click", () => porteDepuisCarteDeMort("rejouer", "onReplay"));
  reviveDecline.addEventListener("click", () => reviveResoudre("onDecline"));

  // --- Tiroir de conversion ----------------------------------------------
  // ⚠️ Le basculement en phase « absence » est DIFFÉRÉ d'un setTimeout(0) :
  // il cache le <a>, et le neutraliser PENDANT le dispatch du clic annule la
  // navigation (l'activation d'un lien relit le href après le dispatch) —
  // Spotify ne s'ouvrait jamais, prouvé au banc d'essai (revue du 21 août).
  gateCta.addEventListener("click", () => {
    if (!gateEtat || gateEtat.phase !== "demande") return;
    if (gateEtat.niveau === "presave") marquerMorceauOuvert();
    else marquerPmcSuivi();
    setTimeout(gatePhaseAbsence, 0);
  });
  // Armé seulement en phase « prêt » : le clic est ignoré tant que le décompte
  // de retour tourne (le bouton est aussi visuellement verrouillé).
  gateGo.addEventListener("click", () => {
    if (!gateEtat || gateEtat.phase !== "pret") return;
    gateResoudre("onUnlocked");
  });
  gateLater.addEventListener("click", () => gateResoudre("onCancel"));

  // Retour dans l'appli pendant le détour Spotify (22 août 2026, demandé :
  // « quand la personne revient sur l'app, à ce moment-là le décompte se
  // remet en mode 5, 4, 3, 2, 1 »). Pendant l'absence la boucle du début
  // tourne au plus filtré ; au retour elle se défiltre sur ce décompte-là.
  document.addEventListener("visibilitychange", () => {
    if (!gateEtat) return; // tiroir fermé : rien à piloter
    if (document.hidden) {
      audio.setReviveIntensity(0); // « pas fort du tout » pendant le détour
      return;
    }
    if (gateEtat.phase === "absence" || gateEtat.phase === "retour") gatePhaseRetour();
  });

  audio.setVolume(Number(volumeSlider.value) / 100);
  syncMuteIcon();

  pseudoInput.value = localStorage.getItem("pseudoJoueur") || "";
  instaInput.value = localStorage.getItem("pseudoInsta") || "";
  syncPseudoStep();

  // ⚠️ Retour d'un joueur connu (21 août 2026, demandé : « quand les gens
  // reviennent, ils n'ont pas besoin de refaire quoi que ce soit ») : pseudo
  // ET insta déjà en localStorage → on saute l'étape 1 et on atterrit
  // directement sur « JOUER ». Un lien discret permet de changer d'identité
  // (téléphone prêté) — voir changePseudo ci-dessous. En navigation privée,
  // localStorage est vide : le nouveau venu garde le parcours complet.
  const identiteConnue = cleanPseudo().length > 0 && cleanInsta().length > 0;
  if (identiteConnue) {
    changePseudoBtn.textContent = `Pas ${cleanPseudo()} ? Modifier`;
    changePseudoBtn.classList.remove("hidden");
    showStep(1);
  } else {
    changePseudoBtn.classList.add("hidden");
    showStep(0);
  }
  changePseudoBtn.addEventListener("click", () => showStep(0));

  document.querySelectorAll(".menu-step [data-next]").forEach((btn) => {
    btn.addEventListener("click", nextStep);
  });

  playButton.addEventListener("click", startGame);
  // ⚠️ REJOUER de l'écran de fin passe par LA MÊME porte que la carte de mort
  // (23 août 2026, quatrième passe — « pareil pour le rejouer, il faut que ce
  // soit exactement les mêmes conditions »). Sans ça la porte se contournerait
  // en un tap : « Voir mon score » puis REJOUER, et plus rien ne serait
  // demandé à personne.
  replayButton.addEventListener("click", () => {
    exigerConversion({
      action: "rejouer",
      score: deps.game.score,
      onOk: () => deps.restartGame(),
      onCancel: () => { /* il reste sur son écran de fin */ },
    });
  });

  // Le lien du morceau lève le verrou de rejeu (et donne le boost fan), sur
  // TOUS les emplacements — carte de fin, CTA flottant du menu, bandeau
  // « Tu écoutes » : le geste compte, d'où qu'il vienne.
  [endCta, ctaLink].forEach((lien) => lien.addEventListener("click", marquerMorceauOuvert));

  // Tracking du clic (23 août 2026, voir net.postClicEP) : mesurer le taux
  // jeu → smartlink sans dépendre du tableau de bord li.sten.to, qui ne voit
  // que ses propres visites, jamais d'où elles viennent. ⚠️ Seulement si le
  // lien pointe VRAIMENT vers lienEP au clic — reviveCta peut aussi pointer
  // vers lienSuivre (palier « suivre » de la carte de mort), un funnel
  // différent qu'on ne veut pas mélanger dans ce compteur.
  [endCta, ctaLink, reviveCta].forEach((lien) => {
    lien.addEventListener("click", () => {
      if (lien.href === window.CONFIG.lienEP) net.postClicEP();
    });
  });

  skipCountdownBtn.addEventListener("click", skipCountdown);

  // Échap = pause (24 août 2026, demandé : « les gens sur l'ordi, quand ils
  // appuient sur Échap, ça fait pause »). Bascule : ouvre le menu pause en
  // course, le referme s'il est déjà ouvert. openPauseMenu() se refuse tout
  // seul hors course (pauseButton.hidden) — aucun risque d'ouvrir la pause
  // sur le menu d'accueil ou l'écran de fin.
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Escape") return;
    if (deps.isManuallyPaused()) closePauseMenu();
    else openPauseMenu();
  });

  // Entrée/espace au clavier : confort de test sur desktop uniquement.
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Enter" && e.code !== "Space") return;
    if (!overlay.classList.contains("visible")) return;
    if (currentView === "end") {
      deps.restartGame();
      return;
    }
    if (currentView === "onboarding" && stepOrder[stepIndex] === "play" && !playButton.disabled) {
      startGame();
    }
  });

  pseudoInput.addEventListener("input", () => {
    localStorage.setItem("pseudoJoueur", cleanPseudo());
    syncPseudoStep();
  });
  instaInput.addEventListener("input", () => {
    localStorage.setItem("pseudoInsta", cleanInsta());
    syncPseudoStep();
  });
  // Empêche la frappe/le focus de fuiter vers les gestes de jeu (swipes),
  // même traitement que les autres contrôles superposés au canvas.
  [pseudoInput, instaInput].forEach((el) => {
    ["pointerdown", "touchstart", "touchmove", "mousedown"].forEach((type) => {
      el.addEventListener(type, (e) => e.stopPropagation());
    });
  });

  volumeSlider.addEventListener("input", () => {
    audio.setVolume(Number(volumeSlider.value) / 100);
    syncMuteIcon();
  });
  // Le curseur est superposé au canvas, qui écoute les swipes : sans ces
  // gardes, le régler ferait aussi changer de voie.
  ["pointerdown", "pointerup", "touchstart", "touchmove", "touchend", "mousedown"].forEach((type) => {
    soundPanel.addEventListener(type, (e) => e.stopPropagation());
  });
  // Tap hors du panneau = fermeture (un panneau ouvert en pleine course
  // masquerait une partie de la route).
  window.addEventListener("pointerdown", (e) => {
    if (!soundPanel.hidden && !soundControl.contains(e.target)) setSoundPanelOpen(false);
  });
  muteButton.addEventListener("click", (e) => {
    e.stopPropagation();
    setSoundPanelOpen(soundPanel.hidden);
  });
  // Le glissement tactile de secours écoute window : sans ces gardes, toucher
  // la bascule son dirigerait aussi le personnage.
  ["pointerdown", "pointerup", "touchstart", "touchend"].forEach((type) => {
    muteButton.addEventListener(type, (e) => e.stopPropagation());
  });

  pauseButton.addEventListener("click", (e) => {
    e.stopPropagation();
    openPauseMenu();
  });
  resumeButton.addEventListener("click", (e) => {
    e.stopPropagation();
    closePauseMenu();
  });
  pauseReplayButton.addEventListener("click", (e) => {
    e.stopPropagation();
    closePauseMenu();
    deps.restartGame();
  });
  pauseRulesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPauseRulesOpen(true);
  });
  pauseRulesBack.addEventListener("click", (e) => {
    e.stopPropagation();
    setPauseRulesOpen(false);
  });
  pauseVolumeSlider.addEventListener("input", () => {
    audio.setVolume(Number(pauseVolumeSlider.value) / 100);
    volumeSlider.value = pauseVolumeSlider.value; // les deux curseurs (menu déroulant + pause) restent synchronisés
    syncMuteIcon();
  });
  // Même garde que le reste des contrôles superposés au canvas (voir plus
  // haut) : sans stopPropagation, un tap sur le panneau atteindrait `window`
  // et se ferait lire comme un swipe par input.js.
  ["pointerdown", "pointerup", "touchstart", "touchmove", "touchend", "mousedown"].forEach((type) => {
    pauseScreen.addEventListener(type, (e) => e.stopPropagation());
  });
  ["pointerdown", "pointerup", "touchstart", "touchend"].forEach((type) => {
    pauseButton.addEventListener(type, (e) => e.stopPropagation());
  });

  // Le glissement tactile sur la bande de pilotage (#steer-control) et sur le
  // bouton saut gère lui-même sa propagation dans input.js — rien à faire ici.
}
