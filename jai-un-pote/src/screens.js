// screens.js — Écrans hors-jeu de « J'ai un pote » : menu (un seul champ),
// écran de fin, carte de mort, tiroir album (même échelle de conversion que
// le premier jeu, mêmes clés localStorage — un joueur qui a déjà ouvert
// l'album sur l'autre jeu est « libre » ici aussi), pause, son.
// Câblage DOM et présentation uniquement ; main.js garde l'état de partie et
// reçoit les actions en callbacks via init().

import * as audio from "./audio.js";
import * as net from "./net.js";
import * as friends from "./friends.js";

let deps = null;
const $ = (id) => document.getElementById(id);

const overlay = $("overlay");
const onboardingEl = $("onboarding");
const endScreenEl = $("end-screen");
const pseudoInput = $("pseudo-input");
const playButton = $("play-button");
const loadingBlock = $("loading");
const loadingFill = $("loading-fill");
const loadingLabel = $("loading-label");
const ctaLink = $("cta-link");
const endCta = $("end-cta");
const scoreVal = $("score-val");
const endSub = $("end-sub");
const endBest = $("end-best");
const replayButton = $("replay-button");
const instaLink = $("insta-link");
const reviveSheet = $("revive-sheet");
const reviveArc = $("revive-arc");
const reviveTimer = $("revive-timer");
const reviveTimerNum = $("revive-timer-num");
const reviveTitle = $("revive-title");
const reviveText = $("revive-text");
const reviveCta = $("revive-cta");
const reviveReplay = $("revive-replay");
const reviveDecline = $("revive-decline");
const gateSheet = $("gate-sheet");
const gatePlatforms = $("gate-platforms");
const gateHint = $("gate-hint");
const gateEyebrow = $("gate-eyebrow");
const gateTitle = $("gate-title");
const gateText = $("gate-text");
const gateCta = $("gate-cta");
const gateCtaLabel = $("gate-cta-label");
const gateGo = $("gate-go");
const gateLater = $("gate-later");
const muteButton = $("mute-button");
const pauseButton = $("pause-button");
const pauseScreen = $("pause-screen");
const pauseVolumeSlider = $("pause-volume-slider");
const resumeButton = $("resume-button");
const pauseReplayButton = $("pause-replay-button");

// --- Conversion (mêmes clés que le premier jeu) -----------------------------
const CLE_MORCEAU_OUVERT = "morceauOuvert";
const CLE_PMC_SUIVI = "pmcSuivi";
const CLE_PLATEFORME = "plateformeAlbum";
const CLE_PSEUDO = "jaipPseudo";
const CLE_RECORD = "jaipRecord";
const CLE_PARTIES = "jaipParties";
const CLE_LIGUE = "jaipLigue";

// `?zero` : tout effacer (pseudo, record, conversion) — « comme si je n'avais
// jamais joué ». Même origine que le premier jeu, donc ça le remet à zéro aussi.
try {
  if (new URLSearchParams(location.search).has("zero")) {
    localStorage.clear();
    const url = new URL(location.href); url.searchParams.delete("zero"); history.replaceState(null, "", url.toString());
  }
} catch (e) { /* rien */ }
try {
  if (new URLSearchParams(location.search).has("neuf")) {
    localStorage.removeItem(CLE_MORCEAU_OUVERT);
    localStorage.removeItem(CLE_PMC_SUIVI);
    localStorage.removeItem(CLE_PLATEFORME);
    const url = new URL(location.href); url.searchParams.delete("neuf"); history.replaceState(null, "", url.toString());
  }
} catch (e) { /* rien */ }

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* navigation privée */ } }

function morceauDejaOuvert() { return lsGet(CLE_MORCEAU_OUVERT) === "1"; }
function pmcDejaSuivi() { return lsGet(CLE_PMC_SUIVI) === "1"; }
let fanCache = morceauDejaOuvert();
export function estFan() { return fanCache; }
function niveauConversion() {
  if (!morceauDejaOuvert()) return "presave";
  if (!pmcDejaSuivi()) return "suivre";
  return "libre";
}
export function niveauConversionCourant() { return niveauConversion(); }

