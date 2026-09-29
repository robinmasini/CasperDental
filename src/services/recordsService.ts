import { supabase } from '../lib/supabase';
import type { OrthoMindDepData } from '../types/dep';

// ============================================================================
// Comptes-rendus cliniques (analyses photo, consultations audio, fiches DEP)
// ----------------------------------------------------------------------------
// Mode cabinet : stockés dans Supabase (table clinical_records), donc
// identiques sur ordinateur et mobile. Les erreurs sont remontées à
// l'interface : plus d'enregistrement local silencieux.
// Mode démo (Supabase non configuré) : stockage local du navigateur.
// ============================================================================

export type RecordType = 'photos' | 'audio' | 'dep' | 'onyxceph';

export interface ClinicalRecord {
    id: string;
    created_at: string;
    patient_id: string | null;
    patient_name: string;
    type: RecordType;
    images: string[];
    diagnostic_text: string;
    traitement_text: string;
    transcript?: string | null;
    dep_data?: OrthoMindDepData | null;
    meta?: Record<string, unknown> | null;
}

export type NewClinicalRecord = Omit<ClinicalRecord, 'id' | 'created_at'>;

const LOCAL_KEY = 'casper_mock_history';

export const isSupabaseConfigured = (): boolean =>
    Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Données partagées du cabinet (compte Supabase réel) plutôt que mode démo local */
export const isCloudMode = (): boolean =>
    isSupabaseConfigured() && localStorage.getItem('casper_mock_auth') !== 'true';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (id?: string | null) => (id && UUID_RE.test(id) ? id : null);

const readLocal = (): ClinicalRecord[] => {
    try {
        return (JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as any[]).map(r => ({
            ...r,
            type: r.type === 'audio' || r.transcript ? 'audio' : (r.type || 'photos'),
            images: r.images || [],
        }));
    } catch {
        return [];
    }
};

const writeLocal = (records: ClinicalRecord[]) => localStorage.setItem(LOCAL_KEY, JSON.stringify(records));

const cloudError = (action: string, error: any) =>
    new Error(`${action} impossible : ${error?.message || error}. Vérifiez la connexion internet et que le script de synchronisation a bien été exécuté dans Supabase.`);

export const listRecords = async (patientId?: string): Promise<ClinicalRecord[]> => {
    if (!isCloudMode()) {
        const all = readLocal();
        return patientId ? all.filter(r => r.patient_id === patientId) : all;
    }
    let query = supabase.from('clinical_records').select('*').order('created_at', { ascending: false });
    if (patientId) query = query.eq('patient_id', patientId);
    const { data, error } = await query;
    if (error) throw cloudError('Lecture des comptes-rendus', error);
    return data || [];
};

export const saveRecord = async (record: NewClinicalRecord): Promise<ClinicalRecord> => {
    if (!isCloudMode()) {
        const saved: ClinicalRecord = { ...record, id: `local-${record.type}-${Date.now()}`, created_at: new Date().toISOString() };
        writeLocal([saved, ...readLocal()]);
        return saved;
    }
    const { data, error } = await supabase
        .from('clinical_records')
        .insert({ ...record, patient_id: asUuid(record.patient_id) })
        .select()
        .single();
    if (error) throw cloudError('Enregistrement du compte-rendu', error);
    return data;
};

export const updateRecordDep = async (recordId: string, depData: OrthoMindDepData): Promise<void> => {
    if (!isCloudMode() || !UUID_RE.test(recordId)) {
        writeLocal(readLocal().map(r => (r.id === recordId ? { ...r, dep_data: depData } : r)));
        return;
    }
    const { error } = await supabase.from('clinical_records').update({ dep_data: depData }).eq('id', recordId);
    if (error) throw cloudError('Enregistrement de la fiche DEP', error);
};

// ----------------------------------------------------------------------------
// Synchro OnyxCeph inter-appareils (desktop/mobile) via clinical_records
// ----------------------------------------------------------------------------
export const getOnyxCephUrlRecord = async (patientId: string): Promise<string | null> => {
    if (!patientId) return null;
    const localKey = `casper_onyxceph_link_${patientId}`;

    if (isCloudMode()) {
        try {
            const uuid = asUuid(patientId);
            if (uuid) {
                const { data } = await supabase
                    .from('clinical_records')
                    .select('diagnostic_text')
                    .eq('patient_id', uuid)
                    .eq('type', 'onyxceph')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (data?.diagnostic_text) {
                    localStorage.setItem(localKey, data.diagnostic_text);
                    return data.diagnostic_text;
                }
            }
        } catch (e) {
            console.error('Erreur lecture OnyxCeph cloud:', e);
        }
    }

    const localRecord = readLocal().find(r => r.patient_id === patientId && r.type === 'onyxceph');
    if (localRecord?.diagnostic_text) {
        return localRecord.diagnostic_text;
    }

    return localStorage.getItem(localKey);
};

