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
import * as net from "./net.js";

// Durée du petit temps de félicitation entre deux étapes.
const DUREE_REUSSITE = 0.75;
// Profondeur d'apparition des objets de démonstration : ~3,5 s de trajet à la
// vitesse de départ, le temps de les voir venir et de réagir.
const Z_DEPART = 80;

const JAUNE = "#ffcf2e";
const CREME = "#f0ead9";
const ROUGE = "#e13e26";
const POLICE = '"Stage Grotesk", system-ui, sans-serif';

// Pochette de l'EP, affichée au centre pendant l'étape 1 avec la promesse du
// concours (demandé le 20 août 2026 : « précise pendant la première étape du
// tuto que celui qui gagne gagne l'EP, et tu peux mettre une image au
// centre »). WebP recompressée à 480×480 / 16 Ko (l'original fait 4000×4000)
// et préchargée dès le chargement du module — négligeable à côté des 3,9 Mo
// de MP3, donc pas besoin de chargement progressif. Si elle ne charge pas
// (réseau), l'étape s'affiche simplement sans image, jamais bloquante.
const COVER = new Image();
COVER.src = "assets/cover-ep.webp";

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
    texte: "Swipe vers le haut pour attraper l'étoile en l'air",
    geste: "haut",
    objectifs: 1,
    // Dans la voie du joueur : le saut qu'il fait rencontre l'étoile, le geste
    // et sa récompense se lisent d'un coup.
    // ⚠️ C'est l'étoile ATTRAPÉE qui valide, plus le saut lui-même (revu le
    // 20 août 2026 : « faut attraper l'étoile pour valider l'étape 2 ») — un
    // saut dans le vide n'apprend pas le timing, qui est tout l'enjeu des
    // bonus aériens. Une étoile passée sans être prise revient, comme au pont.
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
    // ⚠️ La consigne dit 5 étoiles : il doit y avoir EXACTEMENT 5 étoiles à
    // ramasser et les 5 doivent l'être. La première version posait 3 étoiles
    // et en validait 2 — retour direct : « le 4/4 te laisse pas ramasser le
    // nombre d'étoiles écrit ».
    objectifs: 5,
    // Même règle que le pont : les étoiles arrivent dans une voie ADJACENTE,
    // jamais celle du joueur — il doit aller les chercher.
    props: (voie) => {
      const cible = voie === 0 ? 1 : voie - 1;
      return [0, 14, 28, 42, 56].map((recul) =>
        prop({ isBonus: true, kind: "cd", voie: cible, recul })
      );
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
  partie: 1,       // 1..3 — pour la mesure de l'entonnoir, ne pilote rien
};

