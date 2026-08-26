# Règlement & mentions légales — ce qui reste à faire

Généré le 26 août 2026, à la création de `public/reglement/` et
`public/mentions-legales/`.

Les pages sont **en ligne et complètes sauf les points ci-dessous**. Chaque
valeur manquante apparaît en surbrillance jaune sur la page publique
(`.todo`) : impossible de la rater, mais impossible aussi de la laisser
passer devant la presse.

---

## 1. Bloquant — à remplir avant le premier mail presse

| Variable | Où | Pourquoi c'est bloquant |
|---|---|---|
| `[ADRESSE_POSTALE]` | Règlement art. 1 · Mentions légales « Éditeur » | **Obligation légale** (LCEN art. 6 III). Une domiciliation ou l'adresse d'une association suffit si tu ne veux pas publier ton domicile. Voir la note plus bas. |
| `[VALEUR_LOT]` | Règlement art. 6.1 | Un jeu-concours doit annoncer la valeur commerciale du lot. Une estimation honnête suffit (ex. 30 €). |
| `[DESCRIPTION_LOT]` | Règlement art. 6.1 | Préciser : pressage, édition, dédicacé ou non. Le texte dit aujourd'hui « un exemplaire vinyle de l'EP », sans détail. |

### Note sur l'adresse postale
Pour un éditeur **non professionnel**, la LCEN (art. 6 III 2°) permet de ne pas
publier son adresse, à condition d'avoir communiqué son identité à
l'hébergeur — il suffit alors de publier les coordonnées de l'hébergeur, ce
que la page fait déjà. Mais tu vends de la musique et le site sert une
campagne commerciale : le statut « non professionnel » n'est pas acquis.
**À trancher avec quelqu'un du métier** — c'est le seul point des deux pages
qui ne se règle pas en remplissant une case.

---

## 2. Non bloquant — à compléter quand tu peux

| Variable | Où | Note |
|---|---|---|
| `[RÉGION SUPABASE]` | Mentions légales « Hébergement » | Tableau de bord Supabase → Settings → General. Si la région est hors UE, il faut le dire dans la politique de confidentialité (transfert hors UE). |
| `[Autres crédits]` | Mentions légales « Crédits » | Direction artistique, pixel art, bêta-testeurs (Pablo, Soberland…). Retirer la mention si tu as tout fait seul. |

---

## 3. Écarts entre le prompt d'origine et la réalité du code

Ces cinq points ont été **corrigés d'office** : le prompt décrivait un jeu
différent de celui qui tourne. Un règlement qui décrit des données qu'on ne
collecte pas est pire qu'un règlement absent.

1. **Aucune adresse e-mail n'est collectée.** Le prompt faisait reposer
   l'article 8 et le contact du gagnant sur l'e-mail. Le jeu demande un
   **pseudo public + un identifiant Instagram** (`index.html`, étape 1/2 ;
   `net.js` envoie `pseudo`, `pseudo_insta`, `score`, `game_version`). Le
   règlement décrit donc l'Instagram, et l'article 7.2 annonce un contact du
   gagnant **par message privé Instagram**.

2. **Les dates du prompt ne sont pas celles du jeu.** Le prompt annonçait
   28/08 → 30/09. `config.js` fait foi et affiche déjà sa date de fin aux
   joueurs sur l'écran de score :
   - `dateOuverture` : **17 août 2026**
   - `dateFermeture` : **11 octobre 2026 à 23h59**
   Les pages reprennent ces dates. **Si tu veux d'autres dates, change
   `config.js` ET le règlement ensemble** — sinon le jeu et le règlement se
   contredisent. Attention : 602 parties ont déjà été jouées entre le 21 et le
   25 août ; dater l'ouverture au 28 août les invaliderait toutes.

3. **L'hébergeur n'est pas Vercel.** Le site est servi par **GitHub Pages**
   (`ARCHITECTURE.md` §9), le domaine est chez **OVH**, la base chez
   **Supabase**. Les trois sont nommés dans les mentions légales.

4. **Le « continue » est bien conditionné** (version B du prompt) : le tiroir
   `#gate-sheet` exige une visite du lien Spotify avant CONTINUER et REJOUER.
   L'article 5.4 le décrit tel quel, en insistant sur ce qui le rend légal :
   c'est **gratuit**, sans achat ni abonnement payant, identique pour tous, et
   aucune vérification n'est faite (une visite du lien suffit, suivre ou
   pré-sauvegarder n'est jamais contrôlé).

