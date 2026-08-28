// config.js — Réglages du jeu "La ville est belle".
// Fichier UNIQUE de configuration. Ne contient AUCUNE logique de jeu.
// Tout se règle ici sans toucher au moteur.

window.CONFIG = {

  // === MORCEAU / RYTHME ===
  bpm: 120,                 // Tempo mesuré sur le master (à affiner avec la grille de debug)
  premierTempsOffset: 0.01, // Décalage en secondes du 1er temps depuis le début du fichier
  dureeMorceau: 257.9,      // Durée du MORCEAU (audio) en secondes — sert à la vérif de durée du MP3 (audio.js). Depuis le passage au jeu infini (24 août 2026), le morceau tourne en BOUCLE, raccord arrondi à la mesure pour rester calé sur la grille rythmique (audio.js, playNow).
  dureeCourse: 143.5,       // ⚠️ Depuis le 24 août 2026, le jeu est INFINI : plus de ligne d'arrivée. Ce réglage ne marque plus une fin — c'est la LONGUEUR DE LA RAMPE de difficulté (entities.js, timeRampT/obstacleRatioAt) : à cette échéance, tous les curseurs (densité d'obstacles, rangées de voitures, ponts à voie unique) ont atteint leur régime de croisière maximal et n'évoluent plus.
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
  vitesseMax: 7.65,         // Plafond de la courbe exponentielle (road.js), atteint vers ~102 s puis CONSTANT à jamais — c'est le « plafond de vitesse infranchissable » demandé pour le jeu infini (24 août 2026) : la vitesse au moment de l'ancienne ligne d'arrivée, gardée telle quelle. 4.0 → 5.0 → 6.0, puis ×1,5 (17 août 2026) — 6.0 → 9.0, puis −15 % (21 août 2026, « réduis un petit peu la vitesse à la fin de 15% c'est trop hardcore ») — 9.0 → 7.65.
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
  // ⚠️ PLAFOND du multiplicateur (24 août 2026, après le passage au jeu infini :
  // « il faut réduire le combo, c'est beaucoup trop hardcore, le score va être
  // beaucoup trop gros — il faut que ce soit vraiment ultra difficile d'arriver
  // à 500 000 »). Sans plafond, une série de 200 étoiles montait à ×21 et les
  // scores partaient en millions. À ×5 (atteint à 40 étoiles d'affilée), un jeu
  // parfait en régime de croisière rapporte ~30 k/min : 500 000 = ~15 minutes
  // sans une seule faute. Le début de partie ne change pas (×1,5 → ×5, mêmes
  // paliers appris).
  comboMultiplicateurMax: 5,
  // Pluie d'étoiles (24 août 2026, idée de Pablo validée : « quand t'atteins N
  // étoiles de suite, un chunk combo où il n'y a plus d'obstacles pendant 10 s
  // avec plein d'étoiles ») : tous les `pluieEtoilesSeuil` ramassages d'affilée
  // (50, 100, 150… — la série cassée repart au premier palier), ~10 s de route
  // sans obstacles, que des étoiles. Les voitures traversantes restent actives
  // (sinon c'est 10 s de points gratuits sans aucun risque).
  pluieEtoilesSeuil: 50,
  // Boost de départ du DÉFI (23 août 2026) : qui arrive par un lien
  // « ?defi=… » démarre la course avec ce nombre de paliers de combo déjà
  // acquis (1 → ×1,5 dès la première étoile, perdu au premier obstacle
  // touché, comme n'importe quel combo). C'est l'appât qui rend le lien de
  // défi attirant à ouvrir — le levier de VOLUME du jeu. 0 pour désactiver.
  defiBoostPaliers: 1,

  // === CADEAUX MAGIQUES ===
  // Plafond de cadeaux (+1 cœur) par partie. Retour du premier béta-testeur le
  // jour même de la mise en ligne : « il y a beaucoup trop de cadeaux, ça donne
  // tellement de vies — dès que t'as une vie il y a pas mal de cadeaux, t'es
  // invincible ». Le taux d'apparition (GIFT_RATE, entities.js) ne change pas :
  // c'est le TOTAL par course qui est borné.
  cadeauxMaxParPartie: 2,

  // === EASTER EGG 500 000 ===
  // « À 500 k tu mets un vocal de toi » (idée de Pablo, validée). Le morceau
  // continue derrière, écarté en sidechain pendant la voix (audio.js,
  // playVoiceClip). ⚠️ Le FICHIER n'existe pas encore — l'artiste doit
  // l'enregistrer et le déposer dans public/assets/ sous ce nom : tant qu'il
  // est absent, rien ne se passe (le jeu ne tente le chargement qu'à
  // l'approche du seuil, jamais au démarrage).
  easterEggScore: 500000,
  fichierEasterEgg: "assets/easter-500k.mp3",

  // === OBSTACLES ===
  cadenceSpawnBeats: 1.5,   // Un événement (bonus/obstacle) tous les N temps (calage rythmique) — 2 → 1.5 (playtest : "un peu plus d'objets")

  // === CONCOURS ===
  dateOuverture:  "2026-08-17T00:00:00+02:00", // Ouverture du concours (heure de Paris). Remise à la date de lancement officiel le 19 août 2026 (elle était fixée au 5 août pour les tests). ⚠️ Il reste à VIDER LA TABLE `scores` côté Supabase : les scores enregistrés avant le 19 août l'ont été sous l'ancien barème (plafond 195 525 contre 61 400 aujourd'hui) et resteraient hors d'atteinte en tête du classement. Ça ne se fait pas depuis le jeu (la RLS interdit le DELETE avec la clé anon, et c'est une suppression définitive) — tableau de bord Supabase.
  dateFermeture:  "2026-10-11T23:59:59+02:00", // Fermeture du concours (heure de Paris)
  // Hors fenêtre : le jeu reste jouable, mais le score n'est pas comptabilisé au classement.

  // === LIENS ===
  // Smartlink de l'EP (Feature.fm / li.sten.to). ⚠️ CHANGÉ LE 28 AOÛT 2026,
  // jour de la sortie : l'ancienne URL (`.../la-ville-est-belle`) est restée
  // bloquée sur la page de PRÉ-SAUVEGARDE après la sortie (vérifié : trois
  // boutons « Pre-save » dix minutes après). La campagne a été refaite sous
  // `-pmc`, en mode sortie, avec Spotify / Deezer / Apple Music en tête —
  // l'ordre d'affichage se paie chez Feature.fm, mais DÉSACTIVER les autres
  // services est gratuit : c'est comme ça que les trois restent en tête.
  lienEP: "https://li.sten.to/la-ville-est-belle-pmc",
  // ⚠️ PREMIER PALIER DE CONVERSION. Posé le 23 août 2026 en PRÉ-SAUVEGARDE
  // (« tu dois d'abord pré-sauvegarder l'album de PMC sur Spotify »), devenu
  // un AJOUT À LA BIBLIOTHÈQUE le 28 août 2026 : l'album est sorti (Apple
  // Music et Deezer le matin, Spotify une heure plus tard), il n'y a plus rien
  // à pré-sauvegarder — on demande maintenant d'aller l'écouter et de
  // l'ajouter, ce qui est ce que comptent vraiment les plateformes (sauvegarde
  // + écoute, pas une promesse).
  // ⚠️ Ce lien doit pointer vers l'ALBUM (page de sortie), pas vers le
  // pré-save : la campagne Feature.fm (li.sten.to) bascule d'elle-même de
  // « Pre-save » à « Écouter » à la date de sortie renseignée dans le
  // tableau de bord — si la page affiche encore « Pre-save », c'est la date
  // qui est à corriger côté Feature.fm, pas ici.
  lienAlbum: "https://li.sten.to/la-ville-est-belle-pmc",

  // ⚠️ PANNEAU DE PLATEFORMES DANS LE JEU (28 août 2026, demandé : « au lieu
  // de passer par ce multi-lien, un panneau directement marqué Spotify,
  // Deezer, Apple Music… ils cliquent directement sur Spotify »). Le tiroir de
  // conversion n'envoie plus sur le smartlink : il affiche ces boutons, et un
  // tap ouvre l'album dans l'APPLICATION native. Une page intermédiaire de
  // moins, ~1 s de moins, aucune bannière cookies, aucun formulaire e-mail.
  // ⚠️ URL nettoyées à la main : pas de `?si=` (jeton de partage qui suit
  // l'expéditeur) et pas de `/intl-fr/` sur Spotify (force la page web au lieu
  // de l'app). Format « universal link » en https pour chaque plateforme —
  // JAMAIS le scheme `spotify:album:`, qui déclenche une confirmation iOS.
  // ⚠️ `couleur` sert à une pastille, PAS à un badge : les règles de marque
  // d'Apple interdisent de recréer soi-même un badge Apple Music. On affiche
  // le nom en texte, point.
  // `geste` dit quoi toucher UNE FOIS DANS L'APP — c'est la ligne qui fait
  // réellement monter le taux de sauvegarde : personne ne le fait parce que
  // personne ne le demande explicitement.
  plateformesAlbum: [
    { id: "spotify",      nom: "Spotify",       couleur: "#1DB954", geste: "appuie sur ＋ Ajouter",  url: "https://open.spotify.com/album/5nR4uZiJgNJCIRaRAo6qcX" },
    { id: "deezer",       nom: "Deezer",        couleur: "#A238FF", geste: "appuie sur ♥",           url: "https://www.deezer.com/album/1039050902" },
    { id: "apple-music",  nom: "Apple Music",   couleur: "#FA243C", geste: "appuie sur ＋",          url: "https://music.apple.com/fr/album/la-ville-est-belle-ep/6795042969" },
    { id: "tidal",        nom: "TIDAL",         couleur: "#000000", geste: "appuie sur ♥",           url: "https://tidal.com/album/546720750" },
    { id: "youtube-music", nom: "YouTube Music", couleur: "#FF0033", geste: "appuie sur Enregistrer", url: "https://music.youtube.com/playlist?list=OLAK5uy_lRwuoRCrfJSQCxEMH_GwNJCyITGAhdfNE" },
  ],

  // ⚠️ Comptage des clics PAR PLATEFORME : reste à `false` tant que la colonne
  // n'existe pas côté Supabase (migration supabase-migration-clic-plateforme.sql).
  // Envoyer un champ inconnu ferait échouer l'insert et on perdrait le compteur
  // global de clics, qui marche aujourd'hui — d'où l'interrupteur.
  compteurPlateformes: false,
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
