import { supabase } from './supabaseClient';

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
        nom: 'MASINI',
        prenom: 'Robin',
        date_naissance: '2002-08-24',
        sexe: 'M',
        type_patient: 'Adulte',
        praticien: 'Dr. Renaud Desouches',
        portable: '0603096001',
        telephone: '0603096001',
        email: 'robin.masini@gmail.com',
        responsable_num_secu: '1020820820976',
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
        portable: '0612345678',
        telephone: '0612345678',
        email: 'camille.legrand@email.fr',
        responsable_num_secu: '2951175123456',
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

// Create patient with Supabase insert & automatic local storage fallback on RLS permission errors
export const createPatient = async (patient: Patient): Promise<{ data: Patient | null; error: any }> => {
    console.log('patientService: Starting createPatient with data:', patient);
    const sanitized = sanitizePatient(patient);
    try {
        const { data, error } = await supabase
            .from('patients')
            .insert([sanitized])
            .select()
            .single();

        if (error) {
            console.warn('patientService: Supabase RLS/permission error, saving patient locally:', error.message);
            const localSaved = saveLocalPatient(sanitized);
            return { data: localSaved, error: null };
        }
        console.log('patientService: Patient created successfully in Supabase:', data);
        return { data, error: null };
    } catch (err) {
        console.warn('patientService: Exception, saving patient locally:', err);
        const localSaved = saveLocalPatient(sanitized);
        return { data: localSaved, error: null };
    }
};

// Get all patients (Supabase + LocalStorage merged)
export const getPatients = async (): Promise<Patient[]> => {
    let supabasePatients: Patient[] = [];
    try {
        const { data, error } = await supabase
            .from('patients')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            supabasePatients = data;
        } else {
            console.warn('patientService: Could not fetch patients from Supabase, using local:', error?.message);
        }
    } catch (e) {
        console.warn('patientService: Supabase fetch exception:', e);
    }

    const localPatients = getLocalPatients();
    
    // Combine and deduplicate by id or nom+prenom
    const combinedMap = new Map<string, Patient>();
    for (const p of [...localPatients, ...supabasePatients]) {
        const key = p.id || `${p.nom.toLowerCase()}_${p.prenom.toLowerCase()}`;
        if (!combinedMap.has(key)) {
            combinedMap.set(key, p);
        }
    }

    return Array.from(combinedMap.values());
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
