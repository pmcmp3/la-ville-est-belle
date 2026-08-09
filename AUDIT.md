# AUDIT — La ville est belle

Audit read-only exécuté depuis `BRIEF-AUDIT.md`. Aucun fichier du projet n'a été modifié. Vérifications empiriques faites via lancement du serveur de dev en lecture (preview mobile 375×812, dark) : capture d'écran, console, réseau — pas d'exécution de code modifiant l'état du jeu.

---

## 1. Synthèse

Aucun contrôle de version : le projet est à 6 étapes de développement sans un seul commit Git — tout le travail déjà fait est irréversible, et sans `.gitignore`, le premier `git init` embarquerait un WAV de 65 Mo et `node_modules/`.

Pas de mode debug capable de forcer un état : chaque test d'un écran de fin exige de rejouer 257,9 secondes réelles ou de perdre 3 vies pour de vrai (vérifié empiriquement : le mode debug actuel n'affiche que FPS/position/grille, aucune commande d'état trouvée). Ça va coûter cher aux étapes 6/7/8, qui se jouent presque toutes en fin de partie.

`CLAUDE.md:35-36` et `KICKOFF.md` donnent tous les deux l'instruction périmée « commence à l'étape 0 » alors que le projet est aux étapes 6+ — signature d'un contexte agentique qui n'a pas suivi l'avancement réel, alors même que `PLAN-ACTION.md` est resté, lui, d'une précision remarquable (sa cartographie de fichiers colle exactement à ce qui existe sur disque).

---

## 2. Cartographie

**Volume** (hors `node_modules/`) : 9 fichiers `src/` = 1634 lignes JS. Le plus gros : `main.js` (457 l., 28 % du total). Le plus petit : `clock.js` (40 l.). Racine : `config.js` (61 l.), `index.html` (158 l.), `vite.config.js` (20 l.), `CLAUDE.md` (37 l.), `KICKOFF.md` (25 l.), `PLAN-ACTION.md` (398 l.).

**Stack** : JS vanilla (ES modules), Canvas 2D, Vite 6.4.3 comme unique dépendance (devDependency). Aucun framework, aucune lib runtime, aucun gestionnaire d'état externe. `type: "module"` dans `package.json`.

**Points d'entrée** : `index.html` charge `/config.js` (script classique → `window.CONFIG` gelé) puis `/src/main.js` (type module), qui importe tous les autres modules de `src/`.

**Boucle de jeu réelle** : `main.js:433-457`, fonction `frame(nowMs)` — accumulateur à pas fixe `FIXED_DT = 1/120` (`main.js:13`), `step(dt)` (`main.js:166-230`) appelée en boucle tant que l'accumulateur dépasse `FIXED_DT`, puis `render(alpha)` (`main.js:400-428`) une fois par frame avec interpolation. État de jeu : objet module-scope `game` (`main.js:108-114` : lives/energy/score/ended/endReason) et `playerState` (`main.js:88-96`). Pas de state machine formelle — deux booléens (`gameStarted`, `game.ended`).

**Écrans** : 3, confirmés à la fois par lecture du code et par capture d'écran réelle (preview mobile) — démarrage (`renderStartPrompt`, `main.js:260-282`), en jeu (HUD + indicateur gyro), fin (`renderEndScreen`, `main.js:376-391`, 2 variantes game over/parcours terminé via `endReason`).

**Terminé** : étapes 0 à 5 (fondations, route, audio/synchro, cycliste, décor Paris, gameplay) selon `PLAN-ACTION.md:12-37`, vérifié cohérent avec le code présent sur disque (voir axe A).

**En chantier** : rien d'actif au moment de l'audit. `hud.js`, `share.js`, `net.js` — prévus par `PLAN-ACTION.md:168-170` pour les étapes 6/7 — confirmés absents du disque.

**Mort** : `KICKOFF.md` — prompt de kick-off à usage unique, jamais référencé par `CLAUDE.md` ni `PLAN-ACTION.md`, contenu entièrement périmé. `.claude/settings.local.json` — 4 permissions Bash liées à une analyse ponctuelle du WAV maître (numpy/librosa/scipy/ffprobe, voir axe A), sans utilité une fois les valeurs figées dans `config.js`.

---

## 3. Constats par axe

### A. Contexte agentique

