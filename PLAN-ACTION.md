# La ville est belle — Jeu de campagne · Plan d'action (handoff)

> ⚠️ **Ce fichier est un JOURNAL DE BORD chronologique — ce n'est plus le point d'entrée du
> projet.** Pour comprendre comment le jeu marche, lis **`ARCHITECTURE.md`** : modules,
> invariants, pièges connus, bugs ouverts, méthodes de test. C'est le seul fichier obligatoire
> en début de session.
>
> Ce document-ci sert à retrouver **pourquoi** une décision a été prise et à garder la trace des
> retours de playtest dans l'ordre où ils sont arrivés. On y ajoute en fin de session ; on ne le
> lit pas en entier.

> Document autonome destiné à être exécuté par un autre modèle, session par session.
> Objectif produit : **donner envie d'aller écouter le morceau "La ville est belle" de PMC.**
> Cible : **navigateur mobile** (Safari iOS en priorité absolue, puis Chrome & Firefox iOS/Android). Portrait natif.
> Deadline publique : **11 septembre 2026**. Développement par sessions courtes.

---

## État d'avancement

⚠️ **Cette section décrivait un état du 12 août 2026 devenu faux avec le temps** (gyroscope,
3 obstacles, barre d'énergie — trois choses supprimées depuis, voir `CLAUDE.md` « Décisions
verrouillées »). Retirée le 12 août 2026 pour éviter qu'elle induise en erreur : **l'état
d'avancement à jour est dans `ARCHITECTURE.md`** (§4 carte des modules, §6/§6bis gameplay et
décor, §11 dettes et points ouverts) — c'est le fichier à lire, celui-ci reste un journal
chronologique pur.

---

## PLAN — 5 chantiers lourds demandés après le 1er playtest externe (session suivante, nouvelle conversation)

**Mise à jour : le chantier 2 (glissade swipe bas) est FAIT** — voir ci-dessous. Les quatre autres sont toujours à l'état zéro. Contexte complet ci-dessous pour qu'une nouvelle session (autre modèle) puisse attaquer directement sans repasser par l'historique. Ordre de priorité non tranché — demander à l'artiste avant de commencer (question posée en fin de session précédente, jamais répondue : cyclisme d'abord / gameplay d'abord / tout en même temps sans repasser par lui entre chaque étape).

### 1. Nouvelle DA du cycliste, d'après une image de référence
**Demande exacte :** « Je te donne une image pour les cyclistes. Je veux que tu les réalises comme ça, parce que là, tu as fait des copies de moi en cyclisme. »

