// clock.js — Horloge maîtresse du jeu + grille de temps musicaux (BPM/offset).
//
// Source de temps par défaut : performance.now(), t=0 au chargement du
// module (repère "début du morceau" avant que l'audio ne soit prêt).
// main.js appelle setTimeSource(audio.now) dès que la lecture démarre
// vraiment ; le reste du jeu (road.js, debug.js, entities.js…) n'a jamais
// besoin de savoir laquelle des deux sources est active, il appelle
// uniquement clock.now().

const beatPeriod = 60 / window.CONFIG.bpm;
const offset = window.CONFIG.premierTempsOffset;

let timeSource = () => performance.now() / 1000;
let startTime = timeSource();

export const clock = {
  // Remplace la source de temps brute (ex: horloge audio à l'étape 2).
  // `preserve` = garder le temps de jeu écoulé au lieu de repartir de zéro :
  // indispensable pour basculer d'une source à l'autre EN COURS de partie
  // (secours quand l'horloge audio se fige, voir main.js) sans renvoyer le
  // joueur au début du morceau. Par défaut on repart de zéro (démarrage,
  // rejeu), ce qui reste le comportement attendu ailleurs.
  setTimeSource(fn, preserve = false) {
    const elapsed = preserve ? this.now() : 0;
    timeSource = fn;
    startTime = timeSource() - elapsed;
  },

  // Avance (ou recule, avec un `seconds` négatif) l'horloge de jeu sans
  // toucher à la lecture audio, qui continue depuis sa position réelle.
  // Deux usages : DEBUG, pour atteindre un état (fin de parcours, spawn
  // tardif...) sans attendre — audio et simulation se désynchronisent
  // pendant un saut, compromis assumé pour un outil de dev. Et un usage non-
  // debug, dans la boucle normale : main.js recule l'horloge de
  // `entities.LEAD_IN` au tout début d'une course pour que le premier lot de
  // créneaux glisse depuis l'horizon au lieu d'apparaître déjà à la position
  // du joueur (voir le commentaire sur LEAD_IN dans entities.js).
  jumpBy(seconds) {
    startTime -= seconds;
  },

  // Temps de jeu écoulé en secondes depuis le repère de départ.
  now() {
    return timeSource() - startTime;
  },

  // Durée d'un temps (beat) en secondes.
  beatPeriod,

  // Index (flottant) du temps courant à l'instant t (0 = premier temps).
  beatIndexAt(t) {
    return (t - offset) / beatPeriod;
  },

  // Instant (secondes, depuis le repère de départ) où se produit le temps n.
  timeOfBeat(n) {
    return offset + n * beatPeriod;
  },
};
