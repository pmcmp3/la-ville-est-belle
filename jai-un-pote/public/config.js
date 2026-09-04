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
  vitesseBase: 1.7,
  vitesseMax: 4.6,

  // === SAUT (tap court / tap long) ===
  hauteurSaut: 2.0,      // apex du saut LONG (maintien), en multiple de la hauteur du personnage × 0,6
  dureeSaut: 0.72,       // durée totale du saut long, en secondes
  sautCourtRatio: 0.5,   // apex du tap COURT, en fraction du saut long

  // === GRILLE ===
  cadenceSpawnBeats: 1.5, // un créneau tous les 1,5 temps = 1,06 s à 85 BPM

  // === SCORE = MÈTRES ===
  metresParUnite: 0.5,    // 1 unité-monde = 0,5 m (20 u/s au départ = 36 km/h, un vélo qui envoie)
  // Chaque pote ajoute ce pourcentage aux mètres gagnés (×1 seul, ×3 avec 8 potes).
  potesBonusMetres: 0.25,
  // Mètres bonus par étoile ramassée (avant multiplicateur de potes).
  etoileMetres: { petite: 3, moyenne: 6, grosse: 15 },

  // === POTES ===
  // Points d'étoiles cumulés qui font arriver le pote n°1, n°2… (croissant :
  // chaque pote est plus long à gagner que le précédent, donc plus précieux).
  etoiles: { petite: 100, moyenne: 200, grosse: 500 },
  potesMax: 8,
  potesPaliers: [3000, 8000, 15000, 24000, 35000, 48000, 63000, 80000],

  // === PANNEAUX DE VILLAGE (nom, département) ===
  villages: [
    ["MOYENCOURT", "80"],
    ["LA FRETTE", "38"],
    ["CYSOING", "59"],
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
  apiScores: "",
  apiScoresKey: "",

  toucheDebug: "d",
};

Object.freeze(window.CONFIG);