**`CLAUDE.md:35`** — « Commence par Étape 0 (fondations) + Étape 1 (moteur de route nu) ». Périmé : `PLAN-ACTION.md:12-37` montre les étapes 0 à 5 terminées, et `PLAN-ACTION.md:347-365` (§10, « Prochaine action ») donne la vraie prochaine action (test iPhone réel, puis étape 6).
Gravité : moyenne. Effort : trivial (réécrire 2 lignes). Coût de l'inaction : une session qui suit `CLAUDE.md` à la lettre sans croiser `PLAN-ACTION.md` en détail risque de repartir sur des fondations déjà posées.

**`CLAUDE.md:36`** — « À l'Étape 3, proposer 3 silhouettes de cycliste... » : même défaut, la silhouette B est choisie et intégrée depuis longtemps (`PLAN-ACTION.md:16`, `PLAN-ACTION.md:338`).
Gravité : moyenne. Effort : trivial. Coût : idem ci-dessus.

**`KICKOFF.md`** (fichier entier) — donne littéralement la même instruction périmée que `CLAUDE.md:35`, en étant en plus totalement orphelin (aucun fichier ne le référence).
Gravité : moyenne. Effort : trivial (supprimer ou réécrire). Coût de l'inaction : une nouvelle session ou un collaborateur qui l'ouvre en le prenant pour le point d'entrée actuel repart de zéro dans son raisonnement.

**Reste de `CLAUDE.md`** (résumé, règles techniques, décisions verrouillées, assets fournis) : vérifié exact contre le code observé, aucun autre écart trouvé. Contient de vraies règles d'architecture (`config.js` unique, boucle à pas fixe, horloge Web Audio), pas seulement une description — conforme à l'exigence du brief.

**`.claude/`** : pas de dossier `commands/`, pas de sous-agent, pas de hook, pas de `settings.json` partagé. `launch.json` à jour (port 5173, `autoPort:true` — cohérent avec le piège documenté en `PLAN-ACTION.md:77`). `settings.local.json` : 4 permissions Bash toutes liées à l'analyse ponctuelle du master WAV (BPM/durée/offset, valeurs maintenant figées dans `config.js:8-10`) — vestigial au sens strict du brief.
Gravité : faible. Effort : trivial. Coût de l'inaction : aucun, juste du bruit.

**MCP** : aucun `.mcp.json` au niveau du projet — rien n'est pinné dans le repo. Vu la nature du projet (audio à analyser, Vercel prévu, Supabase prévu), rien n'ancre ces besoins dans le projet lui-même ; tout dépend de la configuration globale de la machine, invisible pour une autre session ou un autre poste.
Gravité : faible aujourd'hui, montera à l'étape 7. Effort : faible. Coût de l'inaction : reproductibilité de l'environnement de travail dépendante d'une seule machine.

**Incohérence interne repérée** — logique de brume (haze) dupliquée entre `road.js` et `world.js` avec deux techniques différentes pour le même effet. `road.js:35-66` précalcule une palette de 16 teintes au chargement du module, explicitement pour éviter de reparser des couleurs à chaque frame (commentaire `road.js:37-39`). `world.js:38-52` (`shade()`/`mix()`) reparse des hex et alloue des chaînes `rgb(...)` à chaque bâtiment visible, chaque frame (appelé depuis `drawBuilding`, `world.js:82-84,105,111,125-126`) — alors que les deux fichiers partagent explicitement les mêmes constantes « pour une atmosphère cohérente » (`world.js:25-26`). L'optimisation faite dans un fichier n'a pas été reportée dans l'autre alors que c'est exactement le même problème.
Gravité : faible aujourd'hui (aucun coût mesuré, voir axe G), mais c'est la signature exacte que le brief demande de chercher. Effort : petit. Voir aussi axe B/G et priorité n°4.

**Reste du code** : aucun autre pattern de duplication ou de nommage incohérent trouvé sur les 9 fichiers de `src/`. Le style (français pour le vocabulaire métier, anglais pour le technique générique, commentaires expliquant le pourquoi plutôt que le quoi) est homogène. Le pattern `stopPropagation` sur les contrôles tactiles (bouton saut, slider volume, bouton rejouer) est appliqué de façon identique aux 3 endroits une fois le problème compris — signe de continuité, pas de solution réinventée à chaque session (voir aussi §5).

### B. Architecture et extensibilité

Découpage globalement fonctionnel et fidèle au domaine (`clock`/`audio`/`road`/`world`/`player`/`entities`/`input`/`debug`), un fichier = une responsabilité claire.

