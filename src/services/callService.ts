import { supabase } from './supabaseClient';

export interface Call {
    id: string;
    created_at: string;
    patient_id?: string;
    phone_number: string;
    direction: 'inbound' | 'outbound';
    duration_seconds: number;
    status: 'completed' | 'missed' | 'ongoing';
    classification?: string;
    practitioner_id?: string;
    summary?: string;
    twilio_call_sid?: string;
}

export interface CallTranscript {
    id: string;
    call_id: string;
    role: 'ai' | 'patient';
    content: string;
    timestamp: string;
}

export const getCalls = async (): Promise<Call[]> => {
    const { data, error } = await supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching calls:', error);
        return [];
    }
    return data || [];
};

export const getCallTranscripts = async (callId: string): Promise<CallTranscript[]> => {
    const { data, error } = await supabase
        .from('call_transcripts')
        .select('*')
        .eq('call_id', callId)
        .order('timestamp', { ascending: true });

    if (error) {
        console.error('Error fetching transcripts:', error);
        return [];
    }
    return data || [];
};

export const createCall = async (call: Partial<Call>): Promise<Call | null> => {
    const { data, error } = await supabase
        .from('calls')
        .insert([call])
        .select()
        .single();

    if (error) {
        console.error('Error creating call:', error);
        return null;
    }
    return data;
};
