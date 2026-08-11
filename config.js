// config.js — Réglages du jeu "La ville est belle".
// Fichier UNIQUE de configuration. Ne contient AUCUNE logique de jeu.
// Tout se règle ici sans toucher au moteur.

window.CONFIG = {

  // === MORCEAU / RYTHME ===
  bpm: 120,                 // Tempo mesuré sur le master (à affiner avec la grille de debug)
  premierTempsOffset: 0.01, // Décalage en secondes du 1er temps depuis le début du fichier
  dureeMorceau: 257.9,      // Durée du morceau en secondes = longueur du parcours
  fichierAudio: "assets/la-ville-est-belle.mp3", // MP3/AAC servi en prod (léger)
  fonduEntree: 1.2,         // Fondu à l'entrée, en secondes
  fonduSortie: 2.0,         // Fondu à la sortie (juste avant la fin du morceau), en secondes
  pauseFiltreHz: 800,       // Menu pause : le morceau continue mais passe dans un filtre passe-bas à cette fréquence — on n'entend plus que les basses (demandé explicitement). Plus bas = plus étouffé.
  pauseFondu: 0.5,          // Durée en secondes du fondu du filtre (à l'entrée comme à la sortie de la pause)

  // === VITESSE / PILOTAGE ===
  vitesseBase: 1.8,         // Playtest 3 : "plus progressif, trop intense au début" — 2.3 → 1.5, puis +20% (retour explicite : "accélère un peu plus la vitesse globale") — 1.5 → 1.8.
  vitesseMax: 6.0,          // Plafond de la courbe exponentielle (road.js). 4.0 → 5.0, puis +20% (même retour) — 5.0 → 6.0.
  sensibiliteDirection: 2.2,// Sensibilité de la direction : plus haut = plus réactif — 1.0 → 1.375 → 2.75 → 2.2 (playtest : "un peu trop sensible, réduis de 20 %")
  zoneMorteGyro: 3,         // Angle mort du gyroscope en degrés (évite le tremblement)
  agressiviteVirages: 0.7,  // Amplitude/nervosité du déport latéral en virage (0 = mou, 1 = sec)

  // === SAUT ===
  hauteurSaut: 2.0,         // Hauteur du saut (multiplicateur) — 1.0 → 2.0 (playtest : "le saut 2x plus haut", entraîne aussi la hauteur des bonus aériens, voir entities.js)
  dureeSaut: 0.665,         // Durée du saut en secondes — 0.45 → 0.95 → 0.665 (-30 %, playtest : "trop long, on reste trop en l'air"). La gravité perçue vient aussi du changement de courbe : parabole physique (accélération constante) au lieu du sinus qui plafonnait longuement à l'apex — voir main.js jumpPhysics.

  // === VIES ===
  viesDepart: 3,            // Nombre de vies au démarrage
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

  // === OBSTACLES ===
  cadenceSpawnBeats: 1.5,   // Un événement (bonus/obstacle) tous les N temps (calage rythmique) — 2 → 1.5 (playtest : "un peu plus d'objets")

  // === CONCOURS ===
  dateOuverture:  "2026-08-05T00:00:00+02:00", // Ouverture du concours (heure de Paris). ⚠️ Fixée à aujourd'hui (dev) pour que l'artiste puisse envoyer des scores de test — À REMETTRE À "2026-08-17T00:00:00+02:00" avant de partager le lien public (lancement officiel demandé), et vider la table `scores` côté Supabase pour repartir sur un tableau propre.
  dateFermeture:  "2026-10-11T23:59:59+02:00", // Fermeture du concours (heure de Paris)
  // Hors fenêtre : le jeu reste jouable, mais le score n'est pas comptabilisé au classement.

  // === LIENS ===
  lienEP: "https://li.sten.to/la-ville-est-belle", // "Aller écouter le morceau" — lien fourni par l'artiste (remplace le linktr.ee)

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
