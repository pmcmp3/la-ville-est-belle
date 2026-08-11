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

// Filtre passe-bas inséré en bout de chaîne, transparent en temps normal
// (fréquence de coupure au-dessus de l'audible) et refermé sur ~800 Hz quand
// le menu pause s'ouvre : on n'entend plus que les basses, comme un morceau
// qu'on écouterait depuis la pièce d'à côté. Voir setPlaybackMode() plus bas.
let lowpass = null;
const FILTRE_OUVERT_HZ = 20000;

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

// `offset` = seconde du morceau où démarrer la lecture. 0 au premier
// lancement et au rejeu ; non nul uniquement à la sortie du menu pause, où le
// morceau a continué d'avancer pendant que la course, elle, était gelée : on
// le remet alors exactement là où le joueur s'était arrêté (voir
// setPlaybackMode). Sans ça, audio et grille rythmique repartiraient décalés
// de toute la durée de la pause — or c'est justement leur calage qui fait
// tout l'intérêt du jeu.
function playNow(offset = 0) {
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
  focusGain.gain.value = mode === "silent" ? 0 : 1; // repart coupé si on est déjà en pause silencieuse
  lowpass = audioCtx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = mode === "muffled" ? window.CONFIG.pauseFiltreHz : FILTRE_OUVERT_HZ;

  sourceNode.connect(envelopeGain);
  envelopeGain.connect(volumeGain);
  volumeGain.connect(lowpass);
  lowpass.connect(focusGain);
  focusGain.connect(audioCtx.destination);

  const { fonduEntree, fonduSortie } = window.CONFIG;
  const now = audioCtx.currentTime;
  const end = now + Math.max(0, buffer.duration - offset);

  // Le fondu d'entrée n'a de sens qu'au vrai début du morceau : reprendre en
  // plein milieu avec une montée de 1,2 s s'entendrait comme un gonflement.
  if (offset > 0) {
    envelopeGain.gain.setValueAtTime(1, now);
  } else {
    envelopeGain.gain.setValueAtTime(0, now);
    envelopeGain.gain.linearRampToValueAtTime(1, now + fonduEntree);
  }
  envelopeGain.gain.setValueAtTime(1, Math.max(now + (offset > 0 ? 0 : fonduEntree), end - fonduSortie));
  envelopeGain.gain.linearRampToValueAtTime(0, end);

  sourceNode.start(0, offset);
  startCtxTime = now - offset; // now() doit renvoyer `offset` à cet instant précis
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
  // Une relance efface toute pause en cours : sans ça, un « Recommencer la
  // course » lancé depuis le menu pause repartirait avec l'horloge gelée et
  // le filtre encore fermé.
  mode = "running";
  muffleAnchor = null;
  if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
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
  if (!started) return "running, en attente";
  return mode === "muffled" ? "lecture (pause, filtre 800 Hz)" : "lecture";
}

