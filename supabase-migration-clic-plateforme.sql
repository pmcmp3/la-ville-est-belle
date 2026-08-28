-- Comptage des clics PAR PLATEFORME (28 août 2026).
-- Le panneau de conversion du jeu affiche Spotify / Deezer / Apple Music /
-- TIDAL / YouTube Music ; cette colonne dit sur laquelle on a tapé.
--
-- À exécuter dans l'éditeur SQL de Supabase, PUIS passer
-- `compteurPlateformes: true` dans config.js et redéployer. Dans cet ordre :
-- envoyer la colonne avant qu'elle existe ferait échouer l'insert et on
-- perdrait aussi le compteur global de clics.
alter table public.clics_ep add column if not exists plateforme text;

-- Répartition des clics par plateforme :
--   select plateforme, count(*) from public.clics_ep group by 1 order by 2 desc;
