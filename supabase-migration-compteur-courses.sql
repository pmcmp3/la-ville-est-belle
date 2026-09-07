-- Compteur de courses (20 août 2026) — preuve sociale sur l'écran de fin
-- (« 2 431 courses effectuées »). Table insert-only : le jeu ajoute une ligne
-- vide par course terminée (net.postRun) et lit le total via un count PostgREST
-- (net.getRunsCount). Aucune donnée personnelle, aucune lecture de lignes.
--
-- À exécuter UNE FOIS dans l'éditeur SQL du dashboard Supabase.

create table if not exists public.courses (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now()
);

alter table public.courses enable row level security;

-- La clé anon peut UNIQUEMENT insérer (une ligne vide) et compter.
create policy "courses_insert_anon" on public.courses
  for insert to anon with check (true);

-- Le SELECT est nécessaire pour le count PostgREST (Prefer: count=exact).
-- Les lignes ne contiennent qu'un id et une date : rien à protéger.
create policy "courses_select_anon" on public.courses
  for select to anon using (true);