export function getPseudo() { return pseudoInput.value.trim().replace(/^@+/, ""); }
export function getRecord() { return Number(lsGet(CLE_RECORD)) || 0; }
export function getParties() { return Number(lsGet(CLE_PARTIES)) || 0; }
export function compterPartie() { lsSet(CLE_PARTIES, String(getParties() + 1)); }
export function setRecord(m) { lsSet(CLE_RECORD, String(Math.floor(m))); }

export function showOverlay() { overlay.classList.add("visible"); }
export function hideOverlay() { overlay.classList.remove("visible"); }
export function showOverlayOnLoad() { requestAnimationFrame(() => requestAnimationFrame(showOverlay)); }

function setView(view) {
  onboardingEl.classList.toggle("active", view === "onboarding");
  endScreenEl.classList.toggle("active", view === "end");
  overlay.classList.toggle("end-view", view === "end");
  ctaLink.style.display = view === "onboarding" ? "" : "none";
}

// --- Décompte circulaire (carte de mort) -----------------------------------
const REVIVE_DELAI_S = 10;
const REVIVE_TICK_MAX_S = 0.3;
const ARC = 2 * Math.PI * 33;

function creerDecompte(boite, num, arc) {
  let id = 0, restant = 0, total = 1;
  const maj = () => {
    num.textContent = `${Math.max(0, Math.ceil(restant))}`;
    arc.style.strokeDashoffset = `${ARC * (1 - Math.max(0, restant) / total)}`;
  };
  return {
    get restant() { return restant; },
    arreter() { clearInterval(id); id = 0; },
    demarrer(duree, onZero) {
      clearInterval(id);
      total = duree; restant = duree;
      boite.classList.remove("hidden");
      maj();
      audio.setReviveIntensity(0);
      let precedent = performance.now();
      id = setInterval(() => {
        const maintenant = performance.now();
        const ecoule = Math.min((maintenant - precedent) / 1000, REVIVE_TICK_MAX_S);
        precedent = maintenant;
        if (document.hidden) return;
        restant -= ecoule;
        maj();
        audio.setReviveIntensity(1 - Math.max(0, restant) / total);
        if (restant <= 0) { clearInterval(id); id = 0; onZero(); }
      }, 100);
    },
  };
}
const decompteRevive = creerDecompte(reviveTimer, reviveTimerNum, reviveArc);

let reviveCallbacks = null;
let reviveMetres = 0;

