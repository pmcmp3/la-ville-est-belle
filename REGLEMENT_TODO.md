# Règlement & mentions légales — état

Créé le 26 août 2026 (`public/reglement/`, `public/mentions-legales/`).

**Les deux pages sont complètes.** Plus aucune variable en attente : plus aucune
case jaune sur les pages publiques.

---

## Ce que j'ai rempli d'office (à corriger si ça ne te va pas)

| Valeur | Retenu | Pourquoi |
|---|---|---|
| Adresse de l'organisateur | 26 chemin de l'Église, 38260 La Frette, France | Fournie le 26/08. |
| Valeur du lot | **25 €** | Prix courant d'un vinyle autoproduit. Une valeur « indicative » n'engage pas à l'euro près, mais elle doit être de bonne foi — si ton pressage vaut nettement plus ou moins, change-la (art. 6.1). |
| Description du lot | « un exemplaire vinyle de l'EP *La ville est belle* de PMC » | Volontairement **minimal**. Je n'ai pas écrit « dédicacé » ni annoncé un tirage : le lot décrit dans un règlement est un engagement, et promettre une dédicace que tu ne comptes pas faire se retourne contre toi. Ajoute-le si tu le veux vraiment. |

---

## Accès aux pages — décision du 26/08

Pas de case à cocher. Un seul lien, **discret**, en pied de l'accueil du jeu
(10 px, opacité 0,38, sous les pastilles d'étape) : « Règlement · Mentions
légales ». Les pages existent d'abord pour être **fournies sur demande**
(presse, plateformes, Meta/Spotify si la campagne est signalée).

**C'est tenable juridiquement** : l'usage courant des jeux-concours français
est que la participation vaut acceptation, à condition que le règlement soit
accessible librement. L'article 9.2 le pose, et l'article 5.1 a été reformulé
pour dire exactement ça — il annonçait une acceptation explicite qui n'existe
plus. Ce qui n'aurait pas été tenable, c'est un règlement introuvable, ou un
règlement qui décrit une case que le jeu n'a pas.

---

## Écarts entre le brief d'origine et le code réel

Corrigés d'office : le brief décrivait un autre jeu.

1. **Aucun e-mail n'est collecté.** L'identité est **pseudo + Instagram**
   (`net.js` envoie `pseudo`, `pseudo_insta`, `score`, `game_version`). Le
   gagnant est contacté par message privé Instagram (art. 7.2).
2. **Les dates viennent de `config.js`**, pas du brief : ouverture
   **17 août 2026**, fermeture **11 octobre 2026 à 23h59**. Le jeu affiche
   déjà cette date de fin sur l'écran de score. Si tu la changes, change les
   deux ensemble. 602 parties ont été jouées entre le 21 et le 25 août :
   dater l'ouverture au 28 les invaliderait.
3. **Hébergeur = GitHub Pages**, pas Vercel. Domaine chez OVH, base chez
   Supabase. Les trois sont nommés dans les mentions légales.
4. **Le « continue » conditionné est décrit tel quel** (art. 5.4), en
   appuyant sur ce qui le rend légal : gratuit, sans achat ni abonnement
   payant, identique pour tous, aucune vérification (une visite du lien
   suffit).
5. **Le boost fan est déclaré** (art. 5.5). `main.js:1018` multiplie les
   points de bonus par 1,1 dès que le joueur a ouvert le lien d'écoute. Avec
   un vinyle attribué au meilleur score, un avantage de 10 % réservé à ceux
   qui ont cliqué devait être écrit. Il reste défendable — gratuit, ouvert à
   tous — mais le taire ne l'était pas. Le boost « défi » est à l'art. 5.6.

---

## Reste ouvert

- **Région Supabase.** La mention a été retirée plutôt que devinée (le
  `cf-ray` ne donne que l'edge Cloudflare le plus proche, pas la région du
  projet). Si le projet est hébergé **hors UE**, il faut l'écrire dans la
  politique de confidentialité (transfert hors UE). À vérifier :
  tableau de bord Supabase → Settings → General.
- **Crédits.** La ligne dit « Conception, code, musiques et visuels : PMC ».
  Ajoute les autres si quelqu'un a contribué.
- **Newsletter.** Pas de case : le jeu ne collecte pas d'e-mail, elle
  n'aurait rien envoyé nulle part. Si tu veux une liste, il faut un champ
  e-mail facultatif + une colonne en base — à voir après la sortie.

---

## Le classement, avant de remettre le vinyle

Sans rapport avec les pages légales, mais ça touche l'art. 5.7 (fraude) et
l'art. 7.1 (meilleur score gagne) :

- **8 scores sur 602 dépassent 300 000 points**, dont un à **1 829 256**,
  alors que le 90ᵉ centile réel est à 71 000. En l'état le vinyle revient à un
  score fabriqué côté client. `CLAUDE.md` note déjà que la table doit être
  vidée avant le lancement public (anciens barèmes) — ça n'a pas été fait.
- **Un pseudo contient une tentative d'injection HTML**
  (`<img src=x onerror=…`). Le jeu ne risque rien : `construireLigneClassement`
  écrit les pseudos en `textContent`, jamais en `innerHTML`. Tout autre outil
  qui lira cette table doit faire pareil. L'art. 5.3 permet de le supprimer.

---

## Vérifié le 26 août 2026

- [x] Les deux pages s'affichent en mobile (375×812), à la charte du jeu.
- [x] Les fontes se chargent depuis `/reglement/` et `/mentions-legales/`
      (chemins relatifs `../fonts/`, valides aussi sous un sous-chemin).
- [x] Plus aucune case jaune (`.todo`) dans le build.
- [x] La case à cocher est bien retirée du DOM et de `screens.js` ; le bouton
      « Suivant » redevient actif avec les deux seuls champs, comme avant.
- [x] Le lien du menu est cliquable (`elementFromPoint` le renvoie), 10 px,
      opacité 0,38.
- [x] `npx vite build --base=./ --outDir=dist-pages` embarque les deux pages.

⚠️ **L'URL canonique porte un slash final** : `/reglement/`,
`/mentions-legales/`. GitHub Pages redirige `/reglement` en 301 vers
`/reglement/` — seul comportement que le serveur local ne reproduit pas, à
reconfirmer une fois en ligne.
