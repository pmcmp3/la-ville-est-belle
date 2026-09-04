-- Compteur de clics vers l'album, PAR PLATEFORME (28 août 2026).
--
-- ⚠️ Ce fichier REMPLACE supabase-migration-compteur-clics-ep.sql : il est
-- autonome. La table `clics_ep` n'avait jamais été créée côté Supabase (erreur
-- 42P01 « relation public.clics_ep does not exist » au premier essai du
-- 28 août), donc l'ALTER seul ne pouvait pas marcher. Tout est ici, et tout
-- est ré-exécutable sans risque (if not exists / drop policy if exists).
--
-- À exécuter dans l'éditeur SQL du dashboard Supabase, PUIS passer
-- `compteurPlateformes: true` dans config.js et redéployer.

create table if not exists public.clics_ep (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now()
);

-- La colonne du panneau de plateformes : "spotify", "deezer", "apple-music",
-- "tidal", "youtube-music". Nullable — les clics comptés avant cette migration
-- (et ceux envoyés tant que compteurPlateformes vaut false) n'en portent pas.
alter table public.clics_ep add column if not exists plateforme text;

alter table public.clics_ep enable row level security;

-- La clé anon peut UNIQUEMENT insérer et compter. Aucune donnée personnelle,
-- aucune lecture de ligne individuelle qui aurait du sens.
drop policy if exists "clics_ep_insert_anon" on public.clics_ep;
create policy "clics_ep_insert_anon" on public.clics_ep
  for insert to anon with check (true);

-- SELECT nécessaire au count PostgREST (Prefer: count=planned, net.getClicsEPCount).
drop policy if exists "clics_ep_select_anon" on public.clics_ep;
create policy "clics_ep_select_anon" on public.clics_ep
  for select to anon using (true);

-- Répartition des clics par plateforme :
--   select coalesce(plateforme, '(inconnue)') as plateforme, count(*)
--   from public.clics_ep group by 1 order by 2 desc;