5. **Le boost fan influe sur le classement** — article 5.5, ajouté. Le prompt
   affirmait qu'aucune action Spotify n'avait d'effet sur le gain ; c'est faux
   dans le code : `main.js:1018` multiplie les points de bonus par **1,1** dès
   que le joueur a ouvert le lien d'écoute (`screens.estFan()`). Avec un
   vinyle attribué au meilleur score, un avantage de 10 % réservé à ceux qui
   ont cliqué **doit** être écrit noir sur blanc. Il reste défendable parce
   qu'il est gratuit et ouvert à tous ; le taire ne l'aurait pas été. Le boost
   « défi » (art. 5.6) est dans le même cas.

---

## 4. La case newsletter n'a pas été posée

Le prompt demandait une seconde case « Je souhaite recevoir les actualités de
PMC par e-mail ». **Elle n'a pas été ajoutée** : le jeu ne collecte aucune
adresse e-mail, la case n'aurait donc rien envoyé nulle part, et la politique
de confidentialité aurait annoncé un traitement inexistant.

Deux options, à choisir :

- **A — laisser tomber.** Tu as déjà l'Instagram de chaque joueur, qui est un
  canal de contact direct. Rien à faire.
- **B — ajouter un champ e-mail facultatif** à l'étape 1/2, avec la case
  d'opt-in. Ça demande : un champ de plus dans l'onboarding (contre la règle
  « une seule décision par écran » du projet), une colonne `email` en base,
  une migration Supabase, et un paragraphe de plus dans les deux pages. C'est
  faisable, mais c'est de la friction ajoutée dans le tunnel de conversion à
  deux jours de la sortie. **Recommandation : attendre après le 28.**

---

## 5. Deux constats sur le concours lui-même

Sans rapport avec les pages légales, mais ils touchent à l'article 5.7
(fraude) et à l'article 7.1 (meilleur score gagne) :

- **Le classement contient des scores impossibles.** Sur les 602 parties du
  21 au 25 août, 8 dépassent 300 000 points, dont un à **1 829 256**. Le
  90ᵉ centile réel est à 71 000. En l'état, le vinyle revient à un score
  fabriqué côté client. `CLAUDE.md` note déjà que le classement Supabase
  **doit être vidé** avant le lancement public (les anciens barèmes) — c'est
  le même geste, et il n'a pas encore été fait.
- **Un pseudo contient une tentative d'injection HTML**
  (`<img src=x onerror=…`). Le jeu ne risque rien : le classement écrit les
  pseudos avec `textContent` (`screens.js`, `construireLigneClassement`),
  jamais `innerHTML`. Mais tout autre outil qui lira cette table doit faire
  pareil, et l'article 5.3 permet de supprimer ce pseudo.

---

## 6. Vérifié le 26 août 2026

- [x] Les deux pages s'affichent sur mobile (375×812) et respectent la charte.
- [x] Les fontes du jeu se chargent depuis `/reglement/` et
      `/mentions-legales/` (chemins relatifs `../fonts/`, valides aussi sous
      un sous-chemin `/la-ville-est-belle/`).
- [x] « Suivant → » reste **désactivé** tant que la case du règlement n'est
      pas cochée, même avec pseudo et insta remplis.
- [x] La case n'est **jamais** pré-cochée ; la décocher retire le consentement
      mémorisé.
- [x] Un joueur déjà connu (pseudo + insta en mémoire) qui n'a jamais accepté
      le règlement **récupère l'étape 1** au lieu de la sauter — c'est le cas
      des joueurs arrivés avant aujourd'hui.
- [x] Liens « Règlement · Mentions légales » présents en pied de l'écran de
      score, et lien « Détails » sous les champs de l'accueil.
- [x] `npx vite build --base=./ --outDir=dist-pages` embarque les deux pages.

⚠️ **L'URL canonique porte un slash final** : `/reglement/` et
`/mentions-legales/`. GitHub Pages redirige `/reglement` (sans slash) en 301
vers `/reglement/` — à reconfirmer une fois en ligne, c'est le seul
comportement que le serveur local ne reproduit pas.

---

## 7. Déploiement

Rien n'est en ligne pour l'instant : les pages existent en local et dans
`dist-pages/`. La mise en ligne suit la procédure manuelle habituelle
(`ARCHITECTURE.md` §9, snapshot orphelin + force-push sur `gh-pages`), avec le
compte GitHub `pmcmp3`.
