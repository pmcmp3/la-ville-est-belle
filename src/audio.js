// audio.js — Chargement, unlock iOS et lecture du morceau via Web Audio API.
//
// Ordre imposé par iOS (Safari ET Chrome/Firefox iOS : même moteur WebKit) :
//
//   1. Télécharger + décoder ne demande aucun geste utilisateur, mais décoder
//      exige *un* contexte : on prend un OfflineAudioContext, qui ne produit
//      aucune sortie audio et n'est donc soumis à aucune restriction iOS.
//      L'AudioBuffer obtenu est lisible par n'importe quel AudioContext
//      ensuite (AudioBufferSourceNode rééchantillonne si le taux diffère).
//   2. L'AudioContext de SORTIE est créé dans le handler du geste, jamais au
//      chargement de la page : un contexte né hors geste reste "suspended" sur
//      iOS et son currentTime ne repart pas de façon fiable, même après un
//      resume() ultérieur.
//   3. Un buffer muet démarré immédiatement dans le geste finit de débloquer
//      la sortie (resume() seul ne suffit pas toujours sur iOS).
//   4. On ne démarre la vraie lecture qu'une fois state === "running" :
//      startCtxTime doit être lu sur une horloge qui avance réellement.
//
// ⚠️ Point critique : now() est la source de temps maîtresse du jeu (clock.js
// → entities.js). Tant que le contexte n'avance pas, elle renvoie 0 en boucle
// et fige toute la grille rythmique — bonus et obstacles restent plantés sur
// place pendant que le décor, lui, défile (il avance sur dt, pas sur
// l'horloge). C'était exactement le bug remonté au playtest iPhone. main.js
// surveille isRunning() pour basculer sur une horloge de secours plutôt que
// de laisser la partie figée.

let audioCtx = null;
let buffer = null;
let rawCopy = null;   // copie de l'ArrayBuffer, gardée tant que le décodage n'a pas abouti
let armed = false;
let started = false;
let startCtxTime = 0;
let loadError = null;

// Trois gains en série, chacun avec sa propre raison d'exister, pour qu'ils
// ne se marchent jamais dessus : envelopeGain fait le fade in/out du morceau
// tout seul (jamais touché par l'utilisateur), volumeGain reflète le slider
// (jamais touché par un fondu), focusGain coupe/rétablit le son quand
// l'onglet perd/reprend le focus (jamais touché par les deux autres). Le
// volume final = les trois multipliés.
let envelopeGain = null;
let volumeGain = null;
let focusGain = null;
let pendingVolume = 1; // valeur demandée avant que le graphe audio existe
let currentSource = null; // nœud en cours de lecture, pour pouvoir l'arrêter au rejeu

// Safari a longtemps n'accepté que la forme à callbacks de decodeAudioData ;
// les navigateurs récents renvoient une Promise. On accepte les deux.
function decodeWith(ctx, data) {
  return new Promise((resolve, reject) => {
    const ret = ctx.decodeAudioData(data, resolve, reject);
    if (ret && typeof ret.then === "function") ret.then(resolve, reject);
  });
}

function onDecoded(decoded) {
  buffer = decoded;
  rawCopy = null; // plus besoin de la copie de secours
  progress = 1;

  const ecart = Math.abs(decoded.duration - window.CONFIG.dureeMorceau);
  if (ecart > 0.3) {
    console.warn(
      `[audio] durée décodée ${decoded.duration.toFixed(2)}s ≠ CONFIG.dureeMorceau ` +
      `${window.CONFIG.dureeMorceau}s (écart ${ecart.toFixed(2)}s) — vérifier l'export mp3.`
    );
  }
}

// Progression 0..1 du chargement, pour l'afficher en pourcentage à l'écran :
// le morceau pèse ~10 Mo, sur data mobile l'attente est longue et un simple
// « Chargement… » ne dit pas si ça avance. On réserve les 10 derniers pour
// cent au décodage, qui n'expose aucune progression.
const PART_TELECHARGEMENT = 0.9;
let progress = 0;

export function getProgress() {
  return progress;
}

// Lit la réponse en flux plutôt que d'attendre l'ArrayBuffer complet, seule
// façon de connaître l'avancement. Repli sur arrayBuffer() si le corps n'est
// pas lisible en flux ou si la taille est inconnue (pas de Content-Length).
function fetchAvecProgression(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);

    const total = Number(res.headers.get("Content-Length")) || 0;
    if (!res.body || !res.body.getReader || !total) {
      return res.arrayBuffer().then((buf) => {
        progress = PART_TELECHARGEMENT;
        return buf;
      });
    }

    const reader = res.body.getReader();
    const morceaux = [];
    let recu = 0;

    const lire = () =>
      reader.read().then(({ done, value }) => {
        if (done) {
          const tout = new Uint8Array(recu);
          let offset = 0;
          for (const m of morceaux) { tout.set(m, offset); offset += m.length; }
          progress = PART_TELECHARGEMENT;
          return tout.buffer;
        }
        morceaux.push(value);
        recu += value.length;
        progress = Math.min(PART_TELECHARGEMENT, (recu / total) * PART_TELECHARGEMENT);
        return lire();
      });

    return lire();
  });
}

