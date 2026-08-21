-- La ville est belle — migration « pseudo public / insta privé »
-- =============================================================
-- À exécuter UNE FOIS dans Supabase : Dashboard → SQL Editor → New query →
-- coller tout ce fichier → Run. Sans risque : rien n'est supprimé, les scores
-- déjà en base sont conservés et recopiés.
--
-- POURQUOI. Le jeu demande maintenant DEUX identifiants :
--   * un pseudo, public, c'est le seul affiché au classement ;
--   * un compte Instagram, privé, qui sert uniquement à te permettre de
--     contacter le gagnant.
-- Or la clé « anon » du jeu est forcément publique (elle est dans le code
-- envoyé au navigateur) et, jusqu'ici, elle autorisait la lecture de TOUTE la
-- table : masquer l'insta à l'écran n'aurait donc rien protégé, n'importe qui
-- pouvait lire la liste complète des comptes Instagram des joueurs.
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. ajoute la colonne `pseudo` (publique) ;
--   2. recopie dedans les anciennes valeurs, pour que le classement existant
--      ne se vide pas ;
--   3. RETIRE la lecture publique de la table (donc de l'insta) ;
--   4. crée la vue `scores_public` (pseudo + score uniquement), seule chose
--      que le jeu lit désormais.
-- L'écriture des scores continue de fonctionner : elle n'a jamais eu besoin
-- de lire quoi que ce soit. Toi, depuis le Table Editor, tu continues de voir
-- les deux colonnes.

-- 1. Nouvelle colonne publique -----------------------------------------------
alter table public.scores add column if not exists pseudo text;

-- 2. Reprise des lignes existantes (elles n'avaient qu'un seul identifiant) --
update public.scores
   set pseudo = ltrim(pseudo_insta, '@')
 where pseudo is null;

-- 3. Plus de lecture publique sur la table (c'est elle qui portait la fuite) -
drop policy if exists "Lecture publique des scores" on public.scores;

-- L'envoi de score, lui, reste ouvert (aucun anti-triche — décision
-- verrouillée, PLAN-ACTION.md §6). Recréée ici seulement si elle manque.
drop policy if exists "Envoi public d'un score" on public.scores;
create policy "Envoi public d'un score"
  on public.scores for insert
  to anon
  with check (true);

-- 4. Vue publique du classement : pseudo + score, rien d'autre ---------------
-- security_invoker = off (défaut) : la vue lit la table avec les droits de son
-- propriétaire, ce qui lui permet de fonctionner alors que le rôle anon n'a
-- plus le droit de lire la table directement. C'est exactement le but.
create or replace view public.scores_public as
  select coalesce(pseudo, ltrim(pseudo_insta, '@')) as pseudo,
         score
    from public.scores
   order by score desc;

grant select on public.scores_public to anon;

-- Vérification (facultatif) : doit renvoyer uniquement pseudo + score.
-- select * from public.scores_public limit 5;
