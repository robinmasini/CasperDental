-- ============================================================================
-- OrthoMind — Espace Secrétariat › Règlements
-- ----------------------------------------------------------------------------
-- À exécuter UNE FOIS dans Supabase › SQL Editor › New query › Run.
-- Script idempotent : il peut être relancé sans risque.
--
-- Une ligne = une échéance à encaisser (ex. TO90 semestre 2/6).
-- Les échéances d'un même traitement partagent le même « plan_id ».
-- Accès réservé aux comptes du cabinet (praticien, secrétariat) : rien en accès anonyme.
-- ============================================================================

create table if not exists public.reglements (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    plan_id uuid not null,
    patient_id uuid not null references public.patients(id) on delete cascade,
    acte text not null check (acte in ('TO90', 'TO75', 'TO20')),
    libelle text not null,
    rang int not null default 1,          -- n° de l'échéance dans le plan (semestre 2 sur 6…)
    nombre int not null default 1,        -- nombre total d'échéances du plan
    montant numeric(10, 2) not null check (montant >= 0),
    remboursement_secu numeric(10, 2) not null default 0 check (remboursement_secu >= 0),
    echeance date not null,
    paye_le date,
    mode_paiement text check (mode_paiement in ('CB', 'Chèque', 'Espèces', 'Virement')),
    note text
);

create index if not exists reglements_patient_idx on public.reglements (patient_id);
create index if not exists reglements_echeance_idx on public.reglements (echeance);
create index if not exists reglements_plan_idx on public.reglements (plan_id);

alter table public.reglements enable row level security;

revoke all on public.reglements from anon;
grant select, insert, update, delete on public.reglements to authenticated;

drop policy if exists "reglements_cabinet" on public.reglements;
create policy "reglements_cabinet" on public.reglements
    for all to authenticated
    using (public.is_cabinet_member())
    with check (public.is_cabinet_member());

-- Mise à jour en direct entre les postes
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reglements'
    ) then
        alter publication supabase_realtime add table public.reglements;
    end if;
end $$;
