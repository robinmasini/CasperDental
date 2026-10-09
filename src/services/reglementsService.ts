import { supabase } from '../lib/supabase';
import { withLiveNotify } from './liveSync';

// ============================================================================
// Règlements des patients (Espace Secrétariat)
// Catalogue fixe des actes ; un plan = une ou plusieurs échéances à encaisser.
// ============================================================================

export type ActeCode = 'TO90' | 'TO75' | 'TO20';
export type ModePaiement = 'CB' | 'Chèque' | 'Espèces' | 'Virement';
export const MODES_PAIEMENT: ModePaiement[] = ['CB', 'Chèque', 'Espèces', 'Virement'];

export interface ActeCatalogue {
    code: ActeCode;
    libelle: string;
    description: string;
    /** Tarifs proposés pour une échéance (le premier est le tarif par défaut) */
    tarifs: number[];
    remboursementSecu: number;
    /** Nombre d'échéances proposé par défaut et maximum */
    echeancesParDefaut: number;
    maxEcheances: number;
    /** Écart proposé entre deux échéances, en mois */
    intervalleMois: number;
    /** TO90 : chaque échéance est un semestre facturé (tarif et remboursement par semestre).
        Sinon : le tarif et le remboursement sont pour l'acte entier, éventuellement payé en plusieurs fois. */
    parEcheance: boolean;
    unite: string;
}

export const CATALOGUE: ActeCatalogue[] = [
    {
        code: 'TO90',
        libelle: 'Traitement orthodontique',
        description: 'Par semestre, 6 semestres maximum',
        tarifs: [950, 1050],
        remboursementSecu: 193.5,
        echeancesParDefaut: 6,
        maxEcheances: 6,
        intervalleMois: 6,
        parEcheance: true,
        unite: 'semestre',
    },
    {
        code: 'TO75',
        libelle: 'Contention',
        description: '1 année de contention',
        tarifs: [600],
        remboursementSecu: 161.25,
        echeancesParDefaut: 1,
        maxEcheances: 12,
        intervalleMois: 1,
        parEcheance: false,
        unite: 'versement',
    },
    {
        code: 'TO20',
        libelle: 'Acte ponctuel',
        description: 'Règlement immédiat',
        tarifs: [110.02],
        remboursementSecu: 43,
        echeancesParDefaut: 1,
        maxEcheances: 4,
        intervalleMois: 1,
        parEcheance: false,
        unite: 'versement',
    },
];

export const acteDuCatalogue = (code: ActeCode) => CATALOGUE.find(a => a.code === code)!;

export interface Reglement {
    id: string;
    created_at: string;
    plan_id: string;
    patient_id: string;
    acte: ActeCode;
    libelle: string;
    rang: number;
    nombre: number;
    montant: number;
    remboursement_secu: number;
    echeance: string;   // AAAA-MM-JJ
    paye_le: string | null;
    mode_paiement: ModePaiement | null;
    note: string | null;
}

/** Une échéance du plan, telle que saisie (montants et dates librement modifiables) */
export interface LignePlan {
    echeance: string;            // AAAA-MM-JJ
    montant: number;
    remboursement_secu: number;
}

export interface NouveauPlan {
    patientId: string;
    acte: ActeCode;
    lignes: LignePlan[];
    payeImmediatement?: { mode: ModePaiement };
}

const euros = (n: number) => Math.round(n * 100) / 100;

export const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Ajoute des mois à une date AAAA-MM-JJ (le 31 devient le dernier jour du mois si besoin)
export const addMonthsIso = (iso: string, months: number): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const target = new Date(y, m - 1 + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(d, lastDay));
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
};

/**
 * Échéancier proposé à partir du catalogue (point de départ, tout reste modifiable).
 * TO90 : un tarif et un remboursement par semestre. Autres actes : le total est réparti
 * en versements égaux (le dernier absorbe les centimes), remboursement sur le 1er versement.
 */
export const proposerLignes = (acte: ActeCode, nombre: number, debut: string, total: number): LignePlan[] => {
    const a = acteDuCatalogue(acte);
    if (a.parEcheance) {
        return Array.from({ length: nombre }, (_, i) => ({
            echeance: addMonthsIso(debut, i * a.intervalleMois),
            montant: euros(total),
            remboursement_secu: a.remboursementSecu,
        }));
    }
    const part = Math.floor((total / nombre) * 100) / 100;
    return Array.from({ length: nombre }, (_, i) => ({
        echeance: addMonthsIso(debut, i * a.intervalleMois),
        montant: i === nombre - 1 ? euros(total - part * (nombre - 1)) : part,
        remboursement_secu: i === 0 ? a.remboursementSecu : 0,
    }));
};

export const libelleEcheance = (acte: ActeCode, rang: number, nombre: number) => {
    const a = acteDuCatalogue(acte);
    return nombre > 1 ? `${a.libelle} — ${a.unite} ${rang}/${nombre}` : a.libelle;
};

