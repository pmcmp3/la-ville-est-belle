-- La ville est belle — migration « tracking complet » (30 août 2026)
-- ===========================================================================
-- À exécuter UNE FOIS dans Supabase : Dashboard → SQL Editor → New query →
-- coller tout ce fichier → Run. Ré-exécutable sans risque (if not exists /
-- drop policy if exists partout). Rien n'est supprimé, rien n'est réécrit.
--
-- PUIS, et seulement après : passer `trackingDetaille: true` dans config.js
-- et redéployer. ⚠️ Ne pas inverser l'ordre — PostgREST REJETTE un insert qui
-- porte une colonne inconnue, donc envoyer les nouveaux champs avant que les
-- colonnes existent ferait tomber en silence les compteurs qui marchent
-- aujourd'hui (courses, clics_ep). C'est exactement le piège déjà vécu le
-- 28 août avec `plateforme`, d'où le même interrupteur.
--
-- CE QUE ÇA AJOUTE
--   1. `courses`      : durée réelle de la partie, score, identifiant anonyme
--                       de joueur, cause de fin.
--   2. `clics_ep`     : identifiant anonyme, pour DÉDUPLIQUER les clics.
--   3. `clics_suivre` : compteur du palier 2 (« s'abonner à PMC »), qui
--                       n'existait pas — on ne savait pas du tout combien de
--                       gens franchissaient le dernier péage.
--   4. `tutoriel`     : un événement par étape franchie + un à l'abandon,
--                       pour savoir où les gens décrochent.
--
-- ⚠️ VIE PRIVÉE — RÈGLE À NE PAS CASSER. Aucune de ces tables ne contient de
-- compte Instagram. `joueur` est un identifiant ALÉATOIRE tiré une fois par
-- navigateur et rangé en localStorage : il permet de compter des personnes
-- sans savoir qui elles sont, et il est remis à zéro si le joueur efface ses
-- données. Ces tables sont lisibles par la clé anon (nécessaire au count
-- PostgREST), donc y écrire un `pseudo_insta` rouvrirait exactement la fuite
-- que supabase-migration-pseudo-insta.sql a fermée. Ne jamais le faire.

-- 1. courses : de quoi mesurer une partie, plus seulement la compter --------
alter table public.courses add column if not exists duree_s   numeric;
alter table public.courses add column if not exists score     integer;
alter table public.courses add column if not exists joueur    text;
alter table public.courses add column if not exists fin       text;  -- 'mort' | 'rejoue'
alter table public.courses add column if not exists etoiles   integer;
alter table public.courses add column if not exists combo_max numeric;

create index if not exists courses_cree_le_idx on public.courses (cree_le);
create index if not exists courses_joueur_idx  on public.courses (joueur);

-- 2. clics_ep : déduplication ----------------------------------------------
alter table public.clics_ep add column if not exists joueur text;
create index if not exists clics_ep_joueur_idx on public.clics_ep (joueur);

-- 3. clics_suivre : le palier 2, jamais mesuré jusqu'ici --------------------
create table if not exists public.clics_suivre (
  id      bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  joueur  text
);

alter table public.clics_suivre enable row level security;

drop policy if exists "clics_suivre_insert_anon" on public.clics_suivre;
create policy "clics_suivre_insert_anon" on public.clics_suivre
  for insert to anon with check (true);

drop policy if exists "clics_suivre_select_anon" on public.clics_suivre;
create policy "clics_suivre_select_anon" on public.clics_suivre
  for select to anon using (true);

-- 4. tutoriel : où les gens décrochent -------------------------------------
-- Une ligne par ÉTAPE franchie (etape = index 0..3, termine = false) et une
-- ligne finale quand les 4 étapes sont passées (termine = true). Une étape
-- sans ligne suivante = un abandon à cette étape : c'est ce qui donne
-- l'entonnoir. `partie` vaut 1, 2 ou 3 (le tuto rejoue sur les 3 premières).
create table if not exists public.tutoriel (
  id      bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  joueur  text,
  partie  integer,
  etape   integer,
  cle     text,      -- 'voie' | 'saut' | 'pont' | 'combo' | 'passe'
  termine boolean not null default false
);

alter table public.tutoriel enable row level security;

drop policy if exists "tutoriel_insert_anon" on public.tutoriel;
create policy "tutoriel_insert_anon" on public.tutoriel
  for insert to anon with check (true);

drop policy if exists "tutoriel_select_anon" on public.tutoriel;
create policy "tutoriel_select_anon" on public.tutoriel
  for select to anon using (true);

create index if not exists tutoriel_joueur_idx on public.tutoriel (joueur);

-- --------------------------------------------------------------------------
-- Requêtes utiles (à coller dans le SQL Editor quand tu veux) :
--
--   -- Personnes DISTINCTES ayant cliqué vers l'album :
--   select count(distinct joueur) from public.clics_ep where joueur is not null;
--
--   -- Entonnoir du tutoriel :
--   select etape, cle, count(distinct joueur) as joueurs
--     from public.tutoriel group by 1,2 order by 1;
--
--   -- Durée de partie :
--   select round(avg(duree_s)) moyenne, round(percentile_cont(0.5)
--          within group (order by duree_s)::numeric) mediane,
--          round(max(duree_s)) maxi
--     from public.courses where duree_s is not null;
--
--   -- Palier 2 :
--   select count(*) clics, count(distinct joueur) personnes from public.clics_suivre;
