import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ============================================================================
// Mise à jour en direct entre les postes du cabinet
// - Temps réel Supabase : un changement sur un poste rafraîchit les autres aussitôt
// - Filet de sécurité : relecture toutes les 30 s (onglet visible) et au retour sur l'onglet
// ============================================================================

export type LiveTable = 'patients' | 'clinical_records' | 'patient_photos' | 'appointments' | 'reglements';
export type LiveReason = 'realtime' | 'poll' | 'focus' | 'local';
type Listener = (tables: Set<LiveTable> | 'all', reason: LiveReason) => void;

const TABLES: LiveTable[] = ['patients', 'clinical_records', 'patient_photos', 'appointments', 'reglements'];
const POLL_MS = 30_000;
const listeners = new Set<Listener>();
let started = false;
let pending = new Set<LiveTable>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const emit = (tables: Set<LiveTable> | 'all', reason: LiveReason) => {
    listeners.forEach(listener => {
        try { listener(tables, reason); } catch (err) { console.warn('Rafraîchissement en direct :', err); }
    });
};

// Plusieurs changements rapprochés (ex. 13 photos) = un seul rafraîchissement
const queue = (table: LiveTable) => {
    pending.add(table);
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
        const tables = pending;
        pending = new Set();
        emit(tables, 'realtime');
    }, 500);
};

const start = () => {
    if (started) return;
    started = true;

    // Même règle que isCloudMode (recordsService) — recopiée pour éviter un import circulaire
    const cloud = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
        && localStorage.getItem('casper_mock_auth') !== 'true';
    if (cloud) {
        try {
            let channel = supabase.channel('orthomind-live');
            TABLES.forEach(table => {
                channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => queue(table));
            });
            channel.subscribe();
        } catch (err) {
            console.warn('Temps réel indisponible, relecture périodique seule :', err);
        }
    }

    setInterval(() => {
        if (document.visibilityState === 'visible') emit('all', 'poll');
    }, POLL_MS);

    let lastFocus = 0;
    const onFocus = () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastFocus < 2000) return;
        lastFocus = Date.now();
        emit('all', 'focus');
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
};

/** À appeler après une modification faite sur ce poste : les autres écrans ouverts se mettent à jour aussitôt */
export const notifyDataChanged = (...tables: LiveTable[]) => {
    emit(tables.length ? new Set(tables) : 'all', 'local');
};

/** Enveloppe une écriture : les écrans ouverts sont prévenus dès qu'elle se termine (même en cas d'échec partiel) */
export const withLiveNotify = <A extends unknown[], R>(write: (...args: A) => Promise<R>, ...tables: LiveTable[]) =>
    async (...args: A): Promise<R> => {
        try {
            return await write(...args);
        } finally {
            notifyDataChanged(...tables);
        }
    };

/**
 * Relance `refresh` dès qu'une des tables change (sur ce poste ou un autre).
 * `poll: false` pour les lectures lourdes : seulement temps réel, retour sur l'onglet et changements locaux.
 */
export const useLiveRefresh = (
    refresh: () => void,
    tables: LiveTable[],
    options: { enabled?: boolean; poll?: boolean } = {}
) => {
    const { enabled = true, poll = true } = options;
    const refreshRef = useRef(refresh);
    refreshRef.current = refresh;
    const key = tables.join(',');

    useEffect(() => {
        if (!enabled) return;
        start();
        const watched = new Set(key.split(',') as LiveTable[]);
        const listener: Listener = (changed, reason) => {
            if (reason === 'poll' && !poll) return;
            if (changed !== 'all' && ![...changed].some(t => watched.has(t))) return;
            refreshRef.current();
        };
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, [key, enabled, poll]);
};
