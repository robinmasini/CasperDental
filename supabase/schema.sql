-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: Practitioners (Profiles)
CREATE TABLE IF NOT EXISTS practitioners (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    rpps TEXT,
    profession TEXT,
    specialty TEXT,
    photo TEXT
);

-- Table: Patients
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    civilite TEXT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    deuxieme_prenom TEXT,
    sexe TEXT,
    date_naissance DATE NOT NULL,
    type_patient TEXT, -- 'Enfant', 'Adulte'
    praticien TEXT,
    telephone TEXT,
    portable TEXT,
    email TEXT,
    suivi_exclusif BOOLEAN DEFAULT FALSE,
    rpps TEXT,
    profession TEXT,
    specialty TEXT,
    -- Responsable civil
    responsable_civilite TEXT,
    responsable_nom TEXT,
    responsable_prenom TEXT,
    responsable_num_secu TEXT,
    responsable_date_naissance DATE,
    responsable_adresse TEXT,
    responsable_adresse2 TEXT,
    responsable_cp TEXT,
    responsable_commune TEXT,
    responsable_pays TEXT,
    responsable_portable1 TEXT,
    responsable_portable2 TEXT,
    responsable_telephone1 TEXT,
    responsable_telephone2 TEXT,
    responsable_email TEXT,
    responsable_remarque TEXT,
    -- Correspondants
    envoye_par TEXT,
    dentiste TEXT,
    -- Famille
    famille_membre1_prenom TEXT,
    famille_membre1_sexe TEXT,
    famille_membre1_date_naissance DATE,
    famille_membre2_prenom TEXT,
    famille_membre2_sexe TEXT,
    famille_membre2_date_naissance DATE,
    famille_membre3_prenom TEXT,
    famille_membre3_sexe TEXT,
    famille_membre3_date_naissance DATE
);

-- Table: Appointments
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    type TEXT NOT NULL, -- e.g., 'Contrôle', 'Détartrage', 'Urgence'
    status TEXT DEFAULT 'planifié', -- 'planifié', 'confirmé', 'annulé', 'terminé'
    notes TEXT
);

-- Table: Calls
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    direction TEXT NOT NULL, -- 'inbound', 'outbound'
    duration_seconds INTEGER DEFAULT 0,
    status TEXT NOT NULL, -- 'completed', 'missed', 'ongoing'
    classification TEXT, -- 'RDV', 'Annulation', 'Urgence', 'Autre'
    practitioner_id TEXT, -- RPPS or Name
    summary TEXT,
    twilio_call_sid TEXT UNIQUE
);

-- Table: Call Transcripts
CREATE TABLE IF NOT EXISTS call_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    role TEXT NOT NULL, -- 'ai', 'patient'
    content TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: Follow-ups (Relances)
CREATE TABLE IF NOT EXISTS follow_ups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'Impayer', 'Post-op', 'Rappel'
    priority TEXT DEFAULT 'normale',
    status TEXT DEFAULT 'à faire', -- 'à faire', 'en cours', 'terminé'
    due_date DATE,
    notes TEXT
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_calls_patient ON calls(patient_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_patient ON follow_ups(patient_id);