export const listReglements = async (): Promise<Reglement[]> => {
    const { data, error } = await supabase
        .from('reglements')
        .select('*')
        .order('echeance', { ascending: true });
    if (error) {
        if (/relation .*reglements.* does not exist|Could not find the table/i.test(error.message)) {
            throw new Error("La table des règlements n'existe pas encore : exécutez le script 20261009b_reglements.sql dans Supabase.");
        }
        throw new Error(`Lecture des règlements impossible : ${error.message}`);
    }
    return (data || []).map((r: any) => ({ ...r, montant: Number(r.montant), remboursement_secu: Number(r.remboursement_secu) }));
};

const createPlanWrite = async (plan: NouveauPlan): Promise<void> => {
    const planId = crypto.randomUUID();
    const nombre = plan.lignes.length;
    const rows = plan.lignes.map((l, i) => ({
        plan_id: planId,
        patient_id: plan.patientId,
        acte: plan.acte,
        libelle: libelleEcheance(plan.acte, i + 1, nombre),
        rang: i + 1,
        nombre,
        echeance: l.echeance,
        montant: euros(l.montant),
        remboursement_secu: euros(l.remboursement_secu),
        paye_le: plan.payeImmediatement && i === 0 ? todayIso() : null,
        mode_paiement: plan.payeImmediatement && i === 0 ? plan.payeImmediatement.mode : null,
    }));
    const { error } = await supabase.from('reglements').insert(rows);
    if (error) throw new Error(`Enregistrement du règlement impossible : ${error.message}`);
};

const markPaidWrite = async (id: string, mode: ModePaiement, date = todayIso()): Promise<void> => {
    const { error } = await supabase.from('reglements').update({ paye_le: date, mode_paiement: mode }).eq('id', id);
    if (error) throw new Error(`Encaissement impossible : ${error.message}`);
};

const markUnpaidWrite = async (id: string): Promise<void> => {
    const { error } = await supabase.from('reglements').update({ paye_le: null, mode_paiement: null }).eq('id', id);
    if (error) throw new Error(`Annulation de l'encaissement impossible : ${error.message}`);
};

// Échéance modifiée après coup (cabinet libéral : montants et dates ajustables)
const updateEcheanceWrite = async (id: string, changes: Partial<Pick<Reglement, 'montant' | 'remboursement_secu' | 'echeance' | 'note'>>): Promise<void> => {
    const clean = { ...changes };
    if (clean.montant !== undefined) clean.montant = euros(clean.montant);
    if (clean.remboursement_secu !== undefined) clean.remboursement_secu = euros(clean.remboursement_secu);
    const { error } = await supabase.from('reglements').update(clean).eq('id', id);
    if (error) throw new Error(`Modification de l'échéance impossible : ${error.message}`);
};

const deletePlanWrite = async (planId: string): Promise<void> => {
    const { error } = await supabase.from('reglements').delete().eq('plan_id', planId);
    if (error) throw new Error(`Suppression du plan impossible : ${error.message}`);
};

// Écritures : les autres écrans et postes se mettent à jour aussitôt
export const createPlan = withLiveNotify(createPlanWrite, 'reglements');
export const markPaid = withLiveNotify(markPaidWrite, 'reglements');
export const markUnpaid = withLiveNotify(markUnpaidWrite, 'reglements');
export const deletePlan = withLiveNotify(deletePlanWrite, 'reglements');
export const updateEcheance = withLiveNotify(updateEcheanceWrite, 'reglements');

// ---------------------------------------------------------------------------
// Statut de règlement d'un patient (affiché dans le planning)
// ---------------------------------------------------------------------------
export type NiveauReglement = 'retard' | 'a_regler' | 'a_jour' | 'aucun';

export interface StatutReglement {
    niveau: NiveauReglement;
    /** Échéances non payées en retard, ou dues d'ici la date de référence (+ 30 jours) */
    echeances: Reglement[];
    montant: number;
}

/** `reference` : jour du rendez-vous (AAAA-MM-JJ) — une échéance due d'ici là ou dans les 30 jours suivants est « à régler » */
export const statutReglementPatient = (reglements: Reglement[], patientId: string, reference = todayIso()): StatutReglement => {
    const duPatient = reglements.filter(r => r.patient_id === patientId);
    if (duPatient.length === 0) return { niveau: 'aucun', echeances: [], montant: 0 };
    const today = todayIso();
    const impayees = duPatient.filter(r => !r.paye_le);
    const retard = impayees.filter(r => r.echeance < today);
    const sum = (list: Reglement[]) => euros(list.reduce((t, r) => t + r.montant, 0));
    if (retard.length) return { niveau: 'retard', echeances: retard, montant: sum(retard) };
    const limite = addMonthsIso(reference > today ? reference : today, 1);
    const aRegler = impayees.filter(r => r.echeance <= limite);
    if (aRegler.length) return { niveau: 'a_regler', echeances: aRegler, montant: sum(aRegler) };
    return { niveau: 'a_jour', echeances: [], montant: 0 };
};