// `potes` = nombre de potes au maximum de la course : la carte les promet de
// retour (c'est le ressort émotionnel demandé : les potes s'en vont, ouvre
// l'album pour les rattraper).
export function openReviveSheet({ metres, potes, onAccept, onDecline, onReplay }) {
  reviveCallbacks = { onAccept, onDecline, onReplay };
  reviveMetres = metres;
  reviveTitle.textContent = potes > 0 ? "Tes potes t'attendent" : "Ta course n'est pas finie";
  reviveText.textContent = potes > 0
    ? `Reprends à ${Math.floor(metres).toLocaleString("fr-FR")} m, et ${Math.min(2, potes)} pote${Math.min(2, potes) > 1 ? "s" : ""} te retombe${Math.min(2, potes) > 1 ? "nt" : ""} dessus.`
    : `Reprends pile ici, à ${Math.floor(metres).toLocaleString("fr-FR")} m.`;
  reviveCta.classList.remove("locked");
  reviveSheet.classList.add("visible");
  reviveSheet.setAttribute("aria-hidden", "false");
  decompteRevive.demarrer(REVIVE_DELAI_S, () => reviveResoudre("onDecline"));
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
function reprendreDecompteRevive(restant) {
  if (!reviveCallbacks) return;
  if (restant <= 0) { reviveResoudre("onDecline"); return; }
  decompteRevive.demarrer(restant, () => reviveResoudre("onDecline"));
}

// --- Tiroir album ------------------------------------------------------------
let gateEtat = null;
let gateRetourTimer = 0;

function plateformes() {
  const l = window.CONFIG.plateformesAlbum;
  return Array.isArray(l) ? l.filter((p) => p && p.url && p.nom) : [];
}
function texteGeste(liste) {
  const pref = liste.find((p) => p.id === lsGet(CLE_PLATEFORME));
  const geste = pref && pref.geste ? pref.geste : "appuie sur ＋ ou ♥";
  return `Une fois dans l'app : ${geste} pour ajouter l'album à ta bibliothèque.`;
}
function construirePlateformes() {
  const liste = plateformes();
  gatePlatforms.textContent = "";
  if (!liste.length) return false;
  // Cinq liens de la même taille, sans « préféré » (6 septembre 2026).
  liste.forEach((p) => {
    const a = document.createElement("a");
    a.className = "plat-btn";
    a.href = p.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    const dot = document.createElement("span"); dot.className = "plat-dot"; dot.style.background = p.couleur || "#0d0d10";
    const nom = document.createElement("span"); nom.className = "plat-nom"; nom.textContent = p.nom;
    const fl = document.createElement("span"); fl.className = "plat-fleche"; fl.textContent = "↗";
    a.append(dot, nom, fl);
    a.addEventListener("click", () => {
      if (!gateEtat || gateEtat.phase !== "demande") return;
      lsSet(CLE_PLATEFORME, p.id || p.nom);
      lsSet(CLE_MORCEAU_OUVERT, "1");
      fanCache = true;
      setTimeout(gatePhaseAbsence, 0);
    });
    gatePlatforms.appendChild(a);
  });
  return true;
}

// Même tiroir, même wording pour les trois entrées (6 septembre 2026 :
// « ça doit être la même condition pour rejouer [...] tu vires le titre, tu
// mets "Ajoute l'album à ta bibliothèque pour continuer la partie" »).
function gateTextes(action, niveau) {
  const continuer = action === "continuer";
  const presave = niveau === "presave";
  return {
    eyebrow: "",
    titre: presave
      ? (continuer ? "Ajoute l'album à ta bibliothèque pour continuer la partie" : "Ajoute l'album à ta bibliothèque pour rejouer")
      : (continuer ? "Abonne-toi à PMC pour continuer la partie" : "Abonne-toi à PMC pour rejouer"),
    texte: "",
    ctaLabel: presave ? "Écouter l'album" : "S'abonner à PMC",
    goLabel: continuer ? "Continuer ma course" : "Rejouer",
  };
}

function ouvrirGate({ action, onUnlocked, onCancel, niveauForce, goLabelForce = null }) {
  const niveau = niveauForce || niveauConversion();
  const t = gateTextes(action, niveau);
  gateEtat = { action, onUnlocked, onCancel, niveau, phase: "demande" };
  gateEyebrow.textContent = t.eyebrow;
  gateEyebrow.classList.toggle("hidden", !t.eyebrow);
  gateTitle.textContent = t.titre;
  gateText.textContent = t.texte;
  gateText.classList.toggle("hidden", !t.texte);
  gateCtaLabel.textContent = t.ctaLabel;
  gateCta.href = niveau === "presave" ? ((plateformes()[0] || {}).url || "#") : (window.CONFIG.lienSuivre || "#");
  const panneau = niveau === "presave" && construirePlateformes();
  gatePlatforms.classList.toggle("hidden", !panneau);
  gateHint.classList.add("hidden");
  gateCta.classList.toggle("hidden", panneau);
  gateGo.textContent = goLabelForce || t.goLabel;
  gateGo.classList.add("hidden");
  gateGo.classList.add("locked");
  gateLater.textContent = "Fermer";
  gateSheet.classList.add("visible");
  gateSheet.setAttribute("aria-hidden", "false");
}
function gatePhaseAbsence() {
  if (!gateEtat) return;
  gateEtat.phase = "absence";
  gateTitle.textContent = gateEtat.niveau === "presave" ? "Tu l'as ajouté ? Merci !" : "Abonnement enregistré, merci !";
  gateText.textContent = gateEtat.action === "ecouter" ? "Reviens dans le jeu quand tu veux." : "Reviens dans le jeu quand tu veux, c'est débloqué.";
  gateText.classList.remove("hidden");
  gatePlatforms.classList.add("hidden");
  gateHint.classList.add("hidden");
  gateCta.classList.add("hidden");
  gateGo.classList.remove("hidden");
  gateGo.classList.add("locked");
  audio.setReviveIntensity(0);
  clearTimeout(gateRetourTimer);
  gateRetourTimer = setTimeout(() => { if (gateEtat && gateEtat.phase === "absence" && !document.hidden) gatePhasePret(); }, 1800);
}
function gatePhasePret() {
  if (!gateEtat) return;
  clearTimeout(gateRetourTimer);
  gateEtat.phase = "pret";
  audio.setReviveIntensity(1);
  gateTitle.textContent = gateEtat.action === "ecouter" ? "Merci !" : "C'est reparti !";
  gateText.textContent = gateEtat.action === "continuer" ? "Tes potes reviennent. Reprends quand tu es prêt." : gateEtat.action === "ecouter" ? "Bonne écoute." : "Nouvelle course, quand tu veux.";
  gateText.classList.remove("hidden");
  gateGo.classList.remove("hidden");
  gateGo.classList.remove("locked");
}
function fermerGate() {
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
export function ouvrirEcoute() {
  if (!plateformes().length) return;
  // Depuis l'écran de fin, le bouton armé au retour relance une course ;
  // depuis le menu, il ferme simplement (JOUER est juste là).
  const enFin = endScreenEl.classList.contains("active");
  ouvrirGate({
    action: "rejouer", niveauForce: "presave",
    onUnlocked: enFin ? () => { hideOverlay(); showPauseButton(); deps.restartGame(); } : null,
    onCancel: null,
    goLabelForce: enFin ? null : "Fermer",
  });
}
function exigerConversion({ action, onOk, onCancel }) {
  if (niveauConversion() === "libre") { onOk(); return; }
  ouvrirGate({ action, onUnlocked: onOk, onCancel });
}

// --- Ligue entre potes (7 septembre 2026) -------------------------------------
// Un code à 5 lettres, stocké en local. Les autres membres deviennent les
// potes du peloton ; chaque course envoie un score ; l'écran de fin montre le
// classement de la ligue. `?ligue=CODE` dans l'URL = invitation.
const ligueBloc = $("ligue-bloc"), ligueSans = $("ligue-sans"), ligueAvec = $("ligue-avec");
const ligueInput = $("ligue-input"), ligueRejoindre = $("ligue-rejoindre"), ligueCreer = $("ligue-creer");
const ligueCodeEl = $("ligue-code"), ligueMembresEl = $("ligue-membres"), liguePartager = $("ligue-partager"), ligueQuitter = $("ligue-quitter"), ligueMsg = $("ligue-msg");
const endLigue = $("end-ligue"), endLigueCode = $("end-ligue-code"), endLigueListe = $("end-ligue-liste"), endLiguePartager = $("end-ligue-partager");
let ligue = null;           // { code, membres: [] }
let ligueInvitation = null; // code reçu par l'URL, en attente d'un pseudo

export function getLigue() { return ligue; }

function ligueMessage(txt) { ligueMsg.textContent = txt || ""; ligueMsg.classList.toggle("hidden", !txt); }
function afficherLigue() {
  if (!net.estConfigure()) { ligueBloc.classList.add("hidden"); return; }
  ligueBloc.classList.remove("hidden");
  ligueSans.classList.toggle("hidden", !!ligue);
  ligueAvec.classList.toggle("hidden", !ligue);
  if (ligue) {
    ligueCodeEl.textContent = ligue.code;
    const autres = ligue.membres.filter((m) => m !== getPseudo());
    ligueMembresEl.textContent = autres.length ? `Tes potes : ${autres.map((m) => "@" + m).join(", ")}` : "Tu es seul pour l'instant : invite des potes.";
  }
}
function memoriserLigue() { if (ligue) lsSet(CLE_LIGUE, JSON.stringify(ligue)); else { try { localStorage.removeItem(CLE_LIGUE); } catch (e) { /* rien */ } } }
function appliquerNomsLigue() {
  const moi = getPseudo();
  friends.setNomsLigue(ligue ? ligue.membres.filter((m) => m !== moi) : null);
}
async function rejoindre(code, creer = false) {
  const pseudo = getPseudo();
  if (!pseudo) { ligueMessage("Écris ton pseudo d'abord."); pseudoInput.focus(); return false; }
  code = net.normaliserCode(code);
  if (code.length < 4) { ligueMessage("Code de ligue : 5 lettres."); return false; }
  ligueMessage("…");
  const membres = creer ? await net.creerLigue(code, pseudo) : await net.rejoindreLigue(code, pseudo);
  if (!membres) { ligueMessage(creer ? "Impossible de créer la ligue (réseau ?)." : "Cette ligue n'existe pas."); return false; }
  ligue = { code, membres };
  memoriserLigue(); appliquerNomsLigue(); afficherLigue(); ligueMessage("");
  return true;
}
function lienLigue(code) { return `${window.CONFIG.lienJeu || location.origin + location.pathname}?ligue=${code}`; }
async function partagerLigue(texte) {
  const code = ligue ? ligue.code : "";
  const data = { title: "J'ai un pote", text: texte, url: lienLigue(code) };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(`${texte} ${data.url}`);
    ligueMessage("Lien copié !");
  } catch (e) { /* partage annulé */ }
}
// Rafraîchit les membres au démarrage d'une course (les potes qui ont
// rejoint depuis apparaissent).
export async function preparerLigue() {
  if (ligueInvitation && !ligue) { await rejoindre(ligueInvitation); ligueInvitation = null; }
  if (!ligue) { friends.setNomsLigue(null); return; }
  const membres = await net.membres(ligue.code);
  if (membres) { ligue.membres = membres; memoriserLigue(); }
  appliquerNomsLigue(); afficherLigue();
}
// Fin de course : envoi du score, puis classement de la ligue sur la carte.
export async function finLigue(metres, potes) {
  endLigue.classList.add("hidden");
  if (!ligue) return;
  await net.envoyerScore(ligue.code, getPseudo(), metres, potes);
  const rows = await net.classement(ligue.code);
  if (!rows) return;
  endLigueCode.textContent = ligue.code;
  endLigueListe.textContent = "";
  const moi = getPseudo();
  rows.slice(0, 8).forEach((r, i) => {
    const li = document.createElement("li");
    if (r.pseudo === moi) li.className = "moi";
    const rang = document.createElement("span"); rang.className = "rang"; rang.textContent = `${i + 1}`;
    const nom = document.createElement("span"); nom.className = "nom"; nom.textContent = `@${r.pseudo}`;
    const m = document.createElement("span"); m.className = "m"; m.textContent = `${Number(r.metres).toLocaleString("fr-FR")} m`;
    li.append(rang, nom, m);
    endLigueListe.appendChild(li);
  });
  endLigue.classList.remove("hidden");
}
function initLigue() {
  try { const j = lsGet(CLE_LIGUE); if (j) ligue = JSON.parse(j); } catch (e) { ligue = null; }
  try {
    const code = new URLSearchParams(location.search).get("ligue");
    if (code) { ligueInvitation = net.normaliserCode(code); ligueInput.value = ligueInvitation; if (ligue && ligue.code !== ligueInvitation) ligue = null; }
  } catch (e) { /* rien */ }
  afficherLigue(); appliquerNomsLigue();
  if (ligueInvitation && !ligue) ligueMessage(`Invitation : ligue ${ligueInvitation}. Écris ton pseudo et appuie sur Rejoindre.`);
  ligueRejoindre.addEventListener("click", () => rejoindre(ligueInput.value));
  ligueCreer.addEventListener("click", () => rejoindre(net.genererCode(), true));
  ligueQuitter.addEventListener("click", () => { ligue = null; memoriserLigue(); appliquerNomsLigue(); afficherLigue(); });
  liguePartager.addEventListener("click", () => partagerLigue(`Rejoins ma ligue ${ligue ? ligue.code : ""} sur « J'ai un pote » et viens battre mon score :`));
  endLiguePartager.addEventListener("click", () => partagerLigue(`J'ai fait ${scoreVal.textContent} m dans la ligue ${ligue ? ligue.code : ""} sur « J'ai un pote ». Viens me battre :`));
  ["pointerdown", "touchstart", "touchmove", "mousedown"].forEach((t) => ligueInput.addEventListener(t, (e) => e.stopPropagation()));
  ligueInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); rejoindre(ligueInput.value); } });
}

