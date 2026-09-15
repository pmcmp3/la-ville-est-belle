-- ============================================================================
-- À COLLER EN UNE FOIS dans Supabase → SQL Editor → New query → Run.
-- Regroupe les deux migrations en attente au 16 septembre 2026 :
--   1) la troisième partie de supabase-migration-ligues.sql (graine + trace,
--      une course par ligue et le fantôme) — jamais exécutée ;
--   2) supabase-migration-beta.sql (ligue BETA, plafond par ligue, retours).
-- Idempotent : relançable sans erreur.
-- ============================================================================

-- Troisième partie (9 septembre 2026) : une COURSE PAR LIGUE et le FANTÔME.
-- Idempotent. À exécuter dans l'éditeur SQL Supabase AVANT de déployer :
-- sans ces colonnes, le jeu se replie (score envoyé sans graine ni trace,
-- classement par la vue historique), mais le fantôme n'existe pas.
-- ============================================================================
-- `graine` : la route jouée (regles.graineLigue(code) — la même pour tous les
-- membres d'une ligue ; change avec VERSION_COURSE quand le générateur change,
-- ce qui repart sur un classement vierge sans rien supprimer).
-- `trace` : la trajectoire du joueur (fantome.js, ~15 Ko), envoyée SEULEMENT
-- quand la course bat le record de la ligue sur cette route.
alter table public.ligue_scores add column if not exists graine integer;
alter table public.ligue_scores add column if not exists trace text;
create index if not exists ligue_scores_graine_idx on public.ligue_scores (code, graine, metres desc);

-- ---------------------------------------------------------------------------
-- 1) Plafond par ligue : la bêta n'est pas limitée à 6 personnes.
--    Colonne `plafond` sur `ligues` (défaut 6 = le comportement actuel), lue
--    par le trigger d'adhésion.
-- ---------------------------------------------------------------------------
alter table public.ligues add column if not exists plafond integer not null default 6;

create or replace function public.ligue_plafond() returns trigger language plpgsql as $$
declare cap integer;
begin
  select coalesce(plafond, 6) into cap from public.ligues where code = new.code;
  if cap is null then cap := 6; end if;
  if (select count(*) from public.ligue_membres where code = new.code) >= cap then
    raise exception 'ligue complete (% max)', cap;
  end if;
  return new;
end $$;
drop trigger if exists ligue_plafond_trg on public.ligue_membres;
create trigger ligue_plafond_trg before insert on public.ligue_membres
  for each row execute function public.ligue_plafond();

-- ---------------------------------------------------------------------------
-- 2) La ligue de bêta, VIDE (aucun membre, aucun score).
-- ---------------------------------------------------------------------------
insert into public.ligues (code, nom, createur, plafond)
  values ('BETA', 'Bêta-test', 'pmc', 60)
  on conflict (code) do update set nom = excluded.nom, plafond = excluded.plafond;

-- ⚠️ REMISE À ZÉRO de la bêta — À NE DÉCOMMENTER QUE POUR REPARTIR DE ZÉRO :
-- ça efface les inscrits, leurs scores et leurs retours. Ne pas relancer
-- une fois que les testeurs ont commencé.
-- delete from public.ligue_scores where code = 'BETA';
-- delete from public.ligue_membres where code = 'BETA';
-- delete from public.retours_beta where ligue = 'BETA';

-- ---------------------------------------------------------------------------
-- 3) Les RETOURS des testeurs (insert-only, jamais relus par le jeu).
--    Lecture : le tableau de bord Supabase (Table editor → retours_beta).
-- ---------------------------------------------------------------------------
create table if not exists public.retours_beta (
  id bigint generated always as identity primary key,
  ligue text,
  pseudo text,
  texte text not null,
  score integer,
  potes integer,
  fin boolean,
  partie integer,
  appareil text,
  created_at timestamptz not null default now()
);
alter table public.retours_beta enable row level security;
drop policy if exists "Envoi public d'un retour" on public.retours_beta;
create policy "Envoi public d'un retour" on public.retours_beta for insert to anon with check (true);
create index if not exists retours_beta_date_idx on public.retours_beta (created_at desc);
