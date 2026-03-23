import { supabase } from './supabaseClient';

export interface ConnectivityResult {
    isOnline: boolean;
    isApiReachable: boolean;
    error?: string;
}

export const checkConnectivity = async (): Promise<ConnectivityResult> => {
    const isOnline = navigator.onLine;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    if (!isOnline) {
        return { isOnline: false, isApiReachable: false, error: 'Network is offline' };
    }

    try {
        // Simple health check or ping to the Supabase host
        const response = await fetch(supabaseUrl, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache'
        });
        return { isOnline: true, isApiReachable: true };
    } catch (err) {
        return {
            isOnline: true,
            isApiReachable: false,
            error: err instanceof Error ? err.message : String(err)
        };
    }
};