// Secondes écoulées depuis le premier échantillon du morceau — c'est cette
// fonction que main.js branche sur clock.setTimeSource() une fois démarré.
export function now() {
  // Gelée pendant le menu pause : le contexte tourne toujours (le morceau
  // continue, étouffé par le passe-bas) mais la course doit rester exactement
  // là où le joueur l'a laissée. Voir setPlaybackMode().
  if (muffleAnchor !== null) return muffleAnchor;
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

// --- Modes de lecture (course / menu pause / onglet quitté) ------------------
// Trois états, et un seul point d'entrée pour en changer : main.js calcule le
// mode voulu à partir de ses deux drapeaux (menu pause ouvert, onglet caché)
// et appelle setPlaybackMode(). Aucun appelant n'a à savoir ce que ça
// implique côté Web Audio.
//
//   "running"  — la course : filtre ouvert, son plein.
//   "muffled"  — menu pause : le morceau CONTINUE mais passe dans le filtre
//                passe-bas (~800 Hz, réglable dans config.js), donc on
//                n'entend plus que les basses. Demandé explicitement.
//   "silent"   — onglet/app quitté : fondu à 0 puis audioCtx.suspend(). Là,
//                jouer même étouffé n'aurait aucun sens, personne n'écoute.
//
// ⚠️ Le point délicat est l'horloge. now() est la source de temps maîtresse
// du jeu (voir en-tête) : en mode "silent" elle se fige d'elle-même avec le
// suspend, mais en "muffled" le contexte tourne toujours — il faut donc la
// geler à la main (muffleAnchor), sinon la course continuerait d'avancer
// derrière le panneau de pause. Conséquence : à la reprise, le morceau a pris
// de l'avance sur la course, et on le remet à sa place en relançant la
// lecture à l'instant gelé (playNow(muffleAnchor)). Le petit retour en
// arrière du morceau est couvert par la réouverture du filtre, et c'est le
// prix à payer pour que bonus et obstacles retombent sur les temps.
const PAUSE_FADE = 0.5;
let mode = "running";
let muffleAnchor = null; // temps de jeu gelé pendant la pause manuelle (null = horloge libre)
let suspendTimer = null;

function rampFilter(target) {
  if (!lowpass) return;
  const t = audioCtx.currentTime;
  lowpass.frequency.cancelScheduledValues(t);
  lowpass.frequency.setValueAtTime(lowpass.frequency.value, t);
  // Rampe exponentielle : une fréquence se perçoit en octaves, pas en hertz —
  // une rampe linéaire de 20 kHz à 800 Hz semblerait ne rien faire pendant
  // presque tout le fondu, puis tout faire à la fin.
  lowpass.frequency.exponentialRampToValueAtTime(Math.max(20, target), t + window.CONFIG.pauseFondu);
}

function rampFocus(target) {
  if (!focusGain) return;
  const t = audioCtx.currentTime;
  focusGain.gain.cancelScheduledValues(t);
  focusGain.gain.setValueAtTime(focusGain.gain.value, t);
  focusGain.gain.linearRampToValueAtTime(target, t + PAUSE_FADE);
}

export function setPlaybackMode(next) {
  if (next === mode) return;
  mode = next;

  // Le gel de l'horloge se pose/se lève indépendamment du contexte audio :
  // il doit tenir même si la lecture n'a pas encore démarré.
  if (next === "muffled" && muffleAnchor === null) muffleAnchor = now();

  if (suspendTimer) { clearTimeout(suspendTimer); suspendTimer = null; }
  if (!audioCtx || !started) {
    if (next === "running") muffleAnchor = null;
    return;
  }

  if (next === "silent") {
    rampFocus(0);
    // On laisse le fondu finir avant de suspendre pour de vrai — un suspend()
    // immédiat couperait la rampe en plein milieu, ce qui s'entend comme un clic.
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      if (mode === "silent" && audioCtx.state === "running") audioCtx.suspend().catch(() => {});
    }, PAUSE_FADE * 1000);
    return;
  }

  audioCtx.resume().catch(() => {});

  if (next === "muffled") {
    rampFocus(1);
    rampFilter(window.CONFIG.pauseFiltreHz);
    return;
  }

  // next === "running"
  if (muffleAnchor !== null) {
    // On sort d'une pause manuelle : le morceau a continué pendant que la
    // course était gelée, on le ramène à l'instant exact de la reprise.
    const reprise = muffleAnchor;
    muffleAnchor = null;
    playNow(reprise);
    // playNow() a recréé tout le graphe (donc un filtre neuf, ouvert par
    // défaut puisque mode vaut déjà "running") : on le repose fermé avant de
    // lancer la rampe, sinon la réouverture serait instantanée.
    if (lowpass) lowpass.frequency.value = window.CONFIG.pauseFiltreHz;
    rampFilter(FILTRE_OUVERT_HZ);
    rampFocus(1);
  } else {
    // On sort d'une pause silencieuse : le contexte était suspendu, donc le
    // morceau et l'horloge ont gelé ensemble — rien à resynchroniser.
    rampFocus(1);
    rampFilter(FILTRE_OUVERT_HZ);
  }
}
