import { supabase } from '../lib/supabase';
import { isCloudMode } from './recordsService';
import JSZip from 'jszip';

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

export const DEFAULT_PHOTO_TITLES = [
    'Intra-oral — face',
    'Intra-oral — face dessous',
    'Intra-oral — courbe de Spee',
    'Intra-oral — droit',
    'Intra-oral — gauche',
    'Intra-oral — haut',
    'Intra-oral — bas',
    'Visage — face',
    'Visage — sourire',
    'Visage — droit',
    'Visage — gauche',
    'Buste — face',
    'Buste — profil',
] as const;

// Nettoyage propre du nom de fichier : "Intra-oral — face" -> "Intra-oral-face"
const cleanTitleForFileName = (title: string): string => {
    return title
        .replace(/—/g, '-')
        .replace(/[\(\)]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .trim();
};

export const formatPhotoFileName = (index: number, label?: string | null): string => {
    const num = String(index + 1).padStart(2, '0');
    let title = label && !label.startsWith('cliche_') && !label.startsWith('cliche-') ? label : DEFAULT_PHOTO_TITLES[index] || `Cliché-${index + 1}`;
    const cleaned = cleanTitleForFileName(title);
    return `${num}-Cliché-${cleaned}.jpg`;
};

export const formatRadioFileName = (index: number, title: string): string => {
    const num = String(index + 1).padStart(2, '0');
    const cleaned = cleanTitleForFileName(title);
    return `${num}-Radio-${cleaned}.jpg`;
};

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
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const takenAt = new Date(file.lastModified || Date.now());
        const day = takenAt.toISOString().slice(0, 10);
        const path = `${patientId}/${day}/${crypto.randomUUID()}.jpg`;

        const blob = await prepareForStorage(file);
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
            contentType: 'image/jpeg',
            upsert: false,
        });
        if (uploadError) throw new Error(`Envoi d'une photo impossible : ${uploadError.message}`);

        const extractedLabel = labelFromName(file.name);
        const label = extractedLabel || DEFAULT_PHOTO_TITLES[i] || `cliche_${i + 1}`;

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

// ============================================================================
// Empreintes 3D (BiteScan, BiteScan 2, UpperJawScan, LowerJawScan .STL)
// ============================================================================

export const EMPREINTE_TITLES = [
    'BiteScan',
    'BiteScan 2',
    'UpperJawScan',
    'LowerJawScan'
] as const;

export type EmpreinteTitle = typeof EMPREINTE_TITLES[number];

export const formatEmpreinteFileName = (index: number, title: string, originalFileName?: string): string => {
    const num = String(index + 1).padStart(2, '0');
    const cleaned = cleanTitleForFileName(title);
    const ext = originalFileName && originalFileName.includes('.')
        ? originalFileName.substring(originalFileName.lastIndexOf('.'))
        : '.stl';
    return `${num}-Empreinte-${cleaned}${ext}`;
};

export const uploadPatientEmpreinte = async (
    patientId: string,
    file: File,
    empreinteTitle: string
): Promise<void> => {
    if (!isCloudMode() || !UUID_RE.test(patientId)) return;

    const takenAt = new Date(file.lastModified || Date.now());
    const day = takenAt.toISOString().slice(0, 10);
    const path = `${patientId}/empreintes/${day}/${crypto.randomUUID()}_${file.name}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
    });
    if (uploadError) throw new Error(`Envoi de l'empreinte 3D impossible : ${uploadError.message}`);

    const { error: rowError } = await supabase.from('patient_photos').insert({
        patient_id: patientId,
        record_id: null,
        storage_path: path,
        taken_at: takenAt.toISOString(),
        label: `EMPREINTE::${empreinteTitle}::${file.name}`,
    });

    if (rowError) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error(`Enregistrement de l'empreinte 3D impossible : ${rowError.message}`);
    }
};