// --- Chargement --------------------------------------------------------------
// Au moins `config.chargementMinS` secondes de 0 à 100 % (6 septembre 2026 :
// « une phase de chargement de 5-6 s, ça fait sérieux »), le temps de mettre
// en cache le morceau, les polices et de préchauffer le moteur (main.js,
// prechauffer()). La barre ne dépasse jamais ce qui est VRAIMENT chargé.
let loadingDone = false;
const loadingT0 = performance.now();
const ETAPES = ["Le morceau arrive", "Les potes s'échauffent", "La route se construit", "Les poules se placent", "C'est prêt"];
let prechauffe = 0; // 0..1, rempli par main.js
export function setPrechauffage(p) { prechauffe = Math.max(prechauffe, Math.min(1, p)); }
export function syncLoadingUi() {
  if (loadingDone) return;
  if (audio.getLoadError()) {
    loadingDone = true;
    loadingBlock.classList.add("failed");
    loadingLabel.textContent = "Son indisponible, le jeu reste jouable";
    playButton.disabled = false;
    return;
  }
  const minS = window.CONFIG.chargementMinS || 0;
  const tempsT = minS > 0 ? Math.min(1, (performance.now() - loadingT0) / 1000 / minS) : 1;
  const reel = (audio.isReadyToStart() ? 1 : audio.getProgress()) * 0.7 + prechauffe * 0.3;
  const p = Math.min(reel, tempsT);
  const pct = Math.round(p * 100);
  loadingFill.style.width = `${pct}%`;
  loadingLabel.textContent = `${ETAPES[Math.min(ETAPES.length - 1, Math.floor(p * ETAPES.length))]} · ${pct} %`;
  if (p >= 1) { loadingDone = true; loadingBlock.classList.add("done"); playButton.disabled = getPseudo().length === 0; }
}

