// config.js — Réglages de « J'ai un pote » (jeu n°2, 4 septembre 2026).
// Fichier UNIQUE de configuration, chargé tel quel (pas bundlé). Aucune
// logique de jeu ici. Même contrat que le premier jeu : audio.js lit les clés
// audio, tout le reste est lu par main.js/track.js/friends.js.

window.CONFIG = {

  // === MORCEAU / RYTHME ===
  // « J'ai un pote » (EP La ville est belle). BPM mesuré sur le master WAV
  // (librosa, 222 temps suivis, résidu 43 ms) : 85,0. Premier temps à 0,04 s.
  bpm: 85,
  premierTempsOffset: 0.04,
  dureeMorceau: 173.65,
  fichierAudio: "assets/jai-un-pote.mp3", // 96 kbps, 2,1 Mo (le 320 de l'EPK fait 6,9 Mo)
  boucleMorceau: false,     // contre-la-montre : la fin du morceau = la fin de la partie (6 septembre 2026)
  chargementMinS: 5,        // la barre de chargement dure au moins 5 s : tout est en cache avant JOUER (demandé)
  fonduEntree: 1.2,
  fonduSortie: 2.0,
  pauseFiltreHz: 800,
  pauseFondu: 0.5,
  pauseDeriveMax: 25,

  // Boucle du début pendant la seconde chance : 16 temps = 4 mesures à 85 BPM.
  loopMortDebut: 0.04,
  loopMortDuree: 11.294,
  loopMortFiltreMin: 170,
  loopMortFiltreMax: 16000,
  loopMortVolumeMin: 0.32,
  loopMortRetour: 5,
  // Pas d'easter egg vocal sur ce jeu (clés lues par audio.js, laissées vides).
  fichierEasterEgg: "",
  easterEggScore: Infinity,

  // === VITESSE ===
  // Jeu d'endurance : montée plus douce que le premier (le but est d'aller
  // LOIN avec ses potes, pas de survivre 2 minutes). Plafond ×4,6 = 51 u/s.
  // Vitesse d'avance en rangées/seconde : 4,4 au départ → plafond 9,4 (Crossy
  // Road : 1 rangée = 1 unité). Doublement toutes les 70 s (main.js).
  vitesseBase: 1.7,
  vitesseMax: 2.6,          // 3,6 → 2,6 le 7 septembre 2026 (« quand ça va vite, ça va vraiment trop vite »)

  // === SAUT (tap) ===
  sautHauteur: 1.25,     // apex du saut (unités-monde) — passe au-dessus des poules et des bottes
  sautDuree: 0.55,       // durée du saut en secondes

  // === GRILLE ===
  cadenceSpawnBeats: 1.5, // un créneau tous les 1,5 temps = 1,06 s à 85 BPM

  // === SCORE = MÈTRES ===
  metresParUnite: 1,      // 1 rangée = 1 m (4,4 rangées/s au départ = 16 km/h, 34 km/h au plafond)
  // Chaque pote ajoute ce pourcentage aux mètres gagnés (×1 seul, ×3 avec 8 potes).
  potesBonusMetres: 0.25,
  // Mètres bonus par pièce ramassée (avant multiplicateur de potes).
  pieceMetres: 4,

  // === POTES ===
  // PIÈCES cumulées qui font venir le pote n°1, n°2… (croissant : chaque pote
  // est plus long à gagner que le précédent). Le premier arrive vite (8
  // pièces) pour que le principe se comprenne dans les dix premières secondes.
  potesMax: 8,
  potesPaliers: [5, 12, 20, 30, 42, 56, 72, 90],
  // Prénoms des potes, dans l'ordre d'arrivée (Soberland en premier, verrouillé).
  potesNoms: ["soberland", "jules", "oscar", "elliot", "nita", "pablo", "hermance", "kilian"],

  // === DOUBLE SAUT (6 septembre 2026) ===
  // Un second tap en l'air = salto. Il consomme la barre d'élan, qui se
  // recharge en `elanRechargeS` secondes — pas de double saut en continu.
  elanRechargeS: 2.5,       // 5 → 2,5 (« la barre doit se recharger beaucoup plus vite »)
  elanParPiece: 0.25,       // et chaque pièce recharge un quart
  piecesLogo: false,        // « mets juste des pièces jaunes pour l'instant, enlève les dessins »
  laitDureeS: 5,            // brique de lait : ×2 sur les mètres pendant 5 s
  laitVitesse: 1.2,         // et seulement +20 % de vitesse (« pas ×2, c'est n'importe quoi »)
  nuitDebutS: 95,           // la nuit tombe à partir de cet instant du morceau (30 s de transition)
  tutoParties: 2,           // tutoriel sur les deux premières parties

  // === PANNEAUX DE VILLAGE (nom, département) ===
  villages: [
    ["CYSOING", "59"],
    ["MOYENCOURT", "80"],
    ["LA FRETTE", "38"],
    ["VAL-DE-VIRIEU", "38"],
    ["BIZONNES", "38"],
  ],

  // === LIENS (identiques au premier jeu) ===
  plateformesAlbum: [
    { id: "spotify",      nom: "Spotify",       couleur: "#1DB954", geste: "appuie sur ＋ Ajouter",  url: "https://open.spotify.com/album/5nR4uZiJgNJCIRaRAo6qcX" },
    { id: "deezer",       nom: "Deezer",        couleur: "#A238FF", geste: "appuie sur ♥",           url: "https://www.deezer.com/album/1039050902" },
    { id: "apple-music",  nom: "Apple Music",   couleur: "#FA243C", geste: "appuie sur ＋",          url: "https://music.apple.com/fr/album/la-ville-est-belle-ep/6795042969" },
    { id: "tidal",        nom: "TIDAL",         couleur: "#000000", geste: "appuie sur ♥",           url: "https://tidal.com/album/546720750" },
    { id: "youtube-music", nom: "YouTube Music", couleur: "#FF0033", geste: "appuie sur Enregistrer", url: "https://music.youtube.com/playlist?list=OLAK5uy_lRwuoRCrfJSQCxEMH_GwNJCyITGAhdfNE" },
  ],
  lienSuivre: "https://open.spotify.com/artist/3TqmTXwzfX2UCduNYwW9iq",
  lienInsta: "https://www.instagram.com/pmc.mp3/",

  // === BACKEND === (V1 locale : rien n'est envoyé)
  // Ligues entre potes (7 septembre 2026) : même projet Supabase que le premier
  // jeu, tables de jai-un-pote/supabase-migration-ligues.sql. Clé « anon
  // public » : publique par nature, protégée par la RLS côté serveur.
  apiBase: "https://lmlltogosjpxkgofpcdy.supabase.co/rest/v1",
  apiKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtbGx0b2dvc2pweGtnb2ZwY2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NTIxMDYsImV4cCI6MjEwMTUyODEwNn0.vC1XpJ9qG0FASbugtcsCBWFV1CIJUgTHKJO5E-HVxBs",
  lienJeu: "https://la-ville-est-belle-pmc.fr/jai-un-pote/", // base des liens de ligue (?ligue=CODE)
  apiScores: "",
  apiScoresKey: "",

  toucheDebug: "d",
};

Object.freeze(window.CONFIG);
