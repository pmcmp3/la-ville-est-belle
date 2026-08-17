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

`src/` — 16 modules, ~6 600 lignes avec `index.html`. Aucun n'importe `main.js` : les
dépendances vont toujours vers le bas.

| Module | Rôle | À savoir |
|---|---|---|
| `main.js` | Boucle de jeu à pas fixe, état de partie, physique (saut, latéral), pause | **847 lignes** (1349 avant extraction de `screens.js`, voir §11) |
| `screens.js` | Écrans hors-jeu : onboarding pseudo/insta, décompte, panneau son, menu pause, classement | Extrait de `main.js` le 17 août 2026 — câblage DOM/présentation uniquement, aucune physique. Ne peut pas importer `main.js` (cycle) : reçoit `restartGame`/l'ouverture-fermeture de pause en callbacks via `init()` |
| `clock.js` | Temps musical : `now()`, `beatIndexAt()`, `timeOfBeat()` | Source de temps injectable (`setTimeSource`) |
| `audio.js` | Chargement, unlock iOS, lecture, 3 modes de pause | Le plus délicat du projet, voir §5.1 et §8 |
| `road.js` | Projection pseudo-3D, vitesse, rendu du sol | Exporte `project()`, que tout le reste consomme |
| `world.js` | Façades haussmanniennes, ciel, croisements, feux | Purement décoratif ; source de `isCrossingSlot` co-exportée par `road.js` |
| `entities.js` | Bonus/obstacles calés sur les beats : spawn, difficulté, collisions | **872 lignes** (1442 avant extraction de `entities-render.js`, voir §11) — le cœur du gameplay ; inclut le pont (viaduc). Zéro logique de rendu |
| `entities-render.js` | Rendu des bonus/obstacles : icônes pixel art, voitures/pont en faux-3D | Extrait de `entities.js` le 17 août 2026 — importe `entities.js` (jamais l'inverse) pour lire `slotsFor`/`isConsumed`/`hash` etc. |
| `voxel.js` | Primitif de cube extrudé (`blk`/`shade`/`parseColor`) | Partagé par `player.js` et `cyclists.js`, zéro logique d'orientation |
| `player.js` | Sprite du cycliste joueur (vu de dos), pédalage | **Voxel** (blocs extrudés) depuis le 12 août 2026 — même grammaire que `cyclists.js`, voir §11 |
| `cyclists.js` | Cyclistes-obstacles en sens inverse (vus de face) | DA voxel, 5 variantes |
| `pedestrians.js` | Sprites des piétons-obstacles | **Voxel** depuis le 12 août 2026, même `blk()` que joueur/cyclistes |
| `finish.js` | Ligne d'arrivée (damier au sol + portique façon F1) | Cosmétique — le vrai déclencheur de fin de course est `entities.isFinished()`, que ce module ne fait que visualiser |
| `hud.js` | Score, vies, statut concours | |
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
TOTAL_STARS      = 140   ← LE réglage central, réduit ×0,7 le 17 août 2026 avec dureeCourse (200 avant)
TOTAL_OBJECTS    = 191   ← dérivé de dureeCourse (143,5 s depuis le 17 août 2026)
TOTAL_OBSTACLES  = 51    ← ce qui reste
```

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
HORIZON_Z = √(CAMERA_HEIGHT / CURVATURE) ≈ 119 unités-monde
```

`CURVATURE` retouchée une seconde fois le 12 août 2026 (0,0004 → 0,00034, HORIZON_Z ≈ 110 → 119,
+8 %), inspirée d'un screen Subway Surfers envoyé par l'artiste (perspective de pont très longue).
⚠️ Non vérifiée visuellement dans la session qui l'a posée — preview navigateur inaccessible ce
jour-là, voir §12. À confirmer/ajuster au prochain test réel avant d'aller plus loin dans ce sens.

Rien ne doit être dessiné au-delà : la projection s'y replierait. Tous les modules de rendu
testent `z > HORIZON_Z` et sautent. Les objets « surgissent de derrière la courbe », ce qui est
l'effet recherché.

Repères : `ROAD_HALF_WIDTH = 4`, `LANE_COUNT = 3` (4 avant le 17 août 2026), donc une voie fait
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
| `cycliste` | 0,25 (0,40 au-delà de 10 000 pts, voir plus bas) | −1 vie + **−500 pts** | ✅ depuis le 12 août 2026 |
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

⚠️ **Intensification en fin de partie** (demandé explicitement le 12 août 2026 : « ×2 à partir de
10 000 points ») : au-delà de `CYCLIST_BOOST_SCORE` (10 000 pts, `entities.js`), le poids
`cycliste` est doublé puis toute la table `OBSTACLE_WEIGHTS` renormalisée (sinon la somme dépasse
1 et `pickWeighted()` devient injuste — les derniers types de la liste, `cone`/`pont`,
deviendraient carrément inatteignables). Mesuré : la part de `cycliste` passe de 25 % à 40 % des
obstacles, le reste se répartissant dans les mêmes proportions relatives qu'avant. ⚠️ **Seule
donnée de tout ce fichier qui dépend du GAMEPLAY (le score courant) plutôt que d'un hash pur par
index de créneau** (voir §5.2) — `main.js` pousse `game.score` via `entities.setScore()` une fois
par frame. Le tirage est **mémoïsé par créneau** (`rawContentCache`) dès son premier calcul : sans
ça, un score qui franchit le seuil pile pendant qu'un vélo est déjà visible mais pas encore résolu
lui ferait changer de nature EN COURS D'APPROCHE. Vidé par `reset()` au rejeu, comme
`resolved`/`consumed`/`debugOverrides`.

**Pont (viaduc du métro parisien)**, ajouté le 12 août 2026 (inspiré d'une référence Subway
Surfers envoyée par l'artiste — perspective à piliers, longue ligne de fuite). Bloque 2 ou 3
voies sur 4 à la même profondeur, une seule résolution de collision pour tout le pont (même
principe qu'une rangée de voitures, `entities.js`, mais en stockant les voies **bloquées**
plutôt qu'occupées — voir `bridgeBlockedLanes()`). Progression : 2 voies ouvertes en début de
course, 1 seule en fin de course (`bridgeOpenLanesAt()`, même rampe `t` que les rangées de
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

**Période de grâce** : `GRACE_BEATS = 4` (~2 s) sans obstacle en début de course. C'était 16
(~8 s), réduit après le retour « il y a juste plein d'étoiles, il se passe rien ».

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
même technique `project()`+fondu-brume que le reste du décor.
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

## 8. Audio : les trois modes de lecture

`audio.setPlaybackMode()` est le point d'entrée unique. `main.js` calcule le mode voulu à partir
de deux drapeaux (menu pause ouvert, onglet caché) et ne sait rien du Web Audio.

| Mode | Quand | Effet |
|---|---|---|
| `running` | En course | Filtre ouvert, son plein |
| `muffled` | Menu pause | Le morceau **continue**, filtre passe-bas à 800 Hz — on n'entend que les basses |
| `silent` | Onglet/app quitté | Fondu à 0 puis `audioCtx.suspend()` |

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

**Cache HTTP** (`public/_headers`) — deux régimes opposés :
- Sans hash dans le nom (`index.html`, `config.js`) → `no-store`, jamais périmé.
- Avec hash (bundle) ou quasi figé (MP3, polices) → cache long. Le MP3 fait 3,9 Mo ; ce réglage
  date de l'époque Netlify (facturée à la bande passante) mais reste utile tel quel sur GitHub
  Pages. **En cas de nouveau master : renommer le fichier** pour propager immédiatement.

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

Pour juger un sprite : le dessiner sur un canvas superposé à plusieurs échelles réelles
(110 px au plus près jusqu'à 24 px au loin) — un sprite qui marche à 14× peut être illisible en jeu.

⚠️ Le 12 août 2026, la preview navigateur a en plus refusé toute navigation vers le serveur de
dev (`localhost`, requêtes bloquées avant même le chargement de la page) — distinct du piège n°1
(figement par `AudioContext`), donc pas la même cause. Symptôme à surveiller : si les deux méthodes
ci-dessus deviennent aussi inutilisables, la seule vérification qui reste est un vrai test sur
téléphone après déploiement.
