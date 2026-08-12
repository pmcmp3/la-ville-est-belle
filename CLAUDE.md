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

En ligne : **https://pmc-la-ville-est-belle.netlify.app** (officiel, `lienEP`/CTA pointent ici).
Miroir de secours (crédits Netlify épuisés le 12 août 2026) :
**https://pmcmp3.github.io/la-ville-est-belle/** — voir `ARCHITECTURE.md` §9 pour la mise à jour
(pas automatique, à repousser à la main).

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
- Parcours **fini** : il s'arrête après **343 objets** (~257,3 s), soit toute la durée du
  morceau (257,9 s, ~0,6 s de marge) — renversement du 12 août 2026 (c'était 300 objets/225 s,
  la musique continuait après la ligne). **120 BPM**, offset ~0,01 s.
- **3 vies**, **5 obstacles**, **5 bonus**.
  - Bonus : `cd`, `piano`, `appareil`, `collierPerles`, `guitare` (les deux derniers sont aériens).
  - Obstacles : `voiture` (choc fatal), `cycliste`, `pieton`, `cone`, `pont` (choc fatal).
  - ⚠️ **3 → 4 obstacles** : le cycliste en sens inverse a été promu de décor à vrai obstacle
    (« on fait en sorte que les cyclistes deviennent tous des obstacles »).
  - ⚠️ **4 → 5 obstacles** : `pont` (viaduc du métro parisien) ajouté — bloque 2 ou 3 voies sur 4
    à la même profondeur (2 voies ouvertes en début de course, 1 seule en fin de course).
  - Voiture et cône se franchissent au saut ; cycliste et piéton se contournent
    **latéralement uniquement** (`UNJUMPABLE_KINDS` dans `entities.js`).
  - ⚠️ **Le pont est un cas à part, revu le 12 août 2026** : sauter y est TOUJOURS dangereux,
    même dans la voie ouverte (la poutre est basse) — le seul obstacle où `inAir` aggrave le
    risque au lieu de le neutraliser. Passer sous un pont exige de rester au sol dans la bonne
    voie. Choc fatal comme la voiture (`game.lives = 0` dans `main.js`), pas seulement −1 vie.
- **200 étoiles exactement** par partie : le score maximum doit être un nombre connu.
- Backend **Supabase**. Identité = **pseudo public + Insta privé** (les deux obligatoires).
  **Aucun anti-triche** : la vérité du concours se fait au screenshot.
- Image de partage **1080×1920 pixel art borne arcade 80s** — pas encore faite.
- CTA « aller écouter » : **c'est `config.js` (`lienEP`) qui fait foi**, pas ce fichier.

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