// --- Fin de partie -----------------------------------------------------------
export function showEndScreen({ metres, potesMax, record, fin }) {
  scoreVal.textContent = Math.floor(metres).toLocaleString("fr-FR");
  endSub.textContent = potesMax === 0
    ? "Tu n'as pas eu de potes sur cette partie ? Tu prends des pièces pour les appeler."
    : `Record : ${potesMax} pote${potesMax > 1 ? "s" : ""} avec toi`;
  endBest.classList.toggle("hidden", !record);
  $("end-eyebrow").textContent = fin ? "Course terminée" : "Ta course";
  setTimeout(() => { setView("end"); showOverlay(); }, fin ? 1500 : 600);
}

// --- Pause / son -------------------------------------------------------------
export function showPauseButton() { pauseButton.hidden = false; muteButton.hidden = true; }
export function hidePauseButton() { pauseButton.hidden = true; muteButton.hidden = false; if (deps.isManuallyPaused()) closePauseMenu(); }
function openPauseMenu() {
  if (deps.isManuallyPaused() || pauseButton.hidden) return;
  deps.openPause();
  pauseVolumeSlider.value = String(Math.round(audio.getVolume() * 100));
  pauseScreen.classList.add("visible");
}
function closePauseMenu() {
  if (!deps.isManuallyPaused()) return;
  deps.closePause();
  pauseScreen.classList.remove("visible");
}
function syncMuteIcon() {
  const coupe = audio.getVolume() <= 0;
  muteButton.classList.toggle("muted", coupe);
  muteButton.textContent = coupe ? "✕" : "♪";
}

