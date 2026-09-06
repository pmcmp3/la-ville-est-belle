-- « J'ai un pote » — LIGUES entre potes (7 septembre 2026).
-- À exécuter une fois dans l'éditeur SQL du projet Supabase existant (le même
-- que « La ville est belle »). Même philosophie que supabase-schema.sql :
-- aucun anti-triche, RLS permissive (lecture + insertion publiques, jamais de
-- update/delete côté client).
--
-- Une ligue = un code à 5 lettres. Ses membres deviennent les POTES du
-- peloton de chacun (leurs pseudos), et chaque course envoie un score dans la
-- ligue. Le classement (meilleure course par pseudo) est une vue.

create table if not exists public.ligues (
  code text primary key,
  nom text,
  createur text,
  created_at timestamptz not null default now()
);
alter table public.ligues enable row level security;
create policy "Lecture publique des ligues" on public.ligues for select to anon using (true);
create policy "Creation publique d'une ligue" on public.ligues for insert to anon with check (true);

create table if not exists public.ligue_membres (
  id bigint generated always as identity primary key,
  code text not null references public.ligues(code),
  pseudo text not null,
  created_at timestamptz not null default now(),
  unique (code, pseudo)
);
alter table public.ligue_membres enable row level security;
create policy "Lecture publique des membres" on public.ligue_membres for select to anon using (true);
create policy "Adhesion publique" on public.ligue_membres for insert to anon with check (true);
create index if not exists ligue_membres_code_idx on public.ligue_membres (code, created_at);

-- Plafond : 6 personnes par ligue (7 septembre 2026), vérifié côté serveur.
create or replace function public.ligue_plafond() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.ligue_membres where code = new.code) >= 6 then
    raise exception 'ligue complete (6 max)';
  end if;
  return new;
end $$;
drop trigger if exists ligue_plafond_trg on public.ligue_membres;
create trigger ligue_plafond_trg before insert on public.ligue_membres
  for each row execute function public.ligue_plafond();

create table if not exists public.ligue_scores (
  id bigint generated always as identity primary key,
  code text not null references public.ligues(code),
  pseudo text not null,
  metres integer not null,
  potes integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ligue_scores enable row level security;
create policy "Lecture publique des scores de ligue" on public.ligue_scores for select to anon using (true);
create policy "Envoi public d'un score de ligue" on public.ligue_scores for insert to anon with check (true);
create index if not exists ligue_scores_code_idx on public.ligue_scores (code, metres desc);

-- Classement : la meilleure course de chaque membre.
create or replace view public.ligue_classement as
  select code, pseudo, max(metres) as metres, max(potes) as potes, count(*) as parties
  from public.ligue_scores
  group by code, pseudo;
grant select on public.ligue_classement to anon;
