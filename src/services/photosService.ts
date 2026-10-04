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

// Vues intra-orales (miroir / rotation proposés) : titres « Intra-oral — … »,
// ou anciennes vues de la caméra (« Intra-buccale … », « Occlusale … »)
export const isIntraOralPhoto = (photo: PatientPhoto) =>
    /^(intra-oral|intra-buccale|occlusale)/i.test(photo.label || '');

export type PhotoTransform = 'flip' | 'rotate180';

// Applique un miroir horizontal ou une rotation de 180° à l'image stockée elle-même :
// la fiche, la visionneuse et les téléchargements reflètent tous la correction.
export const transformPatientPhoto = async (photo: PatientPhoto, transform: PhotoTransform): Promise<void> => {
    if (!photo.url) throw new Error('Photo indisponible.');
    const source = await (await fetch(photo.url)).blob();
    const bitmap = await createImageBitmap(source);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    if (transform === 'flip') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    } else {
        ctx.translate(canvas.width, canvas.height);
        ctx.rotate(Math.PI);
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new Error("Transformation de l'image impossible.");

    // Nouveau fichier puis bascule de la fiche : l'original n'est supprimé qu'une fois la nouvelle version en place
    const folder = photo.storage_path.split('/').slice(0, -1).join('/');
    const newPath = `${folder}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(newPath, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw new Error(`Enregistrement de la photo modifiée impossible : ${uploadError.message}`);
    const { error: rowError } = await supabase.from('patient_photos').update({ storage_path: newPath }).eq('id', photo.id);
    if (rowError) {
        await supabase.storage.from(BUCKET).remove([newPath]);
        throw new Error(`Enregistrement de la photo modifiée impossible : ${rowError.message}`);
    }
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
// Téléchargement global structuré du dossier patient (Photos, Radiographies, Empreintes)
// ============================================================================

export const downloadPatientDossierZip = async (
    patientId: string,
    patientName: string
): Promise<void> => {
    const photos = await listPatientPhotos(patientId);
    const radiosMap = await listPatientRadios(patientId);
    const empreintesMap = await listPatientEmpreintes(patientId);

    const safePatientName = (patientName || 'Patient').trim().replace(/[\/\\]/g, '-');

    const zip = new JSZip();

    // 1. Structure propre des 3 sous-dossiers
    const photosFolder = zip.folder('Photos');
    const radiosFolder = zip.folder('Radiographies');
    const empreintesFolder = zip.folder('Empreintes');

    // 2. Photos orthodontiques (13 vues ordonnées)
    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (!photo.url) continue;
        try {
            const res = await fetch(photo.url);
            const blob = await res.blob();
            const fileName = formatPhotoFileName(i, photo.label);
            photosFolder?.file(fileName, blob);
        } catch (err) {
            console.error('Erreur téléchargement photo pour le dossier :', err);
        }
    }

    // 3. Radiographies
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
                console.error('Erreur téléchargement radio pour le dossier :', err);
            }
        }
    }

    // 4. Empreintes 3D (.STL)
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
                console.error('Erreur téléchargement empreinte pour le dossier :', err);
            }
        }
    }

    // Générer et télécharger le dossier structuré "(Nom) (Prénom).zip" en 1 seul clic
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safePatientName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

// ============================================================================
// Téléchargement direct des 13 photos orthodontiques (Fichiers .JPG individuels)
// Idéal pour l'import Windows (OnyxCeph, Carestream, Romexis...) via "Parcourir"
// ============================================================================

export const downloadPatientPhotosDirect = async (
    patientId: string,
    patientName: string
): Promise<void> => {
    const photos = await listPatientPhotos(patientId);
    const safePatientName = (patientName || 'Patient').trim().replace(/[\/\\]/g, '-');

    const triggerDirectDownload = (blob: Blob, fileName: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    };

    for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        if (!photo.url) continue;
        try {
            const res = await fetch(photo.url);
            const blob = await res.blob();
            const fileName = formatPhotoFileName(i, photo.label);
            triggerDirectDownload(blob, `${safePatientName}_${fileName}`);
            await new Promise(r => setTimeout(r, 150));
        } catch (err) {
            console.error('Erreur téléchargement photo direct :', err);
        }
    }
};

// ============================================================================
// Téléchargement du dossier patient structuré DÉZIPPÉ DIRECTEMENT SUR LE DISQUE
// Crée le dossier "[Nom] [Prénom]" avec ses 3 sous-dossiers (Photos, Radiographies, Empreintes)
// directement sans passer par un fichier ZIP.
// ============================================================================

export const downloadPatientDossierFolderUncompressed = async (
    patientId: string,
    patientName: string
): Promise<void> => {
    const photos = await listPatientPhotos(patientId);
    const radiosMap = await listPatientRadios(patientId);
    const empreintesMap = await listPatientEmpreintes(patientId);

    const safePatientName = (patientName || 'Patient').trim().replace(/[\/\\]/g, '-');

    // 1. Tenter le File System Access API (sur Chrome/Edge/Brave/Opera Mac & Windows)
    // Ne PAS passer mode: 'readwrite' au sélecteur racine pour éviter le blocage sécurité Chrome.
    if ('showDirectoryPicker' in window) {
        try {
            const rootDirHandle = await (window as any).showDirectoryPicker();

            // Créer le dossier principal du patient : ex. "GACEM Célia"
            const patientFolderHandle = await rootDirHandle.getDirectoryHandle(safePatientName, { create: true });

            // Demander la permission d'écriture sur le dossier du patient
            if (patientFolderHandle.requestPermission) {
                const status = await patientFolderHandle.requestPermission({ mode: 'readwrite' });
                if (status !== 'granted' && status !== 'prompt') {
                    console.warn('Permission non accordée sur le dossier patient');
                }
            }

            // Créer les 3 sous-dossiers structurés à l'intérieur du dossier patient
            const photosDir = await patientFolderHandle.getDirectoryHandle('Photos', { create: true });
            const radiosDir = await patientFolderHandle.getDirectoryHandle('Radiographies', { create: true });
            const empreintesDir = await patientFolderHandle.getDirectoryHandle('Empreintes', { create: true });

            // Écrire les 13 photos orthodontiques dans Photos/
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                if (!photo.url) continue;
                try {
                    const res = await fetch(photo.url);
                    const blob = await res.blob();
                    const fileName = formatPhotoFileName(i, photo.label);
                    const fileHandle = await photosDir.getFileHandle(fileName, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } catch (err) {
                    console.error('Erreur écriture fichier photo :', err);
                }
            }

            // Écrire les radiographies dans Radiographies/
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
                        const fileHandle = await radiosDir.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    } catch (err) {
                        console.error('Erreur écriture fichier radio :', err);
                    }
                }
            }

            // Écrire les empreintes 3D (.STL) dans Empreintes/
            for (let i = 0; i < EMPREINTE_TITLES.length; i++) {
                const title = EMPREINTE_TITLES[i];
                const emp = empreintesMap[title];
                if (emp && emp.url) {
                    try {
                        const res = await fetch(emp.url);
                        const blob = await res.blob();
                        const originalName = emp.label?.split('::')[2] || 'scan.stl';
                        const fileName = formatEmpreinteFileName(i, title, originalName);
                        const fileHandle = await empreintesDir.getFileHandle(fileName, { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    } catch (err) {
                        console.error('Erreur écriture fichier empreinte :', err);
                    }
                }
            }

            return; // Dossier patient créé 100% DÉZIPPÉ sur le disque !
        } catch (err: any) {
            if (err.name === 'AbortError') return; // L'utilisateur a annulé la sélection
            console.warn('Sélecteur direct indisponible ou annulé, bascule sur génération archive structurée :', err);
        }
    }

    // 2. Si l'API de dossier direct n'est pas disponible (ou navigateur mobile Safari) :
    // Téléchargement du ZIP structuré en fallback
    await downloadPatientDossierZip(patientId, patientName);
};

export const downloadPatientDossierDirectFiles = downloadPatientDossierFolderUncompressed;