fetchAvecProgression(window.CONFIG.fichierAudio)
  .then((data) => {
    // decodeAudioData "détache" l'ArrayBuffer qu'on lui passe : on garde une
    // copie pour pouvoir retenter avec le contexte de sortie si le décodage
    // hors-ligne échoue (implémentations WebKit anciennes).
    rawCopy = data.slice(0);
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    return decodeWith(new Offline(1, 1, 44100), data);
  })
  .then(onDecoded)
  .catch((err) => {
    // Pas encore fatal : une 2e tentative aura lieu avec le contexte de sortie
    // au moment du geste (voir waitForRunningThenPlay).
    console.warn("[audio] décodage hors-ligne impossible, retentera au démarrage :", err);
    if (!rawCopy) loadError = err;
  });

function playNow() {
  if (!audioCtx || !buffer) return;

  if (currentSource) {
    try { currentSource.stop(); } catch (e) { /* déjà terminé */ }
  }

  const sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = buffer;
  currentSource = sourceNode;

  envelopeGain = audioCtx.createGain();
  volumeGain = audioCtx.createGain();
  volumeGain.gain.value = pendingVolume;
  focusGain = audioCtx.createGain();
  focusGain.gain.value = paused ? 0 : 1; // repart coupé si on est déjà en pause (rejeu depuis le menu pause)

  sourceNode.connect(envelopeGain);
  envelopeGain.connect(volumeGain);
  volumeGain.connect(focusGain);
  focusGain.connect(audioCtx.destination);

  const { fonduEntree, fonduSortie } = window.CONFIG;
  const now = audioCtx.currentTime;
  const end = now + buffer.duration;

  envelopeGain.gain.setValueAtTime(0, now);
  envelopeGain.gain.linearRampToValueAtTime(1, now + fonduEntree);
  envelopeGain.gain.setValueAtTime(1, Math.max(now + fonduEntree, end - fonduSortie));
  envelopeGain.gain.linearRampToValueAtTime(0, end);

  sourceNode.start(0);
  startCtxTime = now;
  started = true;
}

// Attend que le contexte tourne VRAIMENT (et que le buffer soit prêt) avant
// de lancer la lecture. Sans cette attente, on capturait startCtxTime sur une
// horloge gelée et le jeu entier se retrouvait bloqué à t=0 (voir en-tête).
const RESUME_POLL_MS = 100;
const RESUME_TIMEOUT_MS = 8000;

function waitForRunningThenPlay(deadline = performance.now() + RESUME_TIMEOUT_MS) {
  if (started || !audioCtx) return;

  if (audioCtx.state !== "running") {
    // iOS repasse en "suspended"/"interrupted" tout seul (appel entrant,
    // mise en arrière-plan…) : on relance tant qu'on est dans les temps.
    audioCtx.resume().catch(() => {});
    if (performance.now() < deadline) setTimeout(() => waitForRunningThenPlay(deadline), RESUME_POLL_MS);
    return;
  }

  if (!buffer) {
    if (loadError) return;
    // Le décodage hors-ligne a pu échouer : on retente avec le contexte de
    // sortie, maintenant qu'il existe.
    if (rawCopy) {
      const data = rawCopy;
      rawCopy = null;
      decodeWith(audioCtx, data)
        .then((decoded) => { onDecoded(decoded); waitForRunningThenPlay(); })
        .catch((err) => {
          loadError = err;
          console.error("[audio] décodage impossible :", err);
        });
      return;
    }
    // Décodage encore en cours : on repasse dans un instant.
    setTimeout(() => waitForRunningThenPlay(performance.now() + RESUME_TIMEOUT_MS), RESUME_POLL_MS);
    return;
  }

  playNow();
}

// À appeler directement depuis un handler de geste utilisateur
// (pointerdown/click/keydown) — jamais depuis un callback async. Ne fait QUE
// débloquer la sortie audio (contexte + buffer muet) : ne lance pas encore la
// vraie lecture. Séparé de play() pour permettre un décompte visuel entre le
// tap sur JOUER et le vrai début de la course, sans perdre le déblocage iOS
// (qui doit impérativement arriver dans la pile d'appel du geste — un
// setTimeout ultérieur ne compte plus comme un geste aux yeux d'iOS).
export function unlock() {
  if (started || armed) return;
  armed = true;

  // « J'avais pas de son sur mon tél » — remonté à chaque playtest iPhone, et
  // à chaque fois la cause était l'interrupteur SILENCIEUX physique : par
  // défaut, iOS classe le Web Audio en catégorie "ambient", donc coupé par le
  // petit switch latéral, exactement comme un son d'interface. Aucun réglage
  // dans la page ne pouvait le contourner… jusqu'à l'API AudioSession
  // (Safari 16.4+) : en déclarant le type "playback", on dit à iOS que c'est
  // du contenu média (comme un lecteur de musique), et le son sort MÊME en
  // mode silencieux. À poser avant la création du contexte, et sans risque
  // ailleurs (l'API n'existe simplement pas sur les autres navigateurs).
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch (e) { /* non bloquant : on retombe sur le comportement par défaut */ }

  const Ctx = window.AudioContext || window.webkitAudioContext;
  audioCtx = new Ctx();

  // Buffer muet démarré DANS le geste : c'est lui qui débloque réellement la
  // sortie audio sur iOS. Doit être synchrone, avant tout await/then.
  try {
    const silent = audioCtx.createBufferSource();
    silent.buffer = audioCtx.createBuffer(1, 1, 22050);
    silent.connect(audioCtx.destination);
    silent.start(0);
  } catch (e) { /* non bloquant : le resume() ci-dessous peut suffire */ }

  audioCtx.resume().catch(() => {});
}

