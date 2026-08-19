// tutorial.js — Tutoriel GUIDÉ et INTERACTIF, joué à la place du décompte.
//
// Demandé le 19 août 2026 : « on peut remplacer les 20 secondes de début avec
// des exemples de swipe [...] comme un jeu Mario, mais faut pas que ce soit
// moche ». L'idée initiale était d'enregistrer une partie et d'en tirer des
// GIF ; écartée pour trois raisons — le poids (plusieurs centaines de Ko contre
// 65 Ko pour tout le bundle, avant même que le joueur puisse lancer le jeu), la
// qualité (256 couleurs et tramage : le dégradé du couchant sortirait en
// bandes), et l'obsolescence (l'aspect du jeu a bougé six fois en trois jours,
// un GIF serait périmé aussitôt).
//
// À la place, le jeu se montre LUI-MÊME : mêmes modules de rendu, mêmes
// sprites, zéro octet ajouté, et aucun risque de divergence avec le vrai jeu
// puisque c'est le vrai jeu qui tourne.
//
// ⚠️ Ce qui rend l'interactivité possible sans rien câbler : l'overlay du
// décompte est déjà en `pointer-events: none` (index.html), donc les gestes
// atteignent le canvas et `main.js` fait déjà bouger le personnage pendant
// cette phase. Le tutoriel n'a donc RIEN à intercepter — il OBSERVE l'état du
// joueur (voie courante, saut) et en déduit si le geste demandé a été fait.
// C'est aussi ce qui garantit qu'on enseigne le vrai contrôle et pas une
// simulation qui pourrait s'en écarter.
//
// ⚠️ La main fantôme MONTRE le geste, elle ne le joue jamais à la place du
// joueur. La première version envoyait de vraies commandes au personnage après
// ~3 s d'inaction — retour immédiat de l'artiste : « je ne fais rien, il bouge
// tout seul » — et comme l'observateur ne distingue pas un geste démontré d'un
// geste fait, les étapes se validaient toutes seules. Le tutoriel n'avance
// donc QUE sur un geste du joueur ; les seules sorties sans geste sont le
// bouton « Passer l'intro » et le plafond de temps global (screens.js).

import * as road from "./road.js";
import { peindreObjet } from "./entities-render.js";
import { isAirBonus } from "./entities.js";

// Durée du petit temps de félicitation entre deux étapes.
const DUREE_REUSSITE = 0.75;
// Profondeur d'apparition des objets de démonstration : ~3,5 s de trajet à la
// vitesse de départ, le temps de les voir venir et de réagir.
const Z_DEPART = 80;

const JAUNE = "#ffcf2e";
const CREME = "#f0ead9";
const ROUGE = "#e13e26";
const POLICE = '"Stage Grotesk", system-ui, sans-serif';