**`main.js` (457 lignes, le plus gros fichier)** concentre : bootstrap/resize (`1-46`), geste de démarrage (`67-78`), état de partie + physique du joueur (`88-230`), HUD (`285-325`), indicateur gyro (`327-374`), écran de fin (`376-391`), écran de démarrage + word-wrap (`242-282`), boucle de rendu (`400-428`) et la boucle à pas fixe elle-même (`433-457`). `PLAN-ACTION.md:168` documente déjà cette dette (« le HUD/écran de fin vivent directement dans main.js (bare) ; à extraire/habiller ici » pour `hud.js`, prévu mais absent).
Gravité : moyenne. Effort : moyen. Coût de l'inaction : l'étape 6 (menu, écran-titre, CTA, concours) ajoute mécaniquement de nouveaux écrans dans un fichier qui gère déjà la physique bas niveau du joueur au même endroit — plus on attend, plus l'extraction devient coûteuse.

**Machine d'état de facto** : 3 écrans pilotés par deux booléens (`gameStarted` `main.js:70`, `game.ended`/`endReason` `main.js:108-114`). Fonctionne à 3 états ; les étapes 6 et 7 en ajoutent au moins 2 (écran-titre, écran de partage).
Gravité : moyenne. Effort : moyen si fait maintenant, plus élevé si fait après coup. Coût de l'inaction : accumulation de conditions imbriquées dans `render()`/`step()` (déjà 3 branches `main.js:413-419`).

