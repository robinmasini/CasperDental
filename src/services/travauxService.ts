import { supabase } from './supabaseClient';

export interface TravauxItem {
    id: string;
    monthGroup: string; // e.g. "SEPTEMBRE 2026", "OCTOBRE 2026"
    patientId: string;
    patientName: string;
    travailARealiser: string; // Tag badge label
    empr?: string; // Empreintes info
    commentaires1?: string;
    travail: string; // Status badge: 'A IMPR' | 'A FAIRE' | 'EN ATTENTE DE RDV' | 'EN COURS' | 'TERMINÉ'
    prothesiste: string; // Sam, Fiona, Marina, etc.
    rdv?: string; // Date or badge
    facturation: string; // 'En attente' | 'Facturé' | 'Réglé'
    commentaires2?: string;
    typeImpress?: string; // 'BAMBULAB', 'Formlabs', etc.
    nbGouttImpr?: string | number;
    imprime: boolean;
    thermoform: boolean;
    createdAt?: string;
}

const LOCAL_STORAGE_KEY = 'casper_onyxceph_travaux';

export const SEED_TRAVAUX: TravauxItem[] = [
    {
        id: 'travaux-seed-1',
        monthGroup: 'SEPTEMBRE 2026',
        patientId: 'patient-seed-1',
        patientName: 'PERE Johan',
        travailARealiser: 'Stab/contention',
        empr: '6 à 9',
        commentaires1: 'en 0.75mm à couper à ...',
        travail: 'A IMPR',
        prothesiste: 'Sam',
        rdv: 'sept. 29',
        facturation: 'En attente',
        commentaires2: '',
        typeImpress: '',
        nbGouttImpr: '',
        imprime: false,
        thermoform: false,
        createdAt: '2026-09-01T10:00:00Z'
    },
    {
        id: 'travaux-seed-2',
        monthGroup: 'SEPTEMBRE 2026',
        patientId: 'patient-seed-1',
        patientName: 'PERE Johan',
        travailARealiser: 'MATCH',
        empr: '',
        commentaires1: '',
        travail: 'A FAIRE',
        prothesiste: 'Sam',
        rdv: 'sept. 29',
        facturation: 'En attente',
        commentaires2: '',
        typeImpress: '',
        nbGouttImpr: '',
        imprime: false,
        thermoform: false,
        createdAt: '2026-09-01T10:05:00Z'
    },
    {
        id: 'travaux-seed-3',
        monthGroup: 'SEPTEMBRE 2026',
        patientId: 'patient-seed-3',
        patientName: 'SAAVEDRA Nancy',
        travailARealiser: 'BRUX',
        empr: '',
        commentaires1: '',
        travail: 'A FAIRE',
        prothesiste: 'Marina',
        rdv: '',
        facturation: 'En attente',
        commentaires2: '',
        typeImpress: '',
        nbGouttImpr: '',
        imprime: false,
        thermoform: false,
        createdAt: '2026-09-02T11:00:00Z'
    },
    {
        id: 'travaux-seed-4',
        monthGroup: 'SEPTEMBRE 2026',
        patientId: 'patient-seed-4',
        patientName: 'DALLY Nadia',
        travailARealiser: 'Stab/contention',
        empr: '',
        commentaires1: '',
        travail: 'A FAIRE',
        prothesiste: 'Marina',
        rdv: '',
        facturation: 'En attente',
        commentaires2: '',
        typeImpress: '',
        nbGouttImpr: '',
        imprime: false,
        thermoform: false,
        createdAt: '2026-09-03T14:20:00Z'
    },
    {
        id: 'travaux-seed-5',
        monthGroup: 'OCTOBRE 2026',
        patientId: 'patient-seed-5',
        patientName: 'FASSETTA Noé',
        travailARealiser: 'Suite a impr',
        empr: '8 à 18',
        commentaires1: '8 à 18',
        travail: 'EN ATTENTE DE RDV',
        prothesiste: 'Fiona',
        rdv: 'oct. 6',
        facturation: 'En attente',
        commentaires2: 'Urgent',
        typeImpress: 'BAMBULAB',
        nbGouttImpr: '12',
        imprime: true,
        thermoform: true,
        createdAt: '2026-10-01T09:00:00Z'
    },
    {
        id: 'travaux-seed-6',
        monthGroup: 'OCTOBRE 2026',
        patientId: 'patient-seed-6',
        patientName: 'CAMELLI Louis',
        travailARealiser: 'Suite a impr',
        empr: '7 à 17',
        commentaires1: '7 à 17',
        travail: 'EN ATTENTE DE RDV',
        prothesiste: 'Sam',
        rdv: 'oct. 7',
        facturation: 'En attente',
        commentaires2: '',
        typeImpress: 'BAMBULAB',
        nbGouttImpr: '10',
        imprime: true,
        thermoform: true,
        createdAt: '2026-10-01T09:30:00Z'
    },
    {
        id: 'travaux-seed-7',
        monthGroup: 'OCTOBRE 2026',
        patientId: 'patient-seed-7',
        patientName: 'DEMOUGEOT Simon',
        travailARealiser: 'Suite a impr',
        empr: '8 à 17',
        commentaires1: '8 à 17',
        travail: 'TERMINÉ',
        prothesiste: 'Fiona',
        rdv: 'oct. 7',
        facturation: 'Facturé',
        commentaires2: '',
        typeImpress: 'BAMBULAB',
        nbGouttImpr: '14',
        imprime: true,
        thermoform: true,
        createdAt: '2026-10-02T10:00:00Z'
    },
    {
        id: 'travaux-seed-8',
        monthGroup: 'OCTOBRE 2026',
        patientId: 'patient-seed-8',
        patientName: 'CHERKAOUI Adam',
        travailARealiser: 'Suite a impr',
        empr: '13 à 19',
        commentaires1: '13 à 19',
        travail: 'TERMINÉ',
        prothesiste: 'Fiona',
        rdv: 'oct. 14',
        facturation: 'Facturé',
        commentaires2: '',
        typeImpress: 'BAMBULAB',
        nbGouttImpr: '12',
        imprime: true,
        thermoform: true,
        createdAt: '2026-10-03T11:00:00Z'
    },
    {
        id: 'travaux-seed-9',
        monthGroup: 'OCTOBRE 2026',
        patientId: 'patient-seed-9',
        patientName: 'CHERKAOUI Wael',
        travailARealiser: 'Suite a impr',
        empr: '13 à 20',
        commentaires1: '13 à 20',
        travail: 'TERMINÉ',
        prothesiste: 'Fiona',
        rdv: 'oct. 13',
        facturation: 'Facturé',
        commentaires2: '',
        typeImpress: 'BAMBULAB',
        nbGouttImpr: '14',
        imprime: true,
        thermoform: true,
        createdAt: '2026-10-03T11:30:00Z'
    },
    {
        id: 'travaux-seed-10',
        monthGroup: 'OCTOBRE 2026',
        patientId: 'patient-seed-10',
        patientName: 'CHOTARD Oscar',
        travailARealiser: 'Suite a impr',
        empr: '8 à 16',
        commentaires1: '8 à 16',
        travail: 'TERMINÉ',
        prothesiste: 'Sam',
        rdv: 'oct. 13',
        facturation: 'Facturé',
        commentaires2: '',
        typeImpress: 'BAMBULAB',
        nbGouttImpr: '16',
        imprime: true,
        thermoform: true,
        createdAt: '2026-10-04T12:00:00Z'
    },
    {
        id: 'travaux-seed-11',
        monthGroup: 'OCTOBRE 2026',
        patientId: 'patient-seed-11',
        patientName: 'SAHKI Darya',
        travailARealiser: 'Suite a impr',
        empr: '8 à 13',
        commentaires1: '8 à 13',
        travail: 'TERMINÉ',
        prothesiste: 'Sam',
        rdv: 'oct. 13',
        facturation: 'Facturé',
        commentaires2: '',
        typeImpress: 'BAMBULAB',
        nbGouttImpr: '10',
        imprime: true,
        thermoform: true,
        createdAt: '2026-10-04T14:00:00Z'
    },
    {
        id: 'travaux-seed-12',
        monthGroup: 'OCTOBRE 2026',
        patientId: 'patient-seed-12',
        patientName: 'PARET Céline',
        travailARealiser: 'Suite a impr',
        empr: '21 à 24',
        commentaires1: '21 à 24',
        travail: 'TERMINÉ',
        prothesiste: 'Sam',
        rdv: 'oct. 13',
        facturation: 'Facturé',
        commentaires2: '',
        typeImpress: 'BAMBULAB',
        nbGouttImpr: '6',
        imprime: true,
        thermoform: true,
        createdAt: '2026-10-04T15:00:00Z'
    }
];

