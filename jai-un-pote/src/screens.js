// screens.js — Écrans hors-jeu de « J'ai un pote » : menu (un seul champ),
// écran de fin, carte de mort, tiroir album (même échelle de conversion que
// le premier jeu, mêmes clés localStorage — un joueur qui a déjà ouvert
// l'album sur l'autre jeu est « libre » ici aussi), pause, son.
// Câblage DOM et présentation uniquement ; main.js garde l'état de partie et
// reçoit les actions en callbacks via init().

import * as audio from "./audio.js";

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
  const prefId = lsGet(CLE_PLATEFORME);
  const pref = liste.find((p) => p.id === prefId);
  const ordre = pref ? [pref, ...liste.filter((p) => p !== pref)] : liste.slice();
  ordre.forEach((p, i) => {
    if (pref && i === 1) {
      const sep = document.createElement("p"); sep.className = "plat-sep"; sep.textContent = "ou sur une autre plateforme";
      gatePlatforms.appendChild(sep);
    }
    const a = document.createElement("a");
    a.className = pref && i === 0 ? "plat-btn prefere" : "plat-btn";
    a.href = p.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    const dot = document.createElement("span"); dot.className = "plat-dot"; dot.style.background = p.couleur || "#0d0d10";
    const nom = document.createElement("span"); nom.className = "plat-nom"; nom.textContent = pref && i === 0 ? `Ouvrir dans ${p.nom}` : p.nom;
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
  gateHint.textContent = texteGeste(liste);
  return true;
}

function gateTextes(action, niveau) {
  if (action === "ecouter") {
    return { eyebrow: "L'ALBUM EST SORTI", titre: "Ouvre l'album de PMC", texte: "Choisis ta plateforme. Ajoute l'album à ta bibliothèque, c'est ce qui compte pour lui.", ctaLabel: "", goLabel: "Fermer" };
  }
  const continuer = action === "continuer";
  const presave = niveau === "presave";
  return {
    eyebrow: continuer ? "POUR CONTINUER TA COURSE" : "POUR REJOUER",
    titre: presave ? "Ouvre l'album de PMC" : "Abonne-toi à PMC",
    texte: presave
      ? "Choisis ta plateforme, ajoute l'album à ta bibliothèque. Tes potes reviennent."
      : "Dernière étape : abonne-toi à PMC sur Spotify, et rejoue autant que tu veux.",
    ctaLabel: presave ? "Écouter l'album" : "S'abonner à PMC",
    goLabel: continuer ? "Continuer ma course" : "Rejouer",
  };
}

function ouvrirGate({ action, onUnlocked, onCancel, niveauForce }) {
  const niveau = niveauForce || niveauConversion();
  const t = gateTextes(action, niveau);
  gateEtat = { action, onUnlocked, onCancel, niveau, phase: "demande" };
  gateEyebrow.textContent = t.eyebrow;
  gateTitle.textContent = t.titre;
  gateText.textContent = t.texte;
  gateCtaLabel.textContent = t.ctaLabel;
  gateCta.href = niveau === "presave" ? ((plateformes()[0] || {}).url || "#") : (window.CONFIG.lienSuivre || "#");
  const panneau = niveau === "presave" && construirePlateformes();
  gatePlatforms.classList.toggle("hidden", !panneau);
  gateHint.classList.toggle("hidden", !panneau);
  gateCta.classList.toggle("hidden", panneau);
  gateGo.textContent = t.goLabel;
  gateGo.classList.add("hidden");
  gateGo.classList.add("locked");
  gateLater.textContent = action === "ecouter" ? "Fermer" : "Plus tard";
  gateSheet.classList.add("visible");
  gateSheet.setAttribute("aria-hidden", "false");
}
function gatePhaseAbsence() {
  if (!gateEtat) return;
  gateEtat.phase = "absence";
  gateTitle.textContent = gateEtat.niveau === "presave" ? "Tu l'as ajouté ? Merci !" : "Abonnement enregistré, merci !";
  gateText.textContent = gateEtat.action === "ecouter" ? "Reviens dans le jeu quand tu veux." : "Reviens dans le jeu quand tu veux, c'est débloqué.";
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
  gateText.textContent = gateEtat.action === "continuer" ? "Tes potes retombent du ciel. Reprends quand tu es prêt." : gateEtat.action === "ecouter" ? "Bonne écoute." : "Nouvelle course, quand tu veux.";
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
  ouvrirGate({ action: "ecouter", niveauForce: "presave", onUnlocked: null, onCancel: null });
}
function exigerConversion({ action, onOk, onCancel }) {
  if (niveauConversion() === "libre") { onOk(); return; }
  ouvrirGate({ action, onUnlocked: onOk, onCancel });
}

// --- Chargement --------------------------------------------------------------
let loadingDone = false;
export function syncLoadingUi() {
  if (loadingDone) return;
  if (audio.getLoadError()) {
    loadingDone = true;
    loadingBlock.classList.add("failed");
    loadingLabel.textContent = "Son indisponible, le jeu reste jouable";
    playButton.disabled = false;
    return;
  }
  const p = audio.isReadyToStart() ? 1 : audio.getProgress();
  loadingFill.style.width = `${Math.round(p * 100)}%`;
  loadingLabel.textContent = `${Math.round(p * 100)} %`;
  if (p >= 1) { loadingDone = true; loadingBlock.classList.add("done"); playButton.disabled = getPseudo().length === 0; }
}

// --- Fin de partie -----------------------------------------------------------
export function showEndScreen({ metres, potesMax, record }) {
  scoreVal.textContent = Math.floor(metres).toLocaleString("fr-FR");
  endSub.textContent = potesMax === 0
    ? "Tout seul du début à la fin. Les étoiles font venir les potes."
    : `Jusqu'à ${potesMax} pote${potesMax > 1 ? "s" : ""} dans le peloton.`;
  endBest.classList.toggle("hidden", !record);
  setTimeout(() => { setView("end"); showOverlay(); }, 600);
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
    if ((e.code === "Enter") && overlay.classList.contains("visible")) {
      if (endScreenEl.classList.contains("active")) replayButton.click();
      else if (!playButton.disabled) startGame();
    }
  });
  setView("onboarding");
}
