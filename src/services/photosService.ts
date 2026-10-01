import { supabase } from '../lib/supabase';
import { isCloudMode } from './recordsService';

// ============================================================================
// Photos & Radiographies des patients : conservées dans l'espace de stockage
// privé du cabinet (Supabase Storage « patient-photos ») et horodatées.
// ============================================================================

const BUCKET = 'patient-photos';
const MAX_EDGE = 2048;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PatientPhoto {
    id: string;
    patient_id: string;
    record_id: string | null;
    storage_path: string;
    taken_at: string;
    label: string | null;
    url?: string;
}

export const RADIOGRAPHY_TITLES = [
    'Panoramique',
    'Téléradiographie de profil',
    'Téléradiographie de face',
    'Radiographie du poignet (évaluation de la maturation osseuse)'
] as const;

export type RadiographyTitle = typeof RADIOGRAPHY_TITLES[number];

export const photosAvailable = () => isCloudMode();

// Qualité clinique préservée (2048 px, JPEG 0,9) pour un stockage raisonnable
const prepareForStorage = async (file: File): Promise<Blob> => {
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        return blob || file;
    } catch {
        return file;
    }
};

// Extraction du titre (« cliche-03__Visage — sourire.jpg » -> « Visage — sourire »)
const labelFromName = (name: string): string | null => {
    const match = name.match(/__(.+)\.[a-z0-9]+$/i);
    return match ? match[1] : null;
};

export const uploadPatientPhotos = async (
    patientId: string,
    files: File[],
    recordId?: string | null
): Promise<number> => {
    if (!isCloudMode() || !UUID_RE.test(patientId) || files.length === 0) return 0;

    let uploaded = 0;
    for (const file of files) {
        const takenAt = new Date(file.lastModified || Date.now());
        const day = takenAt.toISOString().slice(0, 10);
        const path = `${patientId}/${day}/${crypto.randomUUID()}.jpg`;

        const blob = await prepareForStorage(file);
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
            contentType: 'image/jpeg',
            upsert: false,
        });
        if (uploadError) throw new Error(`Envoi d'une photo impossible : ${uploadError.message}`);

        const label = labelFromName(file.name);

        const { error: rowError } = await supabase.from('patient_photos').insert({
            patient_id: patientId,
            record_id: recordId && UUID_RE.test(recordId) ? recordId : null,
            storage_path: path,
            taken_at: takenAt.toISOString(),
            label: label,
        });
        if (rowError) {
            await supabase.storage.from(BUCKET).remove([path]);
            throw new Error(`Enregistrement d'une photo impossible : ${rowError.message}`);
        }
        uploaded++;
    }
    return uploaded;
};

export const listPatientPhotos = async (patientId: string): Promise<PatientPhoto[]> => {
    if (!isCloudMode() || !UUID_RE.test(patientId)) return [];
    const { data, error } = await supabase
        .from('patient_photos')
        .select('*')
        .eq('patient_id', patientId)
        .order('taken_at', { ascending: false });

    if (error) throw new Error(`Lecture des photos impossible : ${error.message}`);
    
    // Filtrer pour ne conserver que les photos (et pas les radios identifiées RADIO::)
    const rawPhotos: PatientPhoto[] = (data || []).filter(p => !p.label?.startsWith('RADIO::'));
    if (rawPhotos.length === 0) return [];

    const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(rawPhotos.map(p => p.storage_path), 3600);

    if (signError) throw new Error(`Accès aux photos impossible : ${signError.message}`);
    const urls = new Map<string, string>((signed || []).map((s: any) => [s.path, s.signedUrl]));
    return rawPhotos.map(p => ({ ...p, url: urls.get(p.storage_path) }));
};

export const deletePatientPhoto = async (photo: PatientPhoto): Promise<void> => {
    const { error } = await supabase.from('patient_photos').delete().eq('id', photo.id);
    if (error) throw new Error(`Suppression impossible : ${error.message}`);
    await supabase.storage.from(BUCKET).remove([photo.storage_path]);
};

// ============================================================================
// Radiographies (Panoramique, Téléradiographies, Poignet)
// ============================================================================

export const uploadPatientRadio = async (
    patientId: string,
    file: File,
    radioTitle: string
): Promise<void> => {
    if (!isCloudMode() || !UUID_RE.test(patientId)) return;

    const takenAt = new Date(file.lastModified || Date.now());
    const day = takenAt.toISOString().slice(0, 10);
    const path = `${patientId}/radios/${day}/${crypto.randomUUID()}.jpg`;

    const blob = await prepareForStorage(file);
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
    });
    if (uploadError) throw new Error(`Envoi de la radiographie impossible : ${uploadError.message}`);

    const { error: rowError } = await supabase.from('patient_photos').insert({
        patient_id: patientId,
        record_id: null,
        storage_path: path,
        taken_at: takenAt.toISOString(),
        label: `RADIO::${radioTitle}`,
    });

    if (rowError) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error(`Enregistrement de la radiographie impossible : ${rowError.message}`);
    }
};

export const listPatientRadios = async (patientId: string): Promise<Record<string, PatientPhoto>> => {
    if (!isCloudMode() || !UUID_RE.test(patientId)) return {};
    
    const { data, error } = await supabase
        .from('patient_photos')
        .select('*')
        .eq('patient_id', patientId)
        .order('taken_at', { ascending: false });

    if (error) throw new Error(`Lecture des radiographies impossible : ${error.message}`);
    
    const radioRows: PatientPhoto[] = (data || []).filter(p => p.label?.startsWith('RADIO::'));
    if (radioRows.length === 0) return {};

    const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(radioRows.map(p => p.storage_path), 3600);

    if (signError) throw new Error(`Accès aux radiographies impossible : ${signError.message}`);
    const urls = new Map<string, string>((signed || []).map((s: any) => [s.path, s.signedUrl]));

    // Associer la plus récente par titre de radio
    const radiosMap: Record<string, PatientPhoto> = {};
    for (const r of radioRows) {
        const title = r.label?.replace(/^RADIO::/, '') || '';
        if (title && !radiosMap[title]) {
            radiosMap[title] = { ...r, url: urls.get(r.storage_path) };
        }
    }
    return radiosMap;
};