// --- Les étapes ------------------------------------------------------------
// Ordre voulu : on apprend à se déplacer, puis à sauter, puis la seule règle
// contre-intuitive du jeu (le pont), puis la récompense (le combo).
// ⚠️ L'étape « pont » est LA raison d'être de ce tutoriel : c'est le seul
// obstacle où le réflexe naturel — sauter — est précisément ce qui tue, et
// jusqu'ici rien ne l'enseignait. Un joueur qui découvre ça en mourant a déjà
// perdu sa course.
const ETAPES = [
  {
    cle: "voie",
    texte: "Swipe à gauche ou à droite pour changer de voie",
    geste: "lateral",
    objectifs: 2, // les deux directions, pour que le geste soit vraiment acquis
    props: () => [],
  },
  {
    cle: "saut",
    texte: "Swipe vers le haut pour sauter et attraper les étoiles en l'air",
    geste: "haut",
    objectifs: 1,
    // Dans la voie du joueur : le saut qu'il fait rencontre l'étoile, le geste
    // et sa récompense se lisent d'un coup.
    props: (voie) => [prop({ isBonus: true, kind: "guitare", voie })],
  },
  {
    cle: "pont",
    texte: "Sous un pont, reste au sol. Sauter est fatal",
    geste: "lateral",
    objectifs: 1,
    // ⚠️ La voie ouverte est TOUJOURS une voie ADJACENTE à celle du joueur,
    // jamais la sienne : la première version ouvrait la voie centrale, où le
    // joueur se trouve déjà au départ — l'étape se validait sans le moindre
    // geste (retour direct : « je ne fais rien, il bouge tout seul »). Voies
    // BLOQUÉES stockées, comme dans entities.js.
    props: (voie) => {
      const ouverte = voie === 0 ? 1 : voie - 1;
      return [prop({ isBonus: false, kind: "pont", voies: [0, 1, 2].filter((l) => l !== ouverte) })];
    },
  },
  {
    cle: "combo",
    texte: "Enchaîne 5 étoiles d'affilée pour déclencher le combo",
    geste: "lateral",
    objectifs: 2,
    // Même règle que le pont : les étoiles arrivent dans une voie ADJACENTE,
    // jamais celle du joueur — il doit aller les chercher.
    props: (voie) => {
      const cible = voie === 0 ? 1 : voie - 1;
      return [
        prop({ isBonus: true, kind: "cd", voie: cible, recul: 0 }),
        prop({ isBonus: true, kind: "cd", voie: cible, recul: 16 }),
        prop({ isBonus: true, kind: "cd", voie: cible, recul: 32 }),
      ];
    },
  },
];

let compteurProp = 0;

// Un objet de démonstration, au format attendu par peindreObjet() — donc
// exactement celui d'un créneau réel : le tutoriel réutilise le rendu du jeu,
// il ne redessine rien à sa façon.
function prop({ isBonus, kind, voie = 1, voies = null, recul = 0 }) {
  const lanes = voies || [voie];
  return {
    isBonus,
    kind,
    lanes,
    x: road.laneX(lanes[0]),
    z: Z_DEPART + recul,
    // Index stable et distinct : peindreObjet s'en sert pour les teintes de
    // voiture, l'outfit des piétons et la phase de flottement des étoiles
    // aériennes. Décalé loin des index réels par prudence.
    slotIndex: 9000 + compteurProp++,
    resolu: false,
  };
}

const etat = {
  actif: false,
  index: 0,
  faits: 0,
  tempsEtape: 0,
  tempsInaction: 0,
  reussite: 0,      // secondes restantes du temps de félicitation
  echec: 0,         // secondes restantes du message d'échec (étape pont)
  props: null,      // posés au premier pas de l'étape, PAR RAPPORT à la voie du joueur
  phaseGeste: 0,    // avance l'animation de la main fantôme
  fini: false,
  derniereVoie: null,
};

export function demarrer() {
  etat.actif = true;
  etat.index = 0;
  etat.faits = 0;
  etat.tempsEtape = 0;
  etat.tempsInaction = 0;
  etat.reussite = 0;
  etat.echec = 0;
  etat.fini = false;
  etat.derniereVoie = null;
  chargerEtape();
}

export function arreter() {
  etat.actif = false;
  etat.props = [];
}

export function estActif() { return etat.actif; }
export function estFini() { return etat.fini; }

function chargerEtape() {
  // `props` reste null jusqu'au premier pas de l'étape : leur placement dépend
  // de la voie COURANTE du joueur (voir ETAPES), que seul avancer() connaît.
  etat.props = null;
  etat.faits = 0;
  etat.tempsEtape = 0;
  etat.tempsInaction = 0;
}

function etapeCourante() { return ETAPES[etat.index]; }

// Ce que screens.js affiche : le texte de consigne et la progression. Le
// message change pendant les temps de félicitation/échec, qui sont les seuls
// retours immédiats dont dispose le joueur.
export function affichage() {
  if (!etat.actif) return null;
  const etape = etapeCourante();
  if (etat.reussite > 0) {
    return { texte: "Bien !", couleur: JAUNE, index: etat.index + 1, total: ETAPES.length };
  }
  if (etat.echec > 0) {
    return { texte: "Raté ! Reste au sol dans la voie libre", couleur: ROUGE, index: etat.index + 1, total: ETAPES.length };
  }
  if (!etape) return null;
  return { texte: etape.texte, couleur: CREME, index: etat.index + 1, total: ETAPES.length };
}

