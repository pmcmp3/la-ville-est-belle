-- La ville est belle — migration « un score par personne, le meilleur gagne »
-- ===========================================================================
-- À exécuter UNE FOIS dans Supabase : Dashboard → SQL Editor → New query →
-- coller tout ce fichier → Run.
--
-- POURQUOI. `net.js` (postScore()) envoie un simple INSERT à chaque fin de
-- partie : rejouer plusieurs fois crée donc plusieurs lignes pour la même
-- personne. Constaté en vrai : "guigzman" apparaissait plusieurs fois dans le
-- classement au lieu d'une seule fois avec son meilleur score — pas beau, et
-- ça fausse le Top N (une bonne partie moyenne d'un joueur peut en chasser
-- une meilleure d'un AUTRE joueur du classement affiché).
--
-- L'identité d'une personne, c'est son compte Instagram (`pseudo_insta`),
-- normalisé en minuscules et sans "@" en tête — le `pseudo` public, lui, peut
-- changer d'une partie à l'autre ou être choisi à l'identique par deux
-- joueurs différents (voir CLAUDE.md : "Identité = pseudo public + Insta
-- privé, les deux obligatoires"). La normalisation reprend exactement celle
-- déjà utilisée par `supabase-migration-pseudo-insta.sql` (`ltrim(..., '@')`)
-- et par `main.js` côté client (`cleanInsta()`, `replace(/^@+/, "")`).
--
-- CE QUE FAIT CETTE MIGRATION (rien n'est perdu : on garde toujours le
-- MEILLEUR score de chaque personne, jamais le plus récent) :
--   1. déduplique les lignes déjà en base : pour chaque identité normalisée,
--      ne garde que la ligne au score le plus haut (à égalité, la plus
--      ancienne), supprime les autres ;
--   2. pose un index UNIQUE sur cette identité normalisée, qui rend toute
--      nouvelle duplication impossible au niveau base ;
--   3. ajoute un trigger BEFORE INSERT qui intercepte chaque nouvel envoi :
--        - personne inconnue          → insertion normale (1re partie) ;
--        - score strictement meilleur → met à jour la ligne existante ;
--        - score égal ou moins bon    → ignoré silencieusement, rien ne change.
--      `net.js` n'a besoin d'AUCUNE modification : il continue de faire un
--      simple INSERT, c'est Postgres qui fait le tri. `Prefer: return=minimal`
--      (déjà utilisé par postScore()) rend ce filtrage invisible côté client :
--      la requête répond 201 que la ligne ait été insérée, mise à jour, ou
--      ignorée — postScore() continue de résoudre à `true` dans les trois cas.

-- 1. Dédoublonnage des lignes existantes -------------------------------------
with classement as (
  select id,
         row_number() over (
           partition by lower(ltrim(trim(pseudo_insta), '@'))
           order by score desc, created_at asc
         ) as rang
    from public.scores
)
delete from public.scores
 where id in (select id from classement where rang > 1);

-- 2. Invariant en base : une seule ligne par identité normalisée ------------
create unique index if not exists scores_identite_unique_idx
  on public.scores (lower(ltrim(trim(pseudo_insta), '@')));

-- 3. Trigger : ne conserver que le meilleur score par personne --------------
-- security definer : le trigger doit pouvoir lire toute la table (dont
-- pseudo_insta) pour comparer, même si le rôle anon qui déclenche l'INSERT
-- n'a plus le droit de SELECT direct sur `scores` (retiré par
-- supabase-migration-pseudo-insta.sql à cause de la fuite d'Insta). Comme la
-- vue `scores_public` déjà en place, la fonction tourne avec les droits de
-- son PROPRIÉTAIRE (postgres), pas ceux de l'appelant — sans risque : elle ne
-- fait jamais qu'écrire un score, exactement ce que la policy publique
-- autorise déjà, jamais de lecture exposée au client.
create or replace function public.scores_garder_meilleur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cle text := lower(ltrim(trim(new.pseudo_insta), '@'));
  existant record;
begin
  select id, score into existant
    from public.scores
   where lower(ltrim(trim(pseudo_insta), '@')) = cle
   limit 1;

  if not found then
    return new; -- première partie de cette personne : insertion normale
  end if;

  if new.score > existant.score then
    update public.scores
       set score = new.score,
           pseudo = coalesce(new.pseudo, pseudo),
           pseudo_insta = new.pseudo_insta,
           game_version = coalesce(new.game_version, game_version),
           created_at = now()
     where id = existant.id;
  end if;

  return null; -- jamais d'INSERT direct : remplacé par l'UPDATE ci-dessus,
               -- ou ignoré si le nouveau score n'est pas meilleur
end;
$$;

drop trigger if exists scores_garder_meilleur_trigger on public.scores;
create trigger scores_garder_meilleur_trigger
  before insert on public.scores
  for each row execute function public.scores_garder_meilleur();

-- Vérification (facultatif) : ne doit renvoyer aucune ligne (0 doublon).
-- select lower(ltrim(trim(pseudo_insta), '@')) as identite, count(*)
--   from public.scores
--  group by 1
-- having count(*) > 1;
