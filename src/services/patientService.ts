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

// Create patient
export const createPatient = async (patient: Patient): Promise<{ data: Patient | null; error: any }> => {
    console.log('patientService: Starting createPatient with data:', patient);
    try {
        const { data, error } = await supabase
            .from('patients')
            .insert([patient])
            .select()
            .single();

        if (error) {
            console.error('patientService: Supabase error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            return { data: null, error };
        }
        console.log('patientService: Patient created successfully:', data);
        return { data, error: null };
    } catch (err) {
        console.error('patientService: Unexpected catch error:', err);
        const errorInfo = {
            message: err instanceof Error ? err.message : String(err),
            name: err instanceof Error ? err.name : 'UnknownError',
            stack: err instanceof Error ? err.stack : undefined,
            navigatorOnline: navigator.onLine
        };
        console.error('Error Info:', errorInfo);
        return { data: null, error: errorInfo };
    }
};

// Get all patients
export const getPatients = async (): Promise<Patient[]> => {
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching patients:', error);
        return [];
    }
    return data || [];
};

// Get patient by ID
export const getPatientById = async (id: string): Promise<Patient | null> => {
    const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching patient:', error);
        return null;
    }
    return data;
};

// Update patient
export const updatePatient = async (id: string, patient: Partial<Patient>): Promise<Patient | null> => {
    const { data, error } = await supabase
        .from('patients')
        .update(patient)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating patient:', error);
        return null;
    }
    return data;
};

// Delete patient
export const deletePatient = async (id: string): Promise<boolean> => {
    const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting patient:', error);
        return false;
    }
    return true;
};