function valider() {
  etat.faits += 1;
  etat.tempsInaction = 0;
  const etape = etapeCourante();
  if (etat.faits >= etape.objectifs) {
    etat.reussite = DUREE_REUSSITE;
  }
}

// Avance le tutoriel d'un pas de simulation.
// `obs` = { voie, auSol, vientDeSauter } — état observé du joueur, fourni par
// main.js. Le tutoriel ne lit JAMAIS l'input directement : main.js consomme
// déjà les gestes pour piloter le personnage, et un second consommateur les
// lui volerait (voir consumeLaneMove dans input.js, qui vide une file).
export function avancer(dt, obs) {
  if (!etat.actif || etat.fini) return;

  // Les objets glissent en TOUTES circonstances, y compris pendant le
  // « Bien ! » : la première version figeait tout pendant la félicitation, et
  // l'étape 4 laissait des étoiles suspendues en plein écran (« trop bizarre,
  // ça marche pas du tout ») — le monde ne doit jamais s'arrêter, seul le
  // jugement des étapes fait des pauses.
  if (etat.props) {
    const vitesse = road.getSpeed();
    for (const p of etat.props) p.z -= vitesse * dt;
  }

  // Temps de félicitation : on laisse le « Bien ! » se lire, puis on enchaîne.
  if (etat.reussite > 0) {
    etat.reussite -= dt;
    if (etat.reussite <= 0) {
      etat.index += 1;
      if (etat.index >= ETAPES.length) {
        etat.fini = true;
        etat.props = [];
        return;
      }
      chargerEtape();
    }
    return;
  }
  if (etat.echec > 0) etat.echec -= dt;

  etat.tempsEtape += dt;
  etat.tempsInaction += dt;
  etat.phaseGeste += dt;

  const etape = etapeCourante();
  if (!etape) return;

  // Pose paresseuse des objets de l'étape : leur placement dépend de la voie
  // où le joueur se trouve MAINTENANT (voir ETAPES) — chargerEtape() ne la
  // connaît pas.
  if (etat.props === null) etat.props = etape.props(obs.voie);

  // --- Détection du geste, par OBSERVATION de l'état du joueur -------------
  if (etat.derniereVoie === null) etat.derniereVoie = obs.voie;
  const aChangeDeVoie = obs.voie !== etat.derniereVoie;
  if (aChangeDeVoie) etat.derniereVoie = obs.voie;

  if (etape.cle === "voie" && aChangeDeVoie) valider();
  if (etape.cle === "saut" && obs.vientDeSauter) valider();

  // --- Jugement au passage du joueur (le déplacement se fait plus haut) ----
  for (const p of etat.props) {
    if (p.resolu) continue;
    if (p.z > road.PLAYER_NEAR_Z) continue;
    p.resolu = true;

    if (p.isBonus) {
      // Ramassage VISIBLE : une étoile prise disparaît, comme en course — la
      // première version la laissait traverser le personnage, ce qui rendait
      // l'étape 4 incompréhensible (rien ne disait que c'était gagné).
      // Une aérienne ne se prend qu'en l'air, comme la vraie règle.
      const prise = p.lanes.includes(obs.voie) && (!isAirBonus(p.kind) || !obs.auSol);
      if (prise) {
        p.pris = true;
        if (etape.cle === "combo") valider();
      }
    } else if (etape.cle === "pont") {
      const voieLibre = !p.lanes.includes(obs.voie);
      if (voieLibre && obs.auSol) valider();
      else {
        // Raté : le pont revient, replacé par rapport à la voie ACTUELLE du
        // joueur, autant de fois qu'il faut. Pas d'auto-validation au bout
        // d'un moment ; le plafond global (screens.js) reste la seule autre
        // sortie sans geste.
        etat.echec = 1.4;
        etat.props = etape.props(obs.voie);
      }
    }
  }
  // Étape combo : des étoiles toutes passées sans être prises reviennent,
  // replacées par rapport à la voie actuelle — même règle que le pont, jamais
  // d'avancement sans geste.
  if (etape.cle === "combo" && etat.props.length && etat.props.every((p) => p.resolu) && etat.faits < etape.objectifs) {
    etat.faits = 0;
    etat.props = etape.props(obs.voie);
  }

}

