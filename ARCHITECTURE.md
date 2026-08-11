# La ville est belle — Documentation technique

> **Lis ce fichier en premier.** Il remplace la lecture intégrale de `PLAN-ACTION.md`,
> qui est un journal de bord chronologique (~850 lignes) : utile pour retrouver *pourquoi*
> une décision a été prise, inutile pour comprendre comment le jeu marche.
>
> Ici : comment c'est construit, quels sont les invariants à ne pas casser, et les pièges
> qui ont déjà coûté des heures. Dernière mise à jour : 11 août 2026.

---

## 1. Le jeu en une page

Runner mobile type Subway Surfers, caméra derrière un cycliste, coucher de soleil parisien.
Tout est calé sur le morceau **La ville est belle** de PMC (~257,9 s, 120 BPM).

**L'objectif produit n'est pas le jeu, c'est le morceau** : le jeu existe pour donner envie
d'aller l'écouter. Toute décision de design se tranche là-dessus. C'est pourquoi, par exemple,
la musique continue de jouer après un game over.

- **Cible** : navigateur mobile, **Safari iOS en priorité absolue**, portrait natif.
- **En ligne** : https://pmc-la-ville-est-belle.netlify.app
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
npm run build && npx netlify deploy --prod --dir=dist
```

Le dépôt **n'a aucun remote git** : pas d'intégration Netlify↔GitHub, le déploiement passe
uniquement par le CLI. Site déjà lié (`ea72e3f5-4d7a-40e2-bf5e-d96daa72d23c`).

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

`src/` — 14 modules, ~5 900 lignes avec `index.html`. Aucun n'importe `main.js` : les
dépendances vont toujours vers le bas.

| Module | Rôle | À savoir |
|---|---|---|
| `main.js` | Boucle de jeu, état de partie, câblage DOM, saut, pause, écrans | **1242 lignes, module fourre-tout** — dette connue, voir §11 |
| `clock.js` | Temps musical : `now()`, `beatIndexAt()`, `timeOfBeat()` | Source de temps injectable (`setTimeSource`) |
| `audio.js` | Chargement, unlock iOS, lecture, 3 modes de pause | Le plus délicat du projet, voir §5.1 et §8 |
| `road.js` | Projection pseudo-3D, vitesse, rendu du sol | Exporte `project()`, que tout le reste consomme |
| `world.js` | Façades haussmanniennes, ciel | Purement décoratif |
| `entities.js` | Bonus/obstacles calés sur les beats, collisions | **1034 lignes**, le cœur du gameplay |
| `player.js` | Sprite du cycliste joueur (vu de dos), pédalage | Pixel art pré-rendu au chargement |
| `cyclists.js` | Cyclistes-obstacles en sens inverse (vus de face) | DA voxel, 5 variantes |
| `pedestrians.js` | Sprites des piétons-obstacles | Même technique que `player.js` |
| `finish.js` | Ligne d'arrivée | Cosmétique |
| `hud.js` | Score, vies, statut concours | |
| `input.js` | Gestes tactiles + clavier | Expose des **événements consommables**, pas un axe continu |
| `net.js` | Supabase (POST score, GET classement) | Ne lève jamais : échoue en silence |
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

### 5.3 `LEAD_IN` : pourquoi l'horloge démarre à −7,5 s

`clock.now()` vaut 0 à l'instant où la partie démarre. Or le créneau 0 est censé arriver au
joueur *pile* à cet instant : sans correctif, tout le premier lot d'objets se retrouve déjà **à**
la position du joueur dès la première frame, au lieu d'avoir glissé depuis l'horizon.

D'où `clock.jumpBy(-entities.LEAD_IN)` au départ **et au rejeu**, avec
`LEAD_IN = LOOKAHEAD_SLOTS × CADENCE × beatPeriod` = 10 × 1,5 × 0,5 = **7,5 s**. Le créneau 0
démarre alors exactement à la limite de visibilité, comme n'importe quel créneau plus tard en
course.

### 5.4 Le quota exact par diffusion d'erreur

Contrainte produit : **exactement 200 étoiles par partie**, pour que le score maximum soit un
nombre connu et que « tout prendre » soit l'objectif.

Un tirage probabiliste (`hash(slot) < ratio`) est déterministe mais ne donne pas un total rond.
Remplacé par une **diffusion d'erreur** (même principe qu'un tramage d'image) : un cumul
accumule le ratio cible créneau après créneau, et un créneau est une étoile seulement s'il fait
franchir un palier entier. Le total vaut alors exactement `floor(somme des ratios)`.

```
TOTAL_STARS      = 200   ← LE réglage central
TOTAL_OBSTACLES  = 100
TOTAL_OBJECTS    = 300   ← c'est ça, la ligne d'arrivée (pas la fin du morceau)
```

La course dure donc 300 × 1,5 × 0,5 = **225 s**, alors que le morceau en fait 257,9. L'écart est
voulu : la musique continue après la ligne d'arrivée.

`BONUS_RATIO_END` est **dérivé**, pas écrit à la main, pour que le quota tienne même si on
retouche `TOTAL_STARS` / `TOTAL_OBSTACLES` / `GRACE_SLOTS`.

### 5.5 La projection pseudo-3D est courbe, pas plate

`road.project(x, z, width, height)` renvoie `{x, y, scale}`. Le sol s'enfonce de `CURVATURE·z²`
sous le plan de la caméra, ce qui donne un horizon **réellement atteignable** :

```
HORIZON_Z = √(CAMERA_HEIGHT / CURVATURE) ≈ 110 unités-monde
```

Rien ne doit être dessiné au-delà : la projection s'y replierait. Tous les modules de rendu
testent `z > HORIZON_Z` et sautent. Les objets « surgissent de derrière la courbe », ce qui est
l'effet recherché.

Repères : `ROAD_HALF_WIDTH = 4`, `LANE_COUNT = 4`, donc une voie fait 2 unités.
`PLAYER_NEAR_Z = 13` (profondeur du joueur, fixe).

---

## 6. Gameplay — les chiffres actuels

**Voies** : 4. La collision est un **test d'égalité de voie**, pas une distance latérale. C'est
ce qui a réglé d'un coup « t'es short sur les hitbox » et « je peux rester entre deux voies
indéfiniment ».

**Rythme** : un objet tous les `cadenceSpawnBeats` = 1,5 temps, soit **0,75 s** à 120 BPM.

**Vitesse** : `BASE_SPEED × vitesseBase` = 11 × 1,8 = **19,8 u/s** au départ, croissance
exponentielle (doublement toutes les 57 s) plafonnée à `vitesseMax` = 6,0.

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

**4 obstacles** (c'était 3 : le cycliste a été promu de décor à obstacle) :

| Obstacle | Poids | Coût | Le saut sauve ? |
|---|---|---|---|
| `voiture` | 0,50 | **fatal** (3 vies d'un coup) | ✅ (survol + atterrissage sur le toit) |
| `cycliste` | 0,20 | −1 vie | ❌ |
| `pieton` | 0,15 | −1 vie | ❌ |
| `cone` | 0,15 | −1 vie | ✅ |

`UNJUMPABLE_KINDS = {pieton, cycliste}` : ces deux-là se contournent **latéralement
uniquement**. Distribution réelle mesurée sur les 300 créneaux : voiture 46, piéton 21,
cycliste 18, cône 15.

**Période de grâce** : `GRACE_BEATS = 4` (~2 s) sans obstacle en début de course. C'était 16
(~8 s), réduit après le retour « il y a juste plein d'étoiles, il se passe rien ».

**La garde anti-piège** : un obstacle infranchissable au saut ne doit jamais partager sa voie
avec un bonus au créneau voisin (±1) — sinon le joueur doit choisir entre rater l'étoile et
perdre une vie, un piège que rien d'autre n'impose. La garde **déplace l'obstacle de voie**
(`laneOverride`). Elle changeait son *type* auparavant : ça marchait tant que le piéton était
seul concerné, mais dès l'arrivée du cycliste elle convertissait **51 %** des obstacles
infranchissables et vidait la catégorie en silence (18 cyclistes tirés → 8 survivants).

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

> 🐛 **Point ouvert — la reprise de pause rembobine le morceau.** En mode `muffled` l'horloge de
> jeu est gelée à la main (`muffleAnchor`) pendant que le morceau continue ; à la reprise, l'écart
> est rattrapé en **relançant la lecture à l'instant gelé** (`playNow(muffleAnchor)`). C'est
> assumé dans le code (« le prix à payer pour que bonus et obstacles retombent sur les temps »)
> mais l'artiste l'entend comme un retour en arrière et veut l'inverse : que le morceau continue
> et que ce soit la *course* qui se resynchronise. **Non corrigé.**

---

## 9. Backend & déploiement

**Supabase** (PostgREST, pas de SDK). Aucun anti-triche — décision verrouillée : la vérité du
concours se fait au screenshot envoyé par le joueur.

- Le **pseudo** est public (classement), l'**Insta** est privé. La lecture passe par la vue
  `scores_public`, qui **n'expose pas** la colonne Insta — masquer à l'affichage n'aurait rien
  protégé, la clé anon est forcément dans le bundle.
- `net.js` ne lève jamais d'exception : backend absent, réseau coupé ou migration non appliquée
  → il renvoie `[]` et l'écran de fin reste fonctionnel.
- Schéma dans `supabase-schema.sql`, migration dans `supabase-migration-pseudo-insta.sql`.

**Cache HTTP** (`public/_headers`) — deux régimes opposés :
- Sans hash dans le nom (`index.html`, `config.js`) → `no-store`, jamais périmé.
- Avec hash (bundle) ou quasi figé (MP3, polices) → cache long. Le MP3 fait 3,9 Mo, le remettre
  en cache est ce qui a arrêté de brûler les crédits Netlify. **En cas de nouveau master :
  renommer le fichier** pour propager immédiatement.

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

**Bugs connus, non corrigés :**
- La reprise de pause rembobine le morceau (voir §8).
- Le classement n'apparaît pas sur l'écran de fin chez l'artiste. Le code est en place et
  intact ; **piste n°1 : la requête Supabase elle-même** (`net.js` renvoie `[]` en silence sur
  toute erreur). À reproduire en prod avec la console réseau.

**Dette structurelle :**
- `main.js` (1242 lignes) est un module fourre-tout : pause, DOM, onboarding, classement,
  physique du saut, boucle, collisions, séquence de fin. À découper — mais **comme passe
  séparée**, jamais mélangé à un changement de gameplay.
- `PLAN-ACTION.md` (850+ lignes) est un journal append-only que `CLAUDE.md` impose de lire en
  entier à chaque session. C'est le plus gros coût fixe par session. Ce fichier-ci est censé
  le remplacer pour le quotidien.

**À vérifier avant le lancement public :**
- ⚠️ `config.js` → `dateOuverture` est fixée au **5 août 2026** pour les tests. Le commentaire
  demande de la remettre à la date de lancement officiel **et de vider la table `scores`** côté
  Supabase pour repartir sur un classement propre.
- ⚠️ `CLAUDE.md` mentionne encore `linktr.ee/pmc.mp3` comme CTA, alors que `config.js` pointe
  désormais vers `li.sten.to/la-ville-est-belle`. C'est `config.js` qui fait foi.
- L'équilibrage : on garde maintenant ~39 obstacles infranchissables par partie au lieu de ~19
  (le total reste à 100). À confirmer en jouant — le levier est le poids `cycliste`.

**Jamais validé sur iPhone réel** pour la session en cours : la DA voxel des cyclistes et la
nouvelle difficulté.

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
