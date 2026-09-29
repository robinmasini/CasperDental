-- ============================================================================
-- OrthoMind — Photos des patients et clé IA partagée par le cabinet
-- ----------------------------------------------------------------------------
-- À exécuter UNE FOIS dans Supabase › SQL Editor › New query › Run
-- (après le script 20260929_synchronisation_cabinet.sql).
-- Script idempotent. Il ne supprime aucune donnée : les « drop policy »
-- remplacent seulement les règles d'accès du même nom.
-- ============================================================================

-- 1. Réglages partagés du cabinet (clé Gemini, etc.) ----------------------------
-- Lisibles uniquement par les praticiens connectés du cabinet.
create table if not exists public.cabinet_settings (
    key text primary key,
    value text not null,
    updated_at timestamptz not null default now(),
    updated_by uuid default auth.uid() references auth.users(id) on delete set null
);

alter table public.cabinet_settings enable row level security;
grant select, insert, update, delete on public.cabinet_settings to authenticated;
drop policy if exists "reglages_cabinet" on public.cabinet_settings;
create policy "reglages_cabinet" on public.cabinet_settings
    for all to authenticated
    using (public.is_cabinet_member())
    with check (public.is_cabinet_member());

-- 2. Photos des patients -------------------------------------------------------
create table if not exists public.patient_photos (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    created_by uuid default auth.uid() references auth.users(id) on delete set null,
    patient_id uuid not null references public.patients(id) on delete cascade,
    record_id uuid references public.clinical_records(id) on delete set null,
    storage_path text not null,
    taken_at timestamptz not null default now(),
    label text
);

create index if not exists patient_photos_patient_idx
    on public.patient_photos (patient_id, taken_at desc);

alter table public.patient_photos enable row level security;
grant select, insert, update, delete on public.patient_photos to authenticated;
drop policy if exists "photos_cabinet" on public.patient_photos;
create policy "photos_cabinet" on public.patient_photos
    for all to authenticated
    using (public.is_cabinet_member())
    with check (public.is_cabinet_member());

-- 3. Espace de stockage privé des clichés ------------------------------------------
insert into storage.buckets (id, name, public)
values ('patient-photos', 'patient-photos', false)
on conflict (id) do nothing;

drop policy if exists "photos_stockage_lecture" on storage.objects;
create policy "photos_stockage_lecture" on storage.objects
    for select to authenticated
    using (bucket_id = 'patient-photos' and public.is_cabinet_member());

drop policy if exists "photos_stockage_ajout" on storage.objects;
create policy "photos_stockage_ajout" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'patient-photos' and public.is_cabinet_member());

drop policy if exists "photos_stockage_suppression" on storage.objects;
create policy "photos_stockage_suppression" on storage.objects
    for delete to authenticated
    using (bucket_id = 'patient-photos' and public.is_cabinet_member());
