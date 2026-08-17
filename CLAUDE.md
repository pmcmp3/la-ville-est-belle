# CLAUDE.md — La ville est belle (jeu de campagne PMC)

## Avant toute chose

**Lis `ARCHITECTURE.md` en entier.** C'est la doc technique : comment le jeu est construit, les
cinq concepts à comprendre avant de toucher au code, les pièges déjà rencontrés, l'état des
bugs ouverts. C'est le seul fichier obligatoire.

**Ne lis `PLAN-ACTION.md` que si tu cherches *pourquoi* une décision a été prise.** C'est un
journal de bord chronologique de 850+ lignes, utile en archéologie, coûteux à lire en entier —
et sa section « État d'avancement » fait double emploi avec `ARCHITECTURE.md` §11.

## Résumé

Runner mobile **type Subway Surfers** (caméra derrière le cycliste), **coucher de soleil parisien
22 h**, calé sur le morceau *La ville est belle* (dans `assets/`). Le jeu doit **donner envie
d'aller écouter le morceau** — c'est l'objectif produit, et il tranche tous les arbitrages de
design. Cible : **navigateur mobile, Safari iOS en priorité**, puis Chrome & Firefox iOS/Android.
**Portrait natif.**

En ligne (seul site, officiel) : **https://pmcmp3.github.io/la-ville-est-belle/**. **Netlify est
abandonné** (décision du 12 août 2026, crédits épuisés) — ne plus le mentionner comme cible, ne
plus lancer `netlify deploy`. Mise à jour du site **pas automatique** : après chaque build, il
faut repousser la branche `gh-pages` à la main, voir `ARCHITECTURE.md` §9. Le CTA « aller
écouter » dans le jeu est un lien différent (le morceau, pas le jeu) : voir `config.js`
(`lienEP`), qui fait foi.

## Règles techniques non négociables

- **Vanilla JS + Canvas 2D + Vite.** Pas de framework, pas de moteur 3D, aucune dépendance runtime.
- **Boucle à pas de temps fixe** (120 Hz) ; horloge maîtresse = **Web Audio API**.
- **`config.js` à la racine = SEUL fichier de réglages**, jamais de logique de jeu dedans.
- Serveur de dev **accessible sur le LAN** (déjà configuré, `npm run dev` suffit).
- **iOS** : `AudioContext` se débloque **sur geste utilisateur** uniquement, dans la pile d'appel
  du geste.

## Décisions verrouillées

- **Contrôle 100 % au geste**, aucun contrôle à l'écran : swipe gauche/droite = une voie,
  swipe haut = saut, swipe bas = glissade rapide. **Le gyroscope a été retiré** après plusieurs
  sessions à fiabiliser la permission iOS — ne pas le réintroduire.
- Parcours **fini** : la ligne d'arrivée arrive quand le morceau atteint **`config.dureeCourse`
  (143,5 s, "02:23,5")**, PAS à la fin du morceau. 205 s → 143,5 s le 17 août 2026 (×0,7,
  « course trop longue », demandé explicitement) — avant ça, deuxième renversement du 12 août
  2026 (c'était d'abord 343 objets/257,3 s calé sur toute la durée du morceau, 257,9 s de
  musique). Le morceau, lui, continue de jouer jusqu'à sa fin réelle (`dureeMorceau`) pendant
  que le joueur est déjà sur l'écran de fin (~114 s de marge désormais, contre ~53 s avant) —
  cohérent avec l'objectif "donner envie d'écouter le morceau". `TOTAL_OBJECTS` (entities.js)
  dérive de `dureeCourse`, pas de `dureeMorceau`. **120 BPM**, offset ~0,01 s.