export const getLocalTravaux = (): TravauxItem[] => {
    try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!stored) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(SEED_TRAVAUX));
            return SEED_TRAVAUX;
        }
        return JSON.parse(stored);
    } catch (e) {
        console.error('Error reading local travaux:', e);
        return SEED_TRAVAUX;
    }
};

export const saveLocalTravaux = (items: TravauxItem[]) => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
        console.error('Error saving local travaux:', e);
    }
};

export const addTravauxItem = (item: Partial<TravauxItem>): TravauxItem => {
    const list = getLocalTravaux();
    const newItem: TravauxItem = {
        id: 'travaux-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        monthGroup: item.monthGroup || 'SEPTEMBRE 2026',
        patientId: item.patientId || '',
        patientName: item.patientName || 'Nouveau Patient',
        travailARealiser: item.travailARealiser || 'A FAIRE',
        empr: item.empr || '',
        commentaires1: item.commentaires1 || '',
        travail: item.travail || 'A FAIRE',
        prothesiste: item.prothesiste || 'Sam',
        rdv: item.rdv || '',
        facturation: item.facturation || 'En attente',
        commentaires2: item.commentaires2 || '',
        typeImpress: item.typeImpress || '',
        nbGouttImpr: item.nbGouttImpr || '',
        imprime: item.imprime ?? false,
        thermoform: item.thermoform ?? false,
        createdAt: new Date().toISOString()
    };
    list.unshift(newItem);
    saveLocalTravaux(list);
    return newItem;
};

export const updateTravauxItem = (id: string, updates: Partial<TravauxItem>): TravauxItem | null => {
    const list = getLocalTravaux();
    const idx = list.findIndex(i => i.id === id);
    if (idx !== -1) {
        list[idx] = { ...list[idx], ...updates };
        saveLocalTravaux(list);
        return list[idx];
    }
    return null;
};

export const deleteTravauxItem = (id: string): boolean => {
    const list = getLocalTravaux();
    const filtered = list.filter(i => i.id !== id);
    saveLocalTravaux(filtered);
    return true;
};
