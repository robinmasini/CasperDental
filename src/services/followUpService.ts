import { supabase } from './supabaseClient';

export interface FollowUp {
    id: string;
    created_at: string;
    patient_id: string;
    type: string;
    priority: 'basse' | 'normale' | 'haute';
    status: 'à faire' | 'en cours' | 'terminé';
    due_date?: string;
    notes?: string;
    patient?: {
        nom: string;
        prenom: string;
    };
}

export const getFollowUps = async (): Promise<FollowUp[]> => {
    const { data, error } = await supabase
        .from('follow_ups')
        .select('*, patient:patients(nom, prenom)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching follow-ups:', error);
        return [];
    }
    return data || [];
};

export const updateFollowUpStatus = async (id: string, status: FollowUp['status']): Promise<boolean> => {
    const { error } = await supabase
        .from('follow_ups')
        .update({ status })
        .eq('id', id);

    if (error) {
        console.error('Error updating follow-up status:', error);
        return false;
    }
    return true;
};
