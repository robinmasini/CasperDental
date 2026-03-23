// Medical.ia Type Definitions

export interface Message {
    id: string;
    role: 'assistant' | 'user';
    content: string;
    timestamp: Date;
}

export interface Patient {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    isNew: boolean;
}

export type RequestType = 'urgency' | 'control' | 'pain' | 'consultation' | 'other';

export type PainLevel = 'low' | 'moderate' | 'high' | 'severe';

export interface AppointmentRequest {
    patient: Patient;
    requestType: RequestType;
    painLevel?: PainLevel;
    symptoms: string[];
    preferredDate?: string;
    preferredTime?: string;
    notes: string;
}

export interface AppointmentSlot {
    id: string;
    date: string;
    time: string;
    available: boolean;
}

export interface ConversationState {
    step: ConversationStep;
    patient: Partial<Patient>;
    request: Partial<AppointmentRequest>;
    messages: Message[];
}

export type ConversationStep =
    | 'greeting'
    | 'patient_type'
    | 'patient_info'
    | 'request_type'
    | 'symptoms'
    | 'pain_assessment'
    | 'slot_proposal'
    | 'confirmation'
    | 'summary'
    | 'completed';

export interface SpeechState {
    isListening: boolean;
    isSpeaking: boolean;
    isSupported: boolean;
    error: string | null;
}
