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
// Repli pour qui ne bouge pas : au bout de `DELAI_DEMO` secondes sans action,
// le tutoriel joue le geste tout seul (main fantôme + commande envoyée au
// personnage), en boucle, jusqu'à ce que le joueur s'y mette ou que le
// plafond de temps global tombe (screens.js).

import * as road from "./road.js";
import { peindreObjet } from "./entities-render.js";

// Secondes d'inaction avant que le tutoriel fasse la démonstration lui-même.
const DELAI_DEMO = 3.2;
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
    texte: "Swipe vers le haut pour sauter — les étoiles en l'air valent le plus",
    geste: "haut",
    objectifs: 1,
    props: () => [prop({ isBonus: true, kind: "guitare", voie: 1 })],
  },
  {
    cle: "pont",
    // Tiret plutôt que deux-points : vérifié à l'écran, le retour à la ligne
    // tombait juste avant le « : », qui ouvrait la seconde ligne — illisible.
    texte: "Sous un pont, reste au sol — sauter y est fatal",
    geste: "lateral",
    objectifs: 1,
    // Pont à une seule voie ouverte (la 1, au centre) : le joueur doit s'y
    // placer ET rester au sol. Voies BLOQUÉES stockées, comme dans entities.js.
    props: () => [prop({ isBonus: false, kind: "pont", voies: [0, 2] })],
  },
  {
    cle: "combo",
    texte: "5 étoiles d'affilée : le combo multiplie tes points",
    geste: "lateral",
    objectifs: 2,
    props: () => [
      prop({ isBonus: true, kind: "cd", voie: 1, recul: 0 }),
      prop({ isBonus: true, kind: "cd", voie: 1, recul: 16 }),
      prop({ isBonus: true, kind: "cd", voie: 1, recul: 32 }),
    ],
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
  props: [],
  commande: null,   // { lane, saut } à appliquer une fois par main.js
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
  etat.commande = null;
  chargerEtape();
}

export function arreter() {
  etat.actif = false;
  etat.props = [];
  etat.commande = null;
}

export function estActif() { return etat.actif; }
export function estFini() { return etat.fini; }

function chargerEtape() {
  const etape = ETAPES[etat.index];
  etat.props = etape ? etape.props() : [];
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
    return { texte: "Raté — au sol, dans la voie libre", couleur: ROUGE, index: etat.index + 1, total: ETAPES.length };
  }
  if (!etape) return null;
  return { texte: etape.texte, couleur: CREME, index: etat.index + 1, total: ETAPES.length };
}

// Commande de démonstration, à consommer par main.js (une seule fois).
export function prendreCommande() {
  const c = etat.commande;
  etat.commande = null;
  return c;
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

  // --- Détection du geste, par OBSERVATION de l'état du joueur -------------
  if (etat.derniereVoie === null) etat.derniereVoie = obs.voie;
  const aChangeDeVoie = obs.voie !== etat.derniereVoie;
  if (aChangeDeVoie) etat.derniereVoie = obs.voie;

  if (etape.cle === "voie" && aChangeDeVoie) valider();
  if (etape.cle === "saut" && obs.vientDeSauter) valider();

  // --- Objets de démonstration : ils avancent à la vitesse de la route -----
  const vitesse = road.getSpeed();
  for (const p of etat.props) {
    p.z -= vitesse * dt;
    if (p.resolu) continue;

    // Passage au niveau du joueur : c'est là qu'on juge.
    if (p.z <= road.PLAYER_NEAR_Z) {
      p.resolu = true;
      if (etape.cle === "pont") {
        const voieLibre = !p.lanes.includes(obs.voie);
        if (voieLibre && obs.auSol) valider();
        else {
          // Jamais de blocage : on rejoue l'étape une fois, puis on passe quoi
          // qu'il arrive (le plafond de temps de screens.js reste le filet).
          etat.echec = 1.4;
          if (etat.tempsEtape > 12) valider();
          else etat.props = etape.props();
        }
      } else if (etape.cle === "combo" && p.isBonus) {
        if (p.lanes.includes(obs.voie)) valider();
      }
    }
  }
  // Étape combo : si les étoiles sont toutes passées sans être prises, on
  // n'enferme personne — la consigne a été lue, on avance.
  if (etape.cle === "combo" && etat.props.every((p) => p.resolu) && etat.faits < etape.objectifs) {
    valider();
    etat.faits = etape.objectifs;
    etat.reussite = DUREE_REUSSITE;
  }

  // --- Démonstration automatique après un temps d'inaction ----------------
  // ⚠️ La démo joue le VRAI geste sur le VRAI personnage, donc l'observateur
  // la compte comme un geste accompli et l'étape avance. C'est assumé : un
  // joueur passif voit le tutoriel se dérouler tout seul (attract mode) au
  // lieu de rester coincé devant une consigne — les trois publics sont
  // servis (pressé → « Passer l'intro », passif → démo, engagé → il joue).
  if (etat.tempsInaction >= DELAI_DEMO) {
    etat.tempsInaction = 0;
    if (etape.geste === "haut") etat.commande = { lane: 0, saut: true };
    else etat.commande = { lane: obs.voie === 0 ? 1 : -1, saut: false };
  }
}

// Objets à peindre, au format `extras` d'entities-render.js — donc triés par
// profondeur avec le joueur et le reste de la scène, jamais posés par-dessus.
export function getExtras(ctx, width, height, now) {
  if (!etat.actif) return [];
  return etat.props
    .filter((p) => p.z > 1 && p.z < road.HORIZON_Z)
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
  const cy = height * 0.68;
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
