-- « J'ai un pote » — LIGUES entre potes (7 septembre 2026).
-- Idempotent : peut être relancé sans erreur (drop policy if exists avant
-- chaque create policy — la première exécution s'était arrêtée à mi-chemin).
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
drop policy if exists "Lecture publique des ligues" on public.ligues;
create policy "Lecture publique des ligues" on public.ligues for select to anon using (true);
drop policy if exists "Creation publique d'une ligue" on public.ligues;
create policy "Creation publique d'une ligue" on public.ligues for insert to anon with check (true);

create table if not exists public.ligue_membres (
  id bigint generated always as identity primary key,
  code text not null references public.ligues(code),
  pseudo text not null,
  created_at timestamptz not null default now(),
  unique (code, pseudo)
);
alter table public.ligue_membres enable row level security;
drop policy if exists "Lecture publique des membres" on public.ligue_membres;
create policy "Lecture publique des membres" on public.ligue_membres for select to anon using (true);
drop policy if exists "Adhesion publique" on public.ligue_membres;
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
drop policy if exists "Lecture publique des scores de ligue" on public.ligue_scores;
create policy "Lecture publique des scores de ligue" on public.ligue_scores for select to anon using (true);
drop policy if exists "Envoi public d'un score de ligue" on public.ligue_scores;
create policy "Envoi public d'un score de ligue" on public.ligue_scores for insert to anon with check (true);
create index if not exists ligue_scores_code_idx on public.ligue_scores (code, metres desc);

-- Classement : la meilleure course de chaque membre.
create or replace view public.ligue_classement as
  select code, pseudo, max(metres) as metres, max(potes) as potes, count(*) as parties
  from public.ligue_scores
  group by code, pseudo;
grant select on public.ligue_classement to anon;


-- ============================================================================
-- Deuxième partie (7 septembre 2026, soir) : skins, sprint, relais, funnel,
-- préinscriptions concert, ligue de démo. Idempotent.
-- ============================================================================
alter table public.ligue_membres add column if not exists skin text;
alter table public.ligue_scores add column if not exists mode text not null default 'course';

-- La ligue de démo : Paul et ses quatre potes. Jamais ouverte au public.
insert into public.ligues (code, nom, createur) values ('PMCMP', 'Ligue de démo', 'paul') on conflict (code) do nothing;
insert into public.ligue_membres (code, pseudo, skin) values
  ('PMCMP', 'paul',   '{"motif":"raye","c1":"#2f7a46","c2":"#f2ede2","short":"#3a3e4e","chapeau":"casquette","chaussures":"#565a66","velo":"vtt"}'),
  ('PMCMP', 'lea',    '{"motif":"uni","c1":"#ffcf2e","c2":"#f2ede2","short":"#3f63b4","chapeau":"paille","chaussures":"#f2ede2","velo":"grandbi"}'),
  ('PMCMP', 'marius', '{"motif":"uni","c1":"#f2ede2","c2":"#f2ede2","short":"#b8402c","chapeau":"aucun","chaussures":"#f2ede2","velo":"vtt"}'),
  ('PMCMP', 'ines',   '{"motif":"uni","c1":"#2f7a46","c2":"#f2ede2","short":"#3a3e4e","chapeau":"bob","chaussures":"#e0742e","velo":"vtt"}'),
  ('PMCMP', 'hugo',   '{"motif":"carreaux","c1":"#e13e26","c2":"#0d0d10","short":"#c8963a","chapeau":"casquette","chaussures":"#33353d","velo":"grandbi"}')
on conflict (code, pseudo) do nothing;

-- Le classement de ligue ne compte que les courses (pas le sprint).
create or replace view public.ligue_classement as
  select code, pseudo, max(metres) as metres, max(potes) as potes, count(*) as parties
  from public.ligue_scores where mode = 'course'
  group by code, pseudo;
grant select on public.ligue_classement to anon;

-- Relais : mètres cumulés d'une ligue depuis le lundi de la semaine en cours.
create or replace view public.ligue_relais as
  select code, sum(metres) as metres, count(*) as parties
  from public.ligue_scores
  where mode = 'course' and created_at >= date_trunc('week', now())
  group by code;
grant select on public.ligue_relais to anon;

-- Événements du funnel (insert-only) : arrivee, inscription, premiere_course,
-- course_finie, invitation_envoyee, invitation_acceptee, clic_album, preinscription.
create table if not exists public.evenements (
  id bigint generated always as identity primary key,
  type text not null,
  pseudo text,
  source text,
  ligue text,
  created_at timestamptz not null default now()
);
alter table public.evenements enable row level security;
drop policy if exists "Envoi public d'un evenement" on public.evenements;
create policy "Envoi public d'un evenement" on public.evenements for insert to anon with check (true);
create index if not exists evenements_type_idx on public.evenements (type, created_at);

-- Préinscriptions au concert (insert-only, comptées en count=planned).
create table if not exists public.preinscriptions_concert (
  id bigint generated always as identity primary key,
  pseudo text not null,
  insta text,
  ville text,
  ligue text,
  source text,
  created_at timestamptz not null default now()
);
alter table public.preinscriptions_concert enable row level security;
drop policy if exists "Preinscription publique" on public.preinscriptions_concert;
create policy "Preinscription publique" on public.preinscriptions_concert for insert to anon with check (true);
drop policy if exists "Comptage public des preinscriptions" on public.preinscriptions_concert;
create policy "Comptage public des preinscriptions" on public.preinscriptions_concert for select to anon using (true);
