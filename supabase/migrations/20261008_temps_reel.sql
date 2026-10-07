-- Mise à jour en direct entre les postes du cabinet (Supabase Realtime)
-- À exécuter une fois dans Supabase > SQL Editor.
-- Sans ce script, OrthoMind se met quand même à jour toutes les 30 s et au retour sur l'onglet.
do $$
declare
    t text;
begin
    foreach t in array array['patients', 'clinical_records', 'patient_photos', 'appointments'] loop
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end $$;
