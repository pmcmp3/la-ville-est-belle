# La ville est belle — Documentation technique

> **Lis ce fichier en premier.** Il remplace la lecture intégrale de `PLAN-ACTION.md`,
> qui est un journal de bord chronologique (~850 lignes) : utile pour retrouver *pourquoi*
> une décision a été prise, inutile pour comprendre comment le jeu marche.
>
> Ici : comment c'est construit, quels sont les invariants à ne pas casser, et les pièges
> qui ont déjà coûté des heures. Dernière mise à jour : 12 août 2026.

---

## 1. Le jeu en une page

Runner mobile type Subway Surfers, caméra derrière un cycliste, coucher de soleil parisien.
Tout est calé sur le morceau **La ville est belle** de PMC (~257,9 s, 120 BPM).

**L'objectif produit n'est pas le jeu, c'est le morceau** : le jeu existe pour donner envie
d'aller l'écouter. Toute décision de design se tranche là-dessus. C'est pourquoi, par exemple,
la musique continue de jouer après un game over.

- **Cible** : navigateur mobile, **Safari iOS en priorité absolue**, portrait natif.
- **En ligne** : https://pmcmp3.github.io/la-ville-est-belle/ — seul site, Netlify abandonné
  (12 août 2026), voir §9.
- **Deadline publique** : 11 septembre 2026.
- **Concours** : meilleur score = un vinyle de l'EP. Scores dans Supabase, identité = pseudo + Insta.

---

## 2. Démarrer

```bash
npm install
```

```bash
npm run dev
```

Sert sur le LAN par défaut (`server.host: true`) — l'IP locale s'affiche au lancement, c'est
elle qu'on ouvre sur l'iPhone. Mode debug : suffixe `?debug` dans l'URL (indispensable sur
téléphone, où il n'y a ni console ni clavier), ou touche `d` au clavier.

```bash
npm run build && npx vite build --base=./ --outDir=dist-pages
```

Déploiement = repousser `dist-pages/` à la main sur la branche `gh-pages` du remote `origin`
(`pmcmp3/la-ville-est-belle`, compte artiste). **Pas de CI, pas d'automatisation** : voir §9 pour
la procédure exacte. ⚠️ Netlify a été **abandonné le 12 août 2026** (crédits épuisés) — ne plus
proposer `netlify deploy`, ne plus le citer comme cible de prod.

---

## 3. Règles non négociables

Elles viennent du brief et ne se renégocient pas sans l'artiste.

1. **Vanilla JS + Canvas 2D + Vite.** Aucun framework, aucun moteur 3D, aucune dépendance runtime.
2. **`config.js` à la racine = seul fichier de réglages.** Aucune logique de jeu dedans. Il n'est
   pas bundlé (chargé tel quel, nom fixe) pour rester modifiable sans rebuild.
3. **Boucle à pas de temps fixe**, horloge maîtresse = Web Audio API.
4. **iOS** : l'`AudioContext` ne se débloque que sur un geste utilisateur, dans la pile d'appel
   du geste (jamais dans un `setTimeout` ou un `.then()` ultérieur).
5. **Portrait natif**, pas de mode paysage.

---

## 4. Carte des modules

`src/` — 17 modules, ~6 700 lignes avec `index.html`. Aucun n'importe `main.js` : les
dépendances vont toujours vers le bas.

| Module | Rôle | À savoir |
|---|---|---|
| `main.js` | Boucle de jeu à pas fixe, état de partie, physique (saut, latéral), pause | **847 lignes** (1349 avant extraction de `screens.js`, voir §11) |
| `screens.js` | Écrans hors-jeu : onboarding pseudo/insta, décompte, panneau son, menu pause, classement | Extrait de `main.js` le 17 août 2026 — câblage DOM/présentation uniquement, aucune physique. Ne peut pas importer `main.js` (cycle) : reçoit `restartGame`/l'ouverture-fermeture de pause en callbacks via `init()` |
| `clock.js` | Temps musical : `now()`, `beatIndexAt()`, `timeOfBeat()` | Source de temps injectable (`setTimeSource`) |
| `audio.js` | Chargement, unlock iOS, lecture, **4 modes** de lecture (dont la boucle de mort) | Le plus délicat du projet, voir §5.1 et §8 |
| `road.js` | Projection pseudo-3D, vitesse, rendu du sol | Exporte `project()`, que tout le reste consomme |
| `world.js` | Façades haussmanniennes, ciel, croisements, feux | Purement décoratif ; source de `isCrossingSlot` co-exportée par `road.js` |
| `entities.js` | Bonus/obstacles calés sur les beats : spawn, difficulté, collisions | **872 lignes** (1442 avant extraction de `entities-render.js`, voir §11) — le cœur du gameplay ; inclut le pont (viaduc). Zéro logique de rendu |
| `entities-render.js` | Rendu des bonus/obstacles : icônes pixel art, voitures/pont en faux-3D | Extrait de `entities.js` le 17 août 2026 — importe `entities.js` (jamais l'inverse) pour lire `slotsFor`/`isConsumed`/`hash` etc. |
| `voxel.js` | Primitif de cube extrudé (`blk`/`shade`/`parseColor`) | Partagé par `player.js` et `cyclists.js`, zéro logique d'orientation |
| `player.js` | Sprite du cycliste joueur (vu de dos), pédalage | **Voxel** (blocs extrudés) depuis le 12 août 2026 — même grammaire que `cyclists.js`, voir §11 |
| `cyclists.js` | Cyclistes-obstacles en sens inverse (vus de face) | DA voxel, 5 variantes |
| `pedestrians.js` | Sprites des piétons-obstacles | **Voxel** depuis le 12 août 2026, même `blk()` que joueur/cyclistes |
| `finish.js` | Ligne d'arrivée (damier au sol + portique façon F1) | Cosmétique — le vrai déclencheur de fin de course est `entities.isFinished()`, que ce module ne fait que visualiser |
| `crosstraffic.js` | Voitures/camions qui TRAVERSENT la chaussée aux carrefours | ⚠️ Fait basculer les croisements de décor à gameplay (19 août 2026). Vit sur la grille de DISTANCE (`road.isCrossingSlot`, partagée avec `world.js`), PAS sur la grille musicale d'`entities.js` — collisions et `Set` de résolus séparés. Densité nulle avant ~50 s, maximale après ~100 s : c'est le levier qui durcit la FIN sans toucher au début. Coût −1 vie, jamais fatal (voir l'en-tête du fichier) |
| `cameo.js` | Soberland (DJ ami de l'artiste) + sa table de mixage, **deux fois** : au tout début de la course, et **sur la ligne d'arrivée** (22 août 2026) | Purement décoratif, même principe que `finish.js` (position par temps écoulé) mais tôt plutôt qu'à la fin — pas de créneau, pas de collision. Expose `getExtras()` (personnage + table, chacun sa profondeur), à fusionner via `entities-render.render(..., extras)`, jamais un rendu séparé |
| `pmc.js` | PMC qui fait coucou pendant le **menu pause** | Décoratif, même grammaire voxel que `cameo.js`. ⚠️ Seul sprite du jeu animé sur `performance.now()` et non sur l'horloge musicale : pendant la pause celle-ci est GELÉE, il bouge précisément parce que le reste est arrêté. Peint après la scène (elle est figée, il n'y a plus de profondeur à négocier), sous le voile du menu |
| `defi.js` | « Défie un ami » : cible reçue dans l'URL (`?defi=…&de=…`), lien à renvoyer | Lue UNE fois au chargement du module, immuable ensuite (rejouer garde la même cible). Aucune vérification, assumé (voir l'en-tête du fichier) : la cible ne touche jamais Supabase, elle ne vit que dans le duel entre deux amis |
| `share.js` | Image de partage **carrée 1080×1080** (PNG) | ⚠️ `prepare()` fabrique l'image à l'AFFICHAGE de l'écran de fin, `partager()` ne fait que la passer au système — `navigator.share()` exige la pile d'appel du geste, et `canvas.toBlob()` étant async, tout faire au clic échoue en silence sur iOS. Repli en téléchargement |
| `hud.js` | Score, vies, statut concours, bandeau de palier | |
| `tutorial.js` | Tutoriel interactif d'avant-course (remplace le décompte 20 → 1) | Machine à états à 4 étapes, OBSERVE l'état du joueur (voie/saut) au lieu de lire l'input — main.js consomme déjà les gestes, un 2e consommateur les lui volerait. Objets de démo rendus par `peindreObjet` (entities-render.js), placés en voie ADJACENTE au joueur (une étape ne se valide jamais sans geste ; la main fantôme montre, ne joue pas). Sorties sans geste : « Passer l'intro », plafond 30 s (screens.js) |
| `input.js` | Gestes tactiles + clavier | Expose des **événements consommables**, pas un axe continu |
| `net.js` | Supabase (POST score, GET classement) | Ne lève jamais : échoue en silence. Un seul score par personne (identité = Insta) garanti côté base, voir §9 |
| `debug.js` | Overlay FPS, grille rythmique | Activé par `?debug` |

---

## 5. Les cinq concepts à comprendre avant de toucher au code

C'est la partie qui compte. Presque tous les bugs sérieux du projet viennent d'une
incompréhension d'un de ces cinq points.

### 5.1 L'horloge maîtresse est l'audio, pas `performance.now()`

`clock.now()` est branchée sur `audio.now()` = `audioCtx.currentTime - startCtxTime`.

**Conséquence critique : un `AudioContext` qui ne tourne pas a un `currentTime` qui n'avance
pas.** Ça a produit le pire bug du projet : sur iPhone, le décor défilait (il avance sur `dt`,
temps réel) pendant que bonus et obstacles restaient figés sur place (ils dépendent du temps
musical), la partie ne se terminait jamais et le score restait à zéro. Les trois symptômes,
une seule cause.

Deux garde-fous existent depuis :
- Si l'audio ne tourne pas **3 s après le tap**, la partie démarre quand même sur une horloge
  de secours (`performance.now()`).
- Un chien de garde (`AUDIO_STALL_TIMEOUT = 1 s`) surveille l'horloge audio en continu pendant
  la course et bascule en secours sans perdre la progression (`setTimeSource(fn, preserve)`).

Principe retenu : **un jeu muet reste jouable, un jeu figé non.**

### 5.2 Les entités n'ont aucune position stockée

Il n'y a pas de tableau d'instances. La profondeur d'un objet est **recalculée à chaque frame** :

```
z = PLAYER_NEAR_Z + (temps_musical_d_arrivée - maintenant) × vitesse_courante
```

Seuls deux `Set` d'index sont gardés en mémoire (`resolved`, `consumed`). Le contenu d'un
créneau est une fonction pure de son index (hash déterministe) — d'où la même séquence
d'objets à chaque partie.

**Le piège** : `vitesse_courante` est un facteur *global*. Si elle change brutalement, **tous**
les objets pas encore arrivés se retrouvent recalculés à une profondeur différente dans la même
frame. Ça a produit deux bugs distincts :

- Un « saut » des objets lointains au ramassage d'un bonus (corrigé par le lissage
  `SPEED_SMOOTHING` dans `road.js`).
- Un pop-in massif au démarrage : une rampe d'accélération faisait partir la vitesse de 0, ce
  qui écrasait tous les `z` sur la position du joueur, puis les repoussait vers l'horizon quand
  elle remontait — les objets semblaient « reculer ». **La rampe a été supprimée**, la route
  part directement à `vitesseBase`.

> ⚠️ **Ne jamais réintroduire de modulation brusque de la vitesse.** Toute variation doit passer
> par le lissage, sinon elle se voit sur toute la profondeur de champ.

### 5.3 `LEAD_IN` : pourquoi l'horloge ne démarre pas à 0

`clock.now()` vaut 0 à l'instant où la partie démarre. Or le créneau 0 est censé arriver au
joueur *pile* à cet instant : sans correctif, tout le premier lot d'objets se retrouve déjà **à**
la position du joueur dès la première frame, au lieu d'avoir glissé depuis l'horizon.

D'où `clock.jumpBy(-entities.LEAD_IN)` au départ **et au rejeu**.

⚠️ **Recalé le 12 août 2026.** La formule d'origine, `LOOKAHEAD_SLOTS × CADENCE × beatPeriod`
= 10 × 1,5 × 0,5 = 7,5 s, visait le mauvais repère : un nombre de créneaux de délai MUSICAL, pas
`VISIBLE_Z_MAX` (= 90, la vraie limite de visibilité utilisée par `visibleSlots()`). À la vitesse
de départ (19,8 u/s), le créneau 0 démarrait donc à z ≈ 162 — largement au-delà de la fenêtre
visible — et la route restait **vide pendant ~3,6 s à chaque partie**, invariablement (le jeu
est entièrement déterministe, voir §5.2). Signalé directement par l'artiste sur téléphone :
« au démarrage, il n'y a rien du tout comme objet ».

Nouvelle formule, qui résout directement le décalage plaçant le créneau 0 à `VISIBLE_Z_MAX`
(moins une petite marge) à la vitesse de départ :

```
LEAD_IN = (VISIBLE_Z_MAX − marge − PLAYER_NEAR_Z) / vitesse_départ − premierTempsOffset ≈ 3,78 s
```

Le créneau 0 est donc déjà dans le champ (z ≈ 88) dès la toute première frame, puis glisse
normalement jusqu'au joueur comme n'importe quel créneau plus tard en course — sans reproduire le
bug de pop-in que `LEAD_IN` existe pour éviter. ⚠️ Non vérifié visuellement (preview navigateur
inaccessible cette session, voir §12) — confirmé seulement par le calcul.

**Ouverture curatée** (même changement, même retour) : le tout premier créneau qui peut être un
obstacle (`slotIndex === GRACE_SLOTS`) est désormais forcé à `cycliste` plutôt que laissé au hash
(`OPENING_KIND_OVERRIDE` dans `entities.js`) — sans ce forçage, le premier cycliste naturel
n'arrivait qu'au créneau 9, largement hors du champ visible au démarrage. Même principe que
`GRACE_SLOTS` qui force déjà les tout premiers créneaux en étoiles pour la même raison de rythme
d'ouverture. Un seul créneau déplacé sur 143 obstacles, quota global inchangé.

### 5.4 Le quota exact par diffusion d'erreur

Contrainte produit : **exactement 140 étoiles par partie** (200 avant le 17 août 2026 — réduit à
la même proportion que `dureeCourse`, voir plus bas), pour que le score maximum soit un
nombre connu et que « tout prendre » soit l'objectif.

Un tirage probabiliste (`hash(slot) < ratio`) est déterministe mais ne donne pas un total rond.
Remplacé par une **diffusion d'erreur** (même principe qu'un tramage d'image) : un cumul
accumule le ratio cible créneau après créneau, et un créneau est une étoile seulement s'il fait
franchir un palier entier. Le total vaut alors exactement `floor(somme des ratios)`.

```
TOTAL_OBJECTS    = 191   ← dérivé de dureeCourse (143,5 s depuis le 17 août 2026)
TOTAL_STARS      = 80    ← ⚠️ DÉRIVÉ depuis le 19 août 2026 : compté sur isBonusQuota, plus écrit à la main
TOTAL_OBSTACLES  = 111   ← ce qui reste
```

⚠️ **Renversement du 19 août 2026 — la rampe linéaire a disparu.** `TOTAL_STARS` n'est plus LE
réglage central dont tout découle : c'est maintenant une CONSÉQUENCE de la loi de difficulté.
La densité d'obstacles **double toutes les 25 s** (`OBSTACLE_DOUBLING_TIME_S`), de 38 % des
créneaux au départ jusqu'au plafond `OBSTACLE_RATIO_MAX` = 60 % (atteint vers 16 s) ;
`BONUS_RATIO_START`/`BONUS_RATIO_END` et `RAMP_SLOTS` sont supprimés. Demandé explicitement
(« multiplie par deux le nombre d'obstacles toutes les 25 secondes [...] il faut vraiment que ce
soit extrêmement difficile ») : l'ancienne rampe faisait *baisser* la densité d'obstacles de 38 %
à 16 % au fil de la course, donc la fin était la portion la plus VIDE du jeu — la plainte exacte,
remontée deux fois de suite.

**La propriété produit est intacte, sa valeur a changé.** « Chaque partie a exactement le même
nombre d'étoiles, donc le score max est un nombre connu » reste vrai (tout est déterministe,
§5.2) ; simplement ce nombre se COMPTE désormais au lieu d'être imposé. Mesuré : **80 étoiles /
111 obstacles pile sur 191 créneaux, 0 trou**, densité d'obstacles 50 % sur les 25 premières
secondes puis ~60 % jusqu'à la fin. Nouveau score maximum théorique : **61 400 points**, combo
final ×9 (contre 195 525 / ×15). ⚠️ **Le classement Supabase est donc à vider** : les scores
enregistrés sous l'ancien barème sont hors d'atteinte du nouveau.

⚠️ **L'arbitrage a été tranché par l'artiste, pas déduit.** Les deux contraintes (doubler les
obstacles / garder 140 étoiles) sont mathématiquement incompatibles — 191 créneaux, un objet par
créneau. Trois scénarios chiffrés lui ont été soumis : plafond 60 % (80 étoiles/111 obstacles,
combo encore atteignable), plafond 85 % (40/151, mais 0 % de chance d'enchaîner 5 étoiles — le
combo, ajouté deux jours plus tôt, serait mort), ou garder 140 étoiles en durcissant chaque
obstacle sans en changer le nombre. Il a choisi le premier. **Ne pas revenir dessus sans le
redemander.**

Le cas dégénéré du ratio > 1 (voir plus bas) n'est plus une dérivation à surveiller mais une
marge structurelle : le ratio d'étoiles vaut `1 − obstacleRatioAt()`, donc il vit entre 0,40 et
0,62, jamais près de 1.

⚠️ **Deuxième révision de la longueur du parcours (12 août 2026)** : la ligne d'arrivée n'est plus
calée sur la fin du morceau mais sur `config.dureeCourse`, un réglage **séparé** de `dureeMorceau`
(257,9 s, la durée réelle du MP3). Le morceau continue de jouer après la ligne, jusqu'à sa fin
réelle — l'écran de fin/le classement s'affichent avec du morceau encore devant eux, ce qui sert
directement l'objectif "donner envie d'écouter le morceau". `TOTAL_OBJECTS` dérive donc de
`dureeCourse`, pas de `dureeMorceau` (`entities.js`). Avant cette révision (même jour) : 343
créneaux calés sur `dureeMorceau` (257,3 s) ; avant elle, 300 créneaux/225 s à la main, la musique
continuant 33 s après la ligne. **`pauseDeriveMax` remonté de 8 s à 25 s** (`config.js`) : la
marge morceau/course qui avait disparu (257,3 s de course pour 257,9 s de musique) est revenue en
force avec ce changement.

⚠️ **Troisième révision, 17 août 2026** : `dureeCourse` 205 → 143,5 s (×0,7, « course trop
longue », demandé explicitement) — ~114 s de marge avant la fin réelle du morceau désormais,
contre ~53 s après la révision du 12 août. Contrairement à cette révision-là (qui avait laissé
`TOTAL_STARS` fixe pendant que `TOTAL_OBJECTS` baissait, voir juste en dessous), `TOTAL_STARS` a
cette fois été réduit **à la même proportion** (200 → 140) — précisément pour ne pas reproduire le
bug de dérivation décrit plus bas (`BONUS_RATIO_START` qui dépasse 1 quand le quota ne baisse pas
avec le nombre de créneaux). `TOTAL_OBJECTS` 273 → 191, `TOTAL_OBSTACLES` 73 → 51 (même
proportion ×0,7 partout) : la densité de danger par créneau ne change donc pas par ce changement
seul — voir `BONUS_RATIO_END` plus bas pour le changement séparé qui, lui, redistribue QUAND les
obstacles arrivent dans la course. Vérifié par balayage hors ligne (méthode §12, tous les
`slotIndex` de 0 à 190 énumérés via `slotsFor()`) : exactement 140 étoiles / 51 obstacles, 0 trou.

`TOTAL_STARS` était resté fixé à 200 après la révision du 12 août (décision verrouillée à
l'époque : score max = nombre connu) alors que `TOTAL_OBJECTS` baissait fortement (343→273,
−20 %) : `TOTAL_OBSTACLES` encaissait tout le raccourcissement (143→73, −49 %) — la course
devenait plus courte ET nettement moins dense en obstacles à quota d'étoiles égal. Le paragraphe
d'alors notait déjà : « si la densité de danger doit revenir à ce qu'elle était, c'est
`TOTAL_STARS` qu'il faudrait revoir à la baisse ». **Fait le 17 août 2026** (voir ci-dessus).

`BONUS_RATIO_START`/`BONUS_RATIO_END` sont **dérivés**, pas écrits à la main, pour que le quota
tienne même si on retouche `TOTAL_STARS` / `TOTAL_OBJECTS` / `GRACE_SLOTS`.

