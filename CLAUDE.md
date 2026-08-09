# CLAUDE.md — La ville est belle (jeu de campagne PMC)

## Avant toute chose
**Lis `PLAN-ACTION.md` en entier.** C'est le brief figé et le découpage en étapes. Tu construis dans l'ordre des étapes, en livrant à chaque fin d'étape un état « fait / reste à faire ».

## Résumé
Runner mobile **type Subway Surfers** (caméra derrière le cycliste), **coucher de soleil parisien 22 h**, calé sur le morceau *La ville est belle* (dans `assets/`). Le jeu doit **donner envie d'aller écouter le morceau**. Cible : **navigateur mobile, Safari iOS en priorité**, puis Chrome & Firefox iOS/Android. **Portrait natif.**

## Règles techniques non négociables
- **Vanilla JS + Canvas 2D + Vite.** Pas de framework lourd (React…).
- **Boucle à pas de temps fixe** (60 **ou** 120 Hz mobile) ; horloge maîtresse = **Web Audio API**.
- **`config.js` à la racine = SEUL fichier de réglages**, en lecture seule, jamais de logique de jeu dedans.
- Serveur de dev **accessible sur le LAN** : `vite --host`. Le partage de fichier (étape 7) exige **HTTPS** → certif local `mkcert` ou tunnel pour tester cette brique sur iPhone.
- **iOS** : `AudioContext` se débloque **sur geste utilisateur** uniquement.

## Décisions verrouillées
- Contrôle : **bande de pilotage tactile en bas d'écran** (revenu en arrière sur le gyroscope, retiré — demandé explicitement après plusieurs sessions à en fiabiliser la permission iOS) + **bouton saut** (réintroduit visible : nécessaire aux bonus aériens, voir ci-dessous).
- Parcours **fini** = durée du morceau (~257,9 s). **120 BPM**, offset ~0,01 s.
- **3 vies**, **3 obstacles**, **5 bonus** (clémentine, clavier, sourire, collier de perles, étoile).
- Backend **Supabase**, identifiant = **pseudo Instagram**, **aucun anti-triche**.
- Image de partage **1080×1920 pixel art borne arcade 80s**.
- CTA → **https://linktr.ee/pmc.mp3**

## Assets fournis
- `assets/la-ville-est-belle.mp3` → à servir en prod (léger). Chemin déjà câblé dans `config.js`.
- `assets/la-ville-est-belle-MASTER.wav` → master interne (ne pas servir tel quel).

## Skills Claude Code à utiliser
- **`run`** : pour lancer et piloter le jeu (serveur Vite), le voir tourner et le screenshotter à chaque itération.
- **`web-perf`** : pour auditer la perf mobile (LCP/INP/CLS, blocages) — important, la cible est le mobile.
- Pour tester le rendu mobile : les outils de preview navigateur + `resize_window` en preset **mobile** (375×812) et **dark**.

## Méthode de travail
- Sessions courtes. À la fin de **chaque étape** : dire précisément **où on en est** et **ce qui reste**.
- L'état d'avancement réel (étapes faites, étape en cours, prochaine action) est dans `PLAN-ACTION.md`, section « État d'avancement » en tête de fichier. Toujours la lire avant de démarrer une session : ne jamais supposer l'étape en cours depuis ce fichier-ci.