export const listPatientEmpreintes = async (patientId: string): Promise<Record<string, PatientPhoto>> => {
    if (!isCloudMode() || !UUID_RE.test(patientId)) return {};
    
    const { data, error } = await supabase
        .from('patient_photos')
        .select('*')
        .eq('patient_id', patientId)
        .order('taken_at', { ascending: false });

    if (error) throw new Error(`Lecture des empreintes 3D impossible : ${error.message}`);
    
    const empreinteRows: PatientPhoto[] = (data || []).filter(p => p.label?.startsWith('EMPREINTE::') || p.label?.startsWith('STL::'));
    if (empreinteRows.length === 0) return {};

    const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(empreinteRows.map(p => p.storage_path), 3600);

    if (signError) throw new Error(`Accès aux empreintes 3D impossible : ${signError.message}`);
    const urls = new Map<string, string>((signed || []).map((s: any) => [s.path, s.signedUrl]));

    const empreintesMap: Record<string, PatientPhoto> = {};
    for (const r of empreinteRows) {
        const parts = (r.label || '').split('::');
        const title = parts[1] || '';
        if (title && !empreintesMap[title]) {
            empreintesMap[title] = { ...r, url: urls.get(r.storage_path) };
        }
    }
    return empreintesMap;
};

// ============================================================================
// Téléchargement global en archive ZIP (Dossiers Photos & Radiographies séparés)
// ============================================================================

export const downloadPatientDossierZip = async (
    patientId: string,
    patientName: string
): Promise<void> => {
    const photos = await listPatientPhotos(patientId);
    const radiosMap = await listPatientRadios(patientId);
    const empreintesMap = await listPatientEmpreintes(patientId);

    const zip = new JSZip();

    // Créer les 3 sous-dossiers distincts dans l'archive ZIP
    const photosFolder = zip.folder('Photos');
    const radiosFolder = zip.folder('Radiographies');
    const empreintesFolder = zip.folder('Empreintes');

    // 1. Ajout des photos dans Photos/ (Titres explicites par étape)
    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (!photo.url) continue;
        try {
            const res = await fetch(photo.url);
            const blob = await res.blob();
            const fileName = formatPhotoFileName(i, photo.label);
            photosFolder?.file(fileName, blob);
        } catch (err) {
            console.error('Erreur de téléchargement photo pour le ZIP :', err);
        }
    }

    // 2. Ajout des radios dans Radiographies/
    const processedRadioTitles = new Set<string>();
    for (let i = 0; i < RADIOGRAPHY_TITLES.length; i++) {
        const title = RADIOGRAPHY_TITLES[i];
        const radio = radiosMap[title];
        if (radio && radio.url) {
            processedRadioTitles.add(title);
            try {
                const res = await fetch(radio.url);
                const blob = await res.blob();
                const fileName = formatRadioFileName(i, title);
                radiosFolder?.file(fileName, blob);
            } catch (err) {
                console.error('Erreur de téléchargement radio pour le ZIP :', err);
            }
        }
    }
    const extraRadioKeys = Object.keys(radiosMap).filter(k => !processedRadioTitles.has(k));
    for (let j = 0; j < extraRadioKeys.length; j++) {
        const title = extraRadioKeys[j];
        const radio = radiosMap[title];
        if (radio && radio.url) {
            try {
                const res = await fetch(radio.url);
                const blob = await res.blob();
                const fileName = formatRadioFileName(RADIOGRAPHY_TITLES.length + j, title);
                radiosFolder?.file(fileName, blob);
            } catch (err) {
                console.error('Erreur de téléchargement radio supplémentaire pour le ZIP :', err);
            }
        }
    }

    // 3. Ajout des empreintes dans Empreintes/ (.STL)
    for (let i = 0; i < EMPREINTE_TITLES.length; i++) {
        const title = EMPREINTE_TITLES[i];
        const emp = empreintesMap[title];
        if (emp && emp.url) {
            try {
                const res = await fetch(emp.url);
                const blob = await res.blob();
                const originalName = emp.label?.split('::')[2] || 'scan.stl';
                const fileName = formatEmpreinteFileName(i, title, originalName);
                empreintesFolder?.file(fileName, blob);
            } catch (err) {
                console.error('Erreur de téléchargement empreinte 3D pour le ZIP :', err);
            }
        }
    }

    // Générer et télécharger le fichier ZIP unique au nom de "(Nom) (Prénom).zip"
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(patientName || 'patient').trim()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};