**Trois endroits où le chemin le plus court a été pris plutôt que le chemin extensible :**
1. HUD/écrans de fin codés en dur dans `main.js` au lieu de `hud.js` déjà prévu (`PLAN-ACTION.md:168`) — bloquera l'habillage de l'étape 6.
2. `entities.js:65-68` (`slotZ`) recalcule la position (z) de chaque bonus/obstacle à partir du temps restant × vitesse **courante**, à chaque frame, plutôt que de stocker une position propre. Ingénieux et documenté, mais c'est la cause directe d'un bug déjà rencontré et corrigé une fois (`PLAN-ACTION.md:49-52` — décalage visuel des objets au ramassage d'un bonus, dû au changement instantané de vitesse). Toute future mécanique qui changerait la vitesse plus brutalement (power-up, boost) rouvre la même classe de bug.
3. Duplication de la logique de brume `road.js`/`world.js` (détaillée en axe A) — un futur réglage d'ambiance (brume plus forte, teinte nocturne) devra être fait à deux endroits avec deux techniques différentes, avec un risque de désynchronisation visuelle sol/bâtiments.

**Logique spatiale/collision** : `project()` (`road.js:78-86`) est la seule fonction de projection, correctement réutilisée par `debug.js`/`world.js`/`player.js`/`entities.js` — pas de duplication de la projection elle-même (point positif, voir §5). Les constantes caméra (`CAMERA_HEIGHT`, `HORIZON_RATIO`, `FOCAL_RATIO` — `road.js:12-14`) et de collision (`HIT_RADIUS`, `PICKUP_RADIUS` — `entities.js:16-17`) restent locales aux modules plutôt que dans `config.js` — défendable (distinction réglage-produit vs détail d'implémentation) mais cette règle n'est écrite nulle part : rien n'indique à une future session où doit vivre une nouvelle constante.
Gravité : faible. Effort : faible (documenter la règle). Coût de l'inaction : ambiguïté récurrente à chaque nouvelle constante.

Aucune hypothèse de taille d'écran câblée en dur dans la logique de jeu (unités-monde converties en pixels uniquement à la projection) — voir §5.

Boucle à pas fixe correctement découplée du framerate (`FIXED_DT = 1/120`, accumulateur, `main.js:13,447-451`) ; lissages (`LATERAL_ACCEL`, `SPEED_SMOOTHING`) multipliés par `dt` — aucune dépendance au framerate détectée dans la logique de mouvement.

### C. Dépendances

Une seule dépendance déclarée : `vite: ^6.0.0` (`package.json:12`), devDependency uniquement — zéro dépendance runtime, cohérent avec `CLAUDE.md:10`.

Lockfile présent et cohérent : version installée `6.4.3`, résolue dans `package-lock.json` à `6.4.3`, dans la plage `^6.0.0` — pas de dérive (vérifié directement dans `node_modules/vite/package.json` et `package-lock.json`).

Aucune dépendance inutilisée (c'est la seule, et elle est utilisée par les 3 scripts `package.json:6-9`). Aucune bibliothèque redondante, aucun candidat à remplacement par du code maison — rien à comparer. Tous les `import` de `src/` vérifiés par recherche : uniquement des chemins relatifs vers des fichiers du projet, zéro import npm dans le code de jeu.

Plage ouverte (`^6.0.0`) sur l'unique dépendance : un `npm install` sans lockfile préservé pourrait remonter une 6.x plus récente sans prévenir.
Gravité : faible (devDependency, pas de code shippé). Effort : n/a. Coût de l'inaction : faible, mais s'élimine tout seul une fois le lockfile versionné dans Git (voir axe E).

### D. Boucle de feedback et testabilité

Mode debug existant (`debug.js`, touche `CONFIG.toucheDebug` = "d", `config.js:56`) — **vérifié en direct** (capture d'écran après appui sur « d ») : affiche FPS/temps de frame, position joueur, vitesse, distance, temps/beat, source de direction active, plus une grille rythmique en surimpression (`debug.js:24-77`).

Mais c'est un pur visualiseur passif. Aucune fonction trouvée (dans le code ni observée en test) pour sauter à un instant du morceau, forcer un écran (game over/fin de course), injecter un score/une énergie/des vies, ou forcer l'apparition d'un bonus/obstacle précis pour tester une collision isolément.
Gravité : élevée. Effort : petit (les points d'ancrage existent déjà : `clock.setTimeSource`, `road.reset()`, `entities.reset()`, `game` est un objet mutable accessible). Coût de l'inaction : atteindre l'écran « Parcours terminé » exige d'attendre les 257,9 s réelles du morceau (`config.js:10`) à **chaque** test, à chaque session ; atteindre « Game Over » exige de perdre 3 vies pour de vrai. `PLAN-ACTION.md` documente lui-même plusieurs bugs trouvés uniquement via playtest réel complet (`PLAN-ACTION.md:43-52`, `67-68`). Les étapes 6, 7 et 8 se jouent presque toutes en fin de partie (CTA, concours, partage, polish) — c'est le point qui va coûter le plus cher en temps de session à partir de maintenant.

Aucun test automatisé : aucun fichier `*.test.js`/`*.spec.js` dans le projet (vérifié par recherche), aucun framework de test dans `package.json`. La logique d'état (résolution bonus/obstacle `entities.js:90-123`) n'est couverte par rien d'automatisé malgré des fonctions pures et un hash déterministe, facilement testables unitairement.
Gravité : moyenne. Effort : petit pour un premier test sur `entities.js` seul (pas de DOM/Canvas impliqué). Coût de l'inaction : chaque régression sur la logique de collision/score ne peut être détectée que par playtest manuel.

Projet inspectable visuellement par un agent : confirmé pour l'écran de démarrage et l'écran de jeu (lancé via `npm run dev`, capturé en preview mobile sans problème). `PLAN-ACTION.md:81` documente un artefact spécifique à ce type d'environnement de preview automatisé : la boucle de rendu est bridée quand les captures s'espacent, désynchronisant simulation et horloge audio — **observation cohérente pendant cet audit** : le mode debug activé pendant la vérification a affiché 22 FPS, très en dessous des 60/120 attendus, très probablement cet artefact documenté plutôt qu'un vrai problème de perf (je ne peux pas trancher depuis cet environnement — voir §6).

### E. Git et historique

Pas de dépôt Git (`git status` → « not a git repository », vérifié à la racine). Aucun commit, aucune branche.

**C'est le constat le plus lourd de l'audit.** Un projet à 6 étapes de développement terminées, construit sur plusieurs sessions (le « État d'avancement » de `PLAN-ACTION.md` documente des dizaines de changements, bugs trouvés et corrigés), sans aucune capacité de rollback, de diff ou de bisect. Le seul historique existant est la prose de `PLAN-ACTION.md`, tenue à jour manuellement — précise (voir §5), mais ce n'est pas un substitut à un vrai historique : elle ne permet ni de revenir en arrière ni de comparer deux versions d'un fichier.
Gravité : critique. Effort : trivial. Coût de l'inaction : chaque session future reste irréversible ; c'est aussi un préalable strict à « GitHub pour la source, Vercel pour le déploiement » (contexte du brief d'audit).

Sans `.gitignore`, un futur `git init && git add -A` embarquerait tel quel : `node_modules/`, les `.DS_Store` (racine et `public/`), et surtout **`assets/la-ville-est-belle-MASTER.wav` (65 Mo)** — `CLAUDE.md:26` dit explicitement « ne pas servir tel quel », ce qui implique aussi ne pas le committer/pousser sur GitHub. `.claude/settings.local.json` serait également versionné alors que sa vocation (nom « local ») est d'être ignoré.
Gravité : élevée (spécifiquement à cause du WAV — 65 Mo dans un historique Git sont ensuite coûteux à retirer, contrairement à avant le premier commit). Effort : trivial (un fichier à écrire avant le premier `git init`). Voir priorité n°1.

Aucun secret trouvé dans le code actuel (axe F) donc rien à purger d'un historique — mais il n'y a de toute façon pas d'historique à purger.

### F. Sécurité

Recherche exhaustive de secrets en dur (`grep` sur `src/`, `config.js`, `index.html`, `vite.config.js`, motifs clé API/secret/token/mot de passe) : rien trouvé.

`config.js:53` — `apiScores: ""` : vide, non branché (étape 7 pas commencée). Seul appel réseau dans tout le projet : `fetch(window.CONFIG.fichierAudio)` (`audio.js:27`), qui charge le mp3 local du projet — confirmé aussi par l'inspection réseau en direct (une seule requête `GET /assets/la-ville-est-belle.mp3`). Aucune API externe ou payante appelée depuis le client aujourd'hui, donc aucun risque de facturation actif pour l'instant.

Décision figée « aucun anti-triche » (`CLAUDE.md:20`, `PLAN-ACTION.md:273`) : le score envoyé par le client ne sera pas validé côté serveur, par choix assumé et documenté, pas par oubli — vérification du concours prévue au screenshot manuel. Le risque réel n'est donc pas « un joueur truque son score » (accepté explicitement) mais l'absence de toute limitation de débit prévue sur le futur endpoint POST : rien dans `PLAN-ACTION.md` §6-7 ne mentionne de rate-limiting. Un endpoint Supabase avec clé anonyme exposée côté client et policy d'écriture ouverte peut être martelé (flood de la table, pollution du classement au-delà de ce qu'une vérification manuelle par screenshot peut absorber).
Gravité : moyenne (aucun coût aujourd'hui, mais l'étape 7 est la prochaine grosse brique). Effort : petit si traité en même temps que le branchement de `apiScores` (ex : passer par une fonction serverless Vercel plutôt que d'exposer Supabase directement, ou a minima une policy RLS stricte + rate-limit basique). Coût de l'inaction : à traiter avant de brancher `apiScores`, nettement plus coûteux à ajouter après coup si le endpoint est déjà public et documenté.

RLS Supabase : non applicable aujourd'hui, aucun projet connecté (pas de SDK importé, pas de credentials). Pas de logs ou messages d'erreur qui fuitent des données sensibles (`console.warn`/`error` dans `audio.js:38-41,47` ne loggent que des écarts de durée audio ou des échecs de chargement).

### G. Performance et poids

Bundle JS : non mesuré (un `vite build` écrirait `dist/` sur le disque, exclu par la règle de non-modification — voir §6). Estimation qualitative : ~1634 lignes de JS, zéro dépendance runtime, zéro image — le bundle final sera très léger, l'essentiel du poids du jeu est dans l'audio, pas dans le code.

Poids des assets, vérifié sur disque : `la-ville-est-belle.mp3` = 9,8 Mo (`la-ville-est-belle-MASTER.wav` = 65 Mo, confirmé non servi — ni dans `public/`, ni importé nulle part dans `src/`, ne serait donc pas inclus dans un build Vite). Le mp3 est chargé intégralement en mémoire avant lecture (`fetch` → `arrayBuffer()` → `decodeAudioData()`, `audio.js:27-32`), sans streaming progressif ni range requests.
Gravité : faible à moyenne. Effort : n/a pour l'instant (pas de correctif trivial sans changer d'approche de lecture). Coût de l'inaction : sur une connexion mobile « moyenne », un ordre de grandeur de 8 à 15 secondes de téléchargement avant même le décodage — **hypothèse, non mesurée avec un vrai throttling réseau**. Géré côté UX par un écran « Chargement… » (`main.js:268-269`), donc pas un bug, mais un délai réel avant le premier geste possible sur un jeu dont l'objectif central est justement l'immédiateté de l'accroche musicale (axe I).

Recalculs/allocations par frame repérés dans la boucle de rendu :
- `world.js` — `mix()`/`shade()` reparsent des couleurs hex et allouent des chaînes à chaque bâtiment visible (jusqu'à ~28/frame), chaque frame (détaillé en axe A/B).
- `main.js:243-258` (`wrapText`) redécoupe la même chaîne statique et appelle `ctx.measureText()` à chaque frame tant que l'écran de démarrage est affiché — texte qui ne change jamais, mais portée limitée (quelques secondes, écran inerte avant le premier tap).

Aucun écouteur non nettoyé identifié comme un problème réel : page unique sans cycle de montage/démontage de vues, donc l'absence de `removeEventListener` (aucun trouvé dans tout `src/`) n'a pas de conséquence pratique ici.

`PLAN-ACTION.md:23` rapporte « 120 fps stable » en preview mobile simulée malgré ces coûts. Pendant cet audit, le mode debug a affiché 22 FPS en preview — cohérent avec l'artefact de throttling documenté par le projet lui-même (`PLAN-ACTION.md:81`), pas nécessairement représentatif. Dans tous les cas, **aucun test sur le plancher matériel visé (iPhone SE 2e gén., `PLAN-ACTION.md:343`) n'a encore été fait** (confirmé non testé : `PLAN-ACTION.md:24,87,354-358`).

### H. Déploiement Vercel

Aucun `vercel.json` à la racine, aucun dossier `.vercel/` — aucune configuration Vercel présente dans le projet.

Sans dépôt Git (axe E), un déploiement Vercel classique lié à un repo GitHub ne peut pas exister depuis cet espace de travail aujourd'hui. **Hypothèse** : le projet n'a jamais été déployé. Il reste possible qu'un déploiement existe via un autre poste ou un import direct dans le dashboard Vercel — invisible depuis ce repo, à confirmer (voir §7).
Gravité : n/a tant que l'hypothèse n'est pas confirmée. Le reste de l'axe (previews vs prod direct, variables d'environnement, exploitation des logs runtime) est sans objet tant que ce point n'est pas tranché.

### I. Conception du jeu

Boucle principale lisible : oui, `step()` (`main.js:166-230`) et `render()` (`main.js:400-428`) sont courts, et le trajet action → collision → score/vie → HUD tient dans le même tick à pas fixe (1/120 s) — retour quasi instantané, cohérent avec un jeu de réflexe. Confirmé jouable de bout en bout en preview (démarrage → collecte de bonus → HUD à jour, vérifié en direct).

Canaux de retour implémentés : **visuel uniquement**. HUD, indicateur gyro, anneaux de couleur vert/rouge sur les icônes (`entities.js:163-164`). Recherche de retour sonore dédié : aucun trouvé — `audio.js` ne gère que la piste de fond, aucun son n'est déclenché au ramassage ou à la collision. Recherche de retour haptique : aucun appel à `navigator.vibrate` dans tout le projet.
Gravité : moyenne. Effort : petit (l'infrastructure Web Audio existe déjà dans `audio.js`, ajouter un SFX court ou un `navigator.vibrate()` au moment de l'événement dans `main.js:206-215` est peu coûteux). Coût de l'inaction : sur un jeu dont l'essence est la musique, l'absence de tout accent sonore ou haptique au ramassage/collision est une lacune concrète par rapport à l'« effet waouh » de synchro musicale explicitement recherché (`PLAN-ACTION.md:102`).

Raison de revenir / état inachevé : aucune persistance de meilleur score trouvée (ni `localStorage`, ni variable `bestScore` dans l'objet `game`, `main.js:108-114`) — chaque partie et chaque « Rejouer » (`main.js:125-148`) repart de zéro sans comparaison au run précédent. Cohérent avec le fait que le classement est explicitement prévu pour l'étape 7 — pas un oubli à ce stade, mais tant que l'étape 7 n'est pas là, il n'y a aujourd'hui aucun hook de retour local, même le plus simple (un « ton record : X » en `localStorage` coûterait quelques lignes).

3 écrans maîtrisés, pas de dérive de surface (cohérent avec axe B). Aucune feature hors-sujet repérée : tout le code présent sert la boucle principale.

---

## 4. Les cinq choses à changer en priorité

Classées par rapport valeur/effort, pas par gravité.

**1. `.gitignore` puis `git init` + premier commit.**
Problème : zéro contrôle de version, et le premier commit embarquerait 65 Mo de WAV + `node_modules/` sans garde-fou (axe E).
Action : écrire un `.gitignore` (`node_modules/`, `.DS_Store`, `dist/`, `assets/la-ville-est-belle-MASTER.wav`, `.claude/settings.local.json`), puis `git init` + commit initial.
Temps estimé : 10 minutes.
Débloque : rollback, diff, historique réel ; préalable strict au pipeline GitHub + Vercel visé par le projet.

**2. Mode debug capable de forcer un état.**
Problème : aucun raccourci pour sauter à un instant du morceau, forcer un écran de fin, ou faire spawner un bonus/obstacle précis — chaque test repasse par un playtest complet (axe D).
Action : étendre `debug.js` (ou ajouter des raccourcis clavier dev-only) pour appeler `clock.setTimeSource`/forcer `game.lives = 0`/avancer `dureeMorceau`.
Temps estimé : 30-60 minutes.
Débloque : test quasi instantané des écrans de fin, du concours (étape 6) et du partage (étape 7), qui se jouent tous en fin de partie.

**3. Corriger `CLAUDE.md:35-36` et statuer sur `KICKOFF.md`.**
Problème : instruction de démarrage périmée à deux endroits (axe A).
Action : réécrire les 2 lignes de `CLAUDE.md` pour pointer vers l'état d'avancement de `PLAN-ACTION.md` plutôt que de figer une étape ; supprimer ou réécrire `KICKOFF.md`.
Temps estimé : 10 minutes.
Débloque : une future session ne reçoit plus une instruction de démarrage contradictoire avec l'état réel du projet.

**4. Reporter l'optimisation de brume de `road.js` vers `world.js`.**
Problème : `world.js` reparse des couleurs hex et alloue des chaînes à chaque bâtiment, chaque frame, alors que `road.js` a déjà résolu exactement ce problème pour le sol (axe A/B/G).
Action : précalculer une palette de teintes pour `FACADE_PALETTE`/`ROOF_COLOR`/`WINDOW_LIT`/`WINDOW_DARK` au chargement du module, comme `buildHazeGradient()` dans `road.js:46-58`.
Temps estimé : 20-30 minutes.
Débloque : marge de perf avant même de tester sur le plancher matériel visé (iPhone SE), jamais validé à ce jour.

**5. Extraire HUD/écrans de `main.js` vers `hud.js`.**
Problème : `main.js` centralise déjà bootstrap, physique du joueur ET rendu de 3 écrans (axe B) — déjà identifié comme dette dans `PLAN-ACTION.md:168`.
Action : déplacer `renderStartPrompt`, `renderHud`, `renderGyroIndicator`, `renderEndScreen`, `roundRect`, `wrapText` (`main.js:232-391`) vers `hud.js`, appelées depuis `main.js`.
Temps estimé : 1-2 heures.
Débloque : l'étape 6 (écran-titre, CTA, logique concours) s'ajoute sans faire grossir davantage un fichier déjà surchargé.

---

## 5. Ce qui est bien fait

- Cohérence fichier-tree ↔ `PLAN-ACTION.md` §3 (`148-176`) : vérifiée exacte, aucun écart, y compris pour les fichiers marqués ⬜ et confirmés absents.
- Toute la logique de jeu (positions, collisions, vitesse) est en unités-monde, converties en pixels uniquement à la projection (`road.js:78-86`) — aucune hypothèse de taille d'écran câblée en dur trouvée dans la logique.
- Boucle à pas fixe correctement implémentée : accumulateur + interpolation + anti-spirale de la mort (`MAX_FRAME_TIME`, `main.js:14,433-455`) ; lissages proprement multipliés par `dt`.
- `config.js` respecte strictement son propre contrat : gelé (`Object.freeze`, `config.js:60-61`), aucune logique dedans, seule source de réglages produit.
- Une seule dépendance, utilisée, à jour, lockfile cohérent avec le manifeste.
- Aucun secret, aucune clé, aucun appel réseau externe dans le code actuel.
- Séparation MASTER.wav / mp3 respectée dans les faits, pas seulement dans l'intention : le WAV n'est référencé nulle part dans le code et ne serait pas inclus dans un build.
- `PLAN-ACTION.md` tient lieu, en prose, d'un vrai journal de changements détaillé (bugs, causes, correctifs, vérifications). En l'absence totale de Git, c'est ce qui a permis à cet audit de reconstituer un historique fiable.
- Pattern de correctif réappliqué à l'identique sur les 3 contrôles tactiles (`stopPropagation`, `input.js:139-157`, `main.js:150-157`) une fois le problème compris — continuité entre sessions, pas de solution réinventée à chaque fois.

---

## 6. Ce que je n'ai pas pu vérifier

- Poids réel du bundle JS après build (`vite build` écrirait `dist/` sur le disque, exclu par la règle de non-modification). Estimation qualitative donnée en axe G, non mesurée.
- Comportement réel sur iPhone (gyroscope, 60/120 Hz réels, HTTPS/mkcert) — `PLAN-ACTION.md` le documente lui-même comme jamais testé sur appareil réel ; pas davantage testable depuis cet environnement.
- Le FPS réellement observé (22 en debug pendant cet audit) reflète-t-il un vrai problème de perf ou l'artefact de throttling déjà documenté par le projet (`PLAN-ACTION.md:81`) — je penche pour le second sans pouvoir trancher avec certitude depuis cet outil.
- Existence d'un déploiement Vercel ailleurs (autre machine, import dashboard direct) — absence de preuve locale n'est pas preuve d'absence.
- Configuration MCP globale de la machine, hors du projet — je ne vois que l'absence de configuration au niveau du repo.
- Le calage réel BPM/offset à l'oreille sur le morceau — `PLAN-ACTION.md:121` indique que c'est encore « à faire côté artiste » ; je n'ai pas écouté le fichier.
- Temps de chargement réel du mp3 sur connexion mobile — estimé par calcul (taille/débit théorique), pas mesuré avec un throttling réseau réel.

---

## 7. Questions

1. Un dépôt Git existe-t-il ailleurs (autre machine), ou faut-il vraiment partir de zéro ? Conditionne la priorité n°1.
2. Un projet Vercel/GitHub a-t-il déjà été créé (dashboard, autre poste) ? Hypothèse actuelle : non, faute de toute trace locale.
3. `KICKOFF.md` : à supprimer, à archiver, ou à mettre à jour comme point d'entrée légitime pour une future itération (nouveau morceau, nouvelle campagne) ?
4. La cible « iPhone SE 2e gén. » comme plancher perf (`PLAN-ACTION.md:343`) est-elle actée, ou encore à confirmer comme le texte le suggère ?
5. Le silence sonore/haptique au ramassage/collision (axe I) est-il un choix assumé (pour ne pas parasiter le morceau), ou un manque à corriger ?
6. Faut-il prévoir un rate-limiting/proxy serveur pour l'endpoint de score avant l'étape 7, ou le risque de spam est-il jugé acceptable vu la vérification manuelle par screenshot ?
7. Les 14 assets créa listés en `PLAN-ACTION.md` §11 sont-ils en cours de production ? Ça conditionne le calendrier réaliste de l'étape 6 et suivantes.
8. Le contenu exact attendu pour l'écran-titre de l'étape 6 (au-delà de « CTA + logique de dates ») est-il déjà décidé ailleurs, hors de ce repo ?
9. `.claude/settings.local.json` (permissions numpy/librosa/ffprobe) : à nettoyer maintenant que le calage audio est figé, ou à garder pour un futur réglage sur un nouveau morceau ?
10. Le rythme de spawn (`cadenceSpawnBeats`, actuellement 1,5 — `config.js:42`) est-il figé ou encore en réglage actif ?

---

## 8. Proposition de méthode

**`CLAUDE.md`** : retirer les lignes 35-36 (instruction de démarrage figée) et les remplacer par un renvoi explicite à la section « État d'avancement » de `PLAN-ACTION.md` — le point d'entrée méthode doit toujours pointer vers la source vivante, jamais répéter un état qui va se périmer à la prochaine étape terminée.

**`.claude/`** : séparer un `settings.json` versionné (une fois Git en place) du `settings.local.json` machine-only — aujourd'hui tout est dans le `.local`, ce qui mélange ce qui devrait être partagé (conventions d'équipe, permissions courantes) et ce qui ne devrait pas l'être.

**Commande/skill à créer** : un raccourci de debug (skill ou juste des touches clavier dev-only dans `debug.js`) pour sauter à un instant du morceau ou forcer un écran de fin — c'est la priorité n°2, et c'est le levier le plus rentable pour accélérer chaque session à venir. Un deuxième skill utile viendrait à l'étape 7 : un aller-retour rapide « poser un score de test dans Supabase → vérifier le classement affiché » une fois le backend branché.

**MCP à envisager** : rien d'urgent tant que Supabase/Vercel ne sont pas branchés. Dès l'étape 7, un MCP Supabase (schéma, RLS) et un MCP Vercel (déploiement, logs) deviennent directement utiles pour piloter le backend et le déploiement sans sortir du terminal — à évaluer concrètement à ce moment-là plutôt que par anticipation.

**Rythme de commit** : dès Git initialisé, un commit par sous-étape validée plutôt que par étape entière. `PLAN-ACTION.md` documente déjà des unités de travail assez fines (un bug trouvé = une cause identifiée = un correctif = une vérification) qui correspondraient chacune à un commit atomique et donneraient tout de suite un historique exploitable, sans changer la façon de travailler par ailleurs.

**Boucle de test** : ajouter aux critères de validation de fin d'étape (`PLAN-ACTION.md` §8) un passage systématique par le mode debug étendu (priorité n°2) avant de déclarer une étape « faite », en complément du playtest manuel déjà pratiqué — pas en remplacement, le playtest réel reste irremplaçable pour tout ce qui touche au ressenti (feel du pilotage, lisibilité à l'écran).
