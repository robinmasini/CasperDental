-- ============================================================================
-- OrthoMind — Synchronisation des données du cabinet (ordinateur ↔ mobile)
-- ----------------------------------------------------------------------------
-- À exécuter UNE FOIS dans Supabase › SQL Editor › New query › Run.
-- Script idempotent : il peut être relancé sans risque.
--
-- Principe de sécurité : seuls les praticiens inscrits dans la table
-- « practitioners » peuvent lire ou écrire les données patients. Un compte
-- créé par un inconnu ne voit rien.
-- ============================================================================

-- 1. Appartenance au cabinet ---------------------------------------------------
create or replace function public.is_cabinet_member()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (select 1 from public.practitioners where id = auth.uid());
$$;

revoke all on function public.is_cabinet_member() from public, anon;
grant execute on function public.is_cabinet_member() to authenticated;

alter table public.practitioners enable row level security;
grant select, update on public.practitioners to authenticated;
drop policy if exists "praticiens_lecture" on public.practitioners;
create policy "praticiens_lecture" on public.practitioners
    for select to authenticated using (public.is_cabinet_member());
drop policy if exists "praticiens_mise_a_jour_soi" on public.practitioners;
create policy "praticiens_mise_a_jour_soi" on public.practitioners
    for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 2. Patients ------------------------------------------------------------------
alter table public.patients enable row level security;
grant select, insert, update, delete on public.patients to authenticated;
drop policy if exists "patients_cabinet" on public.patients;
create policy "patients_cabinet" on public.patients
    for all to authenticated
    using (public.is_cabinet_member())
    with check (public.is_cabinet_member());

-- 3. Rendez-vous ---------------------------------------------------------------
alter table public.appointments enable row level security;
grant select, insert, update, delete on public.appointments to authenticated;
drop policy if exists "rdv_cabinet" on public.appointments;
create policy "rdv_cabinet" on public.appointments
    for all to authenticated
    using (public.is_cabinet_member())
    with check (public.is_cabinet_member());

-- 4. Comptes-rendus cliniques (analyses photo, consultations audio, fiches DEP)
create table if not exists public.clinical_records (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    created_by uuid default auth.uid() references auth.users(id) on delete set null,
    patient_id uuid references public.patients(id) on delete cascade,
    patient_name text not null,
    type text not null check (type in ('photos', 'audio', 'dep')),
    images text[] not null default '{}',
    diagnostic_text text not null default '',
    traitement_text text not null default '',
    transcript text,
    dep_data jsonb,
    meta jsonb
);

create index if not exists clinical_records_patient_idx
    on public.clinical_records (patient_id, created_at desc);

alter table public.clinical_records enable row level security;
grant select, insert, update, delete on public.clinical_records to authenticated;
drop policy if exists "comptes_rendus_cabinet" on public.clinical_records;
create policy "comptes_rendus_cabinet" on public.clinical_records
    for all to authenticated
    using (public.is_cabinet_member())
    with check (public.is_cabinet_member());

-- 5. Inscription des praticiens --------------------------------------------------
-- Créez d'abord le compte dans Authentication › Users › Add user
-- (e-mail + mot de passe, « Auto confirm user » coché), puis remplacez
-- l'adresse ci-dessous et exécutez ce bloc (une fois par praticien).
insert into public.practitioners (id, name, email, profession, specialty)
select id, 'Dr Renaud Desouches', email, 'Chirurgien-Dentiste', 'Orthodontiste'
from auth.users
where email = 'REMPLACEZ_PAR_VOTRE_EMAIL@exemple.fr'
on conflict (id) do nothing;
