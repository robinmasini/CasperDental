import { supabase } from '../lib/supabase';
import { isCloudMode } from './recordsService';
import { setCabinetGeminiKey, testGeminiKey } from './geminiService';

// ============================================================================
// Réglages partagés du cabinet (table cabinet_settings, réservée aux praticiens)
// La clé Gemini y est enregistrée une fois pour tous les appareils.
// ============================================================================

const GEMINI_KEY = 'gemini_api_key';
const LOCAL_KEY_NAMES = ['casper_gemini_api_key', 'orthomind_gemini_api_key'];

/** Charge la clé du cabinet ; à appeler après la connexion d'un praticien */
export const loadCabinetSettings = async (): Promise<void> => {
    if (!isCloudMode()) return;
    try {
        const { data, error } = await supabase
            .from('cabinet_settings')
            .select('value')
            .eq('key', GEMINI_KEY)
            .maybeSingle();
        if (error) {
            console.warn('Réglages du cabinet indisponibles :', error.message);
            return;
        }
        setCabinetGeminiKey(data?.value || null);

        // Première fois : la clé déjà saisie sur cet appareil devient celle du cabinet
        if (!data?.value) {
            const localKey = LOCAL_KEY_NAMES.map(k => localStorage.getItem(k)).find(Boolean);
            if (localKey) {
                const check = await testGeminiKey(localKey);
                if (check.ok) await saveCabinetGeminiKey(localKey);
            }
        }
    } catch (e) {
        console.warn('Réglages du cabinet indisponibles :', e);
    }
};

/** Enregistre la clé pour tout le cabinet (tous les praticiens, tous les appareils) */
export const saveCabinetGeminiKey = async (key: string): Promise<void> => {
    const { error } = await supabase
        .from('cabinet_settings')
        .upsert({ key: GEMINI_KEY, value: key.trim(), updated_at: new Date().toISOString() });
    if (error) throw new Error(`Enregistrement de la clé pour le cabinet impossible : ${error.message}`);
    setCabinetGeminiKey(key);
};

export const clearCabinetGeminiKey = async (): Promise<void> => {
    const { error } = await supabase.from('cabinet_settings').delete().eq('key', GEMINI_KEY);
    if (error) throw new Error(`Suppression de la clé impossible : ${error.message}`);
    setCabinetGeminiKey(null);
};