- **3 vies**, **5 obstacles**, **5 bonus**.
  - Bonus : `cd`, `piano`, `appareil`, `collierPerles`, `guitare` (les deux derniers sont aériens).
  - Obstacles : `voiture` (choc fatal), `cycliste`, `pieton`, `cone`, `pont` (choc fatal).
  - ⚠️ **3 → 4 obstacles** : le cycliste en sens inverse a été promu de décor à vrai obstacle
    (« on fait en sorte que les cyclistes deviennent tous des obstacles »).
  - ⚠️ **4 → 5 obstacles** : `pont` (viaduc du métro parisien) ajouté — bloque 2 ou 3 voies sur 4
    à la même profondeur (2 voies ouvertes en début de course, 1 seule en fin de course).
  - Voiture, cône **et cycliste** se franchissent au saut ; seul le piéton se contourne
    **latéralement uniquement** (`UNJUMPABLE_KINDS` dans `entities.js`). ⚠️ Le cycliste en est
    sorti le 12 août 2026 (demandé explicitement, il y était depuis sa promotion en obstacle) —
    ne pas le réintroduire dans `UNJUMPABLE_KINDS` sans redemander.
  - ⚠️ **Intensification des vélos en fin de partie** (demandé le 12 août 2026) : au-delà de
    **10 000 points**, le poids `cycliste` est doublé puis la table renormalisée
    (`CYCLIST_BOOST_SCORE`/`CYCLIST_BOOST_FACTOR`, `entities.js`) — seule donnée de ce fichier qui
    dépend du GAMEPLAY (score) plutôt que d'un hash pur par index de créneau, voir
    `ARCHITECTURE.md` §5.2.
  - ⚠️ **Le pont est un cas à part, revu le 12 août 2026** : sauter y est TOUJOURS dangereux,
    même dans la voie ouverte (la poutre est basse) — le seul obstacle où `inAir` aggrave le
    risque au lieu de le neutraliser. Passer sous un pont exige de rester au sol dans la bonne
    voie. Choc fatal comme la voiture (`game.lives = 0` dans `main.js`), pas seulement −1 vie.
  - ⚠️ **Intensification voitures/vélos à ~1/3 de course** (demandé le 13 août 2026, retour ami ;
    facteurs intensifiés et seuil rescalé le 17 août 2026) : à partir de **63 s**
    (`CAR_TIME_BOOST_TIME_S`, `entities.js` — 90 s à l'origine, rescalé ×0,7 avec `dureeCourse`
    pour se déclencher au même moment RELATIF du parcours), le poids `voiture` est multiplié par
    **2,5** (2 avant) et le poids `cycliste` par **1,6** (1,3 avant), puis la table est
    renormalisée. Déclenché par le TEMPS écoulé, contrairement au boost vélo à 10 000 points
    ci-dessus (déclenché par le SCORE) — reste donc une fonction pure de `slotIndex`, pas une
    exception au modèle décrit en `ARCHITECTURE.md` §5.2. Les deux boosts vélo se cumulent si
    score ET temps sont franchis (jusqu'à **×3,2**, contre ×2,6 avant).
- **140 étoiles exactement** par partie (200 avant le 17 août 2026) : le score maximum doit être
  un nombre connu — réduit à la MÊME proportion que le raccourcissement du parcours (×0,7, 205 →
  143,5 s) pour ne pas casser le calcul de quota exact (voir `entities.js`, `BONUS_RATIO_START`).
  `TOTAL_OBSTACLES` (= `TOTAL_OBJECTS` − `TOTAL_STARS`) vaut maintenant 51 (100 avant, voir
  `ARCHITECTURE.md` §5.4) — la part d'obstacles en FIN de course a en plus été doublée
  (`BONUS_RATIO_END` 0,92 → 0,84, « plus d'obstacles quand ça avance », demandé le 17 août 2026).
- **Ligne d'arrivée en volume** (`finish.js`) : damier au sol + portique (deux pylônes + poutre à
  damier qui enjambe la route), façon Formule 1 — demandé explicitement le 12 août 2026 pour
  remplacer le simple damier plat d'origine.
- Backend **Supabase**. Identité = **pseudo public + Insta privé** (les deux obligatoires).
  **Aucun anti-triche** : la vérité du concours se fait au screenshot.
- Image de partage **1080×1920 pixel art borne arcade 80s** — pas encore faite.
- CTA « aller écouter » : **c'est `config.js` (`lienEP`) qui fait foi**, pas ce fichier.
- **3 voies** (`LANE_COUNT`, `road.js`) — 4 avant le 17 août 2026, demandé explicitement. Route
  physique inchangée (`ROAD_HALF_WIDTH`), voies plus larges. Seul ajustement de logique exigé : les
  rangées de 3 voitures (`entities.js`) auraient occupé les 3 voies à la fois, retirées.
- **Combo** (demandé le 17 août 2026) : `comboSeuil`/`comboBonusParPalier` (`config.js`) — 5 étoiles
  ramassées d'affilée (sans toucher d'obstacle entre-temps) → ×1,5 sur les points de bonus, 10 → ×2,
  15 → ×2,5, etc. Remis à 0 au moindre obstacle touché. `main.js` (`comboMultiplier()`), affiché en
  jeu sous le score (`hud.js`) quand actif.

## Assets

- `assets/la-ville-est-belle.mp3` → servi en prod (3,9 Mo, 128 kbps). Câblé dans `config.js`.
- `assets/la-ville-est-belle-MASTER.wav` → master interne, **ne jamais servir tel quel** (65 Mo).

## Outils

- **`run`** : lancer et piloter le jeu, le voir tourner, le screenshotter à chaque itération.
- **`web-perf`** : auditer la perf **runtime** (fps, coût de rendu). ⚠️ Inutile pour le poids :
  le bundle fait 17 Ko gzippé contre 3,9 Mo de MP3, il n'y a rien à gagner côté code.
- Preview navigateur + `resize_window` en preset **mobile** (375×812) et **dark**.
- ⚠️ **La preview ne peut pas jouer le jeu** (créer l'`AudioContext` fige l'onglet). Voir
  `ARCHITECTURE.md` §12 pour les deux méthodes de test qui marchent.

## Méthode de travail

- Sessions courtes. À la fin de chaque chantier : dire précisément **ce qui est fait** et **ce
  qui reste**, sans enjoliver.
- **Mesurer avant de conclure.** Plusieurs bugs sérieux de ce projet étaient invisibles en
  jouant et n'ont été trouvés qu'en comptant (distribution d'obstacles, quota d'étoiles).
- Quand un correctif touche à la vitesse, à l'horloge ou au spawn : relire `ARCHITECTURE.md` §5
  d'abord. C'est là que sont les invariants qui cassent en silence.
- Tenir `ARCHITECTURE.md` à jour quand un invariant, un piège ou un bug ouvert change.
  Les décisions et l'historique vont dans `PLAN-ACTION.md`.