// Lance la vraie lecture. Peut être appelé plus tard que unlock() (ex. après
// un décompte) : le contexte est déjà créé/débloqué à ce stade, donc plus
// besoin d'un geste utilisateur pour démarrer une source sur ce contexte.
export function play() {
  waitForRunningThenPlay();
}

// Relance le morceau depuis le début (bouton "Rejouer" après game over/fin
// de course) — le contexte est déjà débloqué depuis la première partie.
export function restart() {
  if (!audioCtx) return;
  if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});
  if (!buffer) return;
  playNow();
}

export function hasStarted() {
  return started;
}

// Vrai uniquement si le son sort ET si l'horloge audio avance : c'est la
// condition pour que now() soit une source de temps de jeu valable.
export function isRunning() {
  return started && audioCtx !== null && audioCtx.state === "running";
}

export function isLoading() {
  return !buffer && !loadError;
}

// État lisible pour l'overlay de debug (indispensable pour diagnostiquer à
// distance sur un téléphone, où il n'y a ni console ni clavier).
export function getStatus() {
  if (loadError) return "échec chargement";
  if (!audioCtx) return buffer ? "prêt (en attente du tap)" : "décodage…";
  if (audioCtx.state !== "running") return `contexte ${audioCtx.state}`;
  if (!buffer) return "running, décodage…";
  return started ? "lecture" : "running, en attente";
}

// Secondes écoulées depuis le premier échantillon du morceau — c'est cette
// fonction que main.js branche sur clock.setTimeSource() une fois démarré.
export function now() {
  return started ? audioCtx.currentTime - startCtxTime : 0;
}

export function getDuration() {
  return buffer ? buffer.duration : window.CONFIG.dureeMorceau;
}

// Volume utilisateur (0..1), indépendant du fondu automatique. Peut être
// appelé avant même que la lecture ait démarré (la valeur est retenue).
export function setVolume(v) {
  pendingVolume = Math.max(0, Math.min(1, v));
  if (volumeGain) {
    volumeGain.gain.value = pendingVolume;
  }
}

export function getVolume() {
  return pendingVolume;
}

// --- Pause (perte de focus OU menu pause manuel) -----------------------------
// Deux appelants, même mécanique : le morceau continuait de jouer quand on
// quittait l'onglet (pas de fade, pas de pause, juste du son qui sort d'un
// écran qu'on ne regarde plus) — et le menu pause (bouton dédié, voir
// main.js) a exactement le même besoin : couper le son en douceur ET figer
// l'horloge de jeu pendant que le panneau est ouvert.
// focusGain (voir plus haut) porte tout ça, indépendamment du volume choisi
// par le joueur et du fondu d'entrée/sortie du morceau. On coupe le SON tout
// de suite (fondu 0,5 s) mais on ne fige l'horloge (audioCtx.suspend())
// qu'une fois le fondu terminé — sinon la coupure s'entendrait comme un clic
// sec plutôt qu'un fondu.
const PAUSE_FADE = 0.5;
let paused = false;   // vrai dès la mise en pause, avant même la fin du fondu
let suspendTimer = null;

export function pause() {
  paused = true;
  if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
  if (!audioCtx || !started) return;

  const now = audioCtx.currentTime;
  if (focusGain) {
    focusGain.gain.cancelScheduledValues(now);
    focusGain.gain.setValueAtTime(focusGain.gain.value, now);
    focusGain.gain.linearRampToValueAtTime(0, now + PAUSE_FADE);
  }
  // audioCtx.currentTime (donc now() côté clock.js) se fige avec le suspend :
  // c'est voulu, la partie doit geler pendant la pause, pas continuer sans le
  // joueur. On laisse le temps au fondu de finir avant de couper pour de
  // vrai (un suspend() immédiat couperait la rampe en plein milieu).
  suspendTimer = setTimeout(() => {
    suspendTimer = null;
    if (audioCtx && audioCtx.state === "running") audioCtx.suspend().catch(() => {});
  }, PAUSE_FADE * 1000);
}

export function resume() {
  paused = false;
  if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
  if (!audioCtx || !started) return;

  audioCtx.resume().catch(() => {});
  const now = audioCtx.currentTime;
  if (focusGain) {
    focusGain.gain.cancelScheduledValues(now);
    focusGain.gain.setValueAtTime(focusGain.gain.value, now);
    focusGain.gain.linearRampToValueAtTime(1, now + PAUSE_FADE);
  }
}
