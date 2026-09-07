// clip.js — Clip vidéo des dernières secondes de course, à partager (TikTok).
//
// Demandé le 20 août 2026 (« le clip vidéo des cinq dernières secondes en gif,
// très très bonne idée pour TikTok ») — en VIDÉO plutôt qu'en GIF : le GIF
// aurait les trois défauts déjà documentés pour le tutoriel (poids, 256
// couleurs qui détruisent le couchant, encodage impossible en temps réel côté
// client), là où MediaRecorder encode en matériel, gratuitement.
//
// ⚠️ Le problème central : on veut les DERNIÈRES secondes, or un flux
// MediaRecorder ne se découpe pas après coup (les chunks ne sont décodables
// que depuis le début du conteneur). Solution classique du « replay buffer » :
// DEUX enregistreurs en alternance, redémarrés à tour de rôle toutes les
// SEGMENT_S secondes. À l'instant de la mort, l'enregistreur le plus ancien
// couvre entre SEGMENT_S et 2×SEGMENT_S secondes — on garde celui-là. Le clip
// fait donc 5 à 10 s, toujours terminé pile sur la fin de course.
//
// Périmètre volontairement défensif :
//   - feature-detect complet (captureStream + MediaRecorder + un mimeType
//     accepté) : sans support, le module ne fait RIEN et le bouton n'apparaît
//     jamais (Safari iOS ≥ 14.5 sait faire, en MP4) ;
//   - jamais d'exception qui remonte à la boucle de jeu : tout est try/catch,
//     un clip perdu n'est qu'un bouton absent ;
//   - l'enregistrement ne tourne QUE pendant la course (start/stop appelés par
//     main.js), jamais sur les menus.
//
// ⚠️ Coût : captureStream + encodage matériel pendant le jeu. Mesuré nulle
// part encore — À VÉRIFIER SUR TÉLÉPHONE (voir §12) : si les fps chutent en
// course, ce module est le premier suspect (le couper = ne pas appeler
// demarrer()).

const SEGMENT_S = 5;      // durée d'un segment du double-buffer
const CLIP_FPS = 30;      // suffisant pour un clip réseau social

let flux = null;          // MediaStream du canvas, créé une fois
let mimeType = null;      // format accepté par ce navigateur (mp4 sur Safari, webm ailleurs)
let enregistreurs = [];   // les deux MediaRecorder en alternance
let chunks = [];          // chunks par enregistreur (index parallèle)
let departs = [];         // performance.now() du départ de chaque enregistreur
let rotationTimer = null;
let actif = false;
let clipPret = null;      // File prêt à partager (même règle iOS que share.js)

function supporte() {
  if (typeof MediaRecorder === "undefined") return false;
  const canvas = document.getElementById("game-canvas");
  if (!canvas || !canvas.captureStream) return false;
  if (mimeType === null) {
    // Ordre : MP4 d'abord (Safari iOS ne sait enregistrer QUE ça, et c'est le
    // format le plus partageable), WebM ensuite (Chrome/Firefox/Android).
    const candidats = [
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    mimeType = candidats.find((m) => MediaRecorder.isTypeSupported(m)) || false;
  }
  return Boolean(mimeType);
}

function lancerEnregistreur(index) {
  try {
    const rec = new MediaRecorder(flux, { mimeType, videoBitsPerSecond: 2_500_000 });
    chunks[index] = [];
    departs[index] = performance.now();
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks[index].push(e.data); };
    rec.start();
    enregistreurs[index] = rec;
  } catch (e) {
    enregistreurs[index] = null; // enregistrement impossible : on vivra sans clip
  }
}

// À appeler au départ de course (et au rejeu). Idempotent.
export function demarrer() {
  if (!supporte()) return;
  arreter(); // repart toujours d'un état propre
  try {
    if (!flux) flux = document.getElementById("game-canvas").captureStream(CLIP_FPS);
  } catch (e) { return; }
  clipPret = null;
  actif = true;
  lancerEnregistreur(0);
  // Le second démarre à mi-segment, puis chacun est redémarré toutes les
  // 2×SEGMENT_S : à tout instant, le plus ancien couvre ≥ SEGMENT_S secondes.
  rotationTimer = setTimeout(function tourner() {
    if (!actif) return;
    const plusAncien = departs[0] <= (departs[1] ?? Infinity) ? 0 : 1;
    const aRedemarrer = enregistreurs[1] ? plusAncien : 1;
    if (enregistreurs[aRedemarrer]) {
      try { enregistreurs[aRedemarrer].stop(); } catch (e) { /* déjà arrêté */ }
    }
    lancerEnregistreur(aRedemarrer);
    rotationTimer = setTimeout(tourner, SEGMENT_S * 1000);
  }, SEGMENT_S * 1000);
}

// À appeler à la fin de course : fige le clip (l'enregistreur le plus ancien,
// donc le plus long) et le prépare au partage. Résout quand le File est prêt.
export function terminer() {
  if (!actif) return Promise.resolve();
  actif = false;
  clearTimeout(rotationTimer);

  const valides = [0, 1].filter((i) => enregistreurs[i]);
  if (!valides.length) return Promise.resolve();
  // Le plus ancien = la couverture la plus longue (5 à 10 s).
  const garde = valides.reduce((a, b) => (departs[a] <= departs[b] ? a : b));

  return new Promise((resolve) => {
    const finaliser = () => {
      try {
        const type = mimeType.split(";")[0];
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunks[garde], { type });
        if (blob.size > 0) {
          clipPret = new File([blob], `la-ville-est-belle-clip.${ext}`, { type });
        }
      } catch (e) { clipPret = null; }
      for (const i of valides) {
        if (i !== garde) { try { enregistreurs[i].stop(); } catch (e) { /* rien */ } }
        enregistreurs[i] = null;
      }
      resolve();
    };
    const rec = enregistreurs[garde];
    if (rec.state === "inactive") { finaliser(); return; }
    rec.onstop = finaliser;
    try { rec.stop(); } catch (e) { finaliser(); }
  });
}

// Coupe tout sans rien garder (rejeu, abandon).
export function arreter() {
  actif = false;
  clearTimeout(rotationTimer);
  for (const i of [0, 1]) {
    if (enregistreurs[i]) { try { enregistreurs[i].stop(); } catch (e) { /* rien */ } }
    enregistreurs[i] = null;
    chunks[i] = [];
    departs[i] = undefined;
  }
}

export function estPret() {
  return clipPret !== null && navigator.canShare && navigator.canShare({ files: [clipPret] });
}

// DANS le handler de clic, sans await avant (même règle iOS que share.js).
export function partagerClip() {
  if (!clipPret) return false;
  const donnees = {
    files: [clipPret],
    title: "La ville est belle",
    text: "Ma course sur La ville est belle — joue et tente de gagner le vinyle de l'EP de PMC : https://pmcmp3.github.io/la-ville-est-belle/",
  };
  if (navigator.canShare && navigator.canShare({ files: [clipPret] }) && navigator.share) {
    navigator.share(donnees).catch(() => { /* partage annulé */ });
    return true;
  }
  return false;
}
