// config.js — Réglages du jeu "La ville est belle".
// Fichier UNIQUE de configuration. Ne contient AUCUNE logique de jeu.
// Tout se règle ici sans toucher au moteur.

window.CONFIG = {

  // === MORCEAU / RYTHME ===
  bpm: 120,                 // Tempo mesuré sur le master (à affiner avec la grille de debug)
  premierTempsOffset: 0.01, // Décalage en secondes du 1er temps depuis le début du fichier
  dureeMorceau: 257.9,      // Durée du MORCEAU (audio) en secondes — sert au fondu de sortie et à la vérif de durée du MP3 (audio.js). Le morceau continue de jouer après la ligne d'arrivée (objectif "donner envie d'écouter le morceau") : voir dureeCourse, distinct, pour la longueur du PARCOURS.
  dureeCourse: 143.5,       // ⚠️ Longueur du PARCOURS en secondes = quand la ligne d'arrivée atteint le joueur. 205 → 143,5 (×0,7, "course trop longue", demandé le 17 août 2026). Distinct de dureeMorceau : le morceau continue après, jusqu'à sa fin réelle, pendant que le joueur est déjà sur l'écran de fin — marge encore plus large maintenant (257,9 - 143,5 ≈ 114 s). D'où dérive TOTAL_OBJECTS (entities.js) — donc le nombre d'obstacles rencontrés. TOTAL_STARS (entities.js) a été réduit à la MÊME proportion (200 → 140) : à quota fixe, un parcours 30 % plus court n'aurait plus assez de créneaux pour caser 200 étoiles ET des obstacles (revit le bug de diffusion d'erreur déjà corrigé une fois en août, voir entities.js).
  fichierAudio: "assets/la-ville-est-belle.mp3", // MP3/AAC servi en prod (léger)
  fonduEntree: 1.2,         // Fondu à l'entrée, en secondes
  fonduSortie: 2.0,         // Fondu à la sortie (juste avant la fin du MORCEAU, pas de la course), en secondes
  pauseFiltreHz: 800,       // Menu pause : le morceau continue mais passe dans un filtre passe-bas à cette fréquence — on n'entend plus que les basses (demandé explicitement). Plus bas = plus étouffé.
  pauseFondu: 0.5,          // Durée en secondes du fondu du filtre (à l'entrée comme à la sortie de la pause)
  pauseDeriveMax: 25,       // Retard maximal (secondes, cumulé sur toutes les pauses) que la course accepte de prendre sur le morceau plutôt que de le rembobiner. Redescendu à 8 le 12 août 2026 quand la course durait tout le morceau (plus de marge) ; remonté à sa valeur d'origine maintenant que dureeCourse (205 s) laisse à nouveau ~53 s de marge avant la fin réelle du morceau (257,9 s). Arbitrage : en dessous de ce seuil on garde le morceau qui avance (pas de rembobinage, demandé) ; au-dessus on rembobine, pour ne pas franchir la ligne d'arrivée en silence (audio.js, setPlaybackMode).

  // --- Boucle du début pendant la seconde chance (panneau de mort) ---------
  // Demandé le 22 août 2026 : « on doit mettre en place le début de la boucle
  // à la place du mp3 qui tourne de base derrière [...] le début filtré, on a
  // le décompte des 10 secondes et un filtre passe-bas qui remonte au fur et
  // à mesure du chrono ». Le morceau s'ARRÊTE à la mort et cette boucle prend
  // le relais (audio.js, mode "revive") ; à la reprise le morceau repart pile
  // là où le joueur est mort — plus aucune dérive à encaisser dans ce cas.
  loopMortDebut: 0.01,      // Seconde du morceau où commence la boucle (= premierTempsOffset : on part sur le temps 1)
  loopMortDuree: 8,         // Longueur de la boucle en secondes. 8 s = 4 mesures PILE à 120 BPM, donc un raccord inaudible. Mettre 10 (5 mesures) reste possible : ça boucle aussi sur un temps, c'est juste une longueur impaire en mesures.
  loopMortFiltreMin: 170,   // Passe-bas au plus fermé (début du décompte, ou joueur parti sur Spotify) : on n'entend plus que les basses
  loopMortFiltreMax: 16000, // Passe-bas au plus ouvert (fin du décompte) : la boucle est en clair, le jeu peut reprendre
  loopMortVolumeMin: 0.32,  // Volume de la boucle au plus fermé (« pas fort du tout »), 1 = plein à la fin du décompte
  loopMortRetour: 5,        // Secondes du décompte 5-4-3-2-1 rejoué QUAND LE JOUEUR REVIENT dans l'appli (retour de Spotify) — c'est lui qui rouvre le filtre et arme REPRENDRE

  // === VITESSE / PILOTAGE ===
  vitesseBase: 1.8,         // Playtest 3 : "plus progressif, trop intense au début" — 2.3 → 1.5, puis +20% (retour explicite : "accélère un peu plus la vitesse globale") — 1.5 → 1.8.
  vitesseMax: 7.65,         // Plafond de la courbe exponentielle (road.js) = vitesse de fin de course (atteinte avant la ligne d'arrivée, voir road.js). 4.0 → 5.0 → 6.0, puis ×1,5 (17 août 2026) — 6.0 → 9.0, puis −15 % (21 août 2026, « réduis un petit peu la vitesse à la fin de 15% c'est trop hardcore ») — 9.0 → 7.65.
  sensibiliteDirection: 2.2,// Sensibilité de la direction : plus haut = plus réactif — 1.0 → 1.375 → 2.75 → 2.2 (playtest : "un peu trop sensible, réduis de 20 %"). Module la vitesse de rattrapage de la voie visée (main.js, LANE_TWEEN).
  // zoneMorteGyro / agressiviteVirages retirés le 19 août 2026 : plus aucun
  // usage dans src/ depuis le retrait du gyroscope et le passage au pilotage
  // par crans (un swipe = une voie). Ce fichier est LE fichier de réglages du
  // jeu — y laisser des boutons qui ne branchent sur rien fait perdre du temps
  // à qui les tourne en cherchant un effet.

  // === SAUT ===
  hauteurSaut: 2.0,         // Hauteur du saut (multiplicateur) — 1.0 → 2.0 (playtest : "le saut 2x plus haut", entraîne aussi la hauteur des bonus aériens, voir entities.js)
  dureeSaut: 0.665,         // Durée du saut en secondes — 0.45 → 0.95 → 0.665 (-30 %, playtest : "trop long, on reste trop en l'air"). La gravité perçue vient aussi du changement de courbe : parabole physique (accélération constante) au lieu du sinus qui plafonnait longuement à l'apex — voir main.js jumpPhysics.

  // === VIES ===
  viesDepart: 3,            // Nombre de vies au démarrage
  penaliteObstacle: 500,    // Points perdus à chaque collision qui coûte un cœur (demandé : « on perd un cœur et ça fait perdre 500 points »). Le score ne descend jamais sous 0.
  penaliteDuree: 3,         // Durée d'affichage du "-500" sous le score, en secondes
  // Jauge d'énergie (ralentissement à 0) retirée (demandé explicitement :
  // « elle ne fait pas trop sens ») — la vitesse ne dépend plus que de la
  // progression du morceau (road.js).

  // === BONUS (valeurs de score) ===
  // Bonus repensés autour de l'univers musique / studio (playtest : "des CD,
  // des guitares, du piano, appareil photo, colliers de perles, ordis" — 5
  // slots retenus, les plus lisibles en pixel art à faible résolution).
  bonus: {
    cd:            50,      // CD/vinyle (commun)
    piano:        100,      // Touches de piano
    appareil:     150,      // Appareil photo
    collierPerles:250,      // Collier de perles (inchangé)
    guitare:      500,      // Guitare (rare, bonus aérien — se ramasse en sautant)
  },

  // === COMBO ===
  // Demandé le 17 août 2026 : « une personne qui prend 5 étoiles d'affilée
  // multiplie son score par 1,5, et ensuite 5 étoiles après fois 2, etc. ».
  // Un palier tous les comboSeuil étoiles ramassées SANS toucher d'obstacle
  // entre-temps (un obstacle remet le compteur à 0, voir main.js) ; chaque
  // palier ajoute comboBonusParPalier au multiplicateur (5 → ×1,5, 10 → ×2,
  // 15 → ×2,5...). S'applique aux POINTS de bonus uniquement, jamais à la
  // pénalité de collision.
  comboSeuil: 5,
  comboBonusParPalier: 0.5,
  // Boost de départ du DÉFI (23 août 2026) : qui arrive par un lien
  // « ?defi=… » démarre la course avec ce nombre de paliers de combo déjà
  // acquis (1 → ×1,5 dès la première étoile, perdu au premier obstacle
  // touché, comme n'importe quel combo). C'est l'appât qui rend le lien de
  // défi attirant à ouvrir — le levier de VOLUME du jeu. 0 pour désactiver.
  defiBoostPaliers: 1,

  // === OBSTACLES ===
  cadenceSpawnBeats: 1.5,   // Un événement (bonus/obstacle) tous les N temps (calage rythmique) — 2 → 1.5 (playtest : "un peu plus d'objets")

  // === CONCOURS ===
  dateOuverture:  "2026-08-17T00:00:00+02:00", // Ouverture du concours (heure de Paris). Remise à la date de lancement officiel le 19 août 2026 (elle était fixée au 5 août pour les tests). ⚠️ Il reste à VIDER LA TABLE `scores` côté Supabase : les scores enregistrés avant le 19 août l'ont été sous l'ancien barème (plafond 195 525 contre 61 400 aujourd'hui) et resteraient hors d'atteinte en tête du classement. Ça ne se fait pas depuis le jeu (la RLS interdit le DELETE avec la clé anon, et c'est une suppression définitive) — tableau de bord Supabase.
  dateFermeture:  "2026-10-11T23:59:59+02:00", // Fermeture du concours (heure de Paris)
  // Hors fenêtre : le jeu reste jouable, mais le score n'est pas comptabilisé au classement.

  // === LIENS ===
  lienEP: "https://li.sten.to/la-ville-est-belle", // "Ajouter le morceau" — smartlink fourni par l'artiste (remplace le linktr.ee)
  // ⚠️ PREMIER PALIER DE CONVERSION (23 août 2026, demandé : « tu dois
  // d'abord pré-sauvegarder l'album de PMC sur Spotify »). Séparé de lienEP
  // pour que l'artiste puisse y coller le VRAI lien de pré-sauvegarde de
  // l'album sans toucher au smartlink du morceau, qui reste utilisé partout
  // ailleurs (écran de fin, CTA flottant, bandeau « Tu écoutes »).
  // ⚠️ Tant qu'il vaut la même URL que lienEP, le palier « pré-sauvegarde »
  // envoie sur le smartlink du morceau — fonctionnel, mais ce n'est PAS une
  // pré-sauvegarde d'album : à remplacer dès que le lien existe.
  lienPresave: "https://li.sten.to/la-ville-est-belle",
  // Profil Spotify de PMC (vérifié le 21 août 2026 : c'est bien celui relié à
  // instagram.com/pmc.mp3) : sert au second verrou de conversion — après 3
  // parties, REJOUER demande de suivre PMC (une seule fois, mémorisé).
  lienSuivre: "https://open.spotify.com/artist/3TqmTXwzfX2UCduNYwW9iq",
  // Instagram de PMC — affiché sur l'ÉCRAN DE FIN, accroché au rappel du
  // concours (« Résultats du concours sur @pmc.mp3 »), demandé le 21 août
  // 2026. Placé là plutôt qu'à côté des CTA de conversion : il donne une
  // raison de suivre (savoir si on a gagné le vinyle) au lieu d'ajouter un
  // troisième lien qui se dispute le clic avec le morceau.
  lienInsta: "https://www.instagram.com/pmc.mp3/",

  // === BACKEND (étape 7 — Supabase) ===
  apiScores: "https://lmlltogosjpxkgofpcdy.supabase.co/rest/v1/scores", // URL REST du projet Supabase
  apiScoresKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbGx0b2dvc2pweGtnb2ZwY2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NTIxMDYsImV4cCI6MjEwMTUyODEwNn0.vC1XpJ9qG0FASbugtcsCBWFV1CIJUgTHKJO5E-HVxBs", // Clé "anon public" — publique par nature (destinée au client), protégée côté serveur par la RLS (voir supabase-schema.sql)
  apiScoresLimit: 50,       // Nombre de scores affichés au classement (GET) — 10 → 50 (playtest : « il faut afficher les 50 meilleurs scores »). Le bloc DOM (#leaderboard-list dans index.html) a une max-height + overflow-y auto pour rester sur un écran mobile.

  // === DEBUG ===
  toucheDebug: "d",         // Touche clavier pour activer/désactiver le mode debug
};

// Lecture seule : la logique de jeu ne doit jamais réassigner ces valeurs.
Object.freeze(window.CONFIG);
Object.freeze(window.CONFIG.bonus);
