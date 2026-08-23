-- Compteur de clics sur "AJOUTER LE MORCEAU" (23 août 2026) — mesurer le
-- taux jeu → smartlink sans dépendre du tableau de bord li.sten.to. Même
-- patron exact que supabase-migration-compteur-courses.sql : table
-- insert-only, une ligne vide par clic (net.postClicEP), aucune donnée
-- personnelle, aucune lecture de lignes individuelles.
--
-- À exécuter UNE FOIS dans l'éditeur SQL du dashboard Supabase.

create table if not exists public.clics_ep (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now()
);

alter table public.clics_ep enable row level security;

-- La clé anon peut UNIQUEMENT insérer (une ligne vide) et compter.
create policy "clics_ep_insert_anon" on public.clics_ep
  for insert to anon with check (true);

-- Le SELECT est nécessaire pour le count PostgREST (Prefer: count=planned,
-- voir net.getClicsEPCount — même choix planned/exact que getRunsCount, pour
-- la même raison : éviter un comptage exact relancé par chaque joueur).
create policy "clics_ep_select_anon" on public.clics_ep
  for select to anon using (true);