// Objets à peindre, au format `extras` d'entities-render.js — donc triés par
// profondeur avec le joueur et le reste de la scène, jamais posés par-dessus.
export function getExtras(ctx, width, height, now) {
  // `props` peut encore valoir null : il n'est posé qu'au premier pas de
  // simulation de l'étape, et le rendu peut passer avant.
  if (!etat.actif || !etat.props) return [];
  return etat.props
    .filter((p) => !p.pris && p.z > 1 && p.z < road.HORIZON_Z)
    .map((p) => ({ z: p.z, draw: () => peindreObjet(ctx, width, height, now, p) }));
}

// --- Main fantôme ----------------------------------------------------------
// Dessinée à la main plutôt qu'une icône : une main réaliste jurerait avec la
// DA voxel. Un disque crème et une traînée qui file dans le sens du geste,
// c'est le vocabulaire le plus court pour dire « fais glisser ton doigt ».
export function dessinerGeste(ctx, width, height) {
  if (!etat.actif || etat.fini) return;
  const etape = etapeCourante();
  if (!etape || etat.reussite > 0) return;

  // Boucle de 1,6 s : le doigt part, glisse, s'efface, recommence.
  const cycle = 1.6;
  const t = (etat.phaseGeste % cycle) / cycle;
  const course = 92;                       // px parcourus par le doigt
  const alpha = t < 0.12 ? t / 0.12 : t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
  if (alpha <= 0.01) return;

  const cx = width / 2;
  // 0,68 → 0,80 : à 0,68 le doigt fantôme passait sur le sprite du joueur
  // (vérifié à l'écran) — descendu dans la zone vide sous lui, là où le pouce
  // du joueur se trouve réellement.
  const cy = height * 0.80;
  const vertical = etape.geste === "haut";
  // Le geste latéral alterne gauche/droite d'un cycle à l'autre, pour montrer
  // les deux sens sans écrire deux consignes.
  const sens = vertical ? -1 : (Math.floor(etat.phaseGeste / cycle) % 2 === 0 ? 1 : -1);
  const avance = t * course;
  const x = cx + (vertical ? 0 : sens * avance);
  const y = cy + (vertical ? sens * avance : 0);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Traînée : quelques disques de plus en plus petits derrière le doigt.
  for (let i = 1; i <= 4; i++) {
    const recul = i * 13;
    const tx = cx + (vertical ? 0 : sens * Math.max(0, avance - recul));
    const ty = cy + (vertical ? sens * Math.max(0, avance - recul) : 0);
    ctx.globalAlpha = alpha * (0.26 - i * 0.05);
    ctx.fillStyle = CREME;
    ctx.beginPath();
    ctx.arc(tx, ty, 15 - i * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Le doigt lui-même : disque plein cerclé, bien lisible sur le bitume.
  ctx.globalAlpha = alpha;
  ctx.fillStyle = CREME;
  ctx.beginPath();
  ctx.arc(x, y, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Chevron dans le sens du geste, posé devant le doigt.
  ctx.strokeStyle = JAUNE;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const d = 30;
  ctx.beginPath();
  if (vertical) {
    ctx.moveTo(x - 11, y - d + 11);
    ctx.lineTo(x, y - d);
    ctx.lineTo(x + 11, y - d + 11);
  } else {
    ctx.moveTo(x + sens * (d - 11), y - 11);
    ctx.lineTo(x + sens * d, y);
    ctx.lineTo(x + sens * (d - 11), y + 11);
  }
  ctx.stroke();
  ctx.restore();
}
