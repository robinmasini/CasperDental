-- ============================================================================
-- OrthoMind — Espace Secrétariat
-- ----------------------------------------------------------------------------
-- À exécuter UNE FOIS dans Supabase › SQL Editor › New query › Run,
-- APRÈS avoir créé le compte contact@casperdentalsecretariat.com
-- (Authentication › Users › Add user).
--
-- 1. Ajoute un rôle aux comptes du cabinet : « praticien » ou « secretariat ».
-- 2. Rattache le compte du secrétariat au cabinet (accès aux données en direct).
-- 3. Empêche un compte de modifier lui-même son rôle.
-- ============================================================================

-- 1. Rôle des comptes (les comptes existants restent « praticien »)
alter table public.practitioners
    add column if not exists role text not null default 'praticien';

alter table public.practitioners
    drop constraint if exists practitioners_role_check;
alter table public.practitioners
    add constraint practitioners_role_check check (role in ('praticien', 'secretariat'));

-- 2. Compte du secrétariat rattaché au cabinet
insert into public.practitioners (id, name, email, profession, specialty, role)
select u.id, 'Secrétariat du Dr Desouches', u.email, 'Secrétariat', 'Espace Secrétariat', 'secretariat'
from auth.users u
where lower(u.email) = 'contact@casperdentalsecretariat.com'
on conflict (id) do update
    set role = 'secretariat',
        profession = excluded.profession,
        specialty = excluded.specialty;

-- 3. Chacun peut mettre à jour son profil, mais pas son rôle
revoke update on public.practitioners from authenticated;
grant update (name, rpps, profession, specialty, photo) on public.practitioners to authenticated;

-- Vérification : doit afficher le compte du secrétariat avec le rôle « secretariat »
select id, name, email, role from public.practitioners order by role, name;
