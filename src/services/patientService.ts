import { supabase } from './supabaseClient';
import { isCloudMode } from './recordsService';

export interface Patient {
    id?: string;
    created_at?: string;
    // Informations patient
    civilite: string;
    nom: string;
    prenom: string;
    deuxieme_prenom?: string;
    sexe: string;
    date_naissance: string;
    type_patient: string; // 'Enfant' | 'Adulte'
    praticien: string;
    telephone?: string;
    portable?: string;
    email?: string;
    suivi_exclusif: boolean;
    // Responsable civil
    responsable_civilite?: string;
    responsable_nom?: string;
    responsable_prenom?: string;
    responsable_num_secu?: string;
    responsable_date_naissance?: string;
    responsable_adresse?: string;
    responsable_adresse2?: string;
    responsable_cp?: string;
    responsable_commune?: string;
    responsable_pays?: string;
    responsable_portable1?: string;
    responsable_portable2?: string;
    responsable_telephone1?: string;
    responsable_telephone2?: string;
    responsable_email?: string;
    responsable_remarque?: string;
    // Correspondants
    envoye_par?: string;
    dentiste?: string;
    // Famille
    famille_membre1_prenom?: string;
    famille_membre1_sexe?: string;
    famille_membre1_date_naissance?: string;
    famille_membre2_prenom?: string;
    famille_membre2_sexe?: string;
    famille_membre2_date_naissance?: string;
    famille_membre3_prenom?: string;
    famille_membre3_sexe?: string;
    famille_membre3_date_naissance?: string;
}

const LOCAL_STORAGE_KEY = 'casper_local_patients';

// Default initial patients so cabinet is never empty
const SEED_PATIENTS: Patient[] = [
    {
        id: 'patient-seed-1',
        created_at: new Date('2026-09-01').toISOString(),
        civilite: 'M.',
        nom: 'DURAND',
        prenom: 'Lucas',
        date_naissance: '2003-04-12',
        sexe: 'M',
        type_patient: 'Adulte',
        praticien: 'Dr. Renaud Desouches',
        portable: '0600000001',
        telephone: '0600000001',
        email: 'lucas.durand@exemple.test',
        responsable_num_secu: '',
        suivi_exclusif: false
    },
    {
        id: 'patient-seed-2',
        created_at: new Date('2026-09-05').toISOString(),
        civilite: 'Mme',
        nom: 'LEGRAND',
        prenom: 'Camille',
        date_naissance: '1995-11-14',
        sexe: 'F',
        type_patient: 'Adulte',
        praticien: 'Dr. Renaud Desouches',
        portable: '0600000002',
        telephone: '0600000002',
        email: 'camille.legrand@exemple.test',
        responsable_num_secu: '',
        suivi_exclusif: false
    }
];

const getLocalPatients = (): Patient[] => {
    try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!stored) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(SEED_PATIENTS));
            return SEED_PATIENTS;
        }
        return JSON.parse(stored);
    } catch (e) {
        console.error('Error reading local patients:', e);
        return SEED_PATIENTS;
    }
};

const saveLocalPatient = (patient: Patient): Patient => {
    const localList = getLocalPatients();
    const newPatient: Patient = {
        ...patient,
        id: patient.id || 'local-patient-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
        created_at: patient.created_at || new Date().toISOString()
    };
    localList.unshift(newPatient);
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localList));
    } catch (e) {
        console.error('Error saving local patient:', e);
    }
    return newPatient;
};

// Helper to sanitize date fields (removes empty strings which Postgres rejects as invalid dates)
const sanitizePatient = <T extends Partial<Patient>>(patient: T): T => {
    const sanitized = { ...patient };
    const dateFields: (keyof Patient)[] = [
        'responsable_date_naissance',
        'famille_membre1_date_naissance',
        'famille_membre2_date_naissance',
        'famille_membre3_date_naissance'
    ];
    for (const field of dateFields) {
        if (sanitized[field] === '') {
            delete sanitized[field];
        }
    }
    return sanitized;
};

// Création d'un patient. Mode cabinet : enregistré dans Supabase (visible sur
// tous les appareils) ; en cas d'échec, l'erreur est renvoyée à l'interface.
// Mode démo : stockage local du navigateur.
export const createPatient = async (patient: Patient): Promise<{ data: Patient | null; error: any }> => {
    const { id: _ignored, ...sanitized } = sanitizePatient(patient);
    if (!isCloudMode()) {
        return { data: saveLocalPatient(sanitized as Patient), error: null };
    }
    const { data, error } = await supabase
        .from('patients')
        .insert([sanitized])
        .select()
        .single();
    if (error) {
        console.error('patientService: création refusée par Supabase :', error.message);
        return { data: null, error: new Error(`Le patient n'a pas pu être enregistré dans la base du cabinet : ${error.message}`) };
    }
    return { data, error: null };
};

// Liste des patients : base du cabinet en mode connecté, stockage local en mode démo
export const getPatients = async (): Promise<Patient[]> => {
    if (!isCloudMode()) return getLocalPatients();
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) {
        throw new Error(`Impossible de charger les patients du cabinet : ${error.message}`);
    }
    return data || [];
};

// Get patient by ID
export const getPatientById = async (id: string): Promise<Patient | null> => {
    if (id.startsWith('local-patient-') || id.startsWith('patient-seed-')) {
        const local = getLocalPatients().find(p => p.id === id);
        return local || null;
    }

    try {
        const { data, error } = await supabase
            .from('patients')
            .select('*')
            .eq('id', id)
            .single();

        if (!error && data) return data;
    } catch (e) {}

    const local = getLocalPatients().find(p => p.id === id);
    return local || null;
};

// Update patient
export const updatePatient = async (id: string, patient: Partial<Patient>): Promise<Patient | null> => {
    const sanitized = sanitizePatient(patient);
    
    if (id.startsWith('local-patient-') || id.startsWith('patient-seed-')) {
        const localList = getLocalPatients();
        const idx = localList.findIndex(p => p.id === id);
        if (idx !== -1) {
            localList[idx] = { ...localList[idx], ...sanitized };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localList));
            return localList[idx];
        }
    }

    try {
        const { data, error } = await supabase
            .from('patients')
            .update(sanitized)
            .eq('id', id)
            .select()
            .single();

        if (!error && data) return data;
    } catch (e) {}

    const localList = getLocalPatients();
    const idx = localList.findIndex(p => p.id === id);
    if (idx !== -1) {
        localList[idx] = { ...localList[idx], ...sanitized };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localList));
        return localList[idx];
    }

    return null;
};

// Delete patient
export const deletePatient = async (id: string): Promise<boolean> => {
    if (id.startsWith('local-patient-') || id.startsWith('patient-seed-')) {
        const localList = getLocalPatients().filter(p => p.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localList));
        return true;
    }

    try {
        const { error } = await supabase
            .from('patients')
            .delete()
            .eq('id', id);

        if (!error) return true;
    } catch (e) {}

    const localList = getLocalPatients().filter(p => p.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localList));
    return true;
};
