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

En ligne (seul site, officiel) : **https://la-ville-est-belle-pmc.fr** (domaine OVH de l'artiste
depuis le 21 août 2026, servi par GitHub Pages ; l'ancienne adresse
`pmcmp3.github.io/la-ville-est-belle` redirige en 301 — voir `ARCHITECTURE.md` §11, dix-huitième
passe, pour l'ordre de déploiement et le piège de la page d'attente OVH). **Netlify est
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
- **3 vies**, **5 obstacles**, **5 bonus**. ⚠️ **Depuis le 21 août 2026, TOUS les obstacles de
  la grille sont FATALS** (« je veux que tous les obstacles fassent trois cœurs ») — les coûts
  « −1 vie » listés plus bas sont l'HISTORIQUE, plus la règle courante. Seule la voiture
  traversante (crosstraffic.js) reste à −1 vie (jamais fatale, invariant verrouillé). En
  contrepartie : **seconde chance à la mort** — première mort d'une partie → panneau 10 s
  (`#revive-sheet`), reprise sur place, score ET combo conservés, une fois par partie.
  ⚠️ **Échelle de conversion à TROIS PALIERS** (posée le 21 août 2026 — « la première fois
  sauvegarder le morceau, la deuxième s'abonner à PMC, après on laisse rejouer »). ⚠️ Depuis la
  quatrième passe du 23 août 2026 elle ne vit PLUS sur la carte de mort elle-même mais dans le
  tiroir `#gate-sheet`, et elle conditionne les DEUX actions (continuer ET rejouer) : voir le
  bloc « MODÈLE DE CONVERSION — QUATRIÈME PASSE » plus bas, qui fait foi. La reprise est
  TOUJOURS un tap séparé (jamais « dans le dos » du joueur revenu de Spotify).
  - Bonus : `cd`, `piano`, `appareil`, `collierPerles`, `guitare` (les deux derniers sont aériens).
  - Obstacles : `voiture` (choc fatal), `cycliste`, `pieton`, `cone`, `pont` (choc fatal).
  - ⚠️ **3 → 4 obstacles** : le cycliste en sens inverse a été promu de décor à vrai obstacle
    (« on fait en sorte que les cyclistes deviennent tous des obstacles »).
  - ⚠️ **4 → 5 obstacles** : `pont` (viaduc du métro parisien) ajouté — bloque 2 ou 3 voies sur 3
    (4 avant le 17 août 2026) à la même profondeur (2 voies ouvertes en début de course, 1 seule
    en fin de course).
  - ⚠️ **Beaucoup plus de ponts, surtout en fin de course** (demandé le 17 août 2026) : poids de
    base 0,10 → 0,30 (`OBSTACLE_WEIGHTS`, `entities.js`), plus un boost supplémentaire ×4 à partir
    de `PONT_TIME_BOOST_TIME_S` (95 s, ≈66 % du parcours) — ~43 % de chance qu'un obstacle soit un
    pont une fois ce seuil franchi, contre ~10 % avant. Composé par-dessus les boosts voiture/
    cycliste existants (`applyPontLateBoost()`), jamais une 5e table nommée séparée.
  - Voiture, cône **et cycliste** se franchissent au saut ; seul le piéton se contourne
    **latéralement uniquement** (`UNJUMPABLE_KINDS` dans `entities.js`). ⚠️ Le cycliste en est
    sorti le 12 août 2026 (demandé explicitement, il y était depuis sa promotion en obstacle) —
    ne pas le réintroduire dans `UNJUMPABLE_KINDS` sans redemander.
  - ⚠️ **Intensification par palier de score, SANS PLAFOND** (12 août 2026, remplacée le 17 août
    2026 — « ça manque d'obstacles dès que je suis à 80000... complexifie et intensifie ») :
    l'ancien seuil unique (« ×2 cycliste à partir de 10 000 pts ») ne faisait plus rien une fois
    franchi, alors que le combo (voir plus bas) permet de monter bien plus haut. Remplacé par
    `SCORE_TIER_SIZE`/`SCORE_TIER_FACTOR` (`entities.js`, `applyScoreTierBoost()`) : tous les
    **5 000 pts** (15 000 avant le 19 août 2026 — remis à l'échelle du nouveau plafond de score,
    61 400 au lieu de ~195 000, sinon les paliers ne se déclenchaient quasiment plus), le poids de
    voiture/cycliste/**pont** est multiplié d'avantage, cumulativement. En plus de ça, `scoreRampT()`
    pousse les rangées de voitures et les ponts vers leur configuration la plus dure (le moins de
    voies libres) EN AVANCE sur la rampe temporelle normale — mesuré : à 80 000 pts, 67 % des
    ponts n'ont plus qu'une seule voie ouverte (10 % à score nul), 54 % des rangées de voitures
    sont à 2 voitures (35 % à score nul). Seule donnée de ce fichier qui dépend du GAMEPLAY
    (score) plutôt que d'un hash pur par index de créneau, voir `ARCHITECTURE.md` §5.2.
  - ⚠️ **Le pont est un cas à part, revu le 12 août 2026** : sauter y est TOUJOURS dangereux,
    même dans la voie ouverte (la poutre est basse) — le seul obstacle où `inAir` aggrave le
    risque au lieu de le neutraliser. Passer sous un pont exige de rester au sol dans la bonne
    voie. Choc fatal comme la voiture (`game.lives = 0` dans `main.js`), pas seulement −1 vie.
  - ⚠️ **Intensification voitures/vélos à ~1/3 de course** (demandé le 13 août 2026, retour ami ;
    facteurs intensifiés et seuil rescalé le 17 août 2026) : à partir de **63 s**
    (`CAR_TIME_BOOST_TIME_S`, `entities.js` — 90 s à l'origine, rescalé ×0,7 avec `dureeCourse`
    pour se déclencher au même moment RELATIF du parcours), le poids `voiture` est multiplié par
    **2,5** (2 avant) et le poids `cycliste` par **1,6** (1,3 avant), puis la table est
    renormalisée. Déclenché par le TEMPS écoulé, contrairement au boost par palier ci-dessus
    (déclenché par le SCORE) — reste donc une fonction pure de `slotIndex`, pas une exception au
    modèle décrit en `ARCHITECTURE.md` §5.2. Les deux se cumulent avec le palier de score.
- **Un nombre d'étoiles EXACT et identique à chaque partie**, pour que le score maximum soit un
  nombre connu. ⚠️ **Ce nombre n'est plus 140 et n'est plus écrit à la main depuis le 19 août
  2026** : il vaut **85** et il est DÉRIVÉ de la loi de difficulté (`TOTAL_STARS` se compte sur
  `isBonusQuota`, `entities.js`). C'est la propriété qui est verrouillée (même total à chaque
  partie, score max calculable), pas sa valeur. Historique : 200 → 140 (17 août) → 80 (19 août)
  → 85 (21 août, détente de fin de course + grâce allongée, voir ci-dessous).
  `TOTAL_OBSTACLES` (= `TOTAL_OBJECTS` − `TOTAL_STARS`) vaut donc **106**.
- ⚠️ **Difficulté : la densité d'obstacles DOUBLE toutes les 25 s** (`OBSTACLE_DOUBLING_TIME_S`,
  `entities.js`), de 38 % des créneaux au départ jusqu'à un plafond de **60 %**
  (`OBSTACLE_RATIO_MAX`, atteint vers 16 s). Demandé le 19 août 2026 : « multiplie par deux le
  nombre d'obstacles toutes les 25 secondes, c'est trop facile, il faut vraiment que ce soit
  extrêmement difficile ». Remplace la rampe LINÉAIRE `BONUS_RATIO_START`/`BONUS_RATIO_END`
  (supprimées), qui faisait *baisser* la densité d'obstacles de 38 % à 16 % au fil de la course —
  la fin était devenue la portion la plus vide du jeu, exactement la plainte remontée deux fois.
  ⚠️ **Arbitrage explicite de l'artiste** : un créneau porte soit une étoile soit un obstacle, et
  il n'y en a que 191 — doubler les obstacles fait donc mécaniquement tomber le quota d'étoiles.
  Trois scénarios chiffrés lui ont été soumis, il a choisi le plafond à 60 % (qui plus que double
  les obstacles tout en gardant le combo atteignable) plutôt que 85 % (qui tuait le combo).
  ⚠️ **Détente de FIN de course ajoutée le 21 août 2026** (« plus d'étoiles à la fin, ça va
  super vite mais il n'y a pas beaucoup d'étoiles ») : de 100 s à la ligne, le ratio d'obstacles
  redescend linéairement de 0,60 à **0,45** (`OBSTACLE_END_TAPER_START_S`/`OBSTACLE_RATIO_END`,
  `entities.js`) — justifié par les véhicules traversants (HORS quota) à densité maximale après
  100 s, qui cumulaient les deux sources de danger. Dernières 30 s : 16 → 19 étoiles.
- **Ligne d'arrivée en volume** (`finish.js`) : damier au sol + portique (deux pylônes + poutre à
  damier qui enjambe la route), façon Formule 1 — demandé explicitement le 12 août 2026 pour
  remplacer le simple damier plat d'origine.
- Backend **Supabase**. Identité = **pseudo public + Insta privé** (les deux obligatoires).
  **Aucun anti-triche** : la vérité du concours se fait au screenshot.
- Image de partage **carrée 1080×1080** (`share.js`). ⚠️ **Bouton « PARTAGER MON SCORE » retiré
  le 23 août 2026** (« tout le monde s'en fout ») — `share.js` reste sur le disque, non importé,
  non bundlé (voir plus bas). Le reste de cette entrée décrit un travail toujours sur le disque
  mais actuellement inatteignable en jeu ; ne pas le rebrancher sans redemander. ⚠️ **Deux points
  du brief d'origine révisés le 19 août 2026**, après avoir vu la première version tourner :
  - **Format 9:16 → carré.** « Je pense pas que les gens vont mettre des stories, par contre sur
    TikTok ils vont mettre en commentaire » — or une image en commentaire s'affiche en VIGNETTE
    recadrée au carré : une 1080×1920 y perdait son haut et son bas, donc le titre et le lien,
    c'est-à-dire tout ce qui permet de retrouver le jeu.
  - **Borne d'arcade dessinée → affiche dépouillée.** « Pas trop mal mais beaucoup trop lourd,
    faut le simplifier de fou ». Le premier jet dessinait la borne complète (marquee, écran CRT
    avec le ciel/la route/le personnage, stats, joystick, fente à monnaie) : lisible à 1080 px,
    illisible en vignette. Il ne reste que l'aplat rouge de charte, LE SCORE en énorme, le pseudo,
    une ligne « x/80 étoiles » entre deux étoiles du jeu, et l'URL. Vérifié lisible jusqu'à 56 px.
    96 Ko au lieu de 455.
  ⚠️ **L'image est fabriquée à l'affichage de l'écran de fin, pas au clic** : `navigator.share()`
  doit être appelé dans la pile d'appel du geste (même règle qu'`AudioContext` sur iOS), or
  `canvas.toBlob()` est asynchrone et ferait perdre le geste. Repli en téléchargement quand le
  partage de fichiers n'existe pas.
- **Conversion vers le morceau** (demandé le 19 août 2026 : « quand quelqu'un arrive à 50 000, le
  jeu se met en pause, il doit presser le lien »). Réalisé en DEUX temps, après arbitrage — le
  mur en pleine course a été écarté (à 50 000 sur un maximum de 61 400 le seuil n'était quasiment
  jamais atteint, et quitter la page en course sur mobile fait perdre le run : onglet rechargé, ou
  morceau rembobiné au-delà de `pauseDeriveMax`) :
  - **En course** : un bandeau NON BLOQUANT à 12 000 points (`MILESTONE_SCORE`, `main.js` +
    `hud.renderMilestone`), 4 s, bas de l'écran. ⚠️ Reformulé le 21 août 2026 (« j'ai pas compris
    pourquoi il est marqué 12 000 points [...] dis un truc genre premier palier activé ») :
    titre « PREMIER PALIER ACTIVÉ ! », sous-titre « le morceau t'attend à l'arrivée » — le
    palier est la récompense, le chiffre brut ne se lisait pas.
- ⚠️ **MODÈLE DE CONVERSION — QUATRIÈME PASSE, 23 août 2026** (« quand une personne arrive pour
  la première fois, fait une partie et échoue, il faut deux boutons : continuer la partie,
  rejouer [...] tu dois d'abord pré-sauvegarder l'album de PMC sur Spotify [...] pareil pour le
  rejouer, il faut que ce soit exactement les mêmes conditions. L'idée c'est de la
  transformation »). C'est le modèle COURANT ; les trois passes précédentes du même jour sont
  l'historique, résumé plus bas.
  - **La carte de mort ne porte plus aucun lien Spotify.** Elle pose le choix, rien d'autre :
    `CONTINUER LA PARTIE` (garde score et combo) / `REJOUER` (course neuve) / « Voir mon score ».
    Son décompte de **10 s** est inchangé — expiré sans choix → écran de fin.
  - **Les DEUX boutons passent par exactement la même porte** — c'est tout le point de la
    demande — et cette porte est un **tiroir qui se soulève d'en bas** (`#gate-sheet`,
    `ouvrirGate`/`exigerConversion` dans `screens.js`), avec l'échelle à trois paliers :
    `"presave"` (album jamais pré-sauvegardé → CTA `config.lienPresave`) → `"suivre"`
    (pré-sauvegardé, pas encore abonné → CTA `config.lienSuivre`) → `"libre"` (les deux faits :
    **le tiroir ne s'ouvre plus jamais**, les deux actions partent au premier tap).
  - **`REJOUER` de l'écran de fin passe par la même porte.** Sans ça elle se contournerait en un
    tap (« Voir mon score » puis REJOUER) et ne demanderait plus rien à personne.
  - ⚠️ **`config.lienPresave` est un NOUVEAU réglage**, séparé de `lienEP` pour que le vrai lien
    de pré-sauvegarde de l'album puisse y être collé sans toucher au smartlink du morceau. Tant
    qu'il vaut la même URL, le palier 1 envoie sur le smartlink du morceau — fonctionnel, mais
    **ce n'est pas une pré-sauvegarde d'album** : à remplacer dès que le lien existe.
  - ⚠️ **Le tiroir N'EXPIRE PAS** (mesuré au banc d'essai, sur un premier jet qui lui donnait sa
    propre fenêtre de 10 s) : la fenêtre courait pendant que le joueur LISAIT la demande,
    expirait, rendait la main à la carte de mort dont le décompte reprenait — et le jetait sur
    l'écran de fin sans qu'il ait rien fait. Les 10 s appartiennent à la carte de mort (offre
    limitée) ; le tiroir pose une demande, il attend, sa seule sortie est « Plus tard ». Le
    décompte de la carte est **gelé** tant que le tiroir est ouvert, et **repris là où il en
    était** si le joueur referme par « Plus tard ».
  - Au retour de Spotify, le tiroir joue le **décompte 5-4-3-2-1** (`loopMortRetour`) qui
    rouvre le filtre de la boucle, puis **arme** le bouton d'action. ⚠️ La reprise reste un
    **tap explicite**, jamais un redémarrage automatique (invariant du 22 août 2026).
  - ⚠️ **La première partie reste libre** : la porte n'existe qu'APRÈS un échec. Le bouton
    JOUER du menu n'est pas touché.
  - ⚠️ **RENVERSEMENT ASSUMÉ** du « rejouer est toujours gratuit » posé plus tôt le même jour
    (troisième passe), qui avait été décidé après avoir mesuré une IMPASSE sur un joueur neuf :
    aucun chemin vers une deuxième course sans cliquer le lien, le joueur fermait l'onglet. Ce
    qui change et évite de la reproduire : le palier se lève **au clic** sur le lien,
    définitivement, et le tiroir **arme lui-même** l'action demandée au retour de Spotify — il y
    a donc toujours un chemin vers la course suivante. Le joueur qui refuse le lien, lui, n'en a
    plus : c'est la contrepartie voulue, arbitrée par l'artiste (« l'idée c'est de la
    transformation »).
  - ⚠️ **Le REJOUER de la carte de mort finalise quand même la course** (`finalizeRun()`,
    extrait de `endGame()` le 23 août 2026) : son score part au classement et elle compte dans
    le compteur global. Sans ça, chaque joueur qui préfère repartir de zéro plutôt que voir son
    score aurait fait sous-compter « X courses depuis le lancement » en silence.
  - **L'écran de fin garde ses demandes NON bloquantes** : bouton AJOUTER LE MORCEAU en
    secondaire, promesse de boost fan (+10 %), bandeau « Tu écoutes La ville est belle ». Ces
    clics-là lèvent aussi le palier 1 (même clé `localStorage`).
  - ~~Verrou `#unlock-sheet` sur REJOUER~~ — supprimé le 23 août 2026 avec le panneau lui-même
    (voir l'impasse ci-dessus). Le nouveau modèle n'y revient pas : il n'y a plus de panneau de
    verrou, il y a un tiroir de demande qui débloque lui-même l'action.
- **Défi à un ami** (`defi.js`, demandé le 21 août 2026) : le lien de partage embarque un score
  à battre (`?defi=23102&de=pol`). Le jeu porte la cible d'un bout à l'autre — bandeau au-dessus
  de JOUER, jauge de progression sous le score pendant la course, popup « DÉFI RELEVÉ ! » au
  dépassement, verdict (ou l'écart manquant) sur l'écran de fin. ⚠️ **Aucune vérification,
  assumé** — même règle que le reste du jeu, et rien de tout ça n'atteint Supabase. ⚠️ Le lien
  se fabrique sur une base EN DUR, jamais sur `location.href` (sinon on relaie le score du
  défiant précédent).
  ⚠️ **Boost de départ depuis le 23 août 2026** (« on peut pas booster le défi à un ami pour
  que les gens aient un boost de départ ? ») : arriver par un lien `?defi=` offre
  `defiBoostPaliers` (config.js, = 1) palier(s) de combo dès le départ — ×1,5 dès la première
  étoile, pastille visible dès la première frame, perdu au premier obstacle comme n'importe quel
  combo. Armé dans `requestGameStart()` ET `restartGame()` (la première course ne passe pas par
  restartGame). Annoncé au menu (bandeau défi), dans le texte de partage (defi.js), et sur
  l'écran de fin. Sans condition côté receveur (c'est le levier de VOLUME) ; la vérification
  « la personne a vraiment joué » côté envoyeur n'existe pas — assumé, comme le reste du défi.
  ⚠️ Le bouton « DÉFIER UN AMI » est un vrai `.btn` secondaire depuis le même jour (« il faut
  vraiment qu'on le mette en avant ») — renversement assumé du « pas un troisième bouton » du
  21 août, rendu possible par la passe UX qui a réduit tous les boutons (50→46 px, 15→14 px,
  score de fin 40→46 px : « que tout soit plus lisible et qu'on voie un peu plus de score »).
  ⚠️ **PARTAGER MON SCORE retiré le 23 août 2026** (troisième passe le même jour, « tout le
  monde s'en fout, tu laisses défier un ami prendre toute la place ») — après une étape
  intermédiaire le même jour où les deux boutons étaient côte à côte, PARTAGER a fini par
  disparaître complètement : DÉFIER UN AMI passe en pleine largeur, même gabarit que
  REJOUER/AJOUTER LE MORCEAU. `share.js` reste sur le disque mais n'est plus importé, donc
  plus bundlé (91 Ko → confirmé par le build, 26 modules au lieu de 27) — même sort que
  `clip.js` le 20 août, ne pas le rebrancher sans redemander.
  ⚠️ **Classement réduit au TOP 3 + rang du joueur** (même passe) : la carte ne montre plus une
  liste de 5 lignes qui défile, mais 3 lignes fixes — et, si le joueur est classé au-delà, sa
  propre ligne avec son VRAI rang juste en dessous (filet pointillé, `.self-gap`). Un lien
  « Voir le classement complet → » ouvre `#leaderboard-sheet` (même patron de tiroir que
  `#unlock-sheet`) avec les 50 lignes complètes, scrollable, centré sur le joueur — jamais un
  second appel réseau, `screens.js` réutilise la réponse déjà reçue (`dernierClassement`).
  ⚠️ **Icônes WhatsApp/Messages/Snap sous « DÉFIER UN AMI »** (23 août 2026, « pour que les gens
  captent ») : purement décoratives — `partagerDefi()` ouvre le partage natif du téléphone
  (`navigator.share`), qui liste déjà ces apps si elles sont installées ; les icônes ne
  déclenchent rien de spécifique, elles annoncent juste ce qui va s'ouvrir. Posées SEULEMENT sur
  DÉFIER, pas sur PARTAGER MON SCORE : ce dernier envoie un fichier image (repli story/Instagram
  cohérent, l'URL est déjà bakée dans l'image), le défi envoie un texte+lien (repli messagerie,
  jamais une story).
- **Course parfaite** (demandé le 21 août 2026) : parcours terminé sans un seul choc (traversante
  comprise) → bandeau « Course parfaite », pastille sur l'écran de fin, et badge
  **« LA VILLE EST PARFAITE »** sur l'image de partage, où il REMPLACE le badge de disque.
- **Instagram de l'artiste** (`lienInsta` dans `config.js`) sur l'écran de fin, accroché au rappel
  du concours (fusionné en une ligne le 23 août 2026 : « Un vinyle à gagner — résultats sur
  @pmc.mp3 », passe « ça respire pas ») — placé là pour DONNER une raison de
  suivre plutôt que d'ajouter un troisième lien en concurrence avec les CTA de conversion.
- CTA « aller écouter » : **c'est `config.js` (`lienEP`) qui fait foi**, pas ce fichier.
- **3 voies** (`LANE_COUNT`, `road.js`) — 4 avant le 17 août 2026, demandé explicitement. Route
  physique inchangée (`ROAD_HALF_WIDTH`), voies plus larges. Seul ajustement de logique exigé : les
  rangées de 3 voitures (`entities.js`) auraient occupé les 3 voies à la fois, retirées.
- **Combo** (demandé le 17 août 2026) : `comboSeuil`/`comboBonusParPalier` (`config.js`) — 5 étoiles
  ramassées d'affilée (sans toucher d'obstacle entre-temps) → ×1,5 sur les points de bonus, 10 → ×2,
  15 → ×2,5, etc. Remis à 0 au moindre obstacle touché. `main.js` (`comboMultiplier()`), affiché en
  jeu sous le score (`hud.js`) quand actif, dans une **pastille crème** depuis le 19 août 2026
  (« que le combo soit dans un tag un peu plus gros pour qu'on comprenne comment ça marche ») —
  jamais rouge, le rouge de charte est réservé au négatif (la pénalité). Score maximum théorique
  (run parfait, 85/85 étoiles, 0 obstacle touché, combo jamais cassé) : **86 825 points**
  (**95 519** avec le boost fan ×1,1, voir plus bas) — re-recalculé le 21 août 2026 après le
  passage de GRACE_BEATS à 7 (le tirage déterministe s'est redistribué), avec les **14 étoiles
  DORÉES** (×2, `GOLD_STAR_RATE` dans
  `entities.js`, tirées au hash donc identiques à chaque partie — l'invariant « score max =
  nombre connu » tient toujours ; teinte blanc doré, rotation deux fois plus rapide). Toutes les étoiles **tournent sur elles-mêmes**
  (1 tour / 2 s = une mesure à 120 BPM, `entities-render.js`), autour de l'axe VERTICAL façon
  pièce de Mario (« le haut de l'étoile ne doit pas bouger »), jamais `ctx.rotate()` dans le
  plan de l'écran. ⚠️ **Refonte 3D complète le 21 août 2026** (« on dirait des petits pâtés »,
  références Mario fournies) : plus d'icônes pré-cuites ni d'astuce cosinus/capsule — les
  étoiles sont un VRAI solide extrudé rendu par frame (`drawStar3D()`, entities-render.js) :
  faces bombées à 10 facettes en cel-shading 3 tons, tranche qui suit le contour, yeux sur les
  deux faces. Voir ARCHITECTURE.md §11 (dix-septième passe) pour les réglages sensibles
  (`STAR_THICK`/`STAR_BUMP`/`STAR_SHADE_BUMP`) — ne pas regrossir l'épaisseur sans revérifier
  le profil à 90°.
  ⚠️ **Le classement Supabase est à remettre à zéro** avant le lancement public : les scores déjà
  enregistrés l'ont été sous d'anciens barèmes (195 525, 61 400, 68 925…) et écraseraient
  définitivement ceux du nouveau (86 825 / 95 519).
- **Conversion, mécaniques ajoutées le 20 août 2026** (priorité produit assumée) :
  - **Boost fan ×1,1 permanent** sur les points de bonus dès que le morceau a été ajouté
    (`screens.estFan()`, même localStorage que le verrou) — annoncé sur l'écran de fin tant
    qu'il n'est pas acquis. La conversion est récompensée, pas seulement exigée.
  - ~~**Second verrou doux après 3 parties** sur REJOUER~~ — ⚠️ **SUPPRIMÉ le 23 août 2026**
    avec le verrou principal (le seuil `SEUIL_SUIVRE` a disparu). Suivre PMC (`lienSuivre` dans
    config.js — le vrai profil Spotify, vérifié le 21 août 2026 via son Instagram) reste le
    DEUXIÈME palier de la carte de mort, où il achète la continuation de la course.
  - **Bandeau « Tu écoutes La ville est belle »** sur l'écran de fin (le morceau y joue vraiment
    ~114 s) — cliquable, même smartlink. ⚠️ **Equalizer branché sur le VRAI spectre depuis le
    21 août 2026** (« même modèle que le Dynamic Island : basses à gauche, aigus à droite ») :
    `AnalyserNode` DANS la chaîne de sortie (`focusGain → analyser → destination` — jamais en
    dérivation : WebKit/navigateur Instagram n'alimente pas un analyseur hors du chemin vers
    destination, bug vécu le jour même), `audio.getEqLevels`, 5 barres pilotées en rAF par
    `screens.js` — l'ancienne animation CSS ne subsiste qu'en secours (classe `.idle`) quand le
    contexte audio ne tourne pas.
  - **CTA renommé « AJOUTER LE MORCEAU »** (lienEP est déjà un smartlink li.sten.to).
  - **Balises OG/Twitter** avec la pochette (`public/assets/cover-ep-og.jpg`).
  - **Compteur global de courses** (« X courses déjà jouées ») + **date de fin du concours**
    sur l'écran de fin — table `courses` insert-only, migration
    `supabase-migration-compteur-courses.sql` **à exécuter côté Supabase**. ⚠️ Compté en
    `count=planned` (estimation du planificateur Postgres, pas un `count=exact`) pour ne pas
    relancer un comptage complet toutes les 20 s par joueur sur l'écran de fin — le chiffre
    affiché peut donc dériver de quelques lignes par rapport au total réel, exact ou non selon
    que l'auto-analyze vient de tourner. Assumé, c'est de la preuve sociale, pas une mesure.
  - **Compteur de clics sur « AJOUTER LE MORCEAU »** (23 août 2026, `net.postClicEP`/
    `net.getClicsEPCount`) : même patron exact que le compteur de courses (table `clics_ep`
    insert-only, migration `supabase-migration-compteur-clics-ep.sql` **à exécuter côté
    Supabase**, comptage `planned`). Sert à mesurer le taux JEU → smartlink sans dépendre du
    tableau de bord li.sten.to (qui voit ses visites mais jamais d'où elles viennent). Posé sur
    les 4 emplacements qui peuvent pointer vers `lienEP` (carte de fin, CTA flottant du menu,
    panneau de verrou, panneau de seconde chance) — mais seulement si le lien pointe VRAIMENT
    vers `lienEP` au moment du clic : `unlockSheetCta`/`reviveCta` peuvent aussi pointer vers
    `lienSuivre` (second verrou), un funnel volontairement exclu de ce compteur.
  - **Image de partage** : pochette de l'EP + badge disque (bronze/argent/or/platine) ; le
    partage embarque désormais texte + lien du jeu.
  - ~~**Clip vidéo des 5-10 dernières secondes**~~ — **RETIRÉ le 21 août 2026** (« tu peux
    enlever Partager le clip, tu mets juste Partager mon score ») : bouton supprimé de l'écran
    de fin ET enregistrement coupé en course (les appels `clip.demarrer()`/`terminer()` de
    main.js ont sauté — son coût d'encodage jamais mesuré n'a plus de raison d'être payé).
    `clip.js` reste sur le disque mais n'est plus importé, donc plus bundlé. Ne pas le
    rebrancher sans redemander.
  - **Vibrations Android** (`navigator.vibrate`, sans effet sur iOS) : légère au choc, forte
    quand le choc termine la partie.
- **Voitures/camions qui traversent aux carrefours** (`crosstraffic.js`, demandé le 19 août 2026).
  ⚠️ Les croisements ne sont donc PLUS purement décoratifs — invariant tombé sciemment. Vit sur la
  grille de DISTANCE (celle des bâtiments/feux), pas sur la grille musicale d'`entities.js` :
  collisions et résolution séparées, fusionné au rendu par `extras`. **Aucun véhicule avant ~50 s**
  et densité maximale après ~100 s : c'est le levier qui durcit la FIN de course sans toucher à
  l'ouverture (« la densité au tout début c'est très très bien, mais ça fait plus facile la fin
  que le début »). 45 traversées par course, chacune ne bloquant **qu'une seule voie**. ⚠️ Le véhicule est **découpé sur la trouée de la rue** (`BORD_RUE`) : il émerge de derrière les façades comme d'une rue transversale, au lieu d'être peint par-dessus les trottoirs et les immeubles plusieurs secondes à l'avance — retour direct, capture à l'appui (« on les voit de trop loin »). Coût −1 vie,
  **jamais fatal**. ⚠️ Depuis le 21 août 2026, `sousUnPont()` (crosstraffic.js, dépendance à
  sens unique vers entities.js, assumée) SUPPRIME les traversées qui chevaucheraient un pont
  (marge 0,15 s + plancher 6 unités, mesuré : 5 traversées sur 58) — le cas « voiture dans la
  seule trouée du pont » n'existe plus, mais le −1 vie reste la règle par prudence. ⚠️ **Le CAMION a été
  SUPPRIMÉ le 21 août 2026** (« il faut pas qu'il y ait des camions qui traversent, je veux que
  ce soient des voitures, sinon c'est trop ») — d'abord rendu sautable le même jour, puis retiré
  tout court : seules des voitures traversent désormais, toutes franchissables au saut (« il
  faut qu'on ait la possibilité de les esquiver ou de sauter par-dessus »). Ne pas réintroduire
  le camion sans redemander.
- **Boucle du début pendant la seconde chance** (demandé le 22 août 2026) : quand le panneau de
  mort s'ouvre, le morceau **s'arrête** et la boucle des premières secondes tourne à sa place
  (4 mesures, `loopMort*` dans `config.js`), dans un passe-bas qui **s'ouvre au rythme du
  décompte** — « la loop du début se défiltre ». Mode audio `revive` (`audio.js`), qui l'emporte
  sur `silent` : partir ajouter le morceau sur Spotify ne coupe pas la boucle, elle reste au plus
  filtré et au plus bas pendant l'absence. **Au retour dans l'appli, décompte 5-4-3-2-1** qui
  rouvre le filtre et ARME `REPRENDRE` — ⚠️ la reprise reste un **tap explicite**, jamais un
  redémarrage automatique. Effet de bord : la reprise relance le morceau PILE à la seconde de la
  mort, donc ce chemin ne consomme plus le budget `pauseDeriveMax`. Voir `ARCHITECTURE.md` §8.2.
- **Caméo Soberland** (demandé le 17 août 2026, photo fournie en référence) : DJ ami de l'artiste,
  planté dans la voie centrale **au TOUT début de la course** (`cameo.js`, `CAMEO_TIME_S` = 3 s —
  7 s avant le 21 août 2026, avancé sur insistance : « au tout début et rien autour de lui »).
  Visible dès la première frame jusqu'à ~3,6 s ; la période de grâce a été allongée en vis-à-vis
  (`GRACE_BEATS` 4 → 8 puis redescendu à 7 le même jour — « énormément d'étoiles au tout
  début » ; premier obstacle à ≈3,75 s, 0,15 s après la sortie de Soberland : c'est le
  PLANCHER sûr, ne pas descendre sans raccourcir le caméo) et les étoiles de grâce sont forcées sur les
  voies LATÉRALES (`slotLanes`, entities.js) pour que rien ne partage jamais l'écran avec lui.
  Purement décoratif — pas de collision, pas de créneau, pas de score. Silhouette REPRISE de
  `pedestrians.js` (retour direct sur le premier jet : « ressemble à rien ») : casquette, barbe,
  casque, chemise à carreaux habillent le même squelette que les piétons plutôt qu'un design
  inventé. Étiquette **« @soberland »** flottant au-dessus de sa tête (« comme ça on sait qui
  c'est »). Table de mixage en PROP SÉPARÉ, sa propre profondeur (`TABLE_OFFSET_Z`, toujours
  devant lui), pas intégrée à son sprite comme au premier jet. Voxel (`blk()`, `voxel.js`), même
  grammaire que joueur/cyclistes/piétons. ⚠️ Lui ET sa table passent par `getExtras()` +
  `entities-render.render(..., extras)`, jamais un rendu séparé : sinon ils se peignent toujours
  au même endroit de la séquence peintre, indépendamment de leur profondeur réelle — bug vécu
  (apparaissait devant un pont pourtant plus proche).
  ⚠️ **Il réapparaît SUR LA LIGNE D'ARRIVÉE depuis le 22 août 2026** (« je veux Soberland qui
  apparaît à nouveau sur la ligne d'arrivée en train de mixer ») : même personnage, même table,
  même étiquette, mais **sur le trottoir** et non au milieu de la route (la voie centrale est
  celle du portique et du joueur lancé à pleine vitesse — l'y planter le ferait lire comme un
  obstacle) et **plus grand** (2,6 unités-monde contre 2,2) parce qu'à cette vitesse tout objet
  de bord de route n'est visible que ~2 s. `getExtras()` renvoie donc DEUX occurrences.
- **PMC qui fait coucou pendant le menu pause** (`pmc.js`, demandé le 22 août 2026 : « pendant
  l'écran Pause, mets PMC en train de faire coucou doucement »). Décoratif, grammaire voxel,
  planté en bas à gauche sous la carte de pause. ⚠️ Seul sprite du jeu animé sur
  `performance.now()` : l'horloge musicale est GELÉE pendant la pause — il bouge parce que tout
  le reste est arrêté.

- **Tutoriel interactif à la place du décompte** (`tutorial.js`, 19 août 2026 — « on peut
  remplacer les 20 secondes de début avec des exemples de swipe, comme un jeu Mario »). L'idée
  initiale (enregistrer des GIF) a été écartée : poids (centaines de Ko contre 65 Ko de bundle),
  qualité (256 couleurs, le couchant en bandes), obsolescence (l'aspect du jeu bouge sans arrêt).
  À la place, le jeu se montre lui-même : 4 étapes guidées (changer de voie ×2, sauter, passer
  sous un pont AU SOL, le combo), le joueur fait vraiment les gestes — l'overlay du décompte
  était déjà en `pointer-events:none`, donc les swipes atteignaient déjà le canvas. Objets de
  démonstration rendus par le VRAI moteur (`peindreObjet`, export de `paintSlot`), main fantôme
  animée, « Bien ! »/« Raté » en retour immédiat. ⚠️ **La main fantôme MONTRE le geste, elle ne le
  joue jamais** (revu le jour même, retour direct : « je ne fais rien, il bouge tout seul » — la
  première version pilotait le personnage après ~3 s d'inaction et les étapes se validaient
  toutes seules). Une étape n'avance QUE sur un geste du joueur ; les objets (pont, étoiles) se
  placent dans une voie ADJACENTE à la sienne pour qu'aucune étape ne se valide en restant
  immobile, et les ratés font revenir l'objet, replacé, sans limite. Seules sorties sans geste :
  « Passer l'intro » et le plafond de sécurité 30 s. ⚠️ L'étape pont est LA raison d'être du
  tuto : seul obstacle où le réflexe (sauter) est précisément ce qui tue, enseigné nulle part
  avant. ⚠️ **Rejoué sur les TROIS PREMIÈRES parties** (`TUTO_PARTIES`, screens.js — demandé le
  21 août 2026 : « le tuto pour les 3 premiers atterrissages avec possibilité de skip »). Il
  était sauté dès la 2e partie plus tôt le même jour, c'était trop radical : une seule
  exposition ne suffit pas à faire rentrer la règle du pont. Le bouton « Passer l'intro » est
  ce qui protège l'habitué — affiché après 4 s à la 1re partie, **immédiatement** ensuite. Pas
  de nouvelle clé : `partiesJouees` fait foi (donc abandonner avant la fin ne consomme rien, et
  la navigation privée redonne le tutoriel). ⚠️ La route défile pendant le tutoriel : `road.reset()` dans `requestGameStart()` pour
  que la course parte de distance 0 (la rampe des véhicules traversants est calée dessus).

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
