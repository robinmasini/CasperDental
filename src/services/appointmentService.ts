import { supabase } from './supabaseClient';

export interface Appointment {
    id: string;
    created_at: string;
    patient_id: string;
    date: string;
    duration_minutes: number;
    type: string;
    status: 'planifié' | 'confirmé' | 'annulé' | 'terminé';
    notes?: string;
    patient?: { // For joined data
        nom: string;
        prenom: string;
    };
}

export const getAppointments = async (): Promise<Appointment[]> => {
    const { data, error } = await supabase
        .from('appointments')
        .select('*, patient:patients(nom, prenom)')
        .order('date', { ascending: true });

    if (error) {
        console.error('Error fetching appointments:', error);
        return [];
    }
    return data || [];
};

export const createAppointment = async (appointment: Partial<Appointment>): Promise<Appointment | null> => {
    const { data, error } = await supabase
        .from('appointments')
        .insert([appointment])
        .select()
        .single();

    if (error) {
        console.error('Error creating appointment:', error);
        return null;
    }
    return data;
};

export const getUpcomingAppointments = async (limit = 5): Promise<Appointment[]> => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from('appointments')
        .select('*, patient:patients(nom, prenom)')
        .gte('date', now)
        .order('date', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('Error fetching upcoming appointments:', error);
        return [];
    }
    return data || [];
};

export const getAppointmentsByPatientId = async (patientId: string): Promise<Appointment[]> => {
    const { data, error } = await supabase
        .from('appointments')
        .select('*, patient:patients(nom, prenom)')
        .eq('patient_id', patientId)
        .order('date', { ascending: false });

    if (error) {
        console.error('Error fetching patient appointments:', error);
        return [];
    }
    return data || [];
};