export const saveOnyxCephUrlRecord = async (patientId: string, patientName: string, url: string): Promise<void> => {
    if (!patientId) return;
    const localKey = `casper_onyxceph_link_${patientId}`;

    if (url) {
        localStorage.setItem(localKey, url);
    } else {
        localStorage.removeItem(localKey);
    }

    if (isCloudMode()) {
        const uuid = asUuid(patientId);
        if (uuid) {
            const { data: existing } = await supabase
                .from('clinical_records')
                .select('id')
                .eq('patient_id', uuid)
                .eq('type', 'onyxceph')
                .maybeSingle();

            if (existing?.id) {
                const { error } = await supabase
                    .from('clinical_records')
                    .update({ diagnostic_text: url })
                    .eq('id', existing.id);
                if (error) console.error('Erreur MAJ OnyxCeph cloud:', error.message);
            } else if (url) {
                const { error } = await supabase
                    .from('clinical_records')
                    .insert({
                        patient_id: uuid,
                        patient_name: patientName || 'Patient',
                        type: 'onyxceph',
                        images: [],
                        diagnostic_text: url,
                        traitement_text: 'Lien OnyxCeph',
                    });
                if (error) console.error('Erreur insertion OnyxCeph cloud:', error.message);
            }
        }
    } else {
        const records = readLocal();
        const existingIdx = records.findIndex(r => r.patient_id === patientId && r.type === 'onyxceph');
        if (existingIdx !== -1) {
            records[existingIdx].diagnostic_text = url;
            writeLocal(records);
        } else if (url) {
            const saved: ClinicalRecord = {
                id: `local-onyxceph-${Date.now()}`,
                created_at: new Date().toISOString(),
                patient_id: patientId,
                patient_name: patientName || 'Patient',
                type: 'onyxceph',
                images: [],
                diagnostic_text: url,
                traitement_text: 'Lien OnyxCeph',
            };
            writeLocal([saved, ...records]);
        }
    }
};

// ----------------------------------------------------------------------------
// Transfert unique des données saisies sur cet appareil vers le cabinet
// ----------------------------------------------------------------------------
const MIGRATION_FLAG = 'orthomind_local_data_migrated';

export const migrateLocalDataToCloud = async (): Promise<{ patients: number; records: number } | null> => {
    if (!isCloudMode() || localStorage.getItem(MIGRATION_FLAG) === 'done') return null;

    const localPatients: any[] = JSON.parse(localStorage.getItem('casper_local_patients') || '[]')
        // Les patients de démonstration ne sont pas transférés
        .filter((p: any) => p && !String(p.id || '').startsWith('patient-seed-'));
    const localRecords = readLocal();
    if (localPatients.length === 0 && localRecords.length === 0) {
        localStorage.setItem(MIGRATION_FLAG, 'done');
        return null;
    }

    // Patients : on retrouve un homonyme existant, sinon on le crée
    const { data: existing, error: listError } = await supabase.from('patients').select('id, nom, prenom, date_naissance');
    if (listError) throw cloudError('Transfert des patients', listError);

    const idMap = new Map<string, string>();
    let createdPatients = 0;
    for (const p of localPatients) {
        const match = (existing || []).find((e: any) =>
            e.nom?.toLowerCase() === p.nom?.toLowerCase() &&
            e.prenom?.toLowerCase() === p.prenom?.toLowerCase() &&
            e.date_naissance === p.date_naissance);
        if (match) {
            idMap.set(p.id, match.id);
            continue;
        }
        const { id: _oldId, created_at: _created, ...fields } = p;
        Object.keys(fields).forEach(k => { if (fields[k] === '') delete fields[k]; });
        const { data, error } = await supabase.from('patients').insert(fields).select('id').single();
        if (error) throw cloudError(`Transfert du patient ${p.prenom} ${p.nom}`, error);
        idMap.set(p.id, data.id);
        createdPatients++;
    }

    // Comptes-rendus : rattachés aux nouveaux identifiants patients
    let createdRecords = 0;
    for (const r of localRecords) {
        const patientId = r.patient_id ? (idMap.get(r.patient_id) || asUuid(r.patient_id)) : null;
        const { error } = await supabase.from('clinical_records').insert({
            created_at: r.created_at,
            patient_id: patientId,
            patient_name: r.patient_name || 'Patient',
            type: r.type,
            images: (r.images || []).filter(Boolean),
            diagnostic_text: r.diagnostic_text || '',
            traitement_text: r.traitement_text || '',
            transcript: r.transcript || null,
            dep_data: r.dep_data || null,
            meta: r.meta || null,
        });
        if (error) throw cloudError('Transfert des comptes-rendus', error);
        createdRecords++;
    }

    localStorage.setItem(MIGRATION_FLAG, 'done');
    localStorage.removeItem('casper_local_patients');
    localStorage.removeItem(LOCAL_KEY);
    return { patients: createdPatients, records: createdRecords };
};