> 🐛 **Deux bugs de cette dérivation, trouvés à deux moments différents.**
> 1. (12 août 2026, avant la révision `dureeCourse`) La dérivation calait la **moyenne** de la
>    rampe sur le quota, ce qui suppose que `t` moyenne à 0,5 — faux, il s'arrête à (N−1)/N. Biais
>    minuscule, mais du mauvais côté du `floor` final : **199 étoiles au lieu de 200**. Corrigé en
>    résolvant la somme de la rampe exactement (`N·start + (end−start)·(N−1)/2 = quota`),
>    initialement en dérivant `end` à partir d'un `start` fixe (0,45).
> 2. (12 août 2026, après le passage à `dureeCourse` = 205 s) **Le même quota de 200 étoiles sur
>    beaucoup moins de créneaux (273 contre 343) a fait DÉPASSER 1 au `end` ainsi dérivé** (mesuré :
>    1,011). Un ratio de tramage > 1 fait sauter plus d'un palier entier sur un même créneau, qui
>    ne peut pourtant porter qu'un seul objet — l'étoile "en trop" se perd en silence. Mesuré avant
>    correction : de nouveau **199 étoiles au lieu de 200**, plus une fin de course à 100 %
>    étoiles (aucun obstacle possible une fois le ratio saturé). Corrigé en inversant le sens de la
>    dérivation : `end` est maintenant un plafond volontaire fixe (0,92, sous 1 avec marge), et
>    c'est `start` qui se dérive de la somme exacte — la formule tient quels que soient
>    `TOTAL_STARS`/`TOTAL_OBJECTS`/`GRACE_SLOTS` retouchés ensuite, pas seulement la combinaison du
>    jour. Recensement hors ligne (méthode §12) après correction : 200 étoiles / 73 obstacles
>    pile, ratio max mesuré sur le parcours réel ≈ 0,919 (< 1, marge confirmée).
>
> Mesure de distribution après ce recensement (méthode §12, 273 créneaux, ordre d'ouverture
> curatée inclus) : voiture 39, cycliste 20, pieton 3, cone 4, pont 7 — échantillon beaucoup plus
> petit qu'avant (73 obstacles contre 143), donc plus sensible au hasard du hash que les anciens
> comptages ; à reconfirmer si `TOTAL_STARS`/`dureeCourse` rebougent.
>
> **Reconfirmé le 17 août 2026**, exactement comme prévu ci-dessus (`TOTAL_STARS`/`dureeCourse`
> ont bougé) : 191 créneaux, **140 étoiles / 51 obstacles pile**, 0 trou dans les `slotIndex` —
> aucun retour du bug. Distribution : voiture 33, cycliste 12, pieton 2, cone 0, pont 4 (`cone` à
> 0 sur cet échantillon n'est pas un bug — 7 % de poids sur seulement 51 essais, variance normale
> à cette taille d'échantillon, déjà signalée comme volatile ci-dessus). `BONUS_RATIO_END`
> 0,92 → 0,84 le même jour (« plus d'obstacles quand ça avance », difficulté à doubler) : double la
> part d'obstacles pile en fin de course (8 % → 16 %) sans changer `TOTAL_OBSTACLES` — `start` se
> redérive automatiquement (~0,54 → ~0,62), la formule d'exact-quota n'a pas eu besoin d'y toucher.

### 5.5 La projection pseudo-3D est courbe, pas plate

`road.project(x, z, width, height)` renvoie `{x, y, scale}`. Le sol s'enfonce de `CURVATURE·z²`
sous le plan de la caméra, ce qui donne un horizon **réellement atteignable** :

```
HORIZON_Z = √(CAMERA_HEIGHT / CURVATURE) ≈ 136 unités-monde
```

`CURVATURE` retouchée une seconde fois le 12 août 2026 (0,0004 → 0,00034, HORIZON_Z ≈ 110 → 119,
+8 %), inspirée d'un screen Subway Surfers envoyé par l'artiste (perspective de pont très longue).
Une troisième fois le 17 août 2026 (0,00034 → 0,00026, HORIZON_Z ≈ 119 → 136, +14 %, « charge plus
de distance », demandé explicitement) — même sens, pas à pas comme les fois précédentes. Au-delà,
l'effet de courbure « Terre ronde » qui est la raison d'être de `CURVATURE` se dilue ; ne pas
redescendre sous ~0,0002 sans reconfirmer que la sensation reste perceptible en jeu.

Rien ne doit être dessiné au-delà : la projection s'y replierait. Tous les modules de rendu
testent `z > HORIZON_Z` et sautent. Les objets « surgissent de derrière la courbe », ce qui est
l'effet recherché.

Repères (HORIZON_Z ≈ 209 depuis le 21 août 2026, CURVATURE 0,00011 — voir l'historique complet
des crans dans `road.js`) : `ROAD_HALF_WIDTH = 4`, `LANE_COUNT = 3` (4 avant le 17 août 2026), donc une voie fait
2,67 unités (2 avant) — route physique inchangée, juste redécoupée en voies plus larges.
`PLAYER_NEAR_Z = 13` (profondeur du joueur, fixe).

---

## 6. Gameplay — les chiffres actuels

**Voies** : 3 (4 avant le 17 août 2026, demandé explicitement — voir `road.js` pour le détail et
le seul ajustement de logique que ça a exigé : les rangées de 3 voitures, qui auraient occupé les
3 voies à la fois). La collision est un **test d'égalité de voie**, pas une distance latérale.
C'est ce qui a réglé d'un coup « t'es short sur les hitbox » et « je peux rester entre deux voies
indéfiniment ».

**Rythme** : un objet tous les `cadenceSpawnBeats` = 1,5 temps, soit **0,75 s** à 120 BPM.

**Vitesse** : `BASE_SPEED × vitesseBase` = 11 × 1,8 = **19,8 u/s** au départ, croissance
exponentielle plafonnée à `vitesseMax` (`config.js`) = **9,0** (99 u/s) — 6,0 avant le 17 août
2026, ×1,5 (« vitesse de fin », demandé explicitement). Doublement toutes les `SPEED_DOUBLING_TIME`
(`road.js`) = **43,8 s** — 57 s avant, divisé par 1,3 (« accélère 30 % plus vite », même demande,
même principe que les rampes précédentes : le TAUX d'accélération monte de 30 %, donc le temps de
doublement est divisé par 1,3). Le plafond continue d'être atteint bien avant la ligne d'arrivée
(vérifié par balayage hors ligne : ~103 s, contre `finishTime()` ≈ 143 s).

**5 bonus** (le score est dans `config.js`) :

| Bonus | Points | Aérien |
|---|---|---|
| `cd` | 50 | |
| `piano` | 100 | |
| `appareil` | 150 | |
| `collierPerles` | 250 | ✅ |
| `guitare` | 500 | ✅ |

Les bonus aériens ne se ramassent **qu'en sautant**, avec une fenêtre de collision élargie
(`Z_WINDOW_AIR = 2,2` contre `Z_WINDOW = 1,0`) — le timing du saut doit être tolérant.

**Combo** (`comboMultiplier()`, `main.js`, ajouté le 17 août 2026) : `game.streak` compte les
étoiles ramassées d'affilée depuis le dernier obstacle touché (tout obstacle, quel qu'il soit, le
remet à 0 — voir la boucle d'événements dans `main.js`). Palier tous les `comboSeuil` (5,
`config.js`) : `game.score += Math.round(points_du_bonus × (1 + comboBonusParPalier ×
Math.floor(streak / comboSeuil)))` — 5 → ×1,5, 10 → ×2, 15 → ×2,5, etc. Ne s'applique JAMAIS à la
pénalité de collision (`penaliteObstacle`), uniquement aux points de bonus. Affiché sous le score
(`hud.js`, même position que le "-500" de pénalité — les deux ne sont jamais visibles en même
temps dans les faits, puisqu'un obstacle remet `streak` à 0 au même instant où il déclenche la
pénalité).

**5 obstacles** (c'était 3, puis 4 avec la promotion du cycliste, voir plus bas). Poids revus le
12 août 2026 (« beaucoup plus de gens qui font du vélo », « un peu plus de voiture »), puis
prélevés une seconde fois au prorata pour faire de la place au pont (même jour) :

| Obstacle | Poids | Coût | Le saut sauve ? |
|---|---|---|---|
| `voiture` | 0,47 | **fatal** (3 vies d'un coup) + **−500 pts** | ✅ (survol + atterrissage sur le toit) |
| `cycliste` | 0,25 (voir palier de score plus bas — plus de seuil unique depuis le 17 août 2026) | −1 vie + **−500 pts** | ✅ depuis le 12 août 2026 |
| `pieton` | 0,11 | −1 vie + **−500 pts** | ❌ |
| `cone` | 0,07 | −1 vie + **−500 pts** | ✅ |
| `pont` | 0,10 | **fatal** (3 vies d'un coup) + **−500 pts** | ❌❌ (sauter AGGRAVE : dangereux même voie ouverte) |

⚠️ **Cycliste rendu franchissable au saut le 12 août 2026** (demandé explicitement — il avait
rejoint `UNJUMPABLE_KINDS` en même temps que sa promotion en obstacle, voir plus bas). Sa branche
de collision dans `update()` (`entities.js`) est désormais la même que le cône (`sameLane(e) &&
!inAir`), et il est sorti de `UNJUMPABLE_KINDS` — la garde anti-piège (plus bas) ne s'applique
donc plus à lui, uniquement au piéton.

`UNJUMPABLE_KINDS = {pieton}` : lui seul se contourne **latéralement uniquement**, `inAir` n'y
change rien. Le pont n'est pas dans cet ensemble bien qu'infranchissable — sa branche de
collision est dédiée (voir plus bas). Distribution mesurée sur les 191 créneaux actuels
(`dureeCourse` = 143,5 s depuis le 17 août 2026) : voiture 33, cycliste 12, pieton 2, cone 0,
pont 4 — voir §5.4 pour le détail complet et l'historique des révisions précédentes (273 puis
343 créneaux). Échantillon petit et volatil par nature (51 obstacles au total) ; à reconfirmer si
`TOTAL_STARS`/`dureeCourse` rebougent encore.

⚠️ **Intensification par palier de score, sans plafond** (12 août 2026 : « ×2 à partir de
10 000 points » ; remplacée le 17 août 2026 : « ça manque d'obstacles dès que je suis à
80000... complexifie et intensifie »). L'ancien seuil unique arrêtait de faire quoi que ce soit
une fois franchi — plus adapté depuis que le combo (main.js, `comboMultiplier()`) permet de monter
bien plus haut (~195 000 en théorie). Remplacé par `SCORE_TIER_SIZE`/`SCORE_TIER_FACTOR`
(`applyScoreTierBoost()`) : tous les 15 000 pts, le poids de `voiture`/`cycliste`/`pont` (plus
seulement `cycliste`) est multiplié un peu plus, cumulativement (5 paliers à 80 000 → ×2,85), puis
la table renormalisée. **En plus** : `scoreRampT()` pousse les rangées de voitures
(`carRowSizesAt`) et les ponts (`bridgeOpenLanesAt`) vers leur configuration la plus dure (le
moins de voies libres) EN AVANCE sur la rampe temporelle normale — sans dépasser le maximum déjà
prévu par `CAR_ROW_LATE`/`BRIDGE_OPEN_LATE` (toujours ≥ 1 voie libre, invariant inchangé). Mesuré
par balayage hors ligne : à 80 000 pts, 67 % des ponts n'ont plus qu'une voie ouverte (10 % à
score nul), 54 % des rangées de voitures sont à 2 voitures (35 % à score nul) ; 0 slot bloquant
les 3 voies à la fois, y compris testé au score max théorique (195 525). ⚠️ **Seule donnée de tout
ce fichier qui dépend du GAMEPLAY (le score courant) plutôt que d'un hash pur par index de
créneau** (voir §5.2) — `main.js` pousse `game.score` via `entities.setScore()` une fois par
frame. Le tirage est **mémoïsé par créneau** (`rawContentCache`) dès son premier calcul : sans ça,
un score qui franchit un palier pile pendant qu'un vélo est déjà visible mais pas encore résolu
lui ferait changer de nature EN COURS D'APPROCHE. Vidé par `reset()` au rejeu, comme
`resolved`/`consumed`/`debugOverrides`.

**Pont (viaduc du métro parisien)**, ajouté le 12 août 2026 (inspiré d'une référence Subway
Surfers envoyée par l'artiste — perspective à piliers, longue ligne de fuite). Bloque 1 ou 2
voies sur 3 (2 ou 3 sur 4 avant le passage à 3 voies, 17 août 2026) à la même profondeur, une
seule résolution de collision pour tout le pont (même principe qu'une rangée de voitures,
`entities.js`, mais en stockant les voies **bloquées** plutôt qu'occupées — voir
`bridgeBlockedLanes()`). Progression : 2 voies ouvertes en début de course, 1 seule en fin de
course (`bridgeOpenLanesAt()`, même rampe `t` que les rangées de
voitures). La garde anti-piège a sa propre variante pour le pont (`bridgeGuard()`) : un
piéton/cycliste n'a qu'une voie de repli, un pont a plusieurs voies ouvertes à la fois — la
question posée est « reste-t-il au moins une voie ouverte du pont qui ne coïncide pas avec un
bonus voisin », résolue par rotation de la combinaison de voies ouvertes plutôt que par
déplacement d'une seule voie. Mesuré sur les 343 créneaux : 0 pont à 0 voie ouverte, 1 pont sur
18 déplacé par la garde.

⚠️ **DA et règle revues une première fois, le jour même**, sur retour direct après un test réel
sur téléphone :
- Le premier rendu (piliers béton gris uni + rivets) a été jugé « pas beau ». Remplacé par une
  DA pierre de taille (palette reprise de `world.js`, `FACADE_PALETTE`/`CORNICE_COLOR`) +
  corniche claire + poutre en treillis métallique vert, d'après une photo Street View d'un
  viaduc du métro parisien (`renderBridge()` dans `entities.js`).
- La règle de collision a changé de nature. À l'origine le pont suivait `UNJUMPABLE_KINDS`
  (sauter ne sauve pas, mais ne punit pas non plus). Retour : « j'ai fait exprès de sauter
  quand j'étais dans le trou du pont, j'aurais dû me prendre le pont [...] et le pont doit
  arrêter la partie si je me le prends ». Désormais : sauter sous un pont est TOUJOURS
  dangereux (même voie ouverte — `sameLane(e) || inAir` dans `update()`, seul obstacle où
  `inAir` aggrave au lieu de neutraliser) et le choc est **fatal**, comme la voiture
  (`main.js`, `game.lives = 0`). Passer sous un pont exige de rester au sol, dans la bonne voie.
- Non vérifié visuellement (preview navigateur inaccessible, voir §12) — à confirmer au
  prochain test réel, notamment que `inAir` déclenche bien la collision dans une voie ouverte.

**Pénalité de score** (demandée le 12 août 2026, avec la perte de vie) : chaque collision qui
coûte un cœur retire aussi `penaliteObstacle` points (500, `config.js`), affichés 3 s sous le
score (`game.penaltyTimer`/`penaltyAmount`, `hud.js`). Une seule pénalité par collision, y
compris pour la voiture (qui prend les 3 vies d'un coup). Le score ne descend jamais sous 0.

**Cyclistes en sens inverse — vitesse d'approche.** Signalé comme « je ne vois que des vélos
statiques » : un cycliste avançait à la vitesse du DÉCOR (comme un cône posé au sol), donc
sans lecture de croisement malgré l'animation de pédalage. `APPROACH_FACTOR` (`entities.js`)
multiplie la vitesse de rapprochement des seuls créneaux `cycliste` (×1,35), sans toucher
l'instant d'arrivée — il tombe toujours pile sur son temps musical, il part juste de plus loin.
⚠️ Cassait une hypothèse silencieuse : `visibleSlots()` produisait les créneaux par index
croissant = profondeur croissante, ce que `render()` suppose pour son ordre du peintre (§10,
piège n°4). Un facteur d'approche différent par type casse cette égalité — `slotsFor()` trie
maintenant explicitement par `z` avant de mettre en cache.

**Période de grâce** : `GRACE_BEATS = 7` (~3,5 s, premier obstacle à 3,75 s) sans obstacle en
début de course. Historique : 16 (~8 s) → 4 (~2 s, « il y a juste plein d'étoiles, il se passe
rien ») → 8 puis 7 le 21 août 2026 (« énormément d'étoiles au tout début » — 7 est le PLANCHER
sûr vis-à-vis de Soberland, voir la vingt-deuxième passe en §11),
rallongée pour couvrir la fenêtre de Soberland avancé au tout début (voir seizième passe, §11) —
ses étoiles sont en plus forcées sur les voies latérales, la voie centrale reste à lui.

**La garde anti-piège** : un obstacle infranchissable au saut ne doit jamais partager sa voie
avec un bonus au créneau voisin (±1) — sinon le joueur doit choisir entre rater l'étoile et
perdre une vie, un piège que rien d'autre n'impose. La garde **déplace l'obstacle de voie**
(`laneOverride`). Elle changeait son *type* auparavant : ça marchait tant que le piéton était
seul concerné, mais dès l'arrivée du cycliste elle convertissait **51 %** des obstacles
infranchissables et vidait la catégorie en silence (18 cyclistes tirés → 8 survivants).

---

## 6bis. Décor : façades, croisements, feux (12 août 2026)

Chantier commencé en autonomie créative (accord explicite de l'utilisateur avant de se coucher —
« autorise-toi tout seul pour la créa »), à partir de plusieurs références Street View
(immeuble haussmannien classique + viaduc du métro) et du retour direct : « revois la manière
dont c'est fait en pixel [...] immeuble parisien », « des fois qu'on croise des avenues »,
« tu peux rajouter des feux ». Déployé sur le miroir GitHub Pages (§9) et **revu par
l'utilisateur au réveil** : croisements/feux/piliers de pont jugés bons, mais verdict tranché sur
les bâtiments — « les bâtiments qui font pas du tout parisien » — d'où la deuxième passe
ci-dessous. **Cette deuxième passe, elle, n'a pas encore été revue** (preview navigateur
inaccessible toute la session, voir §12, donc pas de vérification possible de ce côté-ci) —
prochaine chose à regarder.

**Façades (`world.js`, `drawFace`/`buildingShape`)** — trois ajouts, tous additifs sur le rendu
existant (aucun invariant de placement/perspective touché) :
- **Volets** (`SHUTTER_PALETTE`) : deux blocs de part et d'autre de chaque fenêtre d'étage,
  teinte tirée par bâtiment (vert bouteille/gris ardoise/brun), masqués si la fenêtre est trop
  petite pour rester lisible (même garde que le reste du décor, `WINDOW_MIN_PX`-like).
- **Rez-de-chaussée distinct** : la dernière rangée de fenêtres (`groundRow`, la plus proche du
  sol) devient une vitrine sombre plus haute (`SHOPFRONT_COLOR`), sans volets, séparée des
  étages par un bandeau clair (`bandeauColor`, réutilise `corniceGradient`).
- **2e rangée de balcon** : possible désormais au dernier étage noble (juste sous le toit), en
  plus du balcon du 2e étage déjà existant — tirage indépendant (`h8`), jamais garanti sur un
  petit immeuble (`rows >= 5` requis).

⚠️ **Deuxième passe, même jour, sur retour direct plus tranchant : « les bâtiments ne font pas
du tout parisien ».** Le premier lot ci-dessus n'ajoutait que des DÉTAILS de surface ; en
creusant, la FORME elle-même ne matchait pas — le commentaire d'origine du fichier
(`FACADE_PALETTE`) révélait que la palette/les proportions avaient été conçues pour des
« tours de béton brut » (une photo pochette de l'artiste), jamais retravaillées quand l'en-tête
du fichier a commencé à promettre « façades haussmanniennes ». Les ajouts haussmanniens
habillaient donc une forme béton, pas de la pierre. Corrigé :
- **Gabarit resserré** : hauteur `9-22` → `16-19` (ligne de corniche quasi uniforme, la
  signature d'un boulevard haussmannien réglementé, plutôt qu'une skyline de tours
  dépareillées) ; profondeur `5-8` → `7,5-9,3` sur `SPACING=10` (mur quasi continu, ruelle
  latérale réduite à un filet plutôt qu'un vrai vide entre bâtiments).
- **Palette réchauffée** : `FACADE_PALETTE` vire du gris béton vers un crème/ocre plus soutenu,
  luminosité gardée haute (même stratégie que le commentaire d'origine — partir plus clair pour
  ne pas virer boueux une fois mélangé à la brume rouge). `ROOF_COLOR` très légèrement bleuté
  ("zinc") plutôt que noir plat.
- **Fenêtres** : hautes et étroites (porte-fenêtre) plutôt que carrées, encadrement clair ajouté
  (`strokeRect`, sinon la fenêtre se lisait comme un trou plaqué). Vitrines de rez-de-chaussée en
  plein cintre (arc, pas un rectangle).
  - ⚠️ **Bug de la première tentative** (`winH` × 0,78) : ne laissait que 22 % de `cellH` entre
    deux étages, ce qui fusionnait les fenêtres en bandes verticales continues à l'écran (« pas
    du tout immeuble parisien », capture à l'appui — lu comme un mur de lattes/persiennes, pas
    une grille de fenêtres). Redescendu à `winH` × 0,5, `winW` × 0,42, et la marge des volets
    resserrée (`-1` → `-3` px) pour garder de la pierre visible entre colonnes aussi.
- **Lucarnes** (`DORMER_MIN_ROOF_PX`) : deux petites fenêtres à pignon triangulaire qui percent
  le bas du toit — c'était le détail manquant pour lire "mansarde parisienne" plutôt que "pan
  incliné générique", le toit n'ayant jusque-là qu'un aplat sombre uni.
- **Contraste de volume renforcé** : `SIDE_SHADE` (retour d'angle vs façade principale) assombri
  de 0,82 à 0,68 — retour direct « faut que tu fasses des immeubles en 3D quand même » : un
  contraste trop faible entre les deux faces se lisait comme un mur plat.

**Croisements d'avenue** (`road.js` + `world.js`) — grille partagée pour éviter toute
divergence entre les deux fichiers :
- `road.js` exporte désormais `WORLD_GRID_SPACING` (= 10, l'ancien `SPACING` local de
  `world.js`, maintenant importé de là) et `isCrossingSlot(n)` = `n % 7 === 0` (à partir de
  `n = 2`, jamais deux collés, jamais au tout début de la course).
- Sur un créneau de croisement : `world.js` ne pose **aucun bâtiment** des deux côtés
  (`renderBuilding` retourne immédiatement) et pose un feu tricolore à la place
  (`renderTrafficLight`) ; `road.js` remplace, pour les lignes de sol dont le `z` tombe dans ce
  créneau, le trottoir+chaussée+pointillés habituels par un large passage piéton
  (`CROSSING_EXTRA_WIDTH = 6` unités de plus de chaque côté, alternance claire/sombre par bande
  comme le reste du sol).
- ⚠️ **Volontairement purement décoratif** : `laneX()`/la largeur des voies ne changent jamais,
  même au croisement — aucune règle de collision/spawn (`entities.js`) n'a besoin de savoir
  qu'un croisement existe. C'est ce qui rend le risque contenu malgré l'absence de test visuel.

**Feux de circulation** (`world.js`, `renderTrafficLight`) : poteau + tête tricolore (3 pastilles
rouge/jaune/vert), posés au bord du trottoir sur les deux côtés à chaque créneau de croisement,
même technique `project()`+fondu-brume que le reste du décor. ⚠️ **Position revue le 21 août
2026** (« tu les as mis au milieu de la route quand ça croise ») : plantés à `n·SPACING − 0,3`
(juste AVANT l'entrée du carrefour, côté joueur) au lieu du centre du créneau — voir la
treizième passe en §11 pour le détail du −0,3.
- ⚠️ **Revu le 12 août 2026** (« les poteaux des feux fais pareil », même retour que les
  bâtiments) : la première version était un simple `fillRect` plat, sans volume — lisait
  "carton", pas objet planté au sol. Le poteau (trop fin pour qu'un flanc projeté reste visible)
  prend un dégradé 3 tons façon métal cintré ; la tête tricolore, elle, prend un vrai flanc
  projeté à profondeur différente (`fillPoly`, même principe que les piliers de pont/
  `renderCar3D` dans `entities.js`).

⚠️ **Cinquième passe façades, même jour** : deux références Minecraft de bâtiments
haussmanniens très détaillées envoyées (bossage, fenêtres/portes en plein cintre, ferronnerie à
chaque étage, auvents de commerce colorés). Traduit dans la technique existante (`archPath()`,
nouvelle fonction partagée pour toute ouverture en plein cintre) :
- **Toutes les ouvertures en plein cintre** — plus seulement la vitrine du rez-de-chaussée, les
  fenêtres d'étage aussi (avant : rectangle nu, l'écart le plus visible avec les références).
- **Balcon filant à chaque étage** (avant : 1-2 étages tirés au hash) — la ferronnerie est
  quasi continue sur les références, pas un accessoire occasionnel.
- **Bossage/refends** au soubassement (2 premiers étages) : blocs de pierre alternés clair/
  sombre sur les deux arêtes verticales du mur — absent jusqu'ici, le mur était uni jusqu'en bas.
- **Auvents de commerce colorés** (`AWNING_PALETTE` : vert bouteille/bordeaux/bleu nuit) au-dessus
  de chaque vitrine — seule touche de couleur franche au ras du sol.
- **Bug corrigé en même temps** : `SCENERY_MIN_Z` (voir §4/commentaire dans `world.js`) — les
  bâtiments pouvaient rendre jusqu'à z=0,6 (plus près que le joueur, z=13), où l'échelle
  (focal/z) explose et le point au sol projeté part loin sous l'écran — lu comme « ils passent
  en dessous de la route ». Culling des bâtiments/props de décor resserré à z≥3.

⚠️ **Sixième passe, même jour : palette réchauffée** (`FACADE_PALETTE`, `ROOF_COLOR`,
`ROOF_RIDGE_COLOR`, `CORNICE_COLOR`, `WINDOW_DARK`, `SHOPFRONT_COLOR`, `SHUTTER_PALETTE` dans
`world.js` ; `BRIDGE_STONE` dans `entities.js`, même famille par construction — voir commentaire
existant à cet endroit). Référence envoyée : pixel art d'une cathédrale gothique, pierre
rosée/dorée, ciel flamboyant — « tu peux me faire des bâtiments qui ressemblent à ça ». **Portée
volontairement limitée à la couleur** : la géométrie haussmannienne (fenêtres en plein cintre,
balcons filants, toit mansardé) ne change pas, et aucun bâtiment ne devient une église (tours
jumelles/rosace) — clarifié explicitement par l'artiste après coup (« ne mets pas des églises à
la place de tous les bâtiments »). Concrètement : pierre crème/ocre → rosée/dorée plus soutenue,
toit/faîtage zinc bleuté → brun chaud, corniche blanc cassé → crème doré, vitres non éclairées
noir → bleu nuit indigo (contraste chaud/froid direct avec la référence), un des trois volets
(gris ardoise, seule teinte froide de la palette) → cuivre. `WINDOW_LIT` (orange-rouge de charte)
non touché — c'est un choix de DA antérieur, pas lié à cette référence.
⚠️ La preview navigateur a de nouveau refusé toute navigation vers le serveur de dev cette
session (même symptôme que le 12 août 2026, voir §12), donc pas de vérification locale possible.
**Vérifiée en revanche sur le site officiel (GitHub Pages) en prod, juste après le déploiement**
(écran d'accueil, rue vue de dos) : pierre rosée/dorée, fenêtres bleu nuit, corniche crème,
auvents — lisible et cohérent avec l'ambiance couchant. Reste à confirmer par l'artiste
directement.

---

## 7. Contrôles

Tout se joue au geste, **à un pouce**, sans aucun contrôle à l'écran.

| Geste | Effet |
|---|---|
| Swipe gauche / droite | Une voie (**un seul cran par contact**) |
| Swipe haut | Saut |
| Swipe bas | Glissade rapide vers le sol (pendant le saut) |

Clavier (dev uniquement) : flèches / `QD`, `Espace` / `↑`, `↓` / `S`.

**Le verrou « un cran par contact » est important** : le playtest signalait « si je swipe très
fort je traverse toutes les voies ». Un geste reste reconnu dès le franchissement du seuil (pas
d'attente du lever de doigt, pour la réactivité), mais une fois consommé plus rien ne se passe
jusqu'au prochain `touchstart`.

Le gyroscope a été **retiré** après plusieurs sessions à fiabiliser la permission iOS. Ne pas le
réintroduire.

---

## 8. Audio : les quatre modes de lecture

`audio.setPlaybackMode()` est le point d'entrée unique. `main.js` calcule le mode voulu à partir
de trois drapeaux (menu pause ouvert, onglet caché, panneau de seconde chance ouvert) et ne sait
rien du Web Audio.

| Mode | Quand | Effet |
|---|---|---|
| `running` | En course | Filtre ouvert, son plein |
| `muffled` | Menu pause | Le morceau **continue**, filtre passe-bas à 800 Hz — on n'entend que les basses |
| `silent` | Onglet/app quitté | Fondu à 0 puis `audioCtx.suspend()` |
| `revive` | Panneau de seconde chance (mort) | Le morceau **s'arrête** et la **boucle du début** tourne à sa place, dans son propre passe-bas qui s'ouvre au rythme du décompte — voir §8.2 |

Trois gains en série, chacun avec sa raison d'exister pour qu'ils ne se marchent jamais dessus :
`envelopeGain` (fondus automatiques), `volumeGain` (curseur utilisateur), `focusGain`
(perte de focus). Volume final = les trois multipliés.

> ⚠️ **Le son iOS et le bouton silencieux physique.** Par défaut iOS classe le Web Audio en
> catégorie « ambient », donc coupé par l'interrupteur latéral. Le contournement est
> `navigator.audioSession.type = "playback"` (Safari 16.4+), posé **avant** la création du
> contexte. « J'avais pas de son sur mon tél » a été remonté à chaque playtest et c'était
> systématiquement ça.

### 8.1 La reprise de pause : c'est la course qui se recale, pas le morceau

Toute sortie du mode `running` gèle l'horloge de jeu à la main (`pauseAnchor`) — en `muffled`
parce que le contexte tourne toujours, en `silent` parce que le `suspend()` n'arrive qu'après le
fondu (et sur iOS, le timer qui le déclenche peut ne jamais partir en arrière-plan). À la
reprise, le morceau a donc de l'avance sur la course.

**Le morceau ne recule jamais** (il rembobinait avant, via `playNow(muffleAnchor)` : l'artiste
l'entendait comme un retour en arrière). L'écart est encaissé dans `clockShift`, un **retard
permanent** que `audio.now()` retranche à l'horloge audio.

`clockShift` est **arrondi au temps musical le plus proche**, et c'est tout le mécanisme : les
objets arrivent tous les 1,5 temps, donc un décalage multiple d'un temps les laisse **exactement
sur la même grille** — mesuré à 0,000 temps d'écart sur 300 créneaux × 200 000 tirages de durée
de pause. Le résidu, c'est le sursaut de la course à la reprise : **0,25 s au pire**
(un demi-temps à 120 BPM), dans un sens ou dans l'autre.

Contrepartie : le morceau finit `clockShift` secondes plus tôt dans la course. ⚠️ **La marge a
disparu puis est revenue, deux fois le même jour** (§5.4, 12 août 2026) : d'abord ramenée à ~0,6 s
quand la course a duré tout le morceau (257,3 s de course pour 257,9 s de musique), donc
`pauseDeriveMax` ramené de 25 s à 8 s — puis la marge est revenue en force (~53 s) quand la ligne
d'arrivée s'est recalée sur `dureeCourse` (205 s) plutôt que sur la fin du morceau, donc
`pauseDeriveMax` remonté à **25 s**. Au-delà de ce budget, la reprise rembobine quand même plutôt
que de risquer un joueur qui franchit la ligne en silence. Le rembobinage remet `clockShift` à
zéro, le budget repart à neuf.

Le retard courant s'affiche dans `audio.getStatus()`, donc dans l'overlay `?debug` — seul moyen
de le vérifier sur un téléphone.

Enfin, tout ça ne vaut que si l'horloge audio pilote encore le jeu. Sur l'horloge de secours
(§5.1), rien ne gèle la course pendant la pause : `main.js` la recule alors du temps passé en
pause (`applyPauseState`), avec le même arrondi au temps musical.

### 8.2 Le mode `revive` : la boucle du début qui se défiltre (22 août 2026)

Demandé : « on doit mettre en place le début de la boucle à la place du mp3 qui tourne de base
derrière [...] on a le décompte des 10 secondes et un filtre passe-bas qui remonte au fur et à
mesure du chrono, donc la loop du début se défiltre ».

À la mort, le morceau **s'arrête** (fondu de 0,25 s sur `envelopeGain`, source stoppée) et une
seconde source prend le relais : le **même `AudioBuffer`**, `loop = true` sur ses
`config.loopMortDuree` premières secondes (8 s = **4 mesures pile** à 120 BPM, donc un raccord
inaudible), dans **son propre** `BiquadFilter` passe-bas. Elle entre dans la chaîne par
`volumeGain` : le curseur, le mute et l'analyseur de spectre la voient exactement comme le
morceau, mais le filtre de pause ne s'y applique pas.

`screens.js` appelle `audio.setReviveIntensity(0→1)` à chaque tick du décompte : la fréquence de
coupure monte de `loopMortFiltreMin` (170 Hz) à `loopMortFiltreMax` (16 kHz) **en exponentielle**
(une coupure se perçoit en octaves) et le gain de `loopMortVolumeMin` à 1. Le son dit donc, sans
un mot, combien de temps il reste.

⚠️ **Deux raisons d'ARRÊTER le morceau plutôt que de l'étouffer comme le menu pause :**
1. c'est la demande — on veut entendre le DÉBUT du morceau, pas l'endroit où le joueur est mort ;
2. **ça supprime toute dérive.** Le morceau ne prenant plus d'avance pendant une décision qui
   peut durer un aller-retour sur Spotify (donc bien plus que les 10 s du décompte), la reprise
   le relance **pile à la seconde de la mort** (`playNow(pauseAnchor)`, `clockShift` remis à 0).
   Ce chemin ne consomme donc rien du budget `pauseDeriveMax` (§8.1), contrairement à l'ancien
   comportement où le panneau de mort était un simple `muffled`.

⚠️ **`revive` l'emporte sur `silent`** dans `applyPauseState()` (main.js) — c'est la seule
exception au « onglet caché = silence total ». Partir ajouter le morceau est le chemin NORMAL de
cet écran : la boucle doit continuer de tourner pendant le détour, au plus filtré et au plus bas
(`setReviveIntensity(0)` sur `visibilitychange`), pour qu'on la retrouve au retour. Best-effort
côté iOS : c'est `navigator.audioSession.type = "playback"` (§8) qui permet à l'audio de survivre
en arrière-plan, rien ne le garantit.

⚠️ **Le décompte, lui, se fige pendant l'absence** — et au retour dans l'appli il est **rejoué
depuis 5** (`config.loopMortRetour`, phases `absence` → `retour` → `pret` dans screens.js),
décompte pendant lequel la boucle se défiltre. **La reprise reste un tap explicite** : ce
décompte arme `REPRENDRE`, il ne relance jamais la course dans le dos de quelqu'un qui aurait
posé son téléphone (invariant verrouillé, voir CLAUDE.md). Un second aller-retour rejoue le
décompte depuis 5 plutôt que de laisser 1 seconde pour reprendre ses esprits. Filet : si le
navigateur ouvre le lien **sans jamais masquer la page** (nouvel onglet en arrière-plan sur
desktop), aucun `visibilitychange` n'arrive — un `setTimeout` de 1,8 s enclenche alors le
décompte de retour, sans quoi le joueur resterait bloqué devant un bouton verrouillé.

---

## 9. Backend & déploiement

**Supabase** (PostgREST, pas de SDK). Aucun anti-triche — décision verrouillée : la vérité du
concours se fait au screenshot envoyé par le joueur.

- Le **pseudo** est public (classement), l'**Insta** est privé. La lecture passe par la vue
  `scores_public`, qui **n'expose pas** la colonne Insta — masquer à l'affichage n'aurait rien
  protégé, la clé anon est forcément dans le bundle.
- `net.js` ne lève jamais d'exception : backend absent, réseau coupé ou migration non appliquée
  → il renvoie `[]` et l'écran de fin reste fonctionnel.
- Schéma dans `supabase-schema.sql`, migrations dans `supabase-migration-pseudo-insta.sql` et
  `supabase-migration-best-score.sql`.
- **Un seul score par personne** (identité = `pseudo_insta` normalisé, minuscules + sans `@`) :
  `postScore()` continue de faire un simple INSERT côté client, mais un trigger Postgres
  (`supabase-migration-best-score.sql`) ne garde que le MEILLEUR score de chaque personne — un
  score plus faible est ignoré en silence, un meilleur remplace l'ancien. Sans ça, rejouer
  plusieurs fois créait une ligne par partie et le classement affichait la même personne
  plusieurs fois (constaté en vrai, ex. "guigzman" en double). Migration à exécuter une fois
  dans Supabase avant de relancer le concours.

**Cache HTTP** — ⚠️ **`public/_headers` NE FAIT RIEN** (vérifié en prod le 21 août 2026, en lisant
les en-têtes réels). C'est un fichier **Netlify** ; GitHub Pages l'ignore complètement et le sert
même comme un fichier statique ordinaire. La doc décrivait jusqu'ici un régime `no-store` /
cache-long qui n'a jamais été appliqué depuis l'abandon de Netlify — ne pas « corriger » le cache
en éditant ce fichier, il n'a aucun effet, et GitHub Pages n'offre aucun contrôle des en-têtes.

Ce qui s'applique réellement : **`cache-control: max-age=600` sur TOUT** (index, `config.js`,
bundle hashé, MP3). En pratique ce n'est pas un problème — mesuré : passé les 10 minutes, le
navigateur revalide avec `If-None-Match` et GitHub répond **304 avec 0 octet transféré**, donc le
MP3 de 3,9 Mo n'est PAS re-téléchargé. La contrepartie est plutôt bonne pour nous : `config.js` et
`index.html` se propagent en 10 minutes au lieu d'être figés. **En cas de nouveau master :
renommer le fichier** reste la façon la plus sûre de propager immédiatement.

Pas d'en-tête **HSTS** non plus (là encore, hors de notre contrôle). La redirection HTTP → HTTPS
(301) et `https_enforced` couvrent l'essentiel ; seule la toute première requête d'un visiteur qui
taperait `http://` à la main part en clair.

**Déploiement GitHub Pages** — ⚠️ **seule cible depuis le 12 août 2026, Netlify abandonné**
(crédits épuisés ce jour-là ; ce qui était présenté comme un « miroir de secours » dans une
version antérieure de ce fichier est maintenant le site officiel). `CLAUDE.md` et `config.js`
(`lienEP`) font foi pour les liens communiqués.
- Dépôt public **`pmcmp3/la-ville-est-belle`** (compte artiste, distinct du compte perso
  `workpaulmathieucollin-byte` — `gh auth switch` si besoin de re-pousser). Remote `origin` du
  dépôt local.
- Branche `main` (source) et branche `gh-pages` (build statique servi sur
  **https://pmcmp3.github.io/la-ville-est-belle/**) sont toutes les deux des **snapshots sans
  historique** : un unique commit racine (`git checkout --orphan`), généré à neuf à chaque mise à
  jour, jamais un merge/rebase de l'historique local.
- **Exclus du snapshot `main`** : `assets/la-ville-est-belle-MASTER.wav` et
  `assets/la-ville-est-belle-320k-original.mp3` (jamais servis tels quels, voir plus haut) et le
  dossier `3D assets/` (hors sujet, sans rapport avec le jeu — voir le contexte de session sur les
  assets FBX).
- ⚠️ **Corrigé le 17 août 2026** : contrairement à ce que disait ce fichier avant cette date,
  `gameplay-pause-voitures-etoiles` (l'historique COMPLET de développement, avec ses 37 commits)
  est bien poussé sur `origin` — `git branch -a` le montre en `remotes/origin/...`, distinct des
  snapshots `main`/`gh-pages`. Conséquence concrète : le commit racine de cette branche avait
  committé le WAV maître (65 Mo) ET `la-ville-est-belle-320k-original.mp3`, tous deux exposés
  publiquement sur `pmcmp3/la-ville-est-belle` (repo public) depuis le tout premier push, malgré
  la règle "jamais servis tels quels" — l'exclusion documentée ci-dessus ne protégeait que les
  snapshots `main`/`gh-pages`, pas la branche de dev elle-même. **Retiré de tout l'historique**
  via `git filter-repo --path ... --invert-paths` + force-push (dépôt local passé de 82 Mo à
  4,5 Mo) ; les deux fichiers sont maintenant dans `.gitignore` pour ne pas revenir. Sauvegarde
  complète de l'historique pré-purge conservée hors du dépôt (bundle `git bundle create --all`)
  le temps de confirmer qu'aucun autre poste n'a besoin de l'ancien historique.
- ⚠️ **`index.html` utilise des chemins RELATIFS** (`config.js`, `src/main.js`, `fonts/*.ttf`/
  `.otf` — jamais de `/config.js` en absolu) pour que le site reste servable sous un sous-chemin
  (`/la-ville-est-belle/`) sans divergence de code selon la cible. Vérifié : Vite laisse ces
  chemins relatifs inchangés au build (avertissement inoffensif, « didn't resolve at build time,
  it will remain unchanged ») — comportement voulu.
- Le build GitHub Pages passe par `dist-pages/` (gitignoré), pas `dist/` (celui-ci reste utilisé
  seulement pour vérifier le build en local, `base` implicite `/`) : `npx vite build --base=./
  --outDir=dist-pages` — base relative, portable sous n'importe quel sous-chemin sans le coder en
  dur.
- **Mise à jour manuelle, pas de CI.** Procédure éprouvée le 12 août 2026 (recette exacte, à
  réutiliser telle quelle) :
  1. `git checkout --orphan gh-clean-N` (N = prochain numéro libre, voir `git branch` —
     `gh-clean`/`gh-clean2`/… existent déjà en local, une par mise à jour passée), `git add -A`
     puis `git rm --cached` sur les fichiers exclus ci-dessus, `git commit`, puis
     `git push origin gh-clean-N:main --force`.
  2. `npx vite build --base=./ --outDir=dist-pages`, retirer `.DS_Store`, ajouter un `.nojekyll`
     vide (sinon GitHub Pages traite le dossier avec Jekyll et peut ignorer certains fichiers).
  3. Construire le commit `gh-pages` **dans un `git worktree` séparé**, jamais dans l'arbre de
     travail principal — sinon `git checkout --orphan` à la racine désindexe tout le dépôt en
     cours et le retour en arrière déclenche des conflits « untracked files would be overwritten »
     sur les gros binaires (vécu le 12 août 2026, aucune perte de données mais évitable) :
     `git worktree add -b gh-pages-clean-N <chemin tmp> <branche courante>`, puis dans ce
     worktree `git checkout --orphan …`, `git rm -rf --cached .`, `git clean -fdx`, copier le
     contenu de `dist-pages/` dedans, committer, `git push origin <branche>:gh-pages --force`,
     puis `git worktree remove` pour nettoyer.
  4. Étape 1 et 3 sont indépendantes (deux remotes/branches différentes) : peuvent se faire dans
     n'importe quel ordre.

**Poids** : bundle **17 Ko gzippé** contre **3,9 Mo de MP3** — l'audio pèse 99,6 % du total.
Le code n'est pas un levier d'optimisation, et le MP3 est déjà à 128 kbps pour 4 min 18 :
descendre plus bas dégraderait ce que le jeu existe pour vendre.

---

## 10. Pièges connus

Chacun a déjà coûté du temps. À lire avant de débugger quoi que ce soit.

1. **La preview navigateur ne peut pas jouer le jeu.** Créer l'`AudioContext` y fige l'onglet.
   Tout ce qui touche à l'audio, à la pause ou à l'écran de fin se vérifie **en prod sur
   téléphone**, pas en preview.

2. **Importer un module avec un cache-buster en crée une seconde instance.** `import('/src/clock.js?v=123')`
   ne renvoie *pas* le module qu'utilise `entities.js`. Un `setTimeSource()` posé dessus ne
   pilote rien, l'horloge du jeu reste à 0, et une simulation ne détecte qu'un seul objet. **Ça
   ressemble exactement à un bug de collision.** Importer sans query pour partager l'instance.

3. **`fillStyle` invalide = échec silencieux.** Canvas ignore une couleur mal formée et garde la
   précédente. Une fonction d'ombrage qui renvoyait `rgb(NaN,NaN,NaN)` a peint des blocs entiers
   avec la mauvaise couleur sans lever la moindre erreur.

4. **L'ordre du peintre.** `slotsFor()` renvoie les créneaux par profondeur **croissante** :
   peints dans cet ordre, les objets lointains se dessinent par-dessus les proches. Toutes les
   boucles de rendu parcourent donc à rebours.

5. **`resolved` ≠ `consumed`.** `resolved` = « ne plus tester la collision » (touché, ramassé,
   **ou raté**). `consumed` = « vraiment touché/ramassé », et c'est le seul qui fait disparaître
   l'objet au rendu. Confondre les deux fait s'évaporer les objets ratés en plein milieu de la
   route.

6. **`scrollIntoView({block:"center"})` est à éviter sur Safari iOS** : il fait aussi remonter
   l'ancêtre scrollable (donc la page, en `overflow:hidden`) et provoque des sauts de mise en
   page. Le classement positionne son scroll à la main.

7. **`env(safe-area-inset-bottom)` ne couvre pas la barre de Safari iOS.** D'où la variable CSS
   `--browser-chrome-bottom`, calculée en direct depuis `window.visualViewport`.

8. **Le canvas ne participe pas au chargement des polices du document.** Un `ctx.font` demandé
   avant que le fichier soit prêt retombe silencieusement sur la police système et le texte déjà
   peint reste tel quel. D'où le `document.fonts.load()` explicite avant la première frame.

9. **`hash()` renvoie un FLOTTANT — jamais l'indexer sans `Math.floor()`.** `hash(n) % k` reste
   un flottant (0,45…), `tableau[0,45]` vaut `undefined`, et un `|| valeurParDéfaut` en aval
   avale l'erreur sans un mot. Trouvé le 19 août 2026 sur les outfits de piétons
   (`entities-render.js`) : `Math.abs(hash(slot * 7)) % 4` faisait retomber **199 slots sur 200**
   sur l'outfit par défaut — les quatre variantes n'avaient jamais servi depuis leur écriture.
   Même famille que le piège n°3 (`fillStyle` invalide) : un repli muet, invisible en jouant,
   qui ne se voit qu'en comptant. Le tirage d'outfit des cyclistes, lui, multipliait AVANT le
   modulo et n'a jamais eu le problème — comparer les deux si le doute revient.

10. **Le serveur de dev Vite répond 200 à un fichier absent** (repli SPA), pas 404. Une
    vérification d'échec réseau faite en local ne teste donc PAS le même chemin de code qu'en
    prod : côté audio, un 200 avec des octets illisibles part dans la branche « décodage
    impossible » et non « téléchargement impossible ». C'est en testant pour de vrai qu'on a
    découvert la seconde route de blocage de l'écran de chargement (voir §11). Pour simuler une
    vraie coupure réseau : pointer `fichierAudio` vers un hôte injoignable
    (`http://127.0.0.1:9/…`), qui fait bien rejeter `fetch()`.

11. **`element.textContent = "…"` sur un bouton qui contient des SVG les DÉTRUIT.** C'est ce
    qui a défiguré « DÉFIER UN AMI » du 23 août 2026 : `screens.js` mémorisait
    `DEFI_LABEL = defiButton.textContent.trim()` — or `textContent` d'un bouton concatène AUSSI
    le texte des `<title>` des SVG qu'il contient, donc le libellé mémorisé valait déjà
    « DÉFIER UN AMI WhatsApp Messages Snapchat ». La réécriture (`defiButton.textContent =
    DEFI_LABEL`, exécutée à CHAQUE `showEndScreen`) remplaçait ensuite tout le contenu du bouton
    par cette chaîne : les trois `<svg>` disparaissaient et la phrase s'écrivait en clair, sur
    une ligne rognée des deux côtés par le `white-space: nowrap` de `#end-screen .btn`.
    ⚠️ Ce n'était PAS un bug WebKit (première hypothèse, fausse) : il se reproduit partout, mais
    seulement au vrai rendu de l'écran de fin — le forçage du panneau en CSS depuis la console ne
    passe pas par `showEndScreen` et montrait un rendu correct. **Règle : le libellé d'un bouton
    à contenu mixte vit dans un `<span>` dédié** (`#defi-label`), jamais sur le bouton. En
    défense, deux règles de plus : **pas de `<title>` dans un SVG décoratif** (le conteneur est
    `aria-hidden`, il n'apporte rien et pollue `textContent`), et **pas de mise en page flex sur
    un `<button>`** — la poser sur un span interne (`#defi-inner`), WebKit/iOS étant connu pour
    ignorer `display:flex` sur les boutons.

---

## 11. Dettes et points ouverts

**Résolu, ne plus investiguer sauf nouvelle occurrence :**
- ~~Le classement n'apparaît pas sur l'écran de fin chez l'artiste~~ — constaté fonctionnel en
  prod le 12 août 2026 (screenshot : écran de fin avec classement rempli, plusieurs scores dont
  ceux de l'utilisateur). Cause jamais formellement identifiée (les hypothèses réseau/CORS
  avaient déjà été éliminées le 11 août, voir historique dans `PLAN-ACTION.md` si besoin), mais
  `net.js` garde son garde-fou (`getLastError()`, affichage « Classement indisponible » +
  raison en `?debug`) en cas de nouvelle panne côté client.
- ~~Incohérence de DA joueur/cyclistes~~ — résolue le 12 août 2026 : `player.js` est passé en
  voxel (blocs extrudés, `blk()`/`shade()` extraits vers `voxel.js` et partagés avec
  `cyclists.js`), vu de dos (roue arrière en tranche plutôt qu'en ellipse). Les deux fichiers
  partagent maintenant le même primitif de rendu, chacun garde sa silhouette bespoke (vue de
  face vs de dos, sac à dos vs guidon).
- ~~`pedestrians.js` resté en pixel art plat~~ — résolu le 12 août 2026 (même session, retour
  direct : « tu dois me revoir [...] les piétons ») : conversion `px()` → `blk()` à layout
  identique (import direct de `voxel.js`, pas de duplication de primitif). Les quatre
  personnages du jeu (joueur, cyclistes, piétons) partagent maintenant la même grammaire voxel.

**Revue de code du 21 août 2026** (demandée : « refais une étude de ton code et vois si tout
est bien »). Trois trouvailles, dont une critique :
- 🐛🐛 **CRITIQUE — la boucle de rendu plantait au départ de course** (`cameo.js`) : l'horloge
  démarre à −LEAD_IN (≈ −3,3 s), et depuis que Soberland est visible dès la première frame
  (seizième passe), son choix de frame d'animation `FRAMES[Math.floor(now × 1,6) % 4]`
  recevait un `now` NÉGATIF — or en JS `-6 % 4 === -2`, donc `FRAMES[-2]` = undefined et
  `drawImage` levait une exception à chaque frame. **La version déployée quelques heures plus
  tôt était cassée au lancement de course.** Trouvé en étendant le balayage §12 à t = −LEAD_IN
  avec les extras du caméo — les balayages précédents partaient de t = 0 SANS extras, et ne
  pouvaient donc pas le voir. ⚠️ Règle §12 mise à jour : TOUJOURS balayer depuis −LEAD_IN et
  passer les extras. Modulo normalisé ; `pedestrians`/`cyclists` étaient déjà protégés
  (`Math.abs(time)`), `player` aussi (normalisation ((x%n)+n)%n), et les créneaux d'index
  négatif sont exclus du rendu par `Math.max(0, …)` — le caméo était le seul exposé.
- 🐛 **Boucle equalizer qui survivait au REJOUER** (`screens.js`) : REJOUER masque l'overlay
  sans changer `currentView`, donc la boucle rAF de l'equalizer (conditionnée à `view ===
  "end"` seulement) tournait pendant TOUTE la course suivante — getEqLevels + styles chaque
  frame sur des barres invisibles. Conditionnée désormais à « vue de fin ET overlay visible »,
  synchronisée dans show/hideOverlay.
- **`SHOW_BEFORE` 6 → 7** (`cameo.js`) : à 6, `remaining` valait ~6,3 s à la première frame
  (l'horloge part de −LEAD_IN) et Soberland n'apparaissait que ~0,4 s après le départ — à 7 il
  est là dès la frame 1 (z ≈ 137, dans le champ), comme demandé.
- Ménage : `WINDOW_MIN_PX`/`DORMER_MIN_ROOF_PX` (world.js) supprimées — mortes depuis le
  régime unique de façade, elles auraient piégé un futur réglage de « pop de détail ».
- Revérifié au passage : `OPENING_KIND_OVERRIDE` ne peut PAS voler une étoile au quota
  (`isBonusAt` testé avant), l'image de partage suit `TOTAL_STARS` automatiquement (« x/85 »),
  plus aucun import de `clip.js`, aucun console.log. Balayage complet −LEAD_IN → arrivée,
  extras compris : **734 frames, 0 exception**, 85/106 confirmé, et les 6 étoiles de grâce
  mesurées toutes en voies latérales (la centrale reste à Soberland).

**Vingt-septième passe du 21 août 2026 — trois retours de l'artiste après test réel.**
- **« Terminer ma course » → « Voir mon score »** (bouton de refus du revive, index.html). Le
  libellé annonçait un ABANDON au moment précis où le joueur vient de mourir, alors que l'action
  réelle est d'aller voir sa carte de fin (score, classement, partage). Il dit maintenant ce qui
  se passe vraiment, sans faire porter le mot « terminer ».
- **Popups de points limités aux 5 premières étoiles** (`POPUPS_PEDAGOGIQUES` 3 → 5, main.js —
  « que pour les 5 premières étoiles, après tu arrêtes »). ⚠️ Le plafond s'applique DÉSORMAIS
  AUSSI aux étoiles dorées, qui avaient jusqu'ici leur propre branche sans limite (`if (e.gold)`,
  supprimée) : une dorée garde son jaune tant qu'on est dans la fenêtre des 5, et ne s'annonce
  plus après. Conséquence assumée à surveiller : le « ×2 » de la dorée n'a plus que les 5
  premières étoiles pour s'apprendre — la liste « Règles & points » du menu pause le dit aussi,
  c'est le filet. Les annonces de PALIER de combo ne sont pas des points et continuent de sortir.
- **Tutoriel rejoué sur les 3 premières parties** (`TUTO_PARTIES`, screens.js — « le tuto pour
  les 3 premiers atterrissages avec possibilité de skip »). Renversement partiel de la décision
  prise quelques heures plus tôt le même jour (sauté dès la 2e partie) : une seule exposition ne
  suffit pas pour la règle du pont, qui est la raison d'être du tuto. Le frein pour l'habitué est
  traité par le bouton « Passer l'intro », pas par la suppression — d'où l'ajustement qui va
  avec : le bouton attend 4 s à la 1re partie (un débutant doit voir la 1re consigne avant qu'on
  lui propose de sauter) et s'affiche **immédiatement** dès la 2e.

**Vingt-sixième passe du 21 août 2026 — 🐛🐛 AUCUNE PARTIE NE DÉMARRAIT (`runsTimer`).**
Le bug le plus coûteux du projet en rapport dégâts/taille : **une déclaration manquante**, qui a
rendu le jeu INJOUABLE pour tout le monde pendant quelques heures.
- **Symptôme** (remonté deux fois, sur deux appareils différents — un OnePlus 6T/Android 11 et un
  iPhone) : on presse JOUER, l'overlay disparaît, le décor défile, **le morceau continue** — et
  rien d'autre. Pas de HUD, pas d'objets, pas de bouton pause. Bloqué à vie, sans un message.
  Confondu au départ avec un bug Android ; c'était universel.
- **Cause** : `runsTimer` (compteur de parties, screens.js) n'était **jamais déclaré** — sa
  déclaration a sauté dans la refonte « compteur assaini » de la vingt-quatrième passe. Un module
  ES est en mode strict : lire un identifiant non déclaré lève un `ReferenceError`.
  `arreterCompteurCourses()` plantait donc à chaque appel, et `hideOverlay()` l'appelle —
  or `beginRun()` faisait `hideOverlay()` **AVANT** `deps.requestGameStart()`. L'exception tuait
  le handler du clic pile entre les deux : l'overlay était masqué (ligne d'avant), la course
  n'était jamais demandée. `gameStarted` restait `false` pour toujours.
- **Trouvé en reproduisant sur la PROD** dans la preview navigateur (`preview_start {url}` sur
  https://la-ville-est-belle-pmc.fr, pas sur le serveur de dev qui reste inaccessible, §12) :
  localStorage bidouillé pour simuler un joueur connu, clic sur JOUER, puis
  `read_console_messages` → l'erreur en clair. ⚠️ **Nouvelle méthode de test à retenir**, elle
  fait tomber une limite qui durait depuis le 12 août : la prod est chargeable même quand
  `localhost` ne l'est pas, et le jeu s'y pilote au DOM sans jamais démarrer l'AudioContext.
  ⚠️ Piège rencontré pendant cette vérification : le premier test « après correctif » montrait
  encore le bug — l'onglet avait rechargé l'ANCIEN `index.html` depuis son cache (`max-age=600`,
  §9) et donc l'ancien bundle. **Toujours vérifier le nom du bundle chargé**
  (`document.querySelectorAll('script[src]')`) avant de conclure quoi que ce soit sur un déploiement.
- **Trois correctifs, pas un** — le premier répare, les deux autres empêchent la classe entière :
  1. `let runsTimer = null;` (la cause).
  2. `beginRun()` demande le démarrage de la course **en premier**, le DOM ensuite et sous
     `try/catch`. **Règle générale : l'action essentielle avant la cosmétique.** Un ratage
     d'affichage ne doit jamais pouvoir empêcher une course de partir.
  3. `requestAnimationFrame(frame)` replanifié dans un **`finally`** (main.js), et
     `step()`/`render()`/`syncUi` isolés chacun dans leur `try`. Avant : une exception n'importe
     où laissait la boucle non replanifiée — image figée à jamais, musique qui continue dans son
     propre thread. C'est le symptôme exact décrit ici, et celui du crash `cameo.js` de la revue
     précédente : la boucle n'a jamais eu de filet.
- **Journal d'erreurs** (`debug.js`, `signaler()` + `window.onerror` + `unhandledrejection`) :
  affiché en rouge dans l'overlay `?debug`, exposé sur `window.__erreursJeu`. Sur un téléphone il
  n'y a ni console ni message — c'est précisément ce qui a fait perdre la soirée.
- **eslint `no-undef` passé sur tout `src/`** : aucun autre cas (les 3 restants — `Node`,
  `HTMLElement`, `MediaMetadata` — sont de vraies globales navigateur). ⚠️ Le projet n'a pas de
  linter installé ; `npx eslint@9` avec une config jetable a trouvé en 30 s ce qu'aucune relecture
  n'avait vu. **À refaire après toute refonte qui supprime des lignes.**
- Vérifié en prod après déploiement : `distance` qui monte, `horloge=audio`, HUD, cœurs, étoiles,
  bouton pause, jauge de défi — et `window.__erreursJeu` vide.
- **Preuve datée que ce n'était pas un problème d'appareil** : `let runsTimer = null;` existait
  encore dans `a15a1ca` (21/08 12:32) et a disparu dans `4d964be` (21/08 **22:21**) ; le premier
  rapport de blocage (OnePlus 6T, Android 11) date de **22:25**, quatre minutes après le
  déploiement de ce build. Le second (iPhone) est arrivé à 22:50 sur le build suivant, qui
  portait toujours le bug.

**Coût de rendu mesuré (21 août 2026)** — clôt la question laissée ouverte à la
vingt-quatrième passe (« optimisations d'allocations de `drawStar3D` non traitées, à reprendre si
un test sur vieil iPhone accroche ») et la suspicion « le jeu est trop lourd pour Android » :
- **22 107 appels canvas par frame** en pleine course (fillRect 2 542, fill 1 418, stroke 827,
  beginPath 2 349, moveTo 5 628, lineTo 8 653 — les chemins dominent : étoiles 3D + voxels +
  façades). Le chiffre impressionne mais les appels Canvas2D sont bon marché, c'est le GPU qui
  rastérise.
- **Temps CPU réellement passé dans la callback rAF : médiane 1,70 ms, p95 1,90 ms, max 2,00 ms**
  sur 479 frames (mesuré en enveloppant `requestAnimationFrame` sur la prod). Le budget d'une
  frame à 60 Hz est de 16,7 ms : il reste ~90 % de marge sur desktop, et même en supposant un
  téléphone de 2018 3 à 6 fois plus lent, on reste à 5-10 ms. **La perf n'est pas un sujet.**
- ⚠️ Mesure faite sur un navigateur DESKTOP : elle borne le coût, elle ne remplace pas un test sur
  un vrai téléphone. Le moyen de vérifier chez quelqu'un : `?debug`, qui affiche les FPS réels et
  le journal d'erreurs.
- **Poids transféré** (prod, gzip/br) : MP3 4,13 Mo, polices 134 Ko, bundle 33 Ko, index 27 Ko,
  `config.js` 4 Ko — soit **~4,4 Mo dont 94 % de morceau**. Le bouton JOUER reste désactivé tant
  que le morceau n'est pas prêt, donc un téléchargement lent se voit comme une attente, jamais
  comme un blocage en course.

**Vingt-cinquième passe du 21 août 2026 — défi à un ami, course parfaite, Instagram.**
Trois leviers de rétention/partage choisis par l'artiste dans une liste de dix propositions
(« le défi à un ami [...] le point numéro 5 [...] est-ce qu'on peut mettre mon lien Instagram à
la fin du jeu ? »). Aucun ne touche à l'équilibrage : le quota 85/106, la loi de difficulté et
le score maximum (86 825 / 95 519) sont inchangés.
- **`defi.js` (nouveau module)** — la cible d'un défi voyage dans l'URL (`?defi=23102&de=pol`) et
  le jeu la porte d'un bout à l'autre : bandeau rouge au-dessus de JOUER (« pol te défie /
  23 102 points à battre »), jauge de progression sous le score pendant TOUTE la course
  (`hud.renderDefi`), popup « DÉFI RELEVÉ ! » à l'instant du dépassement, verdict sur l'écran de
  fin (relevé, ou l'ÉCART qui manquait — c'est le chiffre qui fait relancer). Le partage se fait
  par un lien texte discret sous PARTAGER MON SCORE, `navigator.share({text, url})` sans fichier
  joint (le champ `url` est honoré ici, contrairement à share.js), repli presse-papiers.
  - ⚠️ **Le lien de défi se fabrique sur une base EN DUR** (`BASE`, defi.js), jamais sur
    `location.href` : le défiant est très souvent quelqu'un qui vient lui-même d'un lien de défi,
    et relayer son URL courante renverrait le score de la personne PRÉCÉDENTE.
  - ⚠️ **Aucune vérification, par construction** — cohérent avec « aucun anti-triche, la vérité du
    concours se fait au screenshot ». Rien de tout ça n'atteint Supabase : `net.js` ne lit pas
    `defi.js`, un défi truqué ne salit que le duel entre deux amis.
  - Entrées nettoyées : score entier de 1 à 9 999 999, pseudo réduit à `\p{L}\p{N}._ -` et
    18 caractères. Vérifié hors ligne sur 10 URL (dont `?defi=abc`, `?defi=-5`, `?defi=1e9` et
    une tentative d'injection) : rejets et troncatures conformes.
  - `hud.renderDefi` est posé à `PAD + SCORE_SIZE × 2,3`, mesuré pour ne croiser NI la pénalité
    (qui descend au plus bas à ×1,2 et REMONTE avec l'âge) NI le combo (×1,1 + ~16 px).
    Balayage de rendu hors ligne (ctx factice, 375×812) : pastille la plus large mesurée à 230 px
    sur 375, pseudo de 18 caractères + cible à 7 chiffres compris — aucun débordement.
- **Course parfaite** (`game.sansFaute`) — parcours terminé sans UN SEUL choc, traversante
  encaissée par les cœurs comprise (le badge dit « aucun choc », pas « aucune vie perdue »).
  Tous les obstacles de la grille étant fatals, c'est mécaniquement aussi une course sans
  seconde chance : le badge le plus rare du jeu. Se lit à trois endroits : le bandeau de l'écran
  de fin (« Course parfaite » au lieu de « Parcours terminé »), une pastille jaune sous le score,
  et le badge de l'image de partage — où il **remplace** le badge de disque plutôt que de s'y
  ajouter (un joueur parfait a de toute façon un bon score ; afficher les deux diluerait le rare
  dans l'ordinaire). Le drapeau tombe APRÈS le garde de bouclier post-revive, donc un choc ignoré
  par le bouclier ne compte pas — sans effet en pratique (un revive implique déjà un choc).
- **Instagram de l'artiste** (`lienInsta`, config.js) sur l'écran de fin, accroché au rappel du
  concours : « Résultats du concours sur @pmc.mp3 ». Placement choisi contre l'évidence (à côté
  des CTA) : là il DONNE une raison de suivre — savoir si on a gagné le vinyle — au lieu d'être
  un troisième lien qui se dispute le clic avec le morceau et avec « suivre PMC sur Spotify ».
- ⚠️ **Non vérifié à l'écran** : la preview navigateur a de nouveau refusé toute navigation vers
  le serveur de dev (symptôme connu, §12), donc rien du DOM (bandeau, pastilles, ligne Instagram,
  lien de défi) n'a été vu en vrai — seulement le build (26 modules transformés, 0 erreur), le
  balayage de `renderDefi` sur ctx factice et les tests d'URL. **À regarder au prochain test
  téléphone**, en ouvrant le jeu avec `?defi=1000&de=test`.

**Vingt-quatrième passe du 21 août 2026 — audit à 8 angles, corrections, échelle de conversion à 3 paliers.**
- **Revue de code à 8 angles sur tout le diff du jour (2 094 lignes)** : 10 constats vérifiés,
  dont 3 vrais bugs dans le revive livré quelques heures plus tôt — tous corrigés ci-dessous.
- 🐛 **Le clic non-fan n'ouvrait JAMAIS Spotify** : revivePhasePrete() retirait le href du <a>
  PENDANT le dispatch du clic, or l'activation d'un lien relit le href APRÈS le dispatch — la
  navigation était annulée (prouvé au banc d'essai : lien-sonde + removeAttribute = zéro
  navigation, témoin identique = navigation). Le joueur était marqué converti sans avoir rien
  ajouté. Corrigé : le basculement en phase « prêt » est différé d'un setTimeout(0). ⚠️ Règle à
  retenir : ne JAMAIS toucher au href d'un lien dans son propre handler de clic.
- 🐛 **Le décompte de 10 s n'était pas vraiment gelé sur iOS** : les timers y sont totalement
  suspendus en arrière-plan, donc aucun tick ne tournait avec document.hidden — au retour, le
  premier tick voyait TOUTE l'absence dans son delta et vidait la fenêtre d'un coup (auto-
  décline). Corrigé : plafond de REVIVE_TICK_MAX_S = 0,3 s décompté par tick (Math.min sur le
  delta), le garde document.hidden ne couvrant que desktop/Android. Vérifié : un gel synchrone
  de 1,5 s ne décompte que ~0,3 s.
- 🐛 **Les swipes faits sur la carte de mort s'exécutaient à la reprise** : pendant revivePaused,
  step() ne consomme plus la file d'input (2 voies + saut + slam au niveau module input.js) —
  purge ajoutée dans onAccept (le seul état du jeu où la file peut s'accumuler : partout
  ailleurs step() la vide en continu, même écran de fin).
- ⚠️ **ÉCHELLE DE CONVERSION À TROIS PALIERS** (demandé : « on ne peut pas refaire l'action en
  permanence ») : `reviveMode` posé à l'ouverture — "morceau" (CTA lienEP), "suivre" (CTA
  lienSuivre, clé pmcSuivi partagée avec le verrou de fin → jamais demandé deux fois), "attente"
  (tout fait : le décompte devient une simple attente et ARME le bouton REPRENDRE au lieu de
  décliner ; clic ignoré + .locked tant qu'il tourne, « Terminer ma course » reste ouvert).
  Testé de bout en bout en harnais : les 3 paliers, la préservation du href pendant le dispatch,
  les conversions marquées, l'expiration-qui-arme, la reprise au tap.
- **Marge pont×traversantes RECALIBRÉE, mesure honnête à l'appui** : la marge de 0,5 s valait
  42 unités au plafond de vitesse et supprimait 20 traversées sur 58 (~35 % du levier de fin de
  course !) — masqué par la mesure précédente qui comptait « vu une frame = conservé » (le
  chiffre « 1 supprimée » d'hier était FAUX ; la bonne méthode : profondeur de DERNIÈRE
  apparition, une disparition à z > 6 = suppression). Le cas injuste est le CHEVAUCHEMENT, pas
  le voisinage : 0,15 s + plancher 6 unités → 5 suppressions sur 58, toutes réelles.
- **sousUnPont ne relit plus clock.now() par carrefour** : pontsVisibles() extrait les z des
  ponts UNE fois par balayage — la relecture par carrefour cassait la mémoïsation du slotCache
  (clé d'égalité stricte), systématiquement sur l'horloge de secours.
- **Compteur de parties assaini** : Prefer count=planned (estimation O(1) au lieu d'un comptage
  complet par requête), 5 s → 20 s, pas de requête onglet caché, et le plancher de preuve
  sociale (< 20 → masqué) supprimé par erreur dans la refonte est restauré.
- **Chiffres officiels recalculés après GRACE_BEATS 7** (le tirage déterministe s'est
  redistribué) : **14 étoiles dorées** (13 avant), **score max 86 825** (95 519 avec boost fan).
  CLAUDE.md mis à jour ; le classement Supabase amorcé sous 14 000 reste largement en dessous.
- Doc réalignée : lienSuivre (vrai profil vérifié), GRACE_BEATS 7 (§6 + CLAUDE.md), la mention
  « grilles indépendantes, coïncidence possible » remplacée par la réalité sousUnPont.
- Non traité, assumé : les optimisations d'allocations de drawStar3D (buffers scratch, géométrie
  unitaire partagée, halo pré-cuit) — réelles mais risquées visuellement à la veille du
  lancement, aucune saccade rapportée en jeu réel à ce jour. À reprendre si un test sur vieil
  iPhone accroche.

**Vingt-troisième passe du 21 août 2026 — reprise en deux temps, règles dans la pause, jingle −5 dB.**
- ⚠️ **La seconde chance passe en DEUX PHASES** (`revivePhase`, screens.js — retour après test
  réel : « je suis reparti d'un seul coup, j'ai perdu mes bonus »). La première version
  reprenait la course À L'INSTANT du clic sur le lien : le joueur partait sur Spotify, le jeu se
  gelait (onglet caché), et au retour la course tournait DÉJÀ sous ses doigts. Désormais :
  phase « decision » (décompte 10 s + CTA) → le clic d'un non-fan ouvre Spotify, marque la
  conversion et bascule la carte en phase « pret » (décompte ARRÊTÉ, reprise acquise — plus
  rien ne peut la retirer, titre « Morceau ajouté, merci ! ») ; la reprise réelle n'arrive QUE
  sur le tap « REPRENDRE MA COURSE » suivant — que le joueur revienne dans 5 s ou 3 min, c'est
  LUI qui décide quand ses mains sont prêtes. Un fan reprend toujours en un clic (rien à
  ajouter). Le bouclier de 2 s est posé dans onAccept, donc au moment du VRAI redémarrage.
  ⚠️ Un retour très tardif dépasse `pauseDeriveMax` (25 s) : la soupape existante d'audio.js
  rembobine le morceau, la course garde sa position — comportement déjà documenté, inchangé.
  ⚠️ Textes de la carte reconstruits en DOM (`poserTexteRevive`), JAMAIS via innerHTML : un
  innerHTML détacherait les nœuds et laisserait des références mortes (piège évité de justesse
  à l'écriture). ⚠️ Piège d'édition rencontré : la chaîne « points. » du markup contient un
  ESPACE INSÉCABLE (\xa0) — toute ancre de recherche avec un espace normal échoue en silence.
- **Le combo SURVIT au choc qui déclenche la seconde chance** (main.js — « faut bien garder
  les bonus en cours ») : le streak n'est plus remis à zéro (ni « COMBO 0 » affiché) quand le
  choc va ouvrir l'offre (`fatal && !reviveOffered`), y compris une traversante qui prend le
  dernier cœur. Restent cassants : une traversante encaissée par les cœurs, et toute mort une
  fois l'offre consommée (partie finie de toute façon).
- **Vue « Règles & points » dans la carte pause** (`#pause-rules`, index.html + screens.js —
  demandé : « les règles des points dans le menu pause avec un menu spécial + la manipulation
  de sauvegarder le jeu »). Une seule carte, deux vues basculées (`setPauseRulesOpen`) : liste
  scrollable (étoiles 50→500, dorée ×2, combo, obstacles fatals/traversantes, boost fan +10 %,
  et la manip « sauve ta course »), RETOUR en bas, bandeau qui change de titre. ⚠️ Le zoom ×1,2
  de la carte pause SAUTE en vue règles (classe `rules-open`) — la liste y déborderait de
  l'écran. ⚠️ Les chiffres de la liste suivent config.js À LA MAIN : les mettre à jour ensemble.
  Rouvre toujours sur la vue principale (reset dans openPauseMenu).
- **Jingle de combo −5 dB** (« baisse de 5 dB le bruit des bruitages ») : `JINGLE_GAIN`
  0,16 → 0,09 (audio.js, ×10^(−5/20) ≈ ×0,562). C'est le seul bruitage du jeu.
- Vérifié : les deux phases du revive (labels/lien/conversion/résolutions), l'aller-retour
  règles (zoom compris, réouverture sur vue principale), balayage complet 17 704 frames à pas
  réel 1/120 s, 0 exception, quota 85/106 intact.

**Vingt-deuxième passe du 21 août 2026 — trois retours après test réel sur le build précédent.**
- 🐛 **BUG CRITIQUE trouvé et corrigé : « reprendre ma course » ne faisait rien (game over
  immédiat derrière le panneau).** Cause : la boucle à pas fixe (`while (accumulator >= FIXED_DT)
  { step(FIXED_DT); ... }`, main.js) ne revérifiait `isPaused()` qu'AVANT d'entrer dans la boucle,
  jamais entre deux itérations. Or FIXED_DT = 1/120 s alors qu'un écran tourne typiquement à
  60 Hz : **chaque frame exécute step() DEUX FOIS d'affilée**, c'est le régime normal, pas un cas
  rare. À la mort, le premier step() de la frame appelle `offerRevive()` (bascule
  `revivePaused = true`) — mais le second step() de la MÊME frame s'exécutait quand même,
  retrouvait `game.lives <= 0` toujours vrai et `reviveOffered` déjà mis à `true` par le premier
  appel, et déclenchait `endGame("gameover")` DANS LA FOULÉE. Le panneau de seconde chance et
  l'écran de fin s'ouvraient donc TOUS LES DEUX à chaque mort, systématiquement — accepter
  l'offre ensuite ne pouvait rien faire, `game.ended` était déjà vrai. Corrigé en ajoutant
  `&& !isPaused()` à la condition du `while` : la boucle s'arrête dès qu'un `step()` bascule la
  pause, au lieu d'attendre le tour suivant. Prouvé par une simulation isolée du pattern exact
  (frame de 16,67 ms → 2 step() avant fix, `endGameCalled: 1` ; 1 seul après, `endGameCalled: 0`)
  et par un balayage complet à pas réel (1/120 s) : 17 704 frames, 0 exception, quota 85/106
  inchangé. ⚠️ Cette classe de bug (état de pause changé DEPUIS L'INTÉRIEUR de step(), au lieu
  d'un événement externe comme un clic ou `visibilitychange`) est nouvelle avec `revivePaused` —
  `manualPaused`/`hiddenPaused` ne pouvaient jamais changer en cours de boucle synchrone. Tout
  futur mécanisme qui pause la partie DEPUIS step() doit repasser par ce même `while (... &&
  !isPaused())`, pas par le seul test d'entrée.
- **Espace d'air sous « Pas X ? Modifier »** (« laisse-le respirer, c'est pas lisible ») :
  `#change-pseudo` collait directement sous JOUER — ni l'un ni l'autre n'a de marge propre, et
  `.panel-body` n'a pas de `gap`. `margin-top: 14px` ajouté, scopé à cet id seul (n'affecte pas
  les autres `.link-minimal` du jeu, chacun déjà dans un conteneur à `gap`).
- **Étoiles d'ouverture allégées** (« énormément d'étoiles au tout début, ça va pas du tout ») :
  `GRACE_BEATS` 8 → 7 (`entities.js`), donc `GRACE_SLOTS` 6 → 5 — un créneau étoile forcé de
  moins. ⚠️ **5 est le PLANCHER mathématique sûr**, pas un choix arbitraire : Soberland
  (cameo.js) disparaît à 3,6 s (`CAMEO_TIME_S` + `SHOW_AFTER`) ; à la cadence de 0,75 s/créneau,
  le créneau 4 arrive à 3,0 s (AVANT sa disparition — rouvrirait le bug « obstacle qui partage
  l'écran avec lui », fixé le même jour un peu plus tôt), le créneau 5 arrive à 3,75 s (0,15 s de
  marge, contre 0,9 s avant). Vérifié par balayage (`§12`) : 17 704 frames, 0 exception, quota
  85/106 inchangé (le créneau libéré retombe simplement dans le calcul normal de la rampe).
  ⚠️ **Amélioration réelle mais MODESTE, à assumer explicitement** : un rendu à t≈2,2 s montre
  encore 5 étoiles à l'écran simultanément (2 grandes au premier plan + 3 qui reculent vers
  l'horizon) — la densité reste élevée juste après la grâce, parce que le ratio d'étoiles de la
  rampe normale est LUI-MÊME haut en début de course (`OBSTACLE_RATIO_START` = 0,381, donc
  ~62 % d'étoiles), une caractéristique voulue et documentée séparément (« beaucoup d'étoiles
  tôt, de moins en moins tard »), pas quelque chose que cette passe a touché. Le vrai gain
  mesuré : le premier OBSTACLE arrive 0,75 s plus tôt qu'avant (3,75 s au lieu de 4,5 s), donc le
  mur de stars-only casse plus vite. Si la densité reste trop élevée au retour du prochain test,
  le levier suivant est de raccourcir la fenêtre de Soberland lui-même (`CAMEO_TIME_S`/
  `SHOW_AFTER`, cameo.js) pour abaisser encore le plancher — décision distincte, à reconfirmer
  avant de la prendre (elle change une DA récemment validée, pas juste un chiffre de gameplay).

**Vingt-et-unième passe du 21 août 2026 — mort à un choc + seconde chance, gros lot de retours.**
- ⚠️ **CHANGEMENT DE RÈGLES : tous les obstacles de la grille sont FATALS** (« je veux que tous
  les obstacles fassent trois cœurs ») — piéton/cycliste/cône rejoignent voiture/pont
  (main.js, branche de collision). SEULE exception : la voiture TRAVERSANTE reste à −1 vie
  (invariant verrouillé de crosstraffic.js — les coïncidences inter-grilles ne sont pas toutes
  exclues par construction). Les cœurs ne servent plus qu'à encaisser les traversantes.
- **Seconde chance à la mort (revive)** — « dix secondes pour prendre une décision [...] tu peux
  sauvegarder le morceau et ça relance ta partie ». `offerRevive()` (main.js) : la première mort
  d'une partie n'appelle plus endGame() — elle gèle la course par le MÊME mécanisme que le menu
  pause (`revivePaused` → isPaused, morceau étouffé, budget `pauseDeriveMax` 25 s) et ouvre
  `#revive-sheet` (screens.openReviveSheet) : carte centrée, décompte 10 s en cercle SVG.
  CTA « AJOUTER LE MORCEAU » (lien lienEP, conversion AU CLIC comme le verrou de rejeu) → vies
  restaurées, reprise PILE où on est mort, score conservé ; « Terminer ma course » ou expiration
  → endGame. Un fan (morceau déjà ajouté) reprend gratuitement (« REPRENDRE MA COURSE », l'
  avantage reste acquis). UNE offre par partie (`reviveOffered`, remis à zéro au rejeu).
  ⚠️ Trois pièges résolus, à ne pas casser :
  1. le décompte SE FIGE quand l'onglet est caché (screens.js) — partir sur Spotify ne consume
     pas la fenêtre, c'est ce qui rend le détour possible ;
  2. bouclier de reprise `REVIVE_SHIELD_S` (2 s, horloge musicale) — on ressuscite parfois à
     quelques dixièmes du créneau suivant, les chocs y sont ignorés (l'obstacle, déjà résolu par
     entities.update, est traversé) ;
  3. unlock/play audio REFAITS dans startGame() (screens.js) — voir l'onboarding sauté ci-dessous.
- **Conflit pont × voiture traversante corrigé** (« ils s'entrechoquent, on peut juste pas
  passer ») : `sousUnPont()` dans crosstraffic.js — dépendance à sens unique crosstraffic →
  entities (slotsFor/isBridgeSlot), assumée contre l'invariant d'indépendance des grilles : un
  véhicule dont le carrefour tombe à moins de `PONT_MARGE_S` (0,5 s × vitesse, plancher 4 unités)
  d'un pont est supprimé. ⚠️ Marge en TEMPS, pas en unités : le premier réglage (9 unités fixes)
  valait 0,1 s au plafond de vitesse et ne supprimait RIEN (mesuré par balayage — 0 suppression),
  alors que le retour venait de la fin de course. Mesuré après : 57 traversées atteintes, 1
  supprimée (la coïncidence réelle du parcours), 56 conservées. Suppression MONOTONE et mémorisée
  (`supprimes`, vidé par reset()) ; un carrefour « gardé » reste revérifié — la fenêtre des
  créneaux (z ≤ 90) est plus courte que le champ des carrefours (z ≤ 209).
- **Vitesse de fin −15 %** (« trop hardcore ») : `vitesseMax` 9,0 → 7,65 (config.js), plafond
  mesuré 84,1 u/s. Quota inchangé (85/106, revérifié).
- **Onboarding sauté pour un joueur connu** (« quand les gens reviennent, ils n'ont pas besoin
  de refaire quoi ») : pseudo ET insta en localStorage → atterrissage direct sur « JOUER », avec
  un lien « Pas X ? Modifier » pour changer d'identité. ⚠️ C'est ce saut qui a imposé le piège
  n°3 ci-dessus : le déverrouillage iOS vivait sur le clic « Suivant », désormais optionnel.
- **Hiérarchie des CTA de fin INVERSÉE** (« les gens vont cliquer [REJOUER], et on leur dit :
  pour rejouer, il faut ajouter le morceau ») : REJOUER devient le bouton principal rouge, en
  premier ; AJOUTER LE MORCEAU passe en secondaire mais reste TOUJOURS présent ; PARTAGER en
  troisième. Le verrou de rejeu (#unlock-sheet) fait la conversion au clic sur REJOUER.
- **Écran de fin compact sous 740 px de hauteur** (« sur les petits téléphones ça va pas du
  tout », capture : REJOUER coupé) : la media query ne réduit plus seulement le classement
  (5 → 3 lignes) mais toute la carte (score 40 → 32 px, paddings, gaps) — mesuré : la carte
  entière tient dans 660 px sans défilement (bas de carte à 550).
- ⚠️ Piège de harnais rencontré (à connaître, §12) : après des éditions à chaud, Vite estampille
  les imports (`?t=`) — un `import('/src/…')` sans query charge alors une SECONDE instance du
  module, et les listeners « ne marchent plus ». Redémarrer le serveur de dev avant de tester.

**Vingtième passe du 21 août 2026 — dégraissage de l'écran de fin + audit de lancement.**
- **Bandeau « Tu écoutes La ville est belle » RETIRÉ** (demandé) : markup, CSS et toute la boucle
  rAF de l'equalizer (`eqTick`/`syncEqLoop`, screens.js) ont sauté. ⚠️ `audio.getEqLevels()` et
  l'`AnalyserNode` de la chaîne de sortie sont **volontairement laissés en place** : plus personne
  ne les appelle, mais un analyseur qu'on ne lit jamais ne coûte rien, alors que retoucher la
  chaîne audio est ce qu'il y a de plus fragile dans ce projet (§5.1, §8) — pas la veille d'un
  lancement pour un gain nul. À nettoyer plus tard si la chaîne audio est rouverte pour autre
  chose. ⚠️ Le CTA `AJOUTER LE MORCEAU` reste : c'est lui qui porte la conversion, le bandeau
  n'était qu'un rappel.
- **Date de fin du concours retirée de l'écran de fin** (demandé). ⚠️ Conséquence à connaître :
  `contestStatus()` (hud.js) continue de piloter l'ENVOI des scores — après `dateFermeture`
  (11 octobre 2026), `postScore()` n'est plus appelé et **rien n'est enregistré, en silence**,
  sans que le joueur voie de différence. Plus aucun écran ne mentionne la date : elle doit être
  communiquée en dehors du jeu (post Instagram), ou `dateFermeture` repoussée.
- Coquille corrigée : « un vinyl de l'EP » → « **vinyle** » (`#end-note`).
- Audit de lancement : RLS reverifiée en prod (lecture directe de `scores` toujours vide,
  UPDATE/DELETE refusés, trigger « meilleur score » actif — testé sans polluer la base en
  envoyant un score volontairement plus bas), balayage complet 738 frames/0 exception,
  quota 85 étoiles/106 obstacles intact, image de partage régénérée et vérifiée.

**Dix-neuvième passe du 21 août 2026 — écran de fin (retour iPhone, capture à l'appui).**
- 🐛 **Le score s'affichait DEUX FOIS** (« y'a deux fois le score ») : `hudAlpha` (main.js) ne
  faisait que MONTER vers 1 et n'était remis à 0 qu'au rejeu — le HUD de course (score + cœurs)
  restait donc peint derrière la carte de fin, qui affiche déjà le score en grand. Il descend
  maintenant vers 0 dès `game.ended`, sur la même durée de fondu (0,6 s), pendant que la carte
  monte. Le rejeu est inchangé (`hudAlpha = 0` puis remontée vers 1).
- **Compteur de parties en temps réel** (`#runs-count`, demandé) : relu toutes les 5 s tant que
  l'écran de fin est ouvert — quelqu'un qui y reste (~114 s de morceau) voit le chiffre monter.
  ⚠️ L'intervalle est coupé dans `hideOverlay()`, même piège que la boucle de l'equalizer qui
  avait tourné toute une course en arrière-plan. **Sorti de `#leaderboard`** dans le DOM : il y
  était imbriqué, donc invisible dès que le classement ne se chargeait pas alors qu'il n'en
  dépend pas. Passé de 10px gris à une pastille avec point rouge clignotant (il se confondait
  avec la mention légale au-dessus), et le seuil d'affichage « ≥ 20 courses » a sauté.
  ⚠️ CSS en BLOC centré, pas en flex : en flex le libellé devenait un enfant contraint et se
  coupait en deux lignes déséquilibrées dans la carte, qui est étroite.
- **Base amorcée avant lancement** (demandé) : compteur de parties mis à **124**, et **22 scores
  de démarrage** sous 14 000 avec des pseudos inventés, pour que le classement ne soit pas vide
  au lancement. ⚠️ **Toutes ces lignes portent `game_version = 'seed-demo'`** et un
  `pseudo_insta` synthétique (`seed-demo-NN`, jamais un vrai compte) : elles sont donc
  supprimables d'un seul `delete ... where game_version = 'seed-demo'`, et aucun contact
  accidentel de l'artiste n'est possible. À purger avant de désigner le gagnant.

**Dix-huitième passe du 21 août 2026 — domaine propre + salve UX (retour iPhone en prod).**
- **Domaine `la-ville-est-belle-pmc.fr`** (OVH, acheté par l'artiste) sur GitHub Pages :
  `public/CNAME` (donc embarqué au build, sinon chaque force-push le perdrait), balises OG/
  Twitter et URL de l'image de partage recalées dessus, HTTPS forcé activé via l'API GitHub.
  L'ancienne adresse `pmcmp3.github.io/la-ville-est-belle` redirige (301) — rien de partagé
  avant ne casse. ⚠️ **Ordre de déploiement non négociable** : publier le CNAME AVANT que le
  DNS résolve rend le jeu injoignable aux DEUX adresses (github.io se met à rediriger vers un
  domaine mort). Vérifier `dig +short A <domaine>` d'abord.
  ⚠️ **Piège OVH rencontré** : la zone d'un domaine neuf contient une page d'attente —
  `A 213.186.33.5` + `TXT "…|welcome"` sur l'apex ET sur `www`. Sur `www` elle FAIT ÉCHOUER
  l'ajout du CNAME (un CNAME ne peut coexister avec aucun autre enregistrement du même nom) ;
  sur l'apex elle est plus vicieuse — aucune erreur, mais 1 visiteur sur 5 tombe sur la pub
  OVH, et surtout **GitHub refuse d'émettre le certificat** tant qu'une IP étrangère traîne,
  donc pas de HTTPS, donc `navigator.share` (le partage de score) mort. À supprimer avant tout.
- **Écran « monte le son » en DA pixel** (`#sound-notice`, index.html) — « je veux un truc pour
  dire de monter le volume en DA pixel et juste un texte simple pour android et iphone ».
  Haut-parleur + 3 ondes concentriques en SVG `shape-rendering: crispEdges` (un `<rect>` par
  bloc : arêtes dures à toute densité d'écran, là où un PNG baverait en @3x), ondes qui
  s'allument en cascade. ⚠️ Palier bas de l'animation à 0,5 et pas 0,18 : plus bas, l'onde
  disparaît du fond rosé et le pictogramme passe la moitié du temps amputé. Ondes dessinées en
  ESCALIER (2 marches + un ventre) — une simple barre verticale se lisait « | », pas « son ».
- **Tuto : textes réduits, plus de chevauchement** (« les éléments se marchent un peu dessus,
  le 1/4 est énorme pour rien ») : `#countdown-num` 56 → **26px** (ce n'est qu'un indicateur de
  progression, il ne doit pas concurrencer la scène), `#countdown-caption` 16 → **13,5px** et
  son ancrage 114 → 86px, pochette `height×0,30` → **`max(height×0,28, 172)`** avec un plancher.
  ⚠️ Le plancher est la vraie correction : la consigne est du DOM, la pochette est peinte sur le
  CANVAS — les deux ne se voient pas. Mesuré sur iPhone SE (667px, le pire cas) avec la consigne
  la plus longue : la marge consigne↔pochette passe de **−13px (chevauchement) à +42px**.
- **Tutoriel sauté pour qui a déjà joué sur ce téléphone** (`startGame()`, screens.js) — demandé.
  ⚠️ **Révisé le soir même, voir la vingt-septième passe** : le tutoriel se rejoue désormais sur
  les TROIS premières parties (`TUTO_PARTIES`), pas seulement la première.
  Réutilise `partiesJouees` (déjà incrémenté à chaque écran de fin), **aucune nouvelle clé** :
  vaut 0 tant qu'aucune course n'est allée à son terme, donc quelqu'un qui abandonne sa première
  course le revoit, et le repli en navigation privée (0) redonne le tutoriel plutôt que de le
  retirer à un débutant. REJOUER passait déjà à côté du tuto (`restartGame`, chemin séparé).

**Dix-septième passe du 21 août 2026 — refonte 3D des étoiles (screens d'inspiration à l'appui).**
- 🐛 **« Les étoiles 3D sont moches, on dirait des petits pâtés »** (références fournies :
  étoile Mario en voxel et en volume lissé). Le montage face-plate-pincée-au-cosinus + tranche-
  capsule (deux passes précédentes) ne lisait pas « étoile en volume » : de trois quarts, la
  capsule débordait derrière la face comme un blob. **Tout le pipeline d'icônes pré-cuites des
  bonus a sauté** (`starBonus`/`starGold`/`starEdgeIcon`, `BONUS_ICONS`/`GOLD_ICONS`/
  `EDGE_ICONS`) au profit d'un rendu DIRECT par frame, `drawStar3D()` (entities-render.js) :
  le contour étoilé est un vrai solide (extrusion + apex central bombé sur chaque face),
  projeté en orthographique après rotation autour de l'axe vertical — 10 facettes par face en
  cel-shading 3 tons (la lumière tourne avec l'étoile), 10 quads de tranche triés par
  profondeur (le contour est concave, l'ordre des arêtes ne suffit pas), contour sombre en un
  seul chemin qui épouse la silhouette réelle sous tous les angles, yeux sur les DEUX faces
  (l'étoile « regarde » le joueur sur toute la rotation), escamotés de profil.
- ⚠️ Deux subtilités qui ont demandé un aller-retour : le bombé GÉOMÉTRIQUE est discret
  (`STAR_BUMP` 0,16 — plus fort, le profil à 90° devenait un tonneau hexagonal) mais les
  NORMALES de shading utilisent un bombé exagéré (`STAR_SHADE_BUMP` 0,55) pour que les facettes
  accrochent franchement la lumière ; et l'épaisseur est `STAR_THICK` 0,36 (0,55 au premier
  essai : trop gras de profil, les yeux glissaient vers le bord aux angles intermédiaires).
- Coût : ~30 remplissages par étoile, rendu direct comme les personnages voxel — la rotation
  est parfaitement lisse (plus de quantification possible d'icônes pré-cuites). Halo doré
  désormais peint par frame (`drawGoldHalo`, 1-2 dorées visibles max, négligeable).
- Vérifié en harnais (§12) : grille 8 angles × 4 tailles réelles (grosse/dorée/mi-distance/
  lointaine) + balayage complet −LEAD_IN → arrivée extras compris, **738 frames, 0 exception**,
  + un rendu en contexte réel (route/façades/pont). La hiérarchie taille↔valeur et les teintes
  de base (#ffcf2e / #fff3c2) sont inchangées.

**Seizième passe du 21 août 2026 — quatrième salve (retour jeu réel).**
- 🐛 **Tranche 3D des étoiles invisible en jeu** (« elles disparaissent pareil, ça marche pas du
  tout ») : le premier jet réutilisait la silhouette ÉTOILÉE pincée à 16 % de sa largeur — un
  contour concave écrasé ne laisse presque rien, et à la taille réelle d'une icône (15-30 px)
  ça faisait 2-5 px, sous le seuil de perception à vitesse de course. ⚠️ Leçon de méthode : la
  preview (étoiles isolées, figées, grosses) validait un effet que le jeu réel ne montrait pas.
  Remplacée par une **capsule pleine** (pilier arrondi ambre + liseré clair central, plancher
  de largeur 0,42 au lieu de 0,16) — un bloc franc, lisible même petit et lancé.
- **Soberland au TOUT début, seul à l'écran** (« j'insiste ») : `CAMEO_TIME_S` 7 → 3 s
  (cameo.js — visible dès la première frame), `GRACE_BEATS` 4 → 8 (entities.js — premier
  obstacle à ≈4,5 s, ~0,9 s après sa sortie d'écran), et les étoiles de grâce sont forcées sur
  les voies LATÉRALES (slotLanes) — sa voie centrale reste vide tant qu'il est là.
- **Étoiles aériennes réduites de 18 %** (`AERIAL_SIZE` 0,82, entities-render.js) — « en
  perspective elles ont l'air gigantesques » : `guitare` (tier 1,4) débordait même de son
  canvas d'icône. Réduction ciblée aux seuls bonus aériens, la hiérarchie taille↔valeur des
  étoiles au sol ne bouge pas.
- **« COMBO 0 » en rouge au choc** (main.js) quand un multiplicateur actif (streak ≥ 5) est
  cassé — même mécanique de popup que les gains, rouge de charte (malus).
- **Détente d'étoiles en fin de course** (`OBSTACLE_END_TAPER_START_S` = 100 s,
  `OBSTACLE_RATIO_END` = 0,45, entities.js) — « plus d'étoiles à la fin, ça va super vite mais
  il n'y a pas beaucoup d'étoiles ». Le ratio d'obstacles redescend linéairement de 0,60 à 0,45
  entre 100 s et la ligne. Justification d'équilibre : depuis l'arbitrage du plafond à 60 %,
  les véhicules traversants (HORS quota) sont venus s'ajouter à densité maximale après 100 s —
  la fin cumulait les deux sources de danger. Mesuré après (balayage §12, 0 trou, 718 frames
  sans exception) : **85 étoiles / 106 obstacles** (80/111 avant), dernières 30 s : 16 → 19
  étoiles. **Nouveau score max : 81 525 (89 678 avec boost fan)** — la hausse vient de la
  détente ET de la grâce allongée (le quota est décalé, donc dorées et types retirés
  différemment). ⚠️ Classement Supabase toujours à vider avant lancement.

**Quinzième passe du 21 août 2026 — troisième salve, testée depuis le navigateur Instagram.**
- **Étoiles en VRAIE épaisseur 3D** (`entities-render.js`, `EDGE_ICONS`) — « quand elles sont à
  90° on ne les voit plus, donne-leur une dimension 3D » : une TRANCHE (silhouette ambre au
  gabarit exact du contour) est peinte sous la face avec une largeur plancher (`EDGE_MIN_SCALE`
  0,16) — de profil l'étoile montre son épaisseur comme une pièce, à plat la face la recouvre
  exactement. Dorées : tranche or. Vérifié en preview sur 8 phases du tour.
- **UN SEUL régime de façade** (`world.js`) — « il y a trois types de façade selon la distance,
  je veux un seul type, le plus proche, chargé le plus tôt possible » : TOUS les paliers de
  détail par taille écran ont sauté (fenêtres, vitrines, garde-corps, balcons, croisillons,
  lucarnes, cheminées, bossage — seule reste une garde à 2-3 px où rien n'est traçable). La
  façade complète se peint dès la sortie de brume ; à 5 px de large la grille devient une
  texture dense, et surtout elle ne CHANGE plus en approchant. ⚠️ Coût mesuré en preview :
  ~2 ms/frame de décor sur desktop (×3-5 attendu sur téléphone) — premier suspect si les fps
  chutent en course.
- **Camions traversants SUPPRIMÉS** (`crosstraffic.js`) — « il faut pas qu'il y ait des camions
  qui traversent, je veux que ce soient des voitures, sinon c'est trop » : `vehiculeAu()` ne
  tire plus que des voitures (sautables), le rendu cabine/gabarit camion a disparu. Ne pas les
  réintroduire sans redemander.
- **Joueur réduit de 20 %** (`player.js`, `DRAW_SCALE` 0,8) — purement visuel : `HEIGHT_WORLD`
  INTACT (physique du saut + étoiles aériennes en dérivent), le halo de ramassage et l'ancrage
  des popups (main.js) suivent le facteur.
- 🐛 **Equalizer muet dans le navigateur intégré d'Instagram** (« le visualiseur, il marche
  pas ») : l'`AnalyserNode` était en DÉRIVATION de `focusGain` — sur WebKit, un analyseur hors
  du chemin vers `destination` peut ne jamais recevoir de données. Inséré DANS la chaîne
  (`focusGain → analyser → destination`, transparent au signal). À reconfirmer dans Instagram.
- **Favicon + « Now Playing »** (demandé : « on peut travailler ce favicon ? ») :
  `public/favicon.png` (64) et `public/apple-touch-icon.png` (180) — étoile Mario du jeu sur
  rouge de charte, générés au canvas en preview ; liens RELATIFS dans le `<head>`. En plus,
  `navigator.mediaSession.metadata` (audio.js, posé à chaque lecture) : titre « La ville est
  belle », artiste PMC, pochette de l'EP — c'est ce qui habille la Dynamic Island / l'écran
  verrouillé pendant que le morceau joue. Best-effort, jamais bloquant.

**Quatorzième passe du 21 août 2026 — deuxième salve du même jour (screen à l'appui).**
- 🐛 **Popups superposés** (`main.js`, `pousserPopup`) — « quand y'a marqué combo ça passe
  par-dessus l'autre texte » : une étoile DORÉE qui fait passer un palier pousse « +900 » puis
  « COMBO ×2 » dans la MÊME frame, même âge donc même ancrage, illisibles l'un sur l'autre.
  Chaque popup encore jeune (< 0,5 s) décale le nouveau de 26 px vers le haut.
- **Bâtiments encore plus tôt, troisième demande** (« faut que les bâtiments chargent bcp plus
  tôt, ça charge bcp trop tard !!! ») — deux leviers :
  - `CURVATURE` 0,00015 → 0,00011 (`road.js`), HORIZON_Z ≈ 179 → **≈ 209** ; pleine opacité
    (HORIZON_Z − FADE_BAND) atteinte 30 unités plus tôt.
  - ⚠️ **Mesuré en preview : les seuils par pixel ne pouvaient PAS suffire** — une façade ne
    fait plus que ~5 px de large à l'écran dès z ≈ 120 (fuite vers le point de fuite), aucune
    grille de fenêtres n'y tient. Nouveau régime « bandes d'étages » dans `drawFacade3D`
    (world.js) : sous le seuil de la vraie grille (10/7 px, abaissé de 14/10), chaque étage est
    peint en une bande sombre continue — le ruban de fenêtres vu de loin. Les immeubles sortent
    de la brume déjà habités. Balcons en saillie dès 14 px (22 avant).
  Vérifié en preview (écran d'accueil, rue en profondeur) : plus aucun mur nu au loin.

**Treizième passe du 21 août 2026 — salve de retours après test iPhone (screen à l'appui).**
- **Étoiles : axe de rotation corrigé** (`entities-render.js`) — « le haut de l'étoile ne doit
  pas bouger [...] là c'est un salto ». `ctx.rotate()` tournait dans le plan de l'écran ;
  remplacé par `ctx.scale(cos(spin), 1)` : rotation autour de l'axe VERTICAL façon pièce de
  Mario, pointe haute immobile. Vitesses inchangées (1 tour/2 s, dorée ×2). Vérifié en preview
  (6 phases dessinées côte à côte via `peindreObjet`).
- **Camions traversants franchissables au saut** (`crosstraffic.js`) — « un camion qui prenait
  toute la route avec un vélo, j'ai été obligé de perdre » : le camion était le seul véhicule
  insurvolable, et les deux grilles (musicale/distance) étant indépendantes, un camion pouvait
  fermer la seule issue laissée par les obstacles musicaux. `sauteDessus = inAir` pour tous les
  types désormais — le saut est la porte de sortie universelle.
- **Feux tricolores déplacés AVANT le carrefour** (`world.js`) — « tu les as mis au milieu de
  la route quand ça croise » : ils étaient à `(n + 0,5)·SPACING`, le centre de l'avenue
  transversale. Désormais à `n·SPACING − 0,3` : au bord du trottoir, juste avant l'entrée du
  croisement, côté joueur. Le −0,3 les garde dans le filet de ruelle après le bâtiment du
  créneau n−1 (profondeur max 9,3 sur 10 → 0,35 u de vide), donc jamais recouverts par une
  façade peinte après eux dans l'ordre du peintre.
- **Détail des façades chargé bien plus loin** (`world.js`) — « ça charge beaucoup trop
  tardivement, il faut que ça charge vraiment largement devant » : seuils de `drawFacade3D`
  30/22 px → 14/10 (fenêtres/vitrines), 70 → 40 (garde-corps de fenêtres), 44 → 22 (balcons
  en saillie). Les immeubles arrivaient en boîtes nues et s'habillaient devant le joueur.
- **Balcons plus parisiens** (`world.js`, `drawBalcony`) — lisse basse + CROISILLONS de fer
  forgé (X entre les barreaux) sur les balcons filants ; garde-corps de fenêtres avec barreaux
  (plus une ligne seule). Sauté quand trop petit à l'écran pour rester lisible.
- **Bandeau 12 000 pts reformulé** (`hud.js`) — « j'ai pas compris pourquoi il est marqué
  12 000 points » : titre « PREMIER PALIER ACTIVÉ ! » (19 px — 22 débordait de 375 px avec ce
  libellé, mesuré), sous-titre « le morceau t'attend à l'arrivée ». Vérifié en preview.
- **Écran de fin remanié** (« toutes les informations ne rentrent pas ») : bandeau « Votre
  score » au lieu de « Game Over » (« Parcours terminé » conservé), ligne « Voici votre score »
  supprimée, bouton « PARTAGER LE CLIP » supprimé — **et l'enregistrement clip.js coupé avec
  lui** (plus d'import : plus bundlé, plus de coût d'encodage en course). Vérifié en preview
  375×812 : tout tient sans scroll.
- **Verrou de rejeu en pop-up depuis le bas** (`#unlock-sheet`, index.html + screens.js) —
  « c'est quand les gens cliquent sur Rejouer que tu affiches ça en pop-up à partir du bas » :
  REJOUER n'est plus `disabled`, il porte `.locked` (grisé) et son clic ouvre un panneau
  voile + carte glissante (texte + CTA + « Plus tard ») qui sert les DEUX verrous (morceau,
  puis suivre PMC). Hors de `#overlay` : `.view.active` porte un transform qui capturerait le
  `position:fixed` (piège déjà vécu sur `#countdown-caption`). 🐛 Corrigé au passage : Entrée
  au clavier sur l'écran de fin contournait le verrou (appel direct de `restartGame`).
  Vérifié en preview : ouverture, fermeture, levée des deux verrous, textes et liens.
- **Equalizer branché sur le vrai spectre** (`audio.js` `getEqLevels` + `screens.js`) —
  « un égaliseur dynamique qui marche par rapport à la musique, même modèle que le Dynamic
  Island : basses à gauche, aigus à droite ». `AnalyserNode` (fftSize 512) en dérivation de
  `focusGain` — il voit ce qui SORT (slider/mute/filtre compris), un equalizer qui danse sur
  du silence mentirait. 5 barres, bandes log ~93 Hz-9 kHz, léger gain vers les aigus (sinon
  les barres de droite restent au sol), boucle rAF active uniquement sur la vue de fin.
  L'animation CSS d'origine reste en secours (classe `.idle`) si l'analyse ne fournit rien.
  ⚠️ **Le spectre réel n'a pas pu être vérifié en preview** (AudioContext y fige l'onglet,
  piège n°1) — à confirmer sur téléphone.

**Douzième passe du 20 août 2026 — refonte 3D des façades + gros lot conversion.**
- **Façades en VRAIE perspective** (world.js, `drawFacade3D`) : le diagnostic du « ça fait 2D »
  était que drawFace plaquait fenêtres/balcons sur une grille ÉCRAN dans le quadrilatère
  projeté — les ouvertures ne fuyaient pas vers l'horizon avec le mur. Désormais chaque
  fenêtre/vitrine/bandeau est positionné en coordonnées MONDE (h, z) et projeté
  individuellement ; **balcons en vraie SAILLIE** (dalle qui avance vers la route +
  garde-corps interpolé, `drawBalcony`) aux 2e et dernier étages ; garde-corps fins sous les
  autres fenêtres quand la façade est proche. Le pignon (z constant = vrai rectangle écran)
  garde drawFace. Hauteurs 16-19 → **12-14** (« très verticales »), toit/corniche extraits en
  `drawRoofAndCornice` (partagé).
- **Trottoirs + bordures** (`renderSidewalks`) : bande claire + bordure pierre entre chaussée et
  façades — corrige « on a l'impression que les façades sont en dessous de la route » (les
  immeubles posaient leurs pieds sur le même bitume que la route).
- **Étoiles** : rotation continue 1 tour/2 s (= une mesure à 120 BPM) ; **12 étoiles DORÉES**
  ×2 par partie (hash déterministe, `GOLD_STAR_RATE` 0,12), blanc doré + halo + rotation ×2.
  **Score max recalculé par balayage (`slotPreview`) : 68 925, et 75 828 avec boost fan** —
  combo final ×9 inchangé. ⚠️ Classement Supabase toujours à vider avant lancement.
- **Conversion** (voir CLAUDE.md pour la liste complète) : boost fan ×1,1 (screens.estFan →
  main.js), verrou « suivre PMC » après 3 parties (`lienSuivre`, localStorage `pmcSuivi`/
  `partiesJouees`), bandeau equalizer « Tu écoutes… », CTA « AJOUTER LE MORCEAU », balises OG
  (cover-ep-og.jpg), compteur de courses (net.postRun/getRunsCount + migration
  `supabase-migration-compteur-courses.sql` à exécuter), image de partage avec pochette +
  badge disque, partage avec texte + lien.
- **Clip TikTok** (`clip.js`) — ⚠️ **RETIRÉ le 21 août 2026, voir treizième passe** (bouton
  supprimé, enregistrement coupé, module plus importé). Historique de sa conception :
  replay buffer MediaRecorder à DEUX enregistreurs alternés
  toutes les 5 s (un flux ne se découpe pas après coup — les chunks ne sont décodables que
  depuis le début du conteneur) ; à la mort, on garde le plus ancien → clip de 5-10 s finissant
  pile sur la fin. Feature-detect complet (Safari iOS enregistre en MP4), jamais bloquant.
  ⚠️ **Coût d'encodage en course jamais mesuré sur téléphone** — si les fps chutent, couper =
  ne pas appeler `clip.demarrer()` (main.js, 2 sites).
- **Tuto étape 1** : pochette avec fondu entrée/sortie + verre dépoli derrière (le canvas se
  redessine sur lui-même via ctx.filter blur — source en pixels DEVICE, d'où le ×dpr) ;
  **transitions de consignes en fondu** (screens.js, aller-retour 0,2 s) et pop du « 1/4 »
  (.step-pop, retrigger par reflow).
- Vibrations Android (légère/forte), main.js.

**Onzième passe du 20 août 2026 — photo haussmannienne, cover au tuto, traversées -30 %.**
- **Façades refaites une TROISIÈME fois** (world.js), d'après une photo d'immeuble d'angle
  parisien fournie : pierre crème pâle (fini l'orangé « cathédrale »), toits mansardés en
  ARDOISE gris-bleu (retour du froid — c'est le couple pierre claire/ardoise sombre qui fait la
  photo), fenêtres redevenues RECTANGULAIRES hautes (les arcs lisaient « église »), garde-corps
  fer forgé NOIRS peints devant le bas des fenêtres (après elles dans l'ordre de peinture),
  devantures noires à enseigne DORÉE (une vitrine sur deux, l'autre garde un store),
  **volets supprimés** (aucun sur la photo — `SHUTTER_PALETTE` retirée).
- **Pochette de l'EP dans l'étape 1 du tutoriel** (`dessinerRecompense`, tutorial.js) +
  « Le meilleur score gagne le vinyle de l'EP » : conversion annoncée dès la première seconde
  de jeu. Fichier `public/assets/cover-ep.webp` — recompressée 4000×4000 → 480×480 / **16 Ko**
  (cwebp -q 72) depuis le master `~/Downloads/4. EP#1 - LVEB ►/`, préchargée au chargement du
  module (négligeable vs 3,9 Mo de MP3). Étape 1 uniquement : ensuite le centre de l'écran
  appartient aux objets des étapes suivantes.
- **Véhicules traversants ralentis de 30 %** (`CROSS_SPEED` 8 → 5,6, crosstraffic.js — demandé).

**Dixième passe du 20 août 2026 — retours sur la neuvième.**
- **Les pieds passent DERRIÈRE la roue arrière** (« mes pieds doivent être derrière la roue ») :
  ordre de peinture inversé dans player.js — jambes, puis roue, puis bassin/short. Vue de dos le
  pneu est l'objet le plus proche de la caméra : le pied en bas de course (qui rentre d'1 px vers
  l'axe, via `swing`) se glisse visiblement derrière lui, et la roue émerge sous le cycliste
  assis dessus. Du coup la tranche du pneu revient à **4 px** (l'élargissement à 8 px du 12 août
  ne compensait que l'ancien ordre jambes-devant) et la jante passe en gris moyen (#989cab) —
  à 50 % de la tranche, le reflet clair faisait lire la roue comme une colonne lumineuse.
- **Balancement lent gauche-droite de tout le cycliste** (« fais moi balancer tout doucement ») :
  ±0,045 rad à ~0,9 Hz autour du point de contact au sol (`SWAY_AMP`/`SWAY_HZ`, main.js),
  ajouté au lean de virage APRÈS son clamp, sur l'horloge réelle (perfClock) — le personnage
  vit aussi sur le menu et pendant le tutoriel. Indépendant du balancement du buste par frame
  (player.js), qui suit la cadence de pédalage.

**Neuvième passe du 20 août 2026 — « on doit voir que je fais du vélo ».**
Refonte du bas du sprite joueur (player.js), le retour étant que le pédalage ne se lisait pas :
- **Sprite 26×34 → 26×40** : les 6 px gagnés vont TOUS sous le corps — la roue arrière dépasse
  nettement sous le short et les jambes, au lieu d'être presque entièrement cachée.
  ⚠️ **`HEIGHT_WORLD` (1,9) est INTACT et doit le rester** : la physique du saut (main.js,
  `jumpPhysics`) et la hauteur des étoiles aériennes (entities-render.js) en dérivent. C'est
  `BODY_H` (34) qui étalonne l'échelle — le corps garde exactement sa taille, le sprite complet
  fait ~2,24 unités-monde à l'écran. Conséquences réglées : halo de ramassage recentré
  (0,45 → 0,62) et popups remontés (1,15 → 1,35), le corps étant plus haut au-dessus du sol.
- **Amplitude de pédalage 3 → 6 px** (`LIFT_MAX`), cuisses visibles et raccordées au genou à
  toutes les phases, **6 frames** au lieu de 4 (l'amplitude doublée sautait par à-coups à 4).
- **Pédales** : plateforme gris métal 1 px plus large que le pied de chaque côté ; en bas de
  course elle reste à 4 px du sol — le pied tourne autour d'un pédalier, il ne racle pas la route.
- **Balancement du buste ±1 px** à contretemps de la jambe qui pousse (les bras restent fixes,
  les mains tiennent le guidon).
- **La roue tourne** : crans du pneu qui défilent d'une frame à l'autre (`treadShift`).
- 🐛 **Pantalon éclairci (ardoise #3a3e4e)** : à #22242b il se fondait dans le pneu (#0e0e11) —
  jambes et roue ne faisaient qu'une seule masse sombre, C'ÉTAIT la cause principale du
  « on ne voit pas que je pédale ». Vérifié frame par frame en preview (échelle ×8 et taille jeu).

**Huitième passe du 20 août 2026 — deuxième salve de retours iPhone.**
- **Départ de course raccourci** : `LEAD_IN_START_Z` (entities.js) = 80 u au lieu de
  VISIBLE_Z_MAX (≈168) — la première étoile atteint le joueur ~3,4 s après la fin du tutoriel
  (« c'est trop long pour commencer le jeu vraiment ») au lieu de ~7,8 s. Vaut aussi pour
  REJOUER. Compromis pop-in assumé et documenté sur place.
- **Plus de -500 sur le choc qui termine la partie** (main.js) : la pénalité ne s'applique que
  si `game.lives > 0` après le choc — un joueur ne finit plus à 0 pour un score réel de
  quelques centaines (« enlève le fait de perdre 500 points quand tu meurs définitivement »).
- **Étape 2/4 du tutoriel : c'est l'étoile ATTRAPÉE qui valide**, plus le saut à vide
  (« faut attraper l'étoile pour valider l'étape 2 »). Étoile ratée = elle revient, comme le
  pont et le combo.
- **Écran de fin qui rentre sur tous les écrans** (capture iPhone 16 : carte coupée en haut,
  grand blanc sous la ligne du joueur). Deux causes racines :
  - le centrage flex d'`#overlay` TRONQUE le haut d'un contenu plus grand que l'écran, sans
    scroll possible → vue `end-view` (classe posée par setView) : titre masqué, overlay
    défilable (`overflow-y:auto` + `touch-action:pan-y`, obligatoire car html/body sont en
    `touch-action:none`), `margin:auto` sur la carte (centrée quand ça tient, défilable sinon),
    padding bas réduit (les 72px réservaient le CTA flottant, absent de cette vue) ;
  - le centrage du classement injectait un `padding-bottom` qui GONFLAIT la liste
    (content-box) → supprimé, le scroll est simplement borné au contenu (screens.js).
  Plus une media query `max-height:700px` → classement à 3 lignes (impair conservé, le
  centrage en dépend) : vérifié en preview à 812 px et 667 px (SE), tout tient sans scroll.

**Septième passe du 20 août 2026 — retours sur test iPhone + « game feel ».**
- **Tonalité du morceau MESURÉE : Ré bémol majeur** (chromagramme + corrélation de Krumhansl
  sur le MP3, corrélation 0,89 — les trois classes dominantes sont exactement Ré♭/Fa/La♭).
  C'est la référence pour tout futur son d'interface : rester sur l'accord Ré♭–Fa–La♭ garantit
  la consonance quel que soit le moment du morceau.
- **Jingle de combo 8-bit** (`playComboJingle`, audio.js) : arpège onde carrée sur cet accord,
  une note de plus par palier (4 → 6). Branché sur `volumeGain` (slider/mute respectés), jamais
  `envelopeGain` (réservé au fondu du morceau) ; muet si le contexte ne tourne pas.
- **Secousse d'écran à l'impact** (main.js, `triggerShake`) : deux sinusoïdes désaccordées,
  décroissance en t², fatal plus fort (13 px/0,5 s) que -1 vie (7 px/0,32 s). Le `ctx.restore()`
  tombe AVANT le bloc HUD : le score ne bouge jamais.
- **Bandeau 12 000 pts enrichi** (hud.js) : rebond d'entrée, halo jaune, étoiles qui pulsent.
  `game.milestoneDuree` exposé pour que hud.js connaisse l'âge de l'animation.
- 🐛 **Étape 4/4 du tutoriel réparée** : la consigne annonçait 5 étoiles, il n'y en avait que 3
  posées et 2 comptées (`objectifs`) — désormais 5 posées, 5 exigées.
- 🐛 **Consigne du tutoriel ancrée SOUS le « 1/4 »** (plus de `top:27%` centré qui remontait sur
  le chiffre dès 3 lignes de texte), chiffre 104 → 56 px, consigne 22 → 16 px.
- 🐛 **Écran de fin qui débordait** : les `.btn` de 240 px fixes dépassaient les ~234 px utiles
  de la carte (rognés par `overflow:hidden`). Boutons en `width:100%`/`nowrap`, score 52 → 40 px,
  lignes du classement 37 → 32 px (⚠️ `max-height` de la liste recalée à 5 × 32 = 160 px, le
  centrage au scroll en dépend), passe générale « polices standards » (boutons 15 px/50 px,
  titre 42 px).

**Sixième passe du 19 août 2026 — tutoriel interactif (Plan A).** Trois retours reçus dans
l'heure qui a suivi la première livraison, tous corrigés le jour même :
- « Je ne fais rien, il bouge tout seul » → la démo pilotée est retirée (la main fantôme montre,
  ne joue plus), les objets se placent en voie ADJACENTE au joueur, et plus aucune étape ne se
  valide sans geste (30 s immobile = toujours 1/4, vérifié).
- « Le fond est trop sombre » → le voile du décompte (assombri le 12 août pour l'ANCIEN écran
  passif) est rallégé (0,35/0,55/0,82 → 0,10/0,16/0,30) : la scène EST le contenu du tutoriel,
  la lisibilité des textes repose sur le panneau de la consigne et l'ombre du « 1/4 », plus sur
  le voile.
- « Étape 4 trop bizarre, ça marche pas du tout » → deux causes : les étoiles ramassées ne
  disparaissaient pas (elles traversaient le personnage — ramassage rendu VISIBLE, `p.pris`),
  et tout se figeait pendant le « Bien ! » (le glissement des objets est sorti du jugement,
  il tourne en toutes circonstances). Les tirets cadratins des consignes ont sauté au passage
  (« typiques de message IA, j'aime pas »).
- Le décompte « 20 → 1 » est remplacé par un **tutoriel guidé et interactif** (`tutorial.js`) —
  voir `CLAUDE.md` pour le détail des 4 étapes et des arbitrages (GIF écartés ; la main fantôme
  MONTRE sans jamais jouer le geste — la démo pilotée a été retirée le jour même, retour direct
  « je ne fais rien, il bouge tout seul » ; objets placés en voie ADJACENTE au joueur pour
  qu'aucune étape ne se valide sans geste). Points de couture à connaître :
  - `screens.js` : `runTutorial()` remplace `runCountdown()`, le DOM du décompte est réutilisé
    (le gros chiffre devient « 1/4 », la légende porte la consigne), `syncTutorialUi()` est
    appelée chaque frame par `main.js` comme `syncLoadingUi()`.
  - `main.js` : pendant le tutoriel, `road.update(dt, 0)` fait défiler la route à la vitesse de
    départ ; les objets de démo + le joueur sont triés par profondeur et peints à la main — PAS
    via `entitiesRender.render()`, qui parcourrait la grille musicale de la future course.
  - ⚠️ `road.reset()` ajouté dans `requestGameStart()` : sans lui, les ~400 unités défilées
    pendant le tutoriel décalaient la rampe des véhicules traversants (calée sur la DISTANCE)
    vers le début de course.
  - Vérifié en vrai : machine à états (les 4 étapes, l'échec du pont avec seconde chance, la
    démo après inaction), swipes souris qui valident l'étape 1, sortie par « Passer l'intro »,
    distance remise à 0, course démarrée. Piège n°2 recroisé pendant le test : après une édition
    de fichier, Vite sert `?t=` et un `import()` console crée une seconde instance morte.

**Cinquième passe du 19 août 2026 — deux retours sur ce qui venait d'être livré.**
- 🐛 **Véhicules traversants visibles beaucoup trop tôt** (capture à l'appui : ils flottaient
  au-dessus des trottoirs et par-dessus les façades, plusieurs secondes avant d'arriver). Cause :
  la marge de rendu valait `ROAD_HALF_WIDTH + 9`, soit 13 unités de part et d'autre. Corrigé par un
  **découpage sur la trouée de la rue** (`BORD_RUE` = bord de chaussée + `SIDEWALK_MARGIN`) : le
  véhicule n'existe visuellement que dans l'ouverture entre les façades, donc il en émerge comme
  d'une rue transversale. Ce sont bien les BÂTIMENTS qui masquent — dessinés avant les entités,
  c'est le découpage et non l'ordre du peintre qui produit l'occultation.
- **Image de partage refaite de zéro** : carrée et dépouillée, voir `CLAUDE.md` pour les deux
  révisions du brief et leurs raisons. À retenir pour la suite : **l'usage visé n'est pas la story
  mais le commentaire TikTok**, donc la vignette est le format de référence, pas le plein écran.

**Quatrième passe du 19 août 2026 — conversion et partage.**
- **Image de partage 1080×1920 faite** (`share.js`) — dernier élément du brief d'origine encore
  ouvert. Voir la carte des modules et `CLAUDE.md` pour le détail. Deux pièges rencontrés et
  corrigés en la regardant : le sprite du joueur était calé sur le bas de la scène, donc
  entièrement **caché derrière le bandeau de score** ; et les guillemets français sortent en
  chevrons très ouverts dans Stage Grotesk, illisibles à cette taille.
- **Conversion vers le morceau, en deux temps.** L'artiste demandait une pause forcée à 50 000
  points avec passage obligé par le lien. Écarté après chiffrage : le maximum théorique est de
  61 400, donc 50 000 = 81 % de la perfection absolue, un seuil que presque personne n'atteint ;
  et surtout, envoyer un joueur sur une page externe EN COURSE lui fait perdre son run sur mobile
  (onglet rechargé par iOS, ou morceau rembobiné au-delà de `pauseDeriveMax` = 25 s). Retenu à la
  place : un **bandeau non bloquant à 12 000 points** en course, et le **vrai verrou sur l'écran
  de fin** (REJOUER inactif tant que le lien n'a pas été ouvert une fois, mémorisé en
  localStorage). L'écran de fin est déjà une pause naturelle : il n'y a plus de partie à casser.
- `dateOuverture` remise au **17 août 2026** (elle était au 5 août pour les tests).
  ⚠️ **Reste à faire, côté Supabase et par l'artiste** : vider la table `scores`. Les scores
  enregistrés avant le 19 août l'ont été sous l'ancien barème (plafond 195 525 contre 61 400
  aujourd'hui) et resteraient hors d'atteinte en tête du classement. Impossible depuis le jeu —
  la RLS interdit le DELETE avec la clé anon, et c'est une suppression définitive.

**Troisième passe du 19 août 2026 — retours après un vrai test manette en main.**
- **Voitures/camions qui TRAVERSENT aux carrefours** (`crosstraffic.js`, nouveau module) : demandé
  tel quel, et c'est aussi la réponse à « ça fait plus facile la fin que le début ». ⚠️ Fait
  tomber l'invariant « les croisements sont purement décoratifs » (§6bis), en connaissance de
  cause. Densité **nulle avant ~50 s**, maximale après ~100 s — précisément pour ne rien changer à
  l'ouverture, jugée bonne (« la quantité et la densité d'objets au tout début, c'est très très
  bien », et « je ne veux pas que les premières étoiles arrivent plus vite au tout départ »).
  Mesuré sur une course simulée au pas fixe : **45 traversées**, 0 avant 50 s, puis 5 / 10 / 19 /
  11 par tranche de 25 s — l'essentiel dans le dernier tiers. **Chacune ne bloque qu'UNE voie**
  (vérifié : jamais 2, donc jamais de mort inévitable), et la position latérale est calculée en
  TEMPS restant avant le joueur, pas en profondeur : sans ça le véhicule aurait surgi 0,2 s avant
  l'impact en fin de course (99 u/s) au lieu de ~1,5 s. Coût **−1 vie, jamais fatal** : les deux
  grilles étant indépendantes, un véhicule peut coïncider avec le seul passage laissé par un pont,
  cas rare qu'on ne peut pas exclure par construction — il coûte un cœur, pas la course.
- **Le « +150 » à chaque étoile est retiré** (« insupportable » — à une étoile toutes les 0,75 s en
  plein combo, le chiffre clignotait en permanence). Ne restent que les **3 premières étoiles** de
  la partie (rôle pédagogique) et l'**annonce de palier de combo** au-dessus du personnage, un
  événement rare qui garde donc sa valeur.
- **Combo réduit au multiplicateur seul**, en jaune étoile, sans pastille (la pastille de la passe
  précédente était « beaucoup trop grosse »). « ×2,5 » sous le score suffit ; le mot COMBO
  n'apprenait rien de plus.
- **Distance de vue encore allongée** : `CURVATURE` 0,0002 → 0,00015 (HORIZON_Z ≈ 155 → 179),
  `VISIBLE_Z_MAX` 145 → 170, fondus élargis (50 côté objets, 62 côté décor). ⚠️ **Premier réglage
  sous le plancher de 0,0002** annoncé en §5.5 : franchi sciemment, sur demande explicite de
  « charger encore plus loin sans la ligne d'horizon » — la courbure s'aplatit, mais c'est
  justement le repli net dont le joueur ne veut plus, et le fondu de brume prend le relais.

**Deuxième passe du 19 août 2026 — six retours de jeu.** Tout vérifié en exécutant le jeu
(harnais console + frame composée sur canvas superposé, la preview refusant de compositer quand
la pane est masquée) :
- **Les objets apparaissaient trop près du joueur.** Vrai goulot trouvé en mesurant :
  `VISIBLE_Z_MAX` valait 90 alors que l'horizon en faisait déjà 136 et que les bâtiments s'y
  rendaient — les bonus/obstacles surgissaient donc à mi-chemin, bien après le décor. Porté à
  **145**, `LOOKAHEAD_SLOTS` 10 → 16 (à la vitesse de départ il faut ~8,9 créneaux pour couvrir
  ce champ, 10 ne laissait aucune marge). Horizon repoussé en plus (`CURVATURE` 0,00026 → 0,0002,
  HORIZON_Z ≈ 136 → 155, le plancher documenté en §5.5). Et **fondu d'apparition ajouté aux
  objets** (`FADE_BAND`, `entities.js` + `entities-render.js`), qu'ils n'avaient pas du tout,
  contrairement au décor : c'est ce contraste qui rendait leur pop-in si voyant. `FADE_BAND` du
  décor 36 → 48 pour que les deux se matérialisent au même rythme.
- 🐛 **Le joueur se peignait par-dessus les ponts déjà dépassés** (« quand je passe un pont et que
  je saute en l'air, on a l'impression que je saute par-dessus le pont, alors que je suis
  derrière »). Il était dessiné APRÈS toute la scène, donc toujours au premier plan, même devant
  un objet physiquement plus proche de la caméra que lui. Corrigé en le faisant passer par
  `extras` — le mécanisme d'ordre du peintre déjà écrit pour le caméo (§4). Vérifié sur **les 36
  ponts du parcours** : chacun se peint bien par-dessus le joueur une fois dépassé.
- **Retour de ramassage d'étoile renforcé** : halo blanc du joueur intensifié (0,3 → 0,55) et
  **points gagnés qui s'envolent** au-dessus de lui (`renderPickupPopups`, `main.js`), combo
  compris — c'est ce chiffre-là qui rend le combo lisible en jeu, le score global défilant trop
  vite pour qu'on voie la différence. Peints hors de la séquence du peintre : c'est de
  l'interface, elle ne doit jamais passer derrière une voiture.
- **Étiquette « @soberland » redescendue** de 4 à 0,35 unité-monde au-dessus de sa tête (« beaucoup
  trop haut écrit dans le ciel »). Réglait du même coup le second reproche (« ne doit pas passer
  devant les bâtiments ») : à 4 unités elle flottait en plein ciel par-dessus les façades. Son
  ordre de profondeur, lui, était déjà correct (peinte dans le draw du personnage, donc à sa
  profondeur).
- **HUD** : score 31 → 38 px, et le combo passe d'un texte blanc nu à une **pastille crème à texte
  sombre** — il se confondait avec le décor et ne se lisait pas comme un état actif.
- **Difficulté doublée toutes les 25 s** — voir §5.4 pour le détail complet et l'arbitrage.
  `SCORE_TIER_SIZE` 15 000 → 5 000 dans la foulée, remis à l'échelle du nouveau plafond de score
  (sinon l'intensification par palier ne se déclenchait quasiment plus de toute la partie).

Invariants revérifiés : **80 étoiles / 111 obstacles pile, 0 trou**, **700 frames rendues sans
exception** (score poussé jusqu'au maximum théorique pendant le balayage), et **0 créneau bloquant
les 3 voies à la fois** même au score max — il reste toujours un passage.

**Passe de revue de code du 19 août 2026** (demandée telle quelle : « jette un œil à la
structure du code et aux erreurs possibles »). Sept correctifs, tous vérifiés en exécutant le
jeu — la preview navigateur a fonctionné cette session, contrairement aux trois précédentes
(§12) :
- 🐛 **Outfits de piétons jamais utilisés** — indexation par un flottant, voir piège n°9. Les
  quatre variantes sortent maintenant à parts égales (mesuré sur 400 slots) ; les 2 piétons du
  parcours réel tirent `brique` et `sombre` au lieu du repli `rouge`.
- 🐛 **Écran de chargement bloqué pour toujours si le morceau ne charge pas** — le bouton JOUER
  n'était débloqué que par `progress >= 1`, donc jamais en cas d'échec : barre figée, aucun
  message, aucune sortie. Contradiction directe avec le principe fondateur (« un jeu muet reste
  jouable, un jeu figé non ») qui n'était appliqué qu'à la course, pas au menu. **DEUX routes
  distinctes**, la seconde trouvée en testant la première : (a) `fetch` en échec → `loadError`,
  message rouge + bouton débloqué ; (b) réponse 200 avec des octets illisibles (MP3 corrompu,
  page d'erreur de proxy, portail captif — et le repli SPA de Vite en local, voir piège n°10) →
  `loadError` reste `null` car `rawCopy` existe, le décodage est repoussé au geste et `buffer`
  reste `null` : bloqué à 90 %. D'où `decodeDeferred`/`isReadyToStart()` (`audio.js`). Les deux
  routes vérifiées de bout en bout, plus le chemin normal (non régressé).
- 🐛 **La frappe clavier fuyait des champs pseudo/Insta vers le jeu** — ni `input.js` ni
  `debug.js` ne regardaient `e.target`. Taper un pseudo contenant un « d » allumait le mode
  debug (et ses raccourcis F = fin de course, G = game over) ; les flèches/espace déplaçaient et
  faisaient sauter le personnage derrière l'overlay. D'où `isTypingTarget()` (`input.js`,
  importée par `debug.js`). Vérifié : dans le champ, plus rien ne passe ; hors champ, tout
  répond encore.
- 🐛 **Flou d'arrivée appliqué sur le MENU** — `finishBlur()` tournait avant même le départ, et
  `clock.now()` compte alors le temps depuis le CHARGEMENT de la page : un joueur qui traîne
  ~143 s sur le menu voyait son personnage se flouter (3,5 px pile sur la ligne). Vérifié en
  espionnant les affectations de `ctx.filter` avec l'horloge posée sur `finishTime()` : plus
  aucun blur.
- **Départ en silence à tort quand l'onglet est masqué** — les 3 s d'`AUDIO_START_TIMEOUT`
  couraient pendant que l'appli était en arrière-plan ; au retour le délai était déjà écoulé
  alors que le contexte venait de reprendre (`resume()` est asynchrone), et la partie basculait
  définitivement sur l'horloge de secours. `startRequestedAt` est maintenant décalé de la durée
  de la pause (`applyPauseState`, `main.js`).
- **`pauseFondu` ne pilotait que le filtre**, pas les gains (une constante locale figée à 0,5
  vivait en parallèle dans `audio.js`). Mêmes valeurs, donc invisible — jusqu'au jour où on
  aurait touché au réglage.
- **Ménage** : `zoneMorteGyro`/`agressiviteVirages` retirés de `config.js` (zéro usage depuis le
  retrait du gyroscope), `3D assets/` ajouté au `.gitignore` (2,4 Mo à un `git add -A` de
  l'historique public, cf. l'incident du WAV maître plus bas), et cinq blocs de commentaires aux
  chiffres périmés remis à jour (morceau « ~10 Mo » → 3,9 Mo, marge de pause « ~33 s » → ~114 s,
  « les 200 étoiles ne bougent pas » → 140, `LANE_WIDTH` « 2 unités » → ≈2,67, table des
  vitesses de `road.js` recalculée : plafond atteint à ~102 s, ligne à 143,5 s).

Invariants revérifiés après coup (balayage hors ligne, méthode §12) : **140 étoiles / 51
obstacles pile sur 191 créneaux, 0 trou**, et **700 frames rendues sur toute la course sans une
seule exception**.

**Dette structurelle :**
- ~~`main.js` module fourre-tout~~ — **découpé le 17 août 2026** : les écrans hors-jeu
  (onboarding pseudo/insta, décompte, panneau son, menu pause, classement) sont passés dans
  `screens.js` (581 lignes). `main.js` reste seul maître de l'état de partie et de la boucle à
  pas fixe (847 lignes, contre 1349 avant). Fait **comme passe séparée**, sans changement de
  gameplay — vérifié par build propre + lecture ligne à ligne, voir §12 pour la limite de ce qui
  a pu être testé en interactif (l'écran d'onboarding avant le premier geste audio, uniquement).
- ~~`entities.js` mélangeait spawn/collision et rendu~~ — **découpé le 17 août 2026** : les
  icônes pixel art et le rendu faux-3D (voitures, pont) sont passés dans `entities-render.js`
  (615 lignes). `entities.js` (872 lignes, contre 1442 avant) ne fait plus que la logique pure
  (spawn, quota, collisions) — `entities-render.js` en dépend, jamais l'inverse.
- `PLAN-ACTION.md` (850+ lignes) est un journal append-only que `CLAUDE.md` impose de lire en
  entier à chaque session. C'est le plus gros coût fixe par session. Ce fichier-ci est censé
  le remplacer pour le quotidien.

**À vérifier avant le lancement public :**
- ⚠️ `config.js` → `dateOuverture` est fixée au **5 août 2026** pour les tests. Le commentaire
  demande de la remettre à la date de lancement officiel **et de vider la table `scores`** côté
  Supabase pour repartir sur un classement propre.
- L'équilibrage : depuis que le cycliste est franchissable au saut (12 août 2026), seuls le
  piéton et le pont restent réellement "infranchissables" (le pont l'est différemment : sauter y
  est dangereux plutôt que neutre, voir plus haut). Sur les 73 obstacles mesurés (§6, parcours
  raccourci à `dureeCourse` = 205 s) : pieton 3 + pont 7 = 10 obstacles où le saut ne protège pas.
  Échantillon petit, sensible au hasard du hash — à confirmer en jouant.

**Historique de validation, session du 12 août 2026** (voir §12 : preview navigateur inaccessible
toute la session, donc rien de tout ça vérifié autrement qu'en jouant réellement sur téléphone) :
- Premier lot testé en cours de session, corrigé sur retour : voxel joueur, pont (fatal, garde
  anti-piège), LEAD_IN, trait noir d'horizon, cheveux. ✅ Revu et corrigé.
- Deuxième lot (façades v1 volets/vitrine/balcon, croisements, feux) testé au réveil :
  **façades jugées "pas du tout parisiennes"** → troisième passe (gabarit/fenêtres/lucarnes/
  palette) + piétons passés en voxel. Croisements/feux non commentés à ce stade (ni bons ni
  mauvais signalés).
- Troisième lot testé avec captures d'écran à l'appui : **bug réel trouvé** (fenêtres fusionnées
  en bandes verticales, `winH` bien trop haut) + **poteaux de feux plats, sans volume** signalés
  en plus des bâtiments. → quatrième passe : fenêtres redimensionnées, contraste de volume
  (`SIDE_SHADE`) renforcé, poteau/tête de feu revus en profil projeté. ✅ Bug de fenêtres
  identifié avec certitude (capture directe).
- Quatrième lot testé avec captures + **deux références Minecraft de bâtiments haussmanniens
  très détaillées** envoyées : fenêtres en grille confirmées lisibles (bug résolu), mais
  toujours « pas du tout immeuble parisien » + **second bug réel** : « ils passent en dessous
  de la route » (bâtiments rendus trop près de la caméra, voir `SCENERY_MIN_Z`). → cinquième
  passe (fenêtres/vitrines en plein cintre partout, bossage/refends, balcons à chaque étage,
  auvents colorés, culling resserré). ✅ Les deux bugs (fenêtres + "sous la route") identifiés
  avec certitude sur captures ; ❌ la cinquième passe encore non vue.
- **Cinquième lot, jamais vu du tout** — voir §6bis pour le détail complet. Vérifié par lecture
  de code + `npm run build` propre uniquement. **Prochaine chose à confirmer.**
- Dette antérieure non encore revérifiée : la reprise de pause sans rembobinage (§8.1).
- **Sixième lot, même jour, sur nouvelle demande directe** : cycliste rendu franchissable au saut,
  ligne d'arrivée recalée sur `dureeCourse` (205 s) avec portique F1 (`finish.js`), bug de
  dépassement de ratio corrigé dans le quota d'étoiles (§5.4), intensification des vélos au-delà
  de 10 000 pts, palette des cartes de menu réchauffée (`--panneau-fond`/`--panneau-bord`,
  `index.html`). `npm run build` propre + recensement hors ligne (§12, script Node) pour les
  chiffres du quota/de la distribution. Preview navigateur à nouveau bloquée cette session (même
  symptôme que le 12 août, voir §12).
  - ✅ **Palette des menus** : vue sur le miroir GitHub Pages en prod (l'écran d'accueil s'affiche
    sans lancer l'audio, donc sans le piège habituel) — carte crème/bordeaux-noir confirmée,
    lisible, cohérente avec les façades.
  - ❌ **Portique F1 (`finish.js`) et collision cycliste/saut jamais vus tourner** : les deux ne
    se déclenchent qu'une fois la partie réellement lancée (`gameStarted === true` pour le
    portique — `finish.render()` n'est appelé que dans ce cas, voir `main.js`), donc derrière le
    geste qui débloque l'`AudioContext` — pas de contournement sûr trouvé cette session sans
    risquer de figer l'onglet (voir piège n°1, §10). **Prochaine chose à confirmer en vrai, sur
    téléphone.**

- **Septième lot, même jour, sur nouvelle demande directe** (retours après un premier essai sur
  téléphone) :
  - **Décompte : voile assombri + légende recentrée à l'écran** (`index.html`). ⚠️ Piège rencontré
    une seconde fois : `#countdown-caption` a dû sortir de `#countdown` pour se centrer sur
    l'écran entier plutôt que sur le bloc du décompte — même raison que `#skip-countdown`
    (`.view.active` porte un `transform` d'animation, qui devient le référentiel de tout
    descendant `position:absolute`, voir plus haut ce même lot). Comme elle n'est plus protégée
    par `display:none` via `.view`, sa visibilité passe désormais par
    `#overlay.countdown-view #countdown-caption { display: block }`, même technique que
    `#menu-title`.
  - **Joueur (`player.js`) : roue arrière élargie 5 → 8 px** (se lisait à peine derrière les
    jambes) **+ jambes qui s'écartent latéralement en pédalant** (`drawLeg` prend un paramètre
    `swing`, en plus de `lift`) — retour direct : « mes pieds ne bougent pas dans le vide, il faut
    une roue de vélo et des jambes qui pédalent sur le côté ».
  - **Bâtiments : seuils de détail par taille écran abaissés** (`WINDOW_MIN_PX` 9→6,
    `DORMER_MIN_ROOF_PX` 14→8, seuils de balcon/bandeau 16→11, bossage 20→14) **+ `FADE_BAND`
    16→36** (`world.js`) : retour « les bâtiments chargent très tard, trop proche de mon joueur,
    je vois les lignes apparaître au fur et à mesure ». Diagnostic : la cause principale n'était
    pas le fondu d'apparition (déjà loin de la caméra, z∈[103,119]) mais les seuils de détail
    eux-mêmes, qui ne se déclenchent qu'à une taille écran donnée — donc relativement PRÈS de la
    caméra vu la projection en perspective — faisant "poper" fenêtres/lucarnes/balcons un par un
    juste devant le joueur. Seuils abaissés pour que le détail arrive pendant que le bâtiment est
    encore loin.
  - **Flou de mouvement autour de la ligne d'arrivée** (`main.js`, `finishBlur()`) : monte en
    fondu sur `FINISH_BLUR_WINDOW` = 3 s de part et d'autre de `entities.finishTime()`, plafonne à
    3,5 px pile sur la ligne. Appliqué au même `ctx.filter` que le flou de changement de voie
    (`Math.max` des deux, pas de cumul) — reste bon marché : seul le sprite du joueur est flouté,
    jamais la scène entière.
  - **Menu Pause grossi de 20 %** (`transform: scale(1.2)` sur `#pause-screen .panel`,
    `index.html`) **+ score/cœurs du HUD grossis de 20 %** (`SCORE_SIZE` 26→31, `HEART_SIZE`
    20→24, `HEART_GAP` 8→10, `hud.js`) — ancrages (`PAD`) inchangés, seules les tailles bougent.
  - `npm run build` propre après chaque changement. Preview navigateur bloquée cette session
    (même symptôme, voir §12) — vérification par bascule de classes CSS en console (miroir GitHub
    Pages en prod, sans lancer l'audio), comme pour la palette des menus au lot précédent :
    - ✅ **Décompte** : voile bien plus sombre, légende bien centrée à l'écran, "20" resté en
      haut, personnage toujours visible en dessous. 🐛 **Bug réel trouvé et corrigé en vérifiant** :
      la légende ne faisait que ~144px de large au lieu des 320px voulus (`left:50%` sans largeur
      explicite → le navigateur calcule une largeur "disponible" de 50 % du conteneur pour le
      shrink-to-fit) — texte débordant de son fond en 6 lignes étroites. Corrigé avec un `width`
      explicite (`min(320px, calc(100% - 48px))`) + `box-sizing:border-box`. Opacité du fond du
      panneau remontée en même temps (0,55→0,7), sinon il se distinguait à peine du voile
      désormais plus sombre derrière lui.
    - ✅ **Menu pause** : bien agrandi (~20 %), tient dans l'écran (375×812) sans être coupé,
      lisible.
    - ⚠️ **Joueur (roue + pédalage latéral)** : inspecté via un zoom manuel (recadrage du canvas
      sur un `<canvas>` offscreen, screenshot) plutôt que par bascule de classes — une seule frame
      du cycle de pédalage vue (position figée hors course), roue visible mais discrète, écart
      latéral des jambes non confirmé (nécessiterait de voir plusieurs frames s'enchaîner, donc la
      partie réellement lancée). **Pas concluant, à confirmer en jouant.**
    - ❌ **Seuils de détail des bâtiments, `FADE_BAND`, flou de fin de course, score/cœurs du HUD** :
      non vérifiés (les deux premiers demandent de voir le défilement dans la durée, pas une image
      figée ; le flou de fin dépend de `finishTime()` donc de l'audio ; le HUD ne s'affiche
      qu'en course). **À confirmer au prochain test réel.**


### Vingt-septième passe — la boucle de mort, Soberland à l'arrivée, PMC en pause (22 août 2026)

Trois demandes indépendantes, aucune ne touche au gameplay ni à l'équilibrage.

1. **Mode audio `revive` : la boucle du début qui se défiltre pendant le panneau de mort.**
   Détail complet en **§8.2** — c'est le seul des trois qui ajoute un invariant. Effet de bord
   heureux : le panneau de mort ne consomme plus le budget `pauseDeriveMax`, puisque le morceau
   ne tourne plus pendant la décision.
2. **Soberland réapparaît SUR LA LIGNE D'ARRIVÉE, en train de mixer** (`cameo.js`). Même
   personnage, même table, même étiquette `@soberland` — `getExtras()` renvoie désormais **deux**
   occurrences, chacune passant par le même mécanisme `extras` d'`entities-render.js` (donc
   triées à leur vraie profondeur : ne jamais les peindre à part, c'est le bug déjà vécu où
   Soberland passait devant un pont plus proche). Il est **sur le trottoir**
   (`x = ROAD_HALF_WIDTH + 0,6`), pas au milieu de la route : la voie centrale est occupée par le
   portique et par le joueur qui franchit la ligne à pleine vitesse, l'y planter le ferait lire
   comme un obstacle alors qu'il n'a aucune collision.
   ⚠️ **Il est plus GRAND qu'au départ** (2,2 → 2,6 unités-monde) et c'est mesuré, pas décoratif :
   à l'arrivée la course file à sa vitesse plafond, or tout objet de bord de route n'entre dans
   la fenêtre visible qu'à `HORIZON_Z` ≈ 209, soit **~2 s** avant le joueur (le portique lui-même
   n'apparaît pas plus tôt). Relevé à 2,2 : 11 px de haut à −2 s, 92 px à −0,1 s ; à 2,6 : 13 px
   puis 109 px. Il sort du champ par la droite au moment exact du passage — comportement normal
   de la perspective, pas un bug à corriger.
3. **PMC fait coucou pendant le menu pause** (`pmc.js`, nouveau module). ⚠️ **Seul sprite du jeu
   animé sur `performance.now()`** : pendant la pause l'horloge musicale est gelée
   (`pauseAnchor`), un geste calé dessus resterait figé sur place. Il bouge parce que le reste est
   arrêté. Position mesurée à `road.project` (z = 7,8 / x = −1,0, soit ~235 px de haut en bas à
   gauche sur 375×812) : le trottoir sort du champ dès qu'on approche de la caméra (à z = 8 la
   fenêtre visible ne fait que ±1,7 unité), et le centre de l'écran est masqué par la carte de
   pause zoomée ×1,2. Peint après la scène, pas dans la séquence du peintre : la scène est figée
   derrière lui, il n'y a plus de profondeur à négocier.
   ⚠️ Premier jet illisible : bras et buste tous deux crème se lisaient comme un seul bloc (le
   pixel art n'a pas de contour, c'est la VALEUR qui détache un membre). Bras repassés en
   `CREME_OMBRE` et main portée au-dessus de la tête — vérifié à l'écran, à taille réelle et ×2.

Vérifié : balayage hors ligne §12 sur **8 912 frames** (t = −LEAD_IN → arrivée + 2 s, extras
inclus), **0 exception** ; parcours complet du panneau de mort dans le navigateur (décision →
clic CTA → absence → retour → décompte 5→1 → tap → reprise), chaque transition relue dans le DOM.

### Vingt-huitième passe — boost de départ du défi + passe UX des boutons (23 août 2026)

Contexte produit : 417 courses, 300 visites du smartlink, 40 pre-saves (~13 %, dans la norme
du marché 8-15 %) — le goulot est le VOLUME de joueurs, pas la conversion. Le défi à un ami est
le seul levier de volume embarqué dans le jeu, d'où les deux demandes.

1. **Boost de départ du défi.** Arriver par `?defi=` → `game.streak` pré-armé à
   `comboSeuil × defiBoostPaliers` (config.js, = 1 palier → ×1,5). ⚠️ Armé à DEUX endroits :
   `requestGameStart()` (la toute première course — celle du receveur de défi, justement — ne
   passe PAS par `restartGame()`) et le bloc reset de `restartGame()`. La pastille combo du HUD
   lit `streak`, donc elle est visible dès la première frame sans autre branchement. Annoncé au
   menu (`#defi-banner-boost`, texte recalculé depuis config.js par screens.js — jamais en dur),
   dans `defi.texte()` (« ce lien t'offre un boost de départ », sans le mot « combo » : le
   receveur n'a pas encore vu le jeu), et sous le bouton de fin (`#defi-note`).
2. **« DÉFIER UN AMI » promu de `link-minimal` à `.btn btn-secondary`** — renversement assumé
   du « pas un troisième bouton de 50 px » du 21 août, compensé par la passe UX ci-dessous.
   `DEFI_LABEL` (screens.js) lit toujours `textContent`, le retour « Lien copié ! » survit.
3. **Passe UX globale** (« réduis la taille de tous les boutons, qu'on voie plus de score ») :
   `.btn` 50→46 px / 15→14 px / largeur 240→228 px / rayon 16→14 ; `#end-screen .btn`
   46→44 px (plancher tactile Apple, ne pas descendre) ; `#score-num` 40→46 px (38 px sous
   740 px de haut). La place du score est reprise sur les boutons, pas sur la carte.

4. **Désencombrement de l'écran de fin** (même jour, retour capture à l'appui : « super méga
   chargé, ça respire pas assez ») : `#end-note` et `#insta-note` fusionnés en UNE ligne
   (« Un vinyle à gagner — résultats sur @pmc.mp3 » — les deux messages survivent, l'Instagram
   reste accroché au concours, sa raison d'être du 21 août ; `#insta-note` n'existe plus, le
   style du lien est passé sur `#end-note a`, l'id `insta-link` est inchangé pour screens.js) ;
   compteur raccourci (« X courses depuis le lancement ») ; lignes du classement 32→29 px /
   13→12,5 px — ⚠️ les `max-height` du classement sont des MULTIPLES de cette hauteur fixe
   (145 = 5×29, 87 = 3×29 sous 740 px de haut), recaler les trois ensemble. L'air gagné est
   réinvesti entre les sections (`#end-hero` 12→14, `#leaderboard` 14→16), pas en tassement.

Vérifié dans la preview (localhost) : bandeau défi complet au menu (« Cadeau : tu démarres avec
un combo ×1,5 ») ; écran de fin forcé par DOM avec classement 5 lignes + compteur + verdict défi
+ 4 boutons + 2 notes, aux DEUX gabarits qui encadrent le parc : 414×896 (iPhone 11 — carte
714 px, large) et 375×667 (iPhone SE/8 — carte 594 px, la note tient sur une ligne) ; 0 erreur
console. Le boost en course réelle a été confirmé par l'artiste sur capture (pastille ×1,5 dès
le départ, jauge défi affichée). Testé aussi : la page publique li.sten.to — le bouton Pre-save
part DIRECTEMENT en OAuth (aucune étape playlist imposée par la page), donc rien à alléger côté
smartlink et aucune raison d'en changer.

---

## 12. Comment tester

Il n'y a pas de suite de tests — le projet est un jeu, la vérité est à l'écran. Deux méthodes
qui marchent bien :

**Recensement hors ligne (Node).** Pour tout ce qui est distribution, quota, équilibrage :
répliquer les fonctions pures d'`entities.js` dans un script et compter sur les 300 créneaux.
C'est comme ça qu'on a mesuré que la garde anti-piège vidait la catégorie cycliste — un bug
qu'aucune session de jeu n'aurait révélé.

**Harnais navigateur.** Charger la page **sans démarrer le jeu**, puis importer les modules
depuis la console (`import('/src/entities.js')`, **sans query string**, cf. piège n°2), injecter
une horloge factice via `clock.setTimeSource(() => t)` et balayer toute la course. Permet de
vérifier le rendu (aucune exception sur ~650 frames) et les collisions voie par voie (~75 objets
rencontrés par voie sur 300).
⚠️ **Balayer depuis t = −LEAD_IN, jamais depuis t = 0, et passer les extras (caméo,
crosstraffic) à `render()`.** Un balayage 0 → arrivée sans extras a laissé passer un crash de
la toute première frame de course (modulo négatif dans cameo.js, revue du 21 août 2026, §11) :
la fenêtre d'horloge négative et les extras font partie du chemin réellement exécuté en jeu.

Pour juger un sprite : le dessiner sur un canvas superposé à plusieurs échelles réelles
(110 px au plus près jusqu'à 24 px au loin) — un sprite qui marche à 14× peut être illisible en jeu.

**Reproduire un bug SUR LA PROD dans la preview** (méthode trouvée le 21 août 2026, qui a résolu
le bug `runsTimer` — voir §11, vingt-sixième passe). La preview refuse `localhost` mais charge
très bien https://la-ville-est-belle-pmc.fr : on peut donc y lire le DOM, bidouiller
`localStorage` (pour simuler un joueur connu, un fan, N parties jouées), cliquer les boutons, et
surtout lire `read_console_messages` — sans jamais démarrer l'AudioContext (piège n°1), tant
qu'on n'entre pas vraiment en course. ⚠️ **Vérifier le nom du bundle chargé**
(`document.querySelectorAll('script[src]')`) avant de conclure : `index.html` est en
`max-age=600` (§9) et l'onglet peut resservir l'ancien build juste après un déploiement.

✅ **La preview accepte de nouveau `localhost` (22 août 2026).** `preview_start` sur la config
`dev` de `.claude/launch.json` puis navigation vers `http://localhost:5173/` fonctionne — c'est
redevenu la méthode la plus rapide, et de loin : on peut charger une **page de harnais** posée à
la racine (qui importe `/src/*.js` et dessine les sprites sur un canvas, sans jamais toucher à
l'AudioContext), et piloter les panneaux DOM du vrai jeu depuis la console via
`import('/src/screens.js')` — Vite renvoie **la même instance de module** que celle de la page,
donc `screens.openReviveSheet(...)` ouvre vraiment le panneau du jeu. Pour tester un lien
sortant sans quitter la page : `addEventListener('click', e => e.preventDefault(), true)` en
capture avant de cliquer — le handler de l'appli tourne quand même. ⚠️ Penser à supprimer la page
de harnais de la racine après coup.

⚠️ Le 12 août 2026, la preview navigateur avait en revanche refusé toute navigation vers le
serveur de dev (`localhost`, requêtes bloquées avant même le chargement de la page) — distinct du piège n°1
(figement par `AudioContext`), donc pas la même cause. Symptôme à surveiller : si les deux méthodes
ci-dessus deviennent aussi inutilisables, la seule vérification qui reste est un vrai test sur
téléphone après déploiement.
