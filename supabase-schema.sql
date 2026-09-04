-- La ville est belle — schéma Supabase (étape 7 du plan d'action)
-- À exécuter une fois dans l'éditeur SQL du projet Supabase (Dashboard →
-- SQL Editor → New query), avant de renseigner CONFIG.apiScores /
-- CONFIG.apiScoresKey dans config.js.
--
-- Aucun anti-triche (décision verrouillée, PLAN-ACTION.md §6) : la table
-- accepte tous les scores envoyés par le client, la vérification du
-- concours se fait au screenshot fourni par le joueur. RLS activé mais
-- permissif — lecture et écriture publiques, pas de update/delete côté
-- client (aucune policy pour ces actions = refusées par défaut).

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  pseudo_insta text not null,
  score integer not null,
  game_version text,
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;

create policy "Lecture publique des scores"
  on public.scores for select
  to anon
  using (true);

create policy "Envoi public d'un score"
  on public.scores for insert
  to anon
  with check (true);

-- Classement (tri par score décroissant) : utilisé par net.js (getTopScores).
create index if not exists scores_score_idx on public.scores (score desc);
