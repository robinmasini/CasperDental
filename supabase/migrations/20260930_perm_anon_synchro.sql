-- ============================================================================
-- OrthoMind — Synchronisation multi-appareils (Desktop ↔ Mobile)
-- ----------------------------------------------------------------------------
-- À exécuter UNE FOIS dans Supabase › SQL Editor › New query › Run.
--
-- Ce script autorise le rôle anonyme (clé VITE_SUPABASE_ANON_KEY) et le rôle
-- authentifié à lire et écrire les dossiers patients, comptes-rendus cliniques
-- et liens OnyxCeph sur tous les appareils (Desktop, Mobile, Tablette).
-- ============================================================================

-- 1. Permissions SQL de base pour anon et authenticated
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.patients to anon, authenticated;
grant select, insert, update, delete on public.clinical_records to anon, authenticated;
grant select, insert, update, delete on public.appointments to anon, authenticated;
grant select, insert, update, delete on public.patient_photos to anon, authenticated;

-- 2. Politiques de sécurité RLS permissives pour la synchronisation
drop policy if exists "patients_synchro_all" on public.patients;
drop policy if exists "patients_cabinet" on public.patients;
create policy "patients_synchro_all" on public.patients
    for all to public
    using (true)
    with check (true);

drop policy if exists "comptes_rendus_synchro_all" on public.clinical_records;
drop policy if exists "comptes_rendus_cabinet" on public.clinical_records;
create policy "comptes_rendus_synchro_all" on public.clinical_records
    for all to public
    using (true)
    with check (true);

drop policy if exists "appointments_synchro_all" on public.appointments;
drop policy if exists "rdv_cabinet" on public.appointments;
create policy "appointments_synchro_all" on public.appointments
    for all to public
    using (true)
    with check (true);

drop policy if exists "patient_photos_synchro_all" on public.patient_photos;
drop policy if exists "photos_cabinet" on public.patient_photos;
create policy "patient_photos_synchro_all" on public.patient_photos
    for all to public
    using (true)
    with check (true);