// --- Démarrage ---------------------------------------------------------------
function startGame() {
  if (deps.isGameStartRequested()) return;
  audio.unlock();
  audio.play();
  lsSet(CLE_PSEUDO, getPseudo());
  preparerLigue();
  deps.requestGameStart();
  hideOverlay();
  showPauseButton();
}

export function init(d) {
  deps = d;
  [ctaLink, endCta].forEach((lien) => {
    lien.removeAttribute("href"); lien.removeAttribute("target"); lien.setAttribute("role", "button");
    lien.addEventListener("click", (e) => { e.preventDefault(); ouvrirEcoute(); });
  });
  instaLink.href = window.CONFIG.lienInsta;
  const credit = $("credit-insta"); if (credit) credit.href = window.CONFIG.lienInsta;
  pseudoInput.value = lsGet(CLE_PSEUDO) || "";
  const syncPlay = () => { if (loadingDone) playButton.disabled = getPseudo().length === 0; };
  pseudoInput.addEventListener("input", syncPlay);
  ["pointerdown", "touchstart", "touchmove", "mousedown"].forEach((t) => pseudoInput.addEventListener(t, (e) => e.stopPropagation()));
  playButton.addEventListener("click", () => { if (getPseudo().length === 0) { pseudoInput.focus(); return; } startGame(); });
  // (Pas de MutationObserver sur `disabled` : il se redéclenchait lui-même en
  // boucle et gelait la page — syncLoadingUi relit le champ à la fin du
  // chargement, l'input le relit à chaque frappe.)

  replayButton.addEventListener("click", () => {
    exigerConversion({ action: "rejouer", onOk: () => { hideOverlay(); showPauseButton(); deps.restartGame(); }, onCancel: () => {} });
  });

  function porteDepuisCarteDeMort(action, issue) {
    if (!reviveCallbacks) return;
    const restant = decompteRevive.restant;
    decompteRevive.arreter();
    exigerConversion({ action, onOk: () => reviveResoudre(issue), onCancel: () => reprendreDecompteRevive(restant) });
  }
  reviveCta.addEventListener("click", () => porteDepuisCarteDeMort("continuer", "onAccept"));
  reviveReplay.addEventListener("click", () => porteDepuisCarteDeMort("rejouer", "onReplay"));
  reviveDecline.addEventListener("click", () => reviveResoudre("onDecline"));

  gateCta.addEventListener("click", () => {
    if (!gateEtat || gateEtat.phase !== "demande") return;
    if (gateEtat.niveau === "presave") { lsSet(CLE_MORCEAU_OUVERT, "1"); fanCache = true; }
    else lsSet(CLE_PMC_SUIVI, "1");
    setTimeout(gatePhaseAbsence, 0);
  });
  gateGo.addEventListener("click", () => { if (!gateEtat || gateEtat.phase !== "pret") return; gateResoudre("onUnlocked"); });
  gateLater.addEventListener("click", () => gateResoudre("onCancel"));
  document.addEventListener("visibilitychange", () => {
    if (!gateEtat) return;
    if (document.hidden) { audio.setReviveIntensity(0); return; }
    if (gateEtat.phase === "absence") gatePhasePret();
  });

  syncMuteIcon();
  muteButton.addEventListener("click", (e) => { e.stopPropagation(); audio.setVolume(audio.getVolume() > 0 ? 0 : 1); syncMuteIcon(); });
  pauseButton.addEventListener("click", (e) => { e.stopPropagation(); openPauseMenu(); });
  resumeButton.addEventListener("click", (e) => { e.stopPropagation(); closePauseMenu(); });
  pauseReplayButton.addEventListener("click", (e) => { e.stopPropagation(); closePauseMenu(); deps.restartGame(); });
  pauseVolumeSlider.addEventListener("input", () => { audio.setVolume(Number(pauseVolumeSlider.value) / 100); syncMuteIcon(); });
  ["pointerdown", "pointerup", "touchstart", "touchmove", "touchend", "mousedown"].forEach((t) => {
    pauseScreen.addEventListener(t, (e) => e.stopPropagation());
    [muteButton, pauseButton].forEach((b) => b.addEventListener(t, (e) => e.stopPropagation()));
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") { if (deps.isManuallyPaused()) closePauseMenu(); else openPauseMenu(); }
    if ((e.code === "Enter") && overlay.classList.contains("visible") && e.target !== ligueInput) {
      if (endScreenEl.classList.contains("active")) replayButton.click();
      else if (!playButton.disabled) startGame();
    }
  });
  initLigue();
  setView("onboarding");
}