**La référence** (image fournie dans le chat, pas encore enregistrée dans le repo — **à redemander à l'artiste au début de la prochaine session**, ou décrite ici de mémoire en attendant) : un rendu **voxel/low-poly isométrique 3D** (style MagicaVoxel/Blockbench, PAS du pixel art 2D plat) — homme barbu (barbe rousse/brune), casque rose voxel, débardeur beige/tan, short marron, baskets rouges, sac à dos rose et blanc en damier, assis sur un vélo à cadre blanc avec de **très grandes roues** (rayons blancs, jante marron), le tout posé sur une petite plateforme de briques beiges.

**⚠️ Contrainte technique à trancher avant de commencer :** `CLAUDE.md` verrouille **vanilla JS + Canvas 2D, aucun moteur 3D**. La référence est un vrai rendu 3D volumétrique — elle ne peut pas être reproduite telle quelle au runtime avec la technique actuelle (`player.js` : sprite pixel art 2D pré-rendu une fois au chargement, blit à l'échelle, exactement comme `pedestrians.js`/`cyclists.js`). Deux options, à faire trancher par l'artiste :
  - **(a) Réinterprétation pixel art** — redessiner un sprite 2D en s'inspirant de la référence (grandes roues, sac à dos, casque, barbe, palette) mais avec la même technique procédurale que l'existant (rectangles/cercles Canvas, comme `player.js` actuel). Le plus rapide, cohérent avec le reste du pipeline, mais un pixel art plat ne rendra jamais un rendu voxel 3D à l'identique — juste "dans le même esprit".
  - **(b) Vrais rendus voxel importés** — faire produire (par l'artiste ou en dehors du jeu) des sprites voxel pré-rendus (rotations/frames de pédalage) en PNG, importés comme images statiques à la place du dessin procédural. Beaucoup plus fidèle à la référence, mais change le pipeline (asset externe au lieu de tout générer en Canvas) et demande un aller-retour avec l'artiste pour les fichiers.
  - **Recommandation : (a) d'abord**, à valider par l'artiste avant de s'engager — c'est réversible et rapide à montrer, (b) reste possible ensuite si le résultat ne satisfait pas.

**Fichiers concernés :** `src/player.js` (silhouette/palette/roue/pédalage — la mécanique de lean/rebond ne change pas, seule l'apparence), `src/cyclists.js` (cyclistes NPC en sens inverse — réutilisent EXPLICITEMENT la géométrie de `player.js` "pour zéro risque visuel", donc à resynchroniser en même temps, pas séparément).

### 2. ✅ FAIT — Glissade rapide vers le sol (swipe vers le bas pendant le saut)
**Livré** (`input.js` : `triggerSlam()`/`consumeSlamDown()`, symétrique du swipe haut, plus `ArrowDown`/`KeyS` au clavier pour le confort de test ; `main.js` : le slam n'a d'effet que si `jump.mode === 'air'` et pousse `jump.vy` à `-vJump × 1.5`, donc la parabole existante est court-circuitée sans être remplacée par un cas particulier). La détection réutilise le même verrou « un cran par contact » que les autres gestes. Descriptif d'origine conservé ci-dessous pour mémoire.

**Demande exacte :** « Plusieurs choses quand tu swipes vers le haut, comme sur [Subway Surfers] : la possibilité de swiper vers le bas pour redescendre très rapidement vers le sol. » Contexte : le joueur remonte au clavier/tactile via un swipe vers le haut mais ne peut pas actuellement écourter la descente — « ça me ferait chier qu'on ne puisse pas redescendre une fois qu'on a sauté ».

**Approche technique :** `src/input.js` a déjà la détection du swipe vers le haut (déclenche le saut) — ajouter la détection symétrique du swipe vers le bas, mais seulement exploitable **pendant que `jump.mode === 'air'`** (voir `main.js`, la machine à états du saut : `ground`/`air`/`onCar`). Actuellement la hauteur suit une parabole physique (`jumpPhysics`, voir commentaire dans `config.js` sur `dureeSaut`/`hauteurSaut`) — la glissade rapide doit court-circuiter cette parabole en cours de vol (accélération vers le bas nettement plus forte, ou un `jump.y` qui redescend directement à 0 sur une durée courte fixe) dès l'input détecté, sans attendre la fin naturelle de l'arc. Attention à ne pas casser la détection de collision/ramassage aérien (étoiles aériennes, `AIR_BONUS_KINDS`) si l'atterrissage devient possible plus tôt que prévu.

**Fichiers concernés :** `src/input.js` (détection swipe bas), `src/main.js` (état du saut, `jump.*`).

### 3. Dégradation du son sur le dernier cœur (effet "radio pixel")
**Demande exacte :** « Si tu arrives, quand la personne a un cœur, à dégrader le son pour que le son soit avec un débit beaucoup plus léger, genre 128 kbps voire moins, pour qu'on ait cet effet pixel radio, ça serait super. » — à faire en même temps que le clignotement N&B déjà en place (§ session précédente), pas à sa place.

**⚠️ Nuance technique à connaître :** on ne peut pas "changer le bitrate" d'un flux Web Audio déjà décodé — le bitrate est une propriété de l'ENCODAGE du fichier source, pas un paramètre live. Ce qui EST possible en direct pour approcher l'effet "radio/téléphone" décrit : (a) un filtre passe-bande serré (ex. 300 Hz–3 kHz, coupe les graves ET les aigus — contrairement au simple passe-bas déjà utilisé pour le menu pause), (b) une réduction d'échantillonnage/bitcrush (`WaveShaperNode` ou `AudioWorklet`, plus lourd à mettre en place), (c) un léger bruit/grain ajouté en mixage. Le projet a déjà un `BiquadFilterNode` de passe-bas dans `audio.js` (`setPlaybackMode`, mode `muffled` du menu pause) — s'en inspirer pour le graphe, mais ce doit être une chaîne d'effet **séparée** (le menu pause et "dernier cœur en danger" sont deux états indépendants qui peuvent en théorie se chevaucher).

**Cadence à trancher :** le clignotement visuel vient tout juste d'être throttlé de continu (1s) à un flash toutes les 4s parce que le continu était "beaucoup trop stressant". Recommandation : caler la dégradation sonore sur la **même cadence de 4s** (pulsée, pas permanente) plutôt que de retomber dans le même piège d'intensité déjà identifié — à confirmer avec l'artiste plutôt qu'à décider seul.

**Fichiers concernés :** `src/audio.js` (nouveau nœud/chaîne d'effet, ex. `setDangerMode(active)`), `src/main.js` (déclenché au même endroit que `updateHealthFilterIfChanged`, idéalement sur la même horloge que le flash visuel pour que son et image pulsent ensemble).

### 4. Événement "ATTENTION" vers 1 min 30 — rangée de 4 voitures, saut obligatoire
**Demande exacte :** « À partir de une minute trente, j'aimerais que tu rajoutes des vrais problèmes, genre un panneau qui dit "Attention" en plein milieu de l'écran. D'un seul coup, il y a 4 voitures qui bloquent toutes les voies, et il est obligatoire de sauter pour passer. [...] ça c'est pour les gens qui sont vraiment très forts et qui arrivent à avancer. »

**Différence avec le système actuel :** les rangées de voitures existantes (`entities.js`, `CAR_ROW_EARLY`/`CAR_ROW_LATE`, voir plus haut dans ce fichier) plafonnent à 3 voitures sur 4 voies — **il reste toujours au moins une voie libre**, par construction. Ce nouvel événement demande l'inverse : **les 4 voies bloquées en même temps**, aucune échappatoire latérale, seul le saut (atterrissage sur le toit, mécanique déjà existante via `roofOverlap`/`renderCar3D`) permet de passer. C'est donc un événement **spécial, hors de la grille aléatoire habituelle**, pas un réglage de plus dans `CAR_ROW_SIZES`.

**Question ouverte à trancher avec l'artiste :** un moment unique et marquant dans toute la course, ou un motif qui revient plusieurs fois après 1 min 30 ? Le texte ("à partir de") suggère plutôt une réapparition possible, mais ce n'est pas explicite.

**Approche technique :** un créneau spécial calé sur un temps fixe (1 min 30 = 90 s → convertir en index de beat avec `clock.timeOfBeat`/`CADENCE`, comme le fait déjà `finishBeatN()`), qui force `pickLanes(slotIndex, 4)` (les 4 voies) au lieu du tirage pondéré habituel. Le panneau "ATTENTION" est un nouvel élément d'UI (bandeau plein écran ou gros texte canvas, à concevoir) qui doit apparaître quelques secondes AVANT que la rangée n'arrive à hauteur du joueur — même principe de timing que la légende du décompte ou l'`#end-note`, mais déclenché en cours de course.

**Fichiers concernés :** `src/entities.js` (créneau spécial + logique de blocage total), nouveau code de rendu pour le panneau "ATTENTION" (`hud.js` ou nouveau module), `src/main.js` (déclenchement/timing).

### 5. Obstacle "pont" récurrent (toutes les 35-40 s), une seule voie de passage
**Demande exacte :** « Ensuite, j'aimerais que tu rajoutes un pont. [...] il faut que les gens passent dans le pont et qu'ils aient une seule voie pour passer dans le pont. Faudrait que tu mettes ce pont toutes les 35-40 secondes, genre le pont Neuf qui traverse [Paris]. »

**🚧 BLOQUANT : référence jamais reçue.** L'artiste a annoncé « je vais te donner un exemple de design » mais aucune image n'est arrivée dans la conversation. **Ne rien dessiner avant de l'avoir reçue** — demander explicitement au début de la prochaine session.

**Ce qu'on sait déjà :** récurrent (~35-40 s, donc à convertir en un intervalle de beats fixe, cadence indépendante de la grille bonus/obstacle habituelle — comparable au système des cyclistes NPC décoratifs, `NPC_CADENCE`/`NPC_LOOKAHEAD`, qui tourne déjà sur sa propre horloge séparée), et une seule voie de passage pendant le franchissement (rétrécissement temporaire de la largeur praticable, ou piliers/parapets bloquant 3 des 4 voies). Techniquement plus proche d'un **volume architectural** (comme les bâtiments haussmanniens, `world.js`, projeté via `road.project()`) que d'un obstacle ponctuel classique — probablement une structure qui encadre la route plutôt qu'un objet dessus.

**Fichiers concernés :** vraisemblablement un nouveau module dédié (sur le modèle de `world.js`), plus une nouvelle règle de collision dans `entities.js` (contact avec les piliers/le parapet si le joueur n'est pas dans la voie centrale).

---

---

## 0. Concept figé

Un **runner à la Subway Surfers** : caméra placée **derrière le cycliste**, sol qui défile vers un point de fuite, façades haussmanniennes de part et d'autre. **Coucher de soleil parisien, 22 h** : ciel orangé, lumière chaude et forte rasant les façades.

- **Parcours fini** calé sur la durée du morceau (~257,9 s). Quand la chanson finit, la course finit → écran de score.
- **Pilotage continu libre** (pas de couloirs) : le joueur glisse latéralement en continu.
- **Contrôle principal : bande de pilotage tactile en bas de l'écran** pour diriger (⚠️ initialement gyroscope à l'inclinaison — revenu en arrière en session, voir « État d'avancement » : demandé explicitement après plusieurs sessions à fiabiliser la permission iOS). **Bouton tactile "saut"** pour sauter les obstacles au sol et ramasser les bonus aériens.
- **3 vies.** Une collision = -1 vie. À 0 vie, game over avant la fin du morceau.
- Le joueur ramasse des **bonus** (points) et évite/saute des **obstacles**.
- **Synchro musicale** : le monde pulse au tempo, les bonus/obstacles arrivent calés sur les temps. C'est l'effet "waouh" recherché.
- **Score + meilleur score.** Un **backend centralise tous les scores** (classement + dashboard).
- **Toujours jouable**, mais un **concours** avec dates d'ouverture/fermeture s'appose par-dessus (participation = score envoyé pendant la fenêtre).
- **Bouton partage** → génère une **image story 1080×1920 pixel art "borne arcade 80s"** (titre, score, lien).
- CTA "aller écouter" → **https://linktr.ee/pmc.mp3**

---

## 1. Données audio (mesurées sur le master fourni)

Fichier : `PMC - La ville est belle MASTER#3.wav` (44,1 kHz / stéréo / 24-bit).

| Donnée | Valeur | Note |
|---|---|---|
| **Durée** | **257,908 s** (4:17.9) | = durée du parcours |
| **BPM** | **120,0** | comb-filter net devant 80/160 |
| **Offset 1er temps** | **~0,01 s** | démarre quasi sur le downbeat |
| Période de beat | 0,5 s | ~516 temps, ~129 mesures en 4/4 |

**À faire côté artiste** : vérifier visuellement le calage avec la grille rythmique de debug (étape 2) et corriger `BPM`/`offset` dans `config.js` si besoin. Fournir un `.wav` **et** un `.mp3` (le `.mp3` de 10 Mo existe déjà) pour le web : servir le **MP3/AAC** en prod (poids), garder le WAV en interne.

**⚠️ iOS Safari** : l'`AudioContext` doit être débloqué par un **geste utilisateur** (le tap "Jouer"). Ne jamais tenter de démarrer l'audio automatiquement.

---

## 2. Choix techniques (et pourquoi)

| Choix | Décision | Justification mobile |
|---|---|---|
| Rendu | **Canvas 2D**, projection pseudo-3D (plan de sol + sprites scalés par profondeur) | Universel Safari/Chrome/Firefox, léger, économe en batterie, pas de risque driver GPU sur vieux iPhone. WebGL surdimensionné pour ce rendu. |
| Boucle de jeu | **Pas de temps fixe** (accumulateur) + interpolation au rendu | iPhone 60 **ou** 120 Hz (ProMotion), Android variable → physique et synchro déterministes. |
| Horloge maîtresse | **Web Audio API** (`AudioContext.currentTime`) | `<audio>` dérive/latence imprévisible sur iOS. Web Audio = calage précis sur la grille de beats. |
| Direction | **Bande de pilotage tactile** en bas d'écran (`#steer-control`) | ⚠️ Initialement gyroscope (`deviceorientation`) — retiré en session après plusieurs allers-retours sur la fiabilité de la permission iOS, remplacé par un contrôle tactile dédié et visible (demandé explicitement). Voir « État d'avancement ». |
| Orientation | **Portrait verrouillé**, plein écran, safe-areas iOS (`env(safe-area-inset-*)`) | Responsive tous écrans, jeu une main. |
| Build/dev | **Vite** (vanilla JS + Canvas, aucun framework lourd) | HMR, `server.host: true` pour LAN, build statique optimisé. |
| Front prod | Statique déployé sur **Vercel ou Netlify** (HTTPS d'office) | HTTPS résout le partage de fichier en prod. |
| Backend | **Supabase** (Postgres managé + API REST instantanée + dashboard) recommandé | Voir §6. Alternative : petit service Node + Postgres. |

**Pourquoi pas de framework JS (React…)** : coût de bundle et de runtime inutile pour un jeu Canvas ; on veut un démarrage rapide sur data mobile et un contrôle total de la boucle.

**Serveur de dev accessible sur le LAN (point 1 du brief)** :
- `vite --host` → `http://<ip-locale>:5173`, ouvrable depuis l'iPhone sur le même Wi-Fi.
- **MAIS** le Web Share (fichier, étape 7) exige un **contexte sécurisé**. En HTTP LAN il est bloqué. → Générer un **certificat local avec `mkcert`** et lancer Vite en HTTPS, **ou** passer par un tunnel (`cloudflared`/`ngrok`) pour tester cette brique sur mobile. Le reste (route, audio, gameplay, direction tactile) se teste très bien en HTTP LAN.

---

## 3. Architecture des fichiers

`✅` = existe déjà et fait ce qui est décrit. `⬜` = pas encore créé (étape à venir).

```
/
├── config.js            ✅ SEUL fichier de réglages, gelé (Object.freeze) — voir §4
├── index.html           ✅ canvas plein écran, viewport, safe-area, slider volume, bouton saut
├── vite.config.js       ✅ server.host:true (HTTPS mkcert : bloc prêt, commenté — voir §2)
├── .claude/launch.json  ✅ config du skill `run` (npm run dev, port 5173)
├── /src
│   ├── main.js          ✅ bootstrap, boucle fixed-timestep, geste de démarrage, état de partie, HUD/écran de fin
│   ├── clock.js         ✅ horloge de jeu, source de temps swappable (perf.now → audio)
│   ├── audio.js         ✅ Web Audio, unlock iOS, fondu in/out, volume
│   ├── road.js          ✅ moteur pseudo-3D scanline (plan de sol, profondeur, projection, caméra)
│   ├── world.js         ✅ immeubles nus qui défilent (parallaxe) + dégradé ciel coucher de soleil — façades détaillées restent à faire (étape 4)
│   ├── player.js        ✅ sprite cycliste (silhouette B), rendu, lean, rebond de pédalage
│   ├── entities.js      ✅ spawn bonus/obstacles calé sur les beats, collision/ramassage, icônes pixel art
│   ├── input.js         ✅ bande de pilotage tactile (#steer-control) + clavier + bouton saut — gyroscope retiré
│   ├── debug.js         ✅ mode debug (FPS, position, grille rythmique, statut gyro)
│   ├── hud.js           ✅ écrans hors-jeu : prompt de démarrage (titre + CTA), HUD, indicateur gyro, écrans de fin (score + statut concours)
│   ├── share.js         ⬜ étape 7 — génération image story 1080×1920 pixel art
│   └── net.js           ⬜ étape 7 — envoi score au backend + récup classement
├── /assets              ✅ la-ville-est-belle.mp3 + MASTER.wav (fournis)
└── /public/assets       ✅ symlink → ../../assets/la-ville-est-belle.mp3 (nécessaire pour Vite,
                             voir §2 "Serveur de dev") — n'expose PAS le WAV master
```

`config.js` n'est **jamais** modifié par la logique de jeu : chargé en premier, exposé en objet global `CONFIG` en lecture seule.

---

## 4. `config.js` — spécification complète (copier-coller de départ)

```js
// config.js — Réglages du jeu "La ville est belle".
// Fichier UNIQUE de configuration. Ne contient AUCUNE logique de jeu.
// Tout se règle ici sans toucher au moteur.

window.CONFIG = {

  // === MORCEAU / RYTHME ===
  bpm: 120,                 // Tempo mesuré sur le master (à affiner avec la grille de debug)
  premierTempsOffset: 0.01, // Décalage en secondes du 1er temps depuis le début du fichier
  dureeMorceau: 257.9,      // Durée du morceau en secondes = longueur du parcours
  fichierAudio: "assets/la-ville-est-belle.mp3", // MP3/AAC servi en prod (léger)
  fonduEntree: 1.2,         // Fondu à l'entrée, en secondes (ajouté étape 2)
  fonduSortie: 2.0,         // Fondu à la sortie (juste avant la fin du morceau), en secondes (ajouté étape 2)

  // === VITESSE / PILOTAGE ===
  vitesseBase: 1.0,         // Vitesse d'avancement de base (multiplicateur global)
  vitesseMax: 1.8,          // Vitesse max atteinte en fin de parcours (montée de difficulté)
  sensibiliteDirection: 1.0,// Sensibilité de la direction (gyroscope) : plus haut = plus réactif
  zoneMorteGyro: 3,         // Angle mort du gyroscope en degrés (évite le tremblement)
  agressiviteVirages: 0.7,  // Amplitude/nervosité du déport latéral en virage (0 = mou, 1 = sec)

  // === SAUT ===
  hauteurSaut: 1.0,         // Hauteur du saut (multiplicateur)
  dureeSaut: 0.45,          // Durée du saut en secondes

  // === VIES / ÉNERGIE ===
  viesDepart: 3,            // Nombre de vies au démarrage
  drainEnergie: 0.04,       // Vitesse de vidage de la jauge d'énergie par seconde
  energieParBonus: 0.15,    // Énergie rendue à chaque bonus ramassé (0..1)
  // Énergie à 0 = ralentissement (pas game over). Les vies gèrent la mort.

  // === BONUS (valeurs de score) ===
  bonus: {
    clementine:    50,      // Clémentine (commun)
    clavier:      100,      // Clavier
    sourire:      150,      // Sourire
    collierPerles:250,      // Collier de perles
    etoile:       500,      // Étoile (rare, gros points / multiplicateur)
  },

  // === OBSTACLES ===
  cadenceSpawnBeats: 2,     // Un événement (bonus/obstacle) tous les N temps (calage rythmique)

  // === CONCOURS ===
  dateOuverture:  "2026-09-11T10:00:00+02:00", // Ouverture du concours (heure de Paris)
  dateFermeture:  "2026-10-11T23:59:59+02:00", // Fermeture du concours (heure de Paris)
  // Hors fenêtre : le jeu reste jouable, mais le score n'est pas comptabilisé au classement.

  // === LIENS ===
  lienEP: "https://linktr.ee/pmc.mp3", // "Aller écouter le morceau"

  // === BACKEND ===
  apiScores: "",            // URL de l'endpoint d'envoi/lecture des scores (rempli à l'étape 7)

  // === DEBUG ===
  toucheDebug: "d",         // Touche clavier pour activer/désactiver le mode debug
};
```

*(Note design à confirmer avec l'artiste : "énergie" est interprétée ici comme une jauge d'allure qui se vide et que les bonus rechargent — à 0 on ralentit. Les **3 vies** restent le vrai game over. Ajuste si l'intention était différente.)*

---

## 5. Contenu de jeu (décisions)

**Bonus (5 types)** — sprites + valeurs dans `config.js` :
Clémentine · Clavier · Sourire · Collier de perles · Étoile.

**Obstacles (3 types, improvisés Paris + logique du saut)** :
1. **Portière de voiture qui s'ouvre** — surgit sur les côtés → à **éviter en se déportant**.
2. **Piéton distrait qui traverse** — → à **éviter en se déportant**.
3. **Trottinette abandonnée / nid-de-poule au sol** — → à **sauter** (donne un rôle clair au bouton saut).

**Mode debug (point 3 du brief)** — touche `CONFIG.toucheDebug` :
- FPS, position (x, z) du joueur, segment courant.
- **Grille rythmique en surimpression** sur la route (lignes qui tombent sur chaque temps/mesure) pour valider le calage sur le BPM à l'œil, sur mobile.

---

## 6. Backend (score centralisé + dashboard)

Demandé : « un énorme back-end pour centraliser toutes les réponses, score, dashboard ».

**Recommandation : Supabase** (Postgres hébergé, API REST/PostgREST instantanée, dashboard de tables intégré, Row Level Security). Le plus rapide à monter en sessions courtes.

- **Identifiant joueur = pseudo Instagram** (handle public, ex. `@pmc.mp3`). **Pas d'email.**
- Table `scores` : `id`, `pseudo_insta`, `score`, `created_at`, `game_version`.
- Endpoint d'écriture (POST score) + lecture (top N classement).
- **Dashboard** : la console Supabase suffit au départ ; une page interne de classement peut venir ensuite.

**Anti-triche : AUCUN.** Décision figée : on ne se protège pas contre les scores falsifiés. Le backend **garde tous les scores** ; la vérification pour le concours se fait **au screenshot** envoyé par le joueur. → POST score simple, pas de HMAC ni de validation de replay.

**RGPD (on est à Paris) :** un pseudo Insta public reste une donnée personnelle, mais l'exposition est minimale (pas d'email, pas de contact direct). Prévoir une courte mention (usage : classement du concours) et une politique de suppression sur demande. Léger.

---

## 7. Image de partage (point 5 du brief)

- Canvas hors-écran **1080×1920**, **pixel art**, rendu **côté client** (rien côté serveur).
- Style **écran de fin de borne d'arcade années 80** : fond sombre, gros pixels, palette néon, titre **"LA VILLE EST BELLE"**, **SCORE**, **HIGH SCORE**, et le **lien** (linktr.ee/pmc.mp3).
- Export via **`canvas.toBlob()` + Web Share API niveau 2** (`navigator.share({ files: [...] })`) — supporté par Safari iOS. **Repli** : téléchargement de l'image si le partage de fichier n'est pas dispo.
- C'est **l'objet qui circule en story** : la soigner autant que le jeu.

---

## 8. Découpage en étapes (avec critères de validation)

À la **fin de chaque étape** : livrer un état précis « fait / reste à faire » pour permettre d'arrêter et reprendre sans perdre le fil (point 6 du brief).

- ✅ **Étape 0 — Fondations** — FAIT.
  `config.js` + `index.html` (canvas plein écran, viewport, safe-area) + Vite LAN (+ HTTPS mkcert) + boucle fixed-timestep + squelette debug (FPS).
  ✅ *Valide si* : page ouvrable depuis l'iPhone via l'IP locale, FPS affichés, 60/120 Hz stables.

- ✅ **Étape 1 — Route nue** *(point de départ demandé par l'artiste)* — FAIT.
  Moteur pseudo-3D : sol qui défile vers le point de fuite, vitesse de base, déport latéral (au clavier d'abord), **aucun asset**. Grille rythmique de debug en surimpression.
  ✅ *Valide si* : la route défile fluide sur iPhone, la direction répond, la grille s'affiche.

- ✅ **Étape 2 — Audio & synchro** — FAIT (+ fondu in/out et volume réglable, ajoutés sur demande).
  Web Audio, unlock iOS, calage `BPM/offset`, le monde **pulse au tempo**, la grille tombe pile sur les temps.
  ✅ *Valide si* : sur mobile, la grille de debug colle au beat du morceau du début à la fin.

- ✅ **Étape 3 — Le cycliste** — FAIT.
  **3 silhouettes proposées, lisibles à 32 px** (d'après la photo : cheveux bouclés, maillot rugby vert/blanc, à vélo) → l'artiste choisit. Intégration du sprite, réglage du feel (sensibilité, agressivité des virages), **gyroscope + bouton saut**.
  ✅ *Valide si* : l'avatar est reconnaissable à 32 px et pilotable au gyro sur iPhone.
  → **Silhouette B ("penché en avant") choisie et intégrée.** Gyro + bouton saut + feel branchés. Il manque encore : test réel sur iPhone (gyro nécessite HTTPS, voir §2/mkcert), vies (arrivent avec le gameplay étape 5).

- ✅ **Étape 4 — Paris** — FAIT (sauf vérif iPhone réel).
  Décor : ciel coucher de soleil 22 h, façades haussmanniennes éclairées orange, défilement latéral, ambiance.
  ✅ *Valide si* : l'univers est lisible et tient 60 fps sur l'iPhone de référence.
  → Fait : caméra, ciel dégradé, façades haussmanniennes détaillées (pierre/toit/fenêtres/cheminées) d'après références artiste, sol + bâtiments fondus dans une brume chaude cohérente à distance. 120 fps stable en preview mobile. Reste : vérif fps + rendu réels sur iPhone (seul point non encore validé sur vrai appareil).

- ✅ **Étape 5 — Gameplay** — FAIT.
  3 vies, 3 obstacles, 5 bonus (spawn calé sur les beats), énergie/drain, score, montée de vitesse, game over + fin de morceau = fin de parcours.
  ✅ *Valide si* : une partie complète est jouable de bout en bout avec score cohérent.
  → Testé en preview : collision obstacle (vie perdue) et ramassage bonus (score+50) confirmés. Pas encore testé sur iPhone réel.

- ✅ **Étape 6 — Habillage & concours** — FAIT (l'habillage ; le classement effectif arrive avec le backend, étape 7).
  Menu, écran-titre, écran de fin, CTA "aller écouter" (→ linktr.ee/pmc.mp3), logique dates d'ouverture/fermeture (toujours jouable, classement conditionné à la fenêtre).
  ✅ *Valide si* : les états s'enchaînent proprement, le CTA fonctionne.
  → Fait : titre intégré à l'écran de démarrage existant (pas de nouvel état), CTA DOM (vrai lien) visible démarrage + fin / caché en jeu, statut concours affiché sur l'écran de fin. Testé en preview mobile, aucune erreur. Reste : validation iPhone réel (comme tout le reste), classement effectif à l'étape 7.

- **Étape 7 — Backend & partage**
  Supabase (table `scores`, POST/GET), meilleur score, classement. **Image story 1080×1920 pixel art arcade** + Web Share.
  ✅ *Valide si* : un score remonte au backend et l'image se partage depuis Safari iOS.

- **Étape 8 — Polish, perf & livraison**
  Tests croisés **Safari/Chrome/Firefox (iOS + Android)**, budget perf, safe-areas, repli gyro, déploiement public **avant le 11/09/2026**.
  ✅ *Valide si* : jouable publiquement, fluide, sur les 3 navigateurs cibles.

---

## 9. Décisions verrouillées & points mineurs

**Verrouillé :**
- Identifiant = **pseudo Instagram**, pas d'email.
- **Aucun anti-triche** : le backend garde tous les scores, vérif concours = screenshot.
- **Silhouette cycliste = variante B, "penché en avant"** (choisie à l'étape 3 parmi 3 propositions). Intégrée dans `src/player.js`.

**Points mineurs (non bloquants) :**
1. **Interprétation "énergie"** vs 3 vies (cf. note §4) — défaut retenu : énergie = allure, vies = mort.
2. **Police définitive** : Helvetica pour l'instant (fournie plus tard).
3. **iPhone/Android minimum** à supporter : viser large (iPhone SE 2e gén. comme plancher perf raisonnable) — à confirmer.

---

## 10. Prochaine action

⚠️ **Cette section a été réécrite : elle décrivait encore l'étape 7 comme à venir alors que Supabase
est branché et que le jeu est en ligne.** Le passage sur le gyroscope est lui aussi périmé — le
gyroscope a été retiré (décision verrouillée, voir `CLAUDE.md`), tout se joue au geste.

Étapes 0 à 7 faites, le jeu est déployé et joué par des testeurs externes
(https://pmc-la-ville-est-belle.netlify.app). Le bloc « ⚠️ À savoir » plus haut garde les pièges
d'environnement déjà rencontrés : serveur de dev qui meurt régulièrement, IP locale à revalider,
preview partagée qui peut montrer le mode debug par erreur. Ajouter à cette liste : **la preview
navigateur ne peut pas jouer le jeu** — créer l'`AudioContext` y fait figer l'onglet, donc tout ce qui
touche à l'audio, à la pause ou à l'écran de fin se vérifie en prod sur téléphone, pas en preview.

**Priorité n°1 — les 3 retours de la vague 3, non corrigés** (reprise de pause qui rembobine le
morceau, classement absent de l'écran de fin, cyclistes NPC traversés sans effet). Diagnostic complet
et pistes dans « État d'avancement » en tête de document ; le 3e demande une décision produit de
l'artiste avant tout code.

Ensuite, dans l'ordre le plus efficace :
1. **Image de partage 1080×1920** — c'est la moitié de l'étape 7 qui n'a jamais été faite (les scores Supabase, eux, tournent). Le style est déjà arrêté : écran de fin de borne d'arcade 80s, voir §11 point 15.
2. **Les 4 chantiers lourds restants** issus du 1er playtest externe (DA cycliste, son dégradé sur le dernier cœur, événement « ATTENTION », pont) — à prioriser avec l'artiste, plusieurs sont encore bloqués sur une référence visuelle jamais reçue.
3. **Étape 8 — Polish/perf/livraison** en dernier, une fois le reste posé.

Livrer un état « fait / reste » à la fin de chaque étape, comme d'habitude.

---

## 11. Liste des assets créa à produire (remplacer le dessin procédural)

Demandé explicitement après avoir buté sur les limites du dessin procédural (rectangles/cercles en
Canvas) pour la roue de vélo et les cheveux bouclés du personnage. Tout ce qui suit est dessiné en
code aujourd'hui (aucun fichier image chargé dans le jeu) ; une fois les fichiers fournis, il reste un
travail de code pour les charger (`Image()` + `drawImage()`) à la place des fonctions de dessin
actuelles (`player.js`, `entities.js`, `world.js`, `road.js`). Format par défaut sauf mention contraire :
**PNG transparent, pixel art "dur"** (pas d'antialiasing/dégradés doux, cohérent avec le reste du jeu).

**Tailles indiquées = celles exploitées par le code aujourd'hui.** Si un format différent est produit,
il suffit de me donner les dimensions exactes retenues pour que je recale les constantes correspondantes
(`SPRITE_W`/`SPRITE_H`, `ICON_SIZE`, etc.) — pas besoin de coller pile aux chiffres ci-dessous.

1. **Personnage (cycliste)** — sprite **26 × 34 px** par frame, vu de dos, penché en avant. **4 frames minimum** (cycle de pédalage : jambe gauche haute → transition → jambe droite haute → transition), toutes alignées sur le même ancrage (bas centré = contact roue/sol, sinon ça "saute" en boucle une fois animé). Sprite sheet horizontal ou fichiers séparés. Palette actuelle à respecter si on garde la cohérence : cheveux `#241609`, peau `#c98a5b`, maillot vert `#2f7a46` / blanc `#f0ead9`, pantalon `#22242b`, pneu `#0e0e11`. Doit couvrir ce qui coince en procédural : cheveux bouclés bien identifiables, vraie roue de vélo visible (pas cachée sous le pantalon). Bonus : une 5e pose dédiée au saut (aujourd'hui, juste le même sprite décalé vers le haut).
2. **Bonus — clémentine** — icône **20 × 20 px**.
3. **Bonus — clavier** — icône **20 × 20 px**.
4. **Bonus — sourire** — icône **20 × 20 px**.
5. **Bonus — collier de perles** — icône **20 × 20 px**.
6. **Bonus — étoile** — icône **20 × 20 px**.
7. **Obstacle — portière de voiture** — icône **20 × 20 px**.
8. **Obstacle — piéton** — icône **20 × 20 px**.
9. **Obstacle — trottinette** — icône **20 × 20 px**.
   *(2 à 9 : même grammaire pixel art que le personnage, simples et lisibles à petite taille — ils défilent vite, calés sur les beats. 32×32 possible si tu veux plus de détail.)*
10. **Bâtiments (façades)** — **pas de taille fixe** : chaque bâtiment est généré avec une largeur/hauteur aléatoire (4 à 8 unités-monde de large, 9 à 22 de haut, converties en pixels écran selon la distance/perspective — ça défile en continu, jamais une taille figée). Deux options : **(a)** une texture **répétable**, ex. une tuile "un étage de fenêtres" ~**32 × 48 px**, qu'on répète pour remplir n'importe quelle taille de bâtiment ; **(b)** un jeu de 3 à 5 bâtiments à **taille fixe** (ex. 64×160, 64×220, 96×140 px) si tu préfères composer à la main et accepter moins de variété.
11. **Route et trottoirs** — même logique que les bâtiments (défilement continu, pas de taille fixe) : une texture tileable, par exemple une tuile **~64 × 64 px** (chaussée + marquage au sol) répétée en continu.
12. **Logo/titre "LA VILLE EST BELLE"** — pour l'écran d'accueil (étape 6, pas encore fait) et l'image de partage (étape 7). Pas de taille précise à donner encore, ça dépendra de la maquette de l'écran-titre.
13. **Icônes HUD "vie"** (optionnel) — actuellement de simples cercles dessinés (3 vies) — suggestion **16 × 16 à 24 × 24 px** par icône si on veut remplacer par un vrai motif (cœur, roue, etc.).
14. **Boutons SAUT / Rejouer** (optionnel) — actuellement du CSS pur, pas d'image — habillage visuel façon arcade si tu veux, sinon on garde tel quel.
15. **Image de partage** (étape 7, plus tard) — canvas **1080 × 1920 px**, style écran de fin de borne d'arcade 80s : cadre de borne, logo, zone score/high score. À détailler le moment venu (§7 du plan).

---

## Journal — Session du 24 août 2026 : « jeu infini » (grosse commande vocale)

**Contexte de la demande** : trois ou quatre joueurs ont atteint le score maximum théorique —
égalité en tête, le concours ne départage plus. L'artiste a dicté une refonte en une seule
commande vocale. Tout ce qui suit a été livré dans la session, vérifié en preview mobile
(375×812, `?debug`, zéro erreur console), puis déployé.

- ✅ **Le jeu devient INFINI** — « on peut supprimer le principe de la ligne d'arrivée, puisque
  le jeu va devenir infini ». Plus de ligne d'arrivée ni de séquence de fin (`finish.js` et le
  bloc `finishing` de main.js retirés, `finishTime()` renvoie `Infinity`) ; seule la mort
  termine une partie. Les créneaux se génèrent sans fin ; `dureeCourse` ne sert plus que de
  longueur de rampe de difficulté (au-delà : régime de croisière maximal constant).
- ✅ **Vitesse plafonnée, jamais dépassée** — « garde la vitesse d'accélération que tu as en
  place au moment de la ligne d'arrivée actuelle ». Rien à changer : `vitesseMax` était déjà
  atteinte vers ~102 s, avant l'ancienne arrivée à 143,5 s — le plafond existant EST la valeur
  demandée.
- ✅ **Chaque partie est différente** — graine aléatoire par course (`runSeed`/`reseed()`,
  entities.js, partagée avec crosstraffic.js). Le quota exact d'étoiles (diffusion d'erreur)
  est remplacé par un tirage au hash seedé suivant la même courbe de difficulté. ⚠️ Invariant
  « score max = nombre connu » supprimé sciemment : c'était le problème à résoudre.
- ✅ **Le morceau tourne en boucle** (audio.js) : `loop` sur la source, raccord arrondi à la
  MESURE (2 s à 120 BPM) pour que la grille rythmique des créneaux reste calée sur les temps à
  chaque tour ; plus de fondu de sortie programmé ; offset de reprise replié dans la boucle
  quand la course dépasse la durée du morceau (l'horloge de jeu, elle, reste continue).
- ✅ **Étoiles jamais au même endroit que les ponts/voitures** — garde côté bonus
  (`lanesBlockedByNeighbors`) : une étoile évite les voies des piliers de pont et des voitures
  à ±1 créneau. L'ancien `bridgeGuard` (le pont qui fuyait les bonus) est supprimé — deux
  gardes qui se déplacent l'une l'autre auraient bouclé. Autorité : voitures/ponts (tirage
  brut) > bonus (s'adapte) > piéton (s'adapte au bonus).
- ✅ **Étoile dorée enfin lisible** — « qu'il y ait marqué x2 sur l'étoile, ou qu'elle brille
  beaucoup plus » : les deux. Badge « ×2 » au-dessus de la pointe haute (qui ne tourne pas) +
  halo nettement renforcé et pulsant (entities-render.js).
- ✅ **Cadeau magique = +1 cœur** — bonus rare (7 % des créneaux étoile), n'apparaît QUE si un
  cœur manque au moment où le créneau se calcule (`setLives`, mémoïsé — un cadeau visible ne
  disparaît pas si un cœur revient). Aucun point, ne touche pas au combo. Boîte violette à
  ruban jaune + cœur + halo rose, popup « +1 VIE ». Vérifié par sonde : 0 cadeau à vies
  pleines, ~4/200 créneaux à 1 vie.
- ✅ **Beaucoup plus de vélos après 1 min 30** — `applyCyclistLateBoost()` : ×2,2 sur le poids
  `cycliste` à partir de 90 s, composé avec les boosts existants (renormalisation par
  `scaleWeights`, comme les autres).
- ✅ **Vague de 3 vélos toutes les ~45 s** — « trois vélos qui arrivent de manière un peu
  désynchronisée en même temps face à toi, pas en conflit avec des voitures ou un pont » :
  3 créneaux consécutifs forcés cycliste (~0,75 s d'écart = la désynchronisation), un par voie
  (permutation Fisher-Yates seedée par vague), et les créneaux ±1 convertis en cône s'ils
  tiraient voiture/pont. Vérifié par sonde : vague aux créneaux 120-122 sur voies 1/0/2,
  créneau 123 redevenu bonus.
- ✅ **Échap = pause sur ordinateur** (screens.js) : bascule ouvre/ferme le menu pause, inerte
  hors course (openPauseMenu se refuse si le bouton pause est caché). Vérifié : ouverture ET
  fermeture au clavier.
- ✅ **Vérifications en preview** : cycle menu → tutoriel (passé) → course → pause Échap →
  rejeu (graine différente confirmée : 518,5 → 616,5) → +160 s de course au-delà de l'ancienne
  arrivée (jeu toujours vivant, étoiles + traversantes) → mort forcée → panneau seconde chance
  (boucle du début OK). Aucune erreur console sur toute la session. ⚠️ Le décompte du panneau
  de mort reste figé dans la preview : l'onglet y est « caché » (comportement documenté, pas
  une régression).
- ✅ **Docs mises à jour** : CLAUDE.md (décisions verrouillées réécrites), ARCHITECTURE.md
  (encart « changement majeur du 24 août » en tête de §1 — les §5.2/5.4 n'ont pas été réécrits
  en profondeur, l'encart fait foi), config.js (commentaires dureeMorceau/dureeCourse/
  vitesseMax).
- ⚠️ **À savoir** : `share.js` affiche encore « x/y étoiles » mais n'est plus importé (mort
  depuis le 23 août) — pas touché. Le caméo Soberland d'arrivée n'apparaît plus (posé sur
  `finishTime()` = Infinity) ; celui du départ est intact. L'écran « Parcours terminé » et le
  badge « course parfaite » sont devenus inatteignables (toute partie finit par une mort) —
  code laissé en place, à nettoyer un jour si confirmé.
- ⚠️ **Classement Supabase à vider avant le lancement** : plus que jamais — les scores des
  anciens barèmes plafonnés n'ont plus de sens face à des scores infinis.

## Journal — Session du 24 août 2026 (après-midi) : retours de Pablo, premier béta-testeur

**Source** : conversation WhatsApp Paul ↔ Pablo transmise telle quelle, quelques heures après la
mise en ligne du jeu infini. Verdicts de Pablo : Échap ✓, random ✓, fondu de pause ✓, cadeau
+1 vie ✓, « le jeu est chaud là c'est parfait », AUCUNE situation impossible depuis le fix
anti-blocage (« je meurs parce que c'est dur, c'est un manque de skill »). Scores observés :
129 k (Pablo), 214 k (pikboum) — d'où l'urgence du plafond de combo.

- ✅ **Cadeaux plafonnés à 2 par partie** (`config.cadeauxMaxParPartie`) — « il y a beaucoup
  trop de cadeaux, t'es invincible ». Le taux ne change pas, le TOTAL est borné ; compte les
  cadeaux apparus (un raté consomme le budget). Mesuré : 2 pile sur 3 000 créneaux à 1 vie.
- ✅ **Combo plafonné à ×5** (`config.comboMultiplicateurMax`) — demande de Paul : « il faut
  réduire le combo, sinon on va avoir des scores à des millions ; 500 000 doit être ultra
  difficile ». ×5 à 40 étoiles d'affilée, ~30 k/min en jeu parfait → 500 k ≈ 15 min sans
  faute. Le popup COMBO se tait une fois le plafond atteint.
- ✅ **Pluie d'étoiles** (idée de Pablo, validée) : à 50/100/150… étoiles ramassées d'affilée,
  ~10 s de route tout en étoiles, sans obstacles de grille (traversantes conservées), posée
  hors champ puis sortie de la brume. Popup « PLUIE D'ÉTOILES ! » + long arpège. Vérifié en
  jeu : 8 créneaux étoile consécutifs à l'écran pile sur la fenêtre, reprise normale après.
  L'idée jumelle (bonus de streak à la mort) écartée — remplacée par celle-ci par son auteur.
- ✅ **Easter egg 500 000 câblé, EN ATTENTE DU FICHIER** : vocal de PMC par-dessus le morceau
  écarté en sidechain (audio.js, playVoiceClip), une fois par partie, préchargé à 80 % du
  seuil. ⚠️ Paul doit livrer l'enregistrement → `public/assets/easter-500k.mp3`, puis
  redéployer. Absent = inactif en silence.
- ✅ **Garde-fou technique** : le tirage de base des créneaux est désormais mémoïsé
  (`baseContentAt`, entities.js) — la garde pont sondait les voisins hors cache et aurait
  fait décompter plusieurs fois le même cadeau du budget.
- ⚠️ **Nettoyage classement demandé par Paul** (comptes multiples de Pablo) : `Ppoz53`
  (163 113), `Pab` (105 226), `maman2pmc` (105 226) — plus `zz_test` (385, ligne de test de
  cette session). Vérifié : la clé anon NE PEUT PAS supprimer (RLS, DELETE renvoie 200 avec 0
  ligne). À faire par Paul dans Supabase (SQL Editor) :
  `delete from scores where pseudo in ('Ppoz53','Pab','maman2pmc','zz_test');`
  Le reste du classement ne doit PAS être touché (consigne explicite).

## Journal — 24 août 2026 (soir) : fausse alerte sur le tunnel de conversion

**Signalement** : « tu as fait sauter une clause hyper importante — pré-save à la 1re relance,
abonnement à la 2e, +10 % de boost ». Capture d'écran à l'appui : la carte de mort ne montre
aucun lien Spotify.

- ✅ **Vérifié bout en bout : RIEN n'avait sauté.** Test sur un joueur neuf (localStorage vidé) :
  mort → CONTINUER → le tiroir s'ouvre sur « Pré-sauvegarde l'album » (`lienPresave`) ; clic →
  `morceauOuvert=1` + boost fan ×1,1 acquis ; relance suivante → « Abonne-toi à PMC »
  (`lienSuivre`, vrai profil Spotify). Idem sur REJOUER, carte de mort ET écran de fin.
- 🔍 **Cause du malentendu** : l'artiste a cliqué ses propres liens des dizaines de fois en
  testant → `niveauConversion()` renvoie « libre » sur SON téléphone → le tiroir ne s'ouvre plus
  jamais chez lui (comportement voulu depuis le 23 août). La carte de mort nue qu'il voyait est
  le design verrouillé de la quatrième passe : elle pose le choix, la demande vient AU TAP.
- ⚠️ **Piège de méthode à retenir** : un premier test avait « prouvé » le bug en lisant
  `#gate-title` — qui contenait « Pré-sauvegarde l'album »… parce que c'est le texte STATIQUE
  d'`index.html`. Le clic n'avait rien déclenché (panneau pas encore ouvert, `reviveCallbacks`
  null). Toujours vérifier la classe `visible` ET un champ que seul le JS peut écrire (ici
  `href`, `#` en statique) avant de conclure.
- ✅ **Ajouté : `?neuf` dans l'URL** remet les deux paliers de conversion à zéro (et rien
  d'autre — pseudo/insta/`partiesJouees` conservés), pour que l'artiste puisse revoir le tunnel
  depuis son propre téléphone sans vider son navigateur.

## Journal — 24 août 2026 (soir, 2e passe) : le palier 2 « existe-t-il ? »

**Signalement** : « j'ai fait la pré-sauvegarde, mais le "Abonne-toi à PMC", je ne vois pas où
il est — j'ai l'impression qu'il n'existe pas dans ta chaîne ».

- ✅ **Vérifié : le palier 2 existe et fonctionne.** Chaîne complète rejouée bout en bout sur un
  joueur neuf, journal à l'appui : (1) CONTINUER → « Pré-sauvegarde l'album » / `lienPresave` ;
  (1b) clic → `morceauOuvert=1` ; (2) REJOUER → « **Abonne-toi à PMC** » / vrai profil Spotify ;
  (2b) clic → `pmcSuivi=1` ; (3) REJOUER suivant → **aucun tiroir**, la course part au premier
  tap. Capture d'écran du palier 2 à l'appui.
- 🐛 **Bug RÉEL trouvé et corrigé — `?neuf` restait dans l'URL.** Le drapeau ajouté quelques
  heures plus tôt rejouait sa remise à zéro à CHAQUE rechargement de la page tant qu'il était
  dans la barre d'adresse — retour de Spotify compris. Un joueur qui franchissait le palier 1
  puis revenait dans le jeu voyait donc son palier effacé et le tunnel tourner en rond sur
  « Pré-sauvegarde l'album », sans jamais atteindre le palier 2. C'est très probablement ce qui
  a été vécu. ✅ Le drapeau se retire maintenant de l'URL dès qu'il est consommé
  (`history.replaceState`).
- ✅ **Palier 2 = promesse de parties illimitées** (demandé) : « Dernière étape : abonne-toi à
  PMC sur Spotify et rejoue autant que tu veux. »
- ✅ **`conversion=` ajouté à l'overlay `?debug`** (presave/suivre/libre) : sur téléphone, c'est
  la seule façon de distinguer « tunnel cassé » de « ce navigateur a déjà tout franchi ». Les
  deux fausses alertes de la journée venaient exactement de cette confusion.

## Journal — 24 août 2026 (soir, 3e passe) : sparkles au ramassage + audit des stats

- ✅ **Sparkles au ramassage** (demandé : « super petit, léger — ça montre qu'on a bien pris un
  truc », référence Mario Sunshine) : 5 étincelles à 4 branches, additives, 0,45 s, semées à la
  position écran du buste du joueur. Elles vivent en espace ÉCRAN (pas dans le monde) : ce n'est
  pas un objet de la scène, il ne doit ni défiler ni passer derrière une voiture. Le cadeau
  magique en sème aussi, en rose.
  - ⚠️ **Calibrées à l'écran, pas au jugé** : la première version (r 3,5-7 px, dispersion 6-16 px)
    était littéralement INVISIBLE — noyée dans le sprite. Constaté en composant un burst sur une
    vraie frame de jeu et en le figeant en overlay DOM. Portées à r 5-9 px, dispersion 10-32 px.
  - ⚠️ **Piège d'environnement à connaître** : dans le panneau de preview, `requestAnimationFrame`
    ne tourne QUE pendant une capture d'écran — le jeu est gelé entre deux commandes, et une
    capture fait avancer ~15-35 s de temps de jeu d'un coup. Un effet de 0,45 s est donc
    IMPOSSIBLE à attraper sur une capture. D'où la méthode retenue : composer l'effet sur un
    instantané du canvas et le figer dans une balise <img> hors du canvas. (C'est aussi ce qui a
    fait croire, pendant une demi-heure, que les ramassages ne fonctionnaient plus : le jeu était
    simplement en pause, `document.hidden` étant vrai.)
- 📊 **Audit des données Supabase** (à la demande de l'artiste) : 1 670 courses enregistrées,
  364 pseudos classés, du 21/08 09h37 au 24/08 19h55. Détail dans la réponse de session.
- 🐛 **TROUVÉ : la table `clics_ep` N'EXISTE PAS** côté Supabase — la migration
  `supabase-migration-compteur-clics-ep.sql` (écrite le 23 août) n'a jamais été exécutée. Le jeu
  appelle `net.postClicEP()` depuis 4 emplacements et l'appel échoue en silence (net.js
  n'exception jamais, par conception). **Aucun clic vers le smartlink n'a donc jamais été
  compté** — le funnel jeu → morceau est aveugle depuis le début. Migration à exécuter.

## Journal — 24 août 2026 (nuit) : le classement a disparu de l'écran de fin

**Symptôme** : plus aucun classement en fin de partie.

- 🔍 **Diagnostic** : `scores_public` répond **HTTP 200 avec `[]`** (0 ligne), alors que la table
  `courses` continue de grossir (1 670 → 1 927 pendant le diagnostic : les gens jouent). Donc ni
  panne réseau, ni projet Supabase en pause, ni concours fermé (`contestStatus()` est bien
  `open`, dates 17/08 → 11/10).
- 🔍 **L'écriture des scores fonctionne** : un POST identique à celui de `net.js`
  (`Prefer: return=minimal`) renvoie **201**. ⚠️ Les 401 obtenus avec `return=representation` /
  `return=headers-only` sont un FAUX POSITIF de diagnostic : sous PostgreSQL, un
  `INSERT ... RETURNING` exige que la ligne passe aussi la policy SELECT — or elle a été retirée
  VOLONTAIREMENT sur `scores` (l'Insta doit rester privé, voir migration pseudo-insta). Ne pas
  « réparer » ça : c'est le design.
- 🎯 **Cause la plus probable : la vue `scores_public` est passée en `security_invoker = on`.**
  Dans ce mode la vue applique la RLS de l'APPELANT (anon), qui n'a précisément pas le droit de
  lire `scores` → la vue renvoie vide pour tout le monde, alors que les données sont intactes.
  C'est exactement ce que propose le « Security Advisor » de Supabase quand on ouvre le
  dashboard — et le dashboard a été ouvert ce jour-là pour supprimer les comptes multiples.
  Correctif : `alter view public.scores_public set (security_invoker = off);`
- ✅ **Rendu VISIBLE côté jeu** : nouvelle ligne `classement=` dans l'overlay `?debug` (nombre de
  lignes reçues, ou la raison de l'échec). Un classement vide et un classement en erreur sont
  indiscernables à l'écran — le bloc est masqué dans les deux cas — et c'est ce qui a laissé la
  panne invisible pendant des heures. Même intention que la ligne `conversion=`.
- ⚠️ **Lignes de test à supprimer** (créées pendant ce diagnostic) : `zz_diag`, `zz_a`, `zz_b`,
  `zz_c`, `zz_head`, plus `zz_test` d'une session précédente.

---

## 4 septembre 2026 — audit du jeu (transition, écrans, police, couleurs)

Demandé : « faire un audit du jeu vidéo pour voir tous les problèmes [...] revoir la transition
entre la fin du tutoriel et le début de la partie ; revoir les écrans de menus, ils font très AI
slop ; la police : il faut de l'Alphabetica ; revoir les couleurs ». Plus dix idées de vidéos Insta.

- ✅ **Transition tuto → course refaite** (voir `ARCHITECTURE.md` §11, trentième passe) : grille
  des créneaux enfin calée sur les temps du morceau (mesuré 0,126 s de décalage avant, 0,000 après),
  décompte « 3, 2, 1, GO » sur les temps, consigne du tuto masquée net, plus de saut du décor
  (`road.markCourseStart()`).
- 📋 **Écrans, police, couleurs** : audit livré (rapport du 4 septembre), rien d'implémenté — la
  refonte dépend de deux décisions de l'artiste : les fichiers de la police Alphabetica (absente
  du disque : seuls Flawsome et Stage Grotesk existent dans `public/fonts/`), et la direction
  « la scène est l'écran » (panneaux sombres translucides, plus de carte crème/bord brun).
- ⚠️ Vue « Règles & points » de la pause : texte OBSOLÈTE (parle encore d'« ajouter le morceau
  pour reprendre », modèle du 22 août ; ignore le plafond ×5 du combo, la pluie d'étoiles, les
  cadeaux) — à réécrire avec la refonte des écrans.

## 4 septembre 2026 (suite) — UI e-card, graffiti au sol, jeu n°2 « J'ai un pote »

- ✅ **UI des deux jeux calée sur l'e-card** (blanc, serif condensée Source Serif Black,
  stickers rouges, boutons rectangulaires). « PMC » à côté du titre retiré le jour même.
- ✅ **Graffiti « la ville est belle » sur la chaussée à 30 s** de course (`src/graffiti.js`,
  WebP 52 Ko chargé 12 s avant, rendu en 28 bandes projetées).
- ✅ **« J'ai un pote », V1 locale** (voir `ARCHITECTURE.md` §14) : décisions prises seul là où
  l'artiste a dit « je te laisse faire » — paliers croissants, score en mètres, coût 1/2/3 potes,
  pas de changement de voie (tap court / tap long seulement), potes qui tombent du ciel, Soberland
  en premier, villages Moyencourt (80) / La Frette (38) / Cysoing (59) / Val-de-Virieu (38) /
  Bizonnes (38). Déployé sous /jai-un-pote/ pour test sur téléphone, sans Supabase.
- 📋 Idées de scripts vidéo notées (top 10 des pires scores commenté, « 80 % des gens n'y
  arrivent pas », 50 villes) : à traiter après le test du jeu.
