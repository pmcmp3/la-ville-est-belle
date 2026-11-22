// config.js — Réglages de « J'ai un pote ».
// Fichier UNIQUE de configuration, chargé tel quel (pas bundlé). Aucune
// logique de jeu ici. audio.js lit les clés audio, tout le reste est lu par
// main.js/track.js/friends.js.

window.CONFIG = {

  // === MORCEAU / RYTHME ===
  // « J'ai un pote » (EP La ville est belle). BPM mesuré sur le master WAV
  // (librosa, 222 temps suivis, résidu 43 ms) : 85,0. Premier temps à 0,04 s.
  bpm: 85,
  premierTempsOffset: 0.04,
  dureeMorceau: 173.65,
  fichierAudio: "assets/jai-un-pote.mp3", // 96 kbps, 2,1 Mo (le 320 de l'EPK fait 6,9 Mo)
  boucleMorceau: false,     // contre-la-montre : la fin du morceau = la fin de la partie
  chargementMinS: 2.6,      // durée minimale de l'écran de chargement (s)
  fonduEntree: 1.2,
  pauseFiltreHz: 800,
  pauseFondu: 0.5,
  pauseDeriveMax: 0,        // 0 : le morceau EST le chrono, il reprend là où la course s'est arrêtée

  // Boucle du début pendant la seconde chance : 16 temps = 4 mesures à 85 BPM.
  loopMortDebut: 0.04,
  loopMortDuree: 11.294,
  loopMortFiltreMin: 170,
  loopMortFiltreMax: 16000,
  loopMortVolumeMin: 0.32,
  // Le MARCHAND du marché : vocal de PMC passé au mégaphone dans une halle,
  // joué une fois par course au passage du marché. `marchandVolume` = volume
  // devant les étals (1 = le fichier tel quel, à −16 LUFS ; le morceau est à
  // ~−14) ; de loin il descend à ~35 % de ça, étouffé. "" = marché muet.
  fichierMarchand: "assets/marchand-courgettes.mp3",
  marchandVolume: 0.5,
  // SOUND DESIGN : tout est synthétisé (bruitages.js, ambiance.js), chaque son
  // calé sur le morceau. 1 = réglage de référence ; 0,5 ≈ −6 dB ; 0 = coupé.
  bruitagesVolume: 1,       // cris, chocs, klaxons, train, quilles…
  veloVolume: 1,            // le vélo : roulement du pneu, roue libre en l'air, vent, atterrissages
  ambianceVolume: 1,        // le décor : oiseaux, grillons, chouette, cloche, vent de montagne, vagues, mouettes
  // La voix du joueur qui se prend un obstacle : le vocal « Pfff… aïe ! » de
  // PMC, nettoyé et compressé. "" = pas de voix.
  fichierAie: "assets/pff-aie.mp3",
  aieVolume: 1,

  // === VITESSE ===
  // En multiples de V_UNIT (regles.js) : la vitesse double toutes les
  // V_DOUBLING_S secondes depuis vitesseBase jusqu'à vitesseMax.
  vitesseBase: 1.7,
  vitesseMax: 3.2,
  // DEUXIÈME ACCÉLÉRATION : sur les `accelDernieresS` dernières secondes, la
  // vitesse repart de vitesseMax vers vitesseFinale, atteinte ~15 s avant la fin.
  vitesseFinale: 8.4,
  accelDernieresS: 120,          // durée de la 2e accélération (s), comptée depuis la fin du morceau

  // === VUE DE PROFIL ===
  // Une seule voie, en 2D (Jetpack Joyride, Zombie Tsunami). Caméra posée à
  // côté de la route (scene.js) : le joueur file vers la droite, le fond
  // défile moins vite que la route (parallaxe).
  unitesVisibles: 14.5,     // largeur de l'écran en unités, à la profondeur de la route (portrait)
  solEcran: 0.7,            // hauteur de la route à l'écran (fraction, depuis le haut)
  cameraDistance: 11,       // distance caméra → route (unités) : plus petit = perspective plus forte
  cameraHauteur: 3.6,       // hauteur de la caméra : plus grand = on voit plus le dessus des choses
  // Où est le joueur à l'écran (fraction de la largeur) : au départ, puis à
  // vitesse maximale — la caméra prend de l'avance quand ça accélère, pour
  // garder ~1,6 s de lecture devant soi.
  cameraJoueurX: [0.3, 0.2],

  // === SAUT ===
  // Tap court    → apex ~1,3 (poules, chats, chiens, moutons, bottes)
  // Appui tenu   → apex ~2,5 (cochons, vaches, tracteurs)
  // Re-tap en l'air → apex ~3,7 (fermiers, voitures) + salto
  // Vitesse initiale et pesanteur sont fortes ENSEMBLE : mêmes apex, mais on
  // monte et on retombe vite (sans ça, le saut flotte).
  sautVitesse: 17.4,        // vitesse verticale au départ du saut (u/s)
  sautVitesseDouble: 17,    // impulsion du second saut, en l'air (u/s) — assez pour passer un tracteur
  sautGravite: 54,          // pesanteur normale (u/s²)
  sautGraviteTenue: 26,     // pesanteur tant qu'on monte ET qu'on reste appuyé (u/s²)
  sautTenueMaxS: 0.28,      // au-delà, l'appui ne fait plus monter (s)

  // === SCORE (en « pts » : tout le monde fait la même distance sur la même
  // course, ce qui départage c'est les potes gardés et les pièces) ===
  metresParUnite: 1,      // 1 rangée = 1 pt de base (× potes, × turbo)
  // Le multiplicateur des potes est ENTIER : 3 potes = ×3, 5 potes = ×5 (regles.js).
  // Mètres bonus par pièce ramassée (avant multiplicateur de potes).
  pieceMetres: 4,

  // === POTES ===
  potesMax: 5,              // sans ligue : la ligue de démo (5 membres)
  // BOOST DE LIGUE : pour faire le meilleur score, un fan doit faire jouer ses
  // potes. Chaque AUTRE membre de ta ligue qui a joué au moins
  // `boostLigueDureeS` secondes te donne +`boostLigueParPote` sur tous tes
  // points, jusqu'à `boostLigueMaxPotes` potes (×3 à 20).
  boostLigueParPote: 0.10,
  boostLigueMaxPotes: 20,
  boostLigueDureeS: 30,
  // Peloton : le premier pote roule `potesRecul` unités derrière le joueur,
  // puis `potesEcart` entre chaque pote. MEUTE serrée : en portrait on ne voit
  // que ~3,5 unités derrière le joueur, une file indienne sortirait de l'écran.
  potesRecul: 1.0,
  potesEcart: 0.5,
  // PIÈCES cumulées qui font venir le pote n°1, n°2… (croissant : chaque pote
  // est plus long à gagner que le précédent ; le premier arrive vite pour que
  // le principe se comprenne dans les premières secondes).
  potesPaliers: [4, 8, 17, 28, 41],
  // Après le dernier palier, un pote PERDU se rachète pour ce nombre de pièces…
  poteRachatPieces: 12,
  // … et de plus en plus cher : `poteRachatPieces` jusqu'à 60 s, puis jusqu'à
  // `poteRachatPiecesFin` à 160 s. Et passé `chocPlusUnApres` (fraction de la
  // course), chaque choc coûte UN pote de plus ; passé `chocPlusDeuxApres`, DEUX.
  poteRachatPiecesFin: 35,
  chocPlusUnApres: 0.3,
  chocPlusDeuxApres: 0.65,
  // Sans ligue, le peloton c'est la LIGUE DE DÉMO : Paul et ses quatre potes,
  // avec leurs skins, dans l'ordre d'arrivée. Dans une ligue, ce sont les membres.
  potesDefaut: [
    { nom: "paul", skin: { motif: "raye", c1: "#2f7a46", c2: "#f2ede2", short: "#3a3e4e", chapeau: "casquette", chaussures: "#565a66", velo: "vtt" } },
    { nom: "lea", skin: { motif: "uni", c1: "#ffcf2e", c2: "#f2ede2", short: "#3f63b4", chapeau: "paille", chaussures: "#f2ede2", velo: "grandbi" } },
    { nom: "marius", skin: { motif: "uni", c1: "#f2ede2", c2: "#f2ede2", short: "#b8402c", chapeau: "aucun", chaussures: "#f2ede2", velo: "vtt" } },
    { nom: "ines", skin: { motif: "uni", c1: "#2f7a46", c2: "#f2ede2", short: "#3a3e4e", chapeau: "bob", chaussures: "#e0742e", velo: "vtt" } },
    { nom: "hugo", skin: { motif: "carreaux", c1: "#e13e26", c2: "#0d0d10", short: "#c8963a", chapeau: "casquette", chaussures: "#33353d", velo: "grandbi" } },
  ],
  potesNoms: ["paul", "lea", "marius", "ines", "hugo"],
  ligueDemo: "PMCMP",       // code de la ligue de démo (jamais ouverte au public)
  // === LIGUE DE TEST (bêta) ===
  // "" = pas de bêta fermée : tout le monde a le jeu complet, avec le concours.
  // Remettre un code ici (et le créer en base) rebranche le menu simplifié
  // (pseudo → cycliste → JOUER, sans choix de ligue) et le bouton « Laisser un
  // retour » — utile pour un tour de test privé, jamais pendant le concours.
  ligueBeta: "",
  ligueBetaPlafond: 60,
  betaRetours: true,        // le bouton « Laisser un retour » sur l'écran de fin

  // === LE CONCOURS DE LIGUES ===
  // LA RÈGLE, en une phrase : le score d'une ligue, c'est la somme des
  // meilleurs scores de ses membres. À la clôture, la ligue n°1 gagne un son
  // écrit sur elle par PMC.
  // ⚠️ La DATE qui fait foi est celle de la table `concours` de la base
  // (supabase/CONCOURS-A-COLLER.sql) : le jeu la lit au chargement. Celle-ci
  // n'est que le repli quand la base ne répond pas. Les deux doivent coïncider.
  concoursFin: "2026-12-31T12:00:00+01:00",
  concoursLot: "un morceau avec PMC et ses potes",
  // Commission : +10 % du record de chaque pote de ta ligue au classement général.
  // Le taux qui fait foi est celui de la table `concours` (la base fait le calcul) ;
  // celui-ci n'est que le repli d'affichage. Les deux doivent coïncider.
  commissionParPote: 0.10,
  reglementUrl: "reglement.html",
  liguesParVague: 0,        // 0 = pas de limite de création de ligues (concours ouvert à tous)
  relaisDistance: 30000,    // mètres cumulés d'une ligue pour gagner le relais
  // Sprint du dimanche : COUPÉ le 15 novembre 2026 (« il faut absolument que
  // tu enlèves le truc »). Le code reste, `true` le rallume.
  sprintDimanche: false,
  sprintDureeS: 60,         // le sprint du dimanche : 60 s, même route pour tous

  piecesLogo: false,        // false = pièces jaunes unies, sans dessin
  laitDureeS: 5,            // brique de lait : ×2 sur les mètres pendant 5 s
  laitVitesse: 1.2,         // et seulement +20 % de vitesse
  // JETPACK : une partie sur `jetpackUneSur` (la 3e, la 8e, la 13e…), un
  // jetpack posé vers `jetpackTempsS` ; `jetpackDureeS` de vol, appuyé = on monte.
  jetpackUneSur: 5,
  jetpackPartie: 3,
  jetpackTempsS: 70,
  jetpackDureeS: 10,
  jetpackPoussee: 30,       // u/s² vers le haut, doigt appuyé
  jetpackGravite: 15,       // u/s² vers le bas, doigt levé (moins qu'un saut : on plane)
  alerteAvanceS: 1.8,      // avance (s) du panneau « attention » sur l'entrée du véhicule à l'écran (plus long : panneau allumé en permanence, mesuré par outils/alertes.mjs)
  nuitDebutS: 50,           // la nuit tombe à partir de cet instant du morceau (s, 30 s de transition)

  // === PANNEAUX DE VILLAGE (nom, département) ===
  villages: [
    ["CYSOING", "59"],
    ["MOYENCOURT", "80"],
    ["LA FRETTE", "38"],
    ["VAL-DE-VIRIEU", "38"],
    ["BIZONNES", "38"],
  ],

  // === LIENS (identiques au premier jeu) ===
  // LE TITRE « J'ai un pote » — c'est lui qu'on pousse, une seule destination.
  // ⚠️ URL nettoyées à la main : pas de `/intl-fr/` sur Spotify (il force la
  // page web au lieu de l'app), pas de `?si=` (jeton de partage qui piste
  // l'expéditeur), jamais le schéma `spotify:` (confirmation iOS).
  // Vide → repli sur `plateformesAlbum`.
  plateformesTitre: [
    { id: "spotify",     nom: "Spotify",     couleur: "#1DB954", geste: "appuie sur ＋ Ajouter", url: "https://open.spotify.com/track/4zIV5SC0pyVbtGb8XMH9gt" },
    { id: "deezer",      nom: "Deezer",      couleur: "#A238FF", geste: "appuie sur ♥",          url: "https://link.deezer.com/s/34Qs1hb9uH9PuTh6k78P7" },
    { id: "apple-music", nom: "Apple Music", couleur: "#FA243C", geste: "appuie sur ＋",          url: "https://music.apple.com/fr/song/jai-un-pote/6795043227" },
  ],
  plateformesAlbum: [
    { id: "spotify",      nom: "Spotify",       couleur: "#1DB954", geste: "appuie sur ＋ Ajouter",  url: "https://open.spotify.com/album/5nR4uZiJgNJCIRaRAo6qcX" },
    { id: "deezer",       nom: "Deezer",        couleur: "#A238FF", geste: "appuie sur ♥",           url: "https://www.deezer.com/album/1039050902" },
    { id: "apple-music",  nom: "Apple Music",   couleur: "#FA243C", geste: "appuie sur ＋",          url: "https://music.apple.com/fr/album/la-ville-est-belle-ep/6795042969" },
    { id: "tidal",        nom: "TIDAL",         couleur: "#000000", geste: "appuie sur ♥",           url: "https://tidal.com/album/546720750" },
    { id: "youtube-music", nom: "YouTube Music", couleur: "#FF0033", geste: "appuie sur Enregistrer", url: "https://music.youtube.com/playlist?list=OLAK5uy_lRwuoRCrfJSQCxEMH_GwNJCyITGAhdfNE" },
  ],
  lienSuivre: "https://open.spotify.com/artist/3TqmTXwzfX2UCduNYwW9iq",
  lienInsta: "https://www.instagram.com/pmc.mp3/",

  // === BACKEND ===
  // ⚠️ La v2 a SA PROPRE base Supabase, jamais celle de la v1 (où tourne la
  // bêta fermée : ses classements, son relais et ses événements ne doivent pas
  // recevoir de courses v2).
  // Projet Supabase v2 créé le 11 octobre 2026 (schema-v2.sql + tableau-de-bord.sql
  // exécutés, ligues et membres de la v1 recopiés). Clé « publishable » : publique
  // par nature, jamais la secret/service_role ici. Vider les deux champs coupe
  // tout appel (le jeu tourne alors avec la ligue de démo). En local et sous
  // les tests, net.js ne contacte jamais la base (sauf `?base` dans l'adresse).
  apiBase: "https://khlxublwgcqihuezzsam.supabase.co/rest/v1",
  apiKey: "sb_publishable_RnguGhkGNTjclChOhgLP8g_tqUxO_v9",
  // Base des liens de ligue (?ligue=CODE). Adresse officielle depuis le
  // 22 novembre 2026 (la v2 remplace la v1 sous /jai-un-pote/ du site de
  // l'artiste). pmcmp3.github.io/jai-un-pote-v2/ reste servie, même build.
  lienJeu: "https://la-ville-est-belle-pmc.fr/jai-un-pote/",

  // === A/B TEST ===
  // Chaque joueur tombe dans UNE variante par test, tirée de son identifiant
  // anonyme (jp2Joueur) : stable d'une visite à l'autre, et la variante part
  // dans `details.ab` de CHAQUE événement. Les vues `ab_ecoute` et
  // `ab_invitation` (CONCOURS-A-COLLER.sql) comparent les taux.
  // Mettre une seule valeur dans une liste = test éteint, tout le monde dessus.
  abTests: {
    // Comment on propose le morceau : le panneau des 3 plateformes, ou Spotify seul.
    ecoute: ["panneau", "spotify"],
    // Quel message d'invitation s'ouvre par défaut (les identifiants de
    // `messagesInvitation`). Le joueur peut toujours en choisir un autre : ce
    // qui est mesuré, c'est le message réellement envoyé.
    invitation: ["joue-avec-moi"], // 21 novembre 2026 : une seule phrase d'ouverture, demandée ; les autres se choisissent dans le menu
  },
  // Messages d'invitation proposés au joueur. Le PREMIER est celui qui s'ouvre
  // par défaut ; le joueur peut en choisir un autre, et son choix part dans
  // l'événement (vue `ab_invitation`) — c'est ça qu'on mesure.
  messagesInvitation: [
    { id: "joue-avec-moi", texte: "Joue avec moi dans le jeu « J'ai un pote »." },
    { id: "jamais-su", texte: "J'ai jamais su te le dire, alors rejoins ma ligue." },
    { id: "pote-ou-pas", texte: "T'es mon pote ou pas ? On va vérifier." },
    { id: "manque-toi", texte: "On y est déjà, il nous manque plus que toi." },
    { id: "trente-s", texte: "30 secondes de ton temps et je monte au classement." },
  ],

  toucheDebug: "d",
};

Object.freeze(window.CONFIG);