// `partie` = 1, 2 ou 3 (le tutoriel rejoue sur les trois premières parties).
// Sert uniquement à la mesure : savoir si les gens décrochent dès la première
// exposition ou seulement quand ils l'ont déjà vu (tracking du 30 août 2026).
export function demarrer(partie) {
  etat.partie = partie || 1;
  net.postTutoriel(etat.partie, -1, "debut", false);
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
  // Abandon : le joueur a appuyé sur « Passer l'intro », ou le plafond de
  // sécurité de 30 s a sauté. Une étape sans ligne suivante = un décrochage à
  // cette étape ; cette ligne-là dit en plus qu'il a été volontaire.
  if (etat.actif && !etat.fini) {
    net.postTutoriel(etat.partie, etat.index, "passe", false);
  }
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
      // Étape franchie : une ligne par étape, c'est ce qui dessine l'entonnoir.
      net.postTutoriel(etat.partie, etat.index, ETAPES[etat.index]?.cle, false);
      etat.index += 1;
      if (etat.index >= ETAPES.length) {
        etat.fini = true;
        etat.props = [];
        net.postTutoriel(etat.partie, ETAPES.length, "fini", true);
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
  // (L'étape saut ne se valide plus ici : sauter dans le vide ne suffit pas,
  // c'est le ramassage de l'étoile aérienne qui compte — voir plus bas.)

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
        if (etape.cle === "combo" || etape.cle === "saut") valider();
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
  // Étapes à étoiles (saut, combo) : des étoiles toutes passées sans être
  // prises reviennent, replacées par rapport à la voie actuelle — même règle
  // que le pont, jamais d'avancement sans geste.
  if ((etape.cle === "combo" || etape.cle === "saut") && etat.props.length && etat.props.every((p) => p.resolu) && etat.faits < etape.objectifs) {
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

// --- Pochette + promesse du concours (étape 1 uniquement) -------------------
// Peinte par main.js APRÈS la scène (c'est de l'interface, comme la main
// fantôme) : la pochette au centre de l'écran, la promesse juste en dessous.
// Uniquement pendant l'étape 1 — ensuite le champ de jeu doit rester dégagé
// (le pont et les étoiles des étapes suivantes arrivent au centre).
// Durées du fondu d'entrée/sortie de la pochette (« mets fade in et fade
// out ») : entrée sur la première demi-seconde de l'étape, sortie pendant le
// « Bien ! » qui clôt l'étape 1.
const RECOMPENSE_FADE_IN_S = 0.5;

export function dessinerRecompense(ctx, width, height) {
  if (!etat.actif || etat.fini || etat.index !== 0) return;
  if (!COVER.complete || !COVER.naturalWidth) return;

  // Fondu d'entrée (temps d'étape) et de sortie (temps de félicitation).
  let alpha = Math.min(1, etat.tempsEtape / RECOMPENSE_FADE_IN_S);
  if (etat.reussite > 0) alpha = Math.min(alpha, etat.reussite / DUREE_REUSSITE);
  if (alpha <= 0.01) return;

  const size = Math.min(width * 0.30, 132);
  const cx = width / 2;
  // ⚠️ Plancher à 172px (21 août 2026, « les éléments se marchent un peu
  // dessus ») : la consigne du haut est du DOM (#countdown-caption), la
  // pochette est peinte ici sur le canvas — les deux ne se voient pas. À
  // height×0,30 seul, un petit écran (iPhone SE, 667px → 200px) passait sous
  // le bas de la consigne. Le plancher est calé sur le pire cas mesuré :
  // 48px de padding + 26px de « 1/4 » + 12px d'air + une consigne de 2 lignes
  // (55px) = 141px, + 31px de marge.
  const top = Math.max(height * 0.28, 172);

  ctx.save();
  ctx.globalAlpha = alpha;

  // « Gros blur derrière » : la zone de scène derrière la carte est floutée
  // (le canvas se redessine dessus lui-même à travers ctx.filter) — effet
  // verre dépoli, la pochette se détache de la route au lieu d'y coller.
  // ⚠️ drawImage lit les pixels SOURCE en coordonnées du backing store (le
  // transform dpr ne s'applique qu'à la destination) — d'où la multiplication
  // par l'échelle courante du contexte.
  const pad = 16;
  const bx = cx - size / 2 - pad;
  const by = top - pad;
  const bw = size + pad * 2;
  const bh = size + pad * 2 + 33; // couvre aussi la pastille de promesse (10 + 23)
  const dpr = ctx.getTransform().a || 1;
  ctx.filter = "blur(9px)";
  ctx.drawImage(ctx.canvas, bx * dpr, by * dpr, bw * dpr, bh * dpr, bx, by, bw, bh);
  ctx.filter = "none";
  // Léger voile sombre par-dessus le flou : unifie la zone quel que soit le
  // décor derrière (façades claires ou bitume).
  ctx.fillStyle = "rgba(13,13,16,0.25)";
  ctx.fillRect(bx, by, bw, bh);

  // Cadre crème fin + ombre portée : la pochette se détache comme une carte.
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#ffffff"; // cadre blanc (plus de crème depuis la refonte du 4 septembre 2026)
  ctx.fillRect(cx - size / 2 - 3, top - 3, size + 6, size + 6);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.drawImage(COVER, cx - size / 2, top, size, size);

  // La promesse, dans le même panneau sombre que la consigne du haut.
  const texte = "Le meilleur score gagne le vinyle de l'EP";
  ctx.font = `900 11.5px ${POLICE}`;
  const largeur = ctx.measureText(texte).width + 24;
  const py = top + size + 10;
  // Tracé manuel plutôt que ctx.roundRect (Safari < 16.4 ne l'a pas — même
  // choix que roundRect() dans hud.js).
  const rx = cx - largeur / 2, rh = 23, rr = 11.5;
  ctx.fillStyle = "rgba(13,13,16,0.7)";
  ctx.beginPath();
  ctx.moveTo(rx + rr, py);
  ctx.arcTo(rx + largeur, py, rx + largeur, py + rh, rr);
  ctx.arcTo(rx + largeur, py + rh, rx, py + rh, rr);
  ctx.arcTo(rx, py + rh, rx, py, rr);
  ctx.arcTo(rx, py, rx + largeur, py, rr);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = JAUNE;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texte, cx, py + rh / 2);
  ctx.restore();
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
