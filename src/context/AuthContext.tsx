import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '../services/recordsService';

interface Practitioner {
    id: string;
    name: string;
    email: string;
    rpps: string;
    profession: string;
    specialty: string;
    photo?: string;
}

interface AuthContextType {
    isAuthenticated: boolean;
    user: Practitioner | null;
    supabaseUser: User | null;
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// Connexion
// ----------------------------------------------------------------------------
// Supabase configuré (production) : connexion réelle obligatoire. Seuls les
// comptes inscrits comme praticiens du cabinet accèdent aux données, et les
// données sont partagées entre tous les appareils.
// Supabase non configuré (développement) : mode démonstration local.
// ============================================================================

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
    ]);

const demoPractitioner = (email: string): Practitioner => ({
    id: 'mock-user-id',
    name: 'Dr. Desouches',
    email,
    rpps: '10100459812',
    profession: 'Chirurgien-Dentiste',
    specialty: 'Orthodontiste YouSmile',
});

const demoUser = (email: string) => ({
    id: 'mock-user-id',
    email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
} as User);

// Profil praticien : sa présence prouve l'appartenance au cabinet (règles d'accès Supabase)
const fetchPractitioner = async (userId: string): Promise<{ profile: Practitioner | null; error?: string }> => {
    try {
        const { data, error } = await withTimeout(
            Promise.resolve(supabase.from('practitioners').select('*').eq('id', userId).maybeSingle()),
            10000,
            'délai dépassé'
        ) as any;
        if (error) return { profile: null, error: error.message };
        return { profile: data || null };
    } catch (err: any) {
        return { profile: null, error: err.message };
    }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<Practitioner | null>(null);
    const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const cloud = isSupabaseConfigured();

    useEffect(() => {
        const initializeAuth = async () => {
            if (!cloud) {
                // Mode démonstration (aucune base configurée)
                if (localStorage.getItem('casper_mock_auth') === 'true') {
                    const email = localStorage.getItem('casper_mock_user_email') || 'dr.desouches@yousmile.fr';
                    setSupabaseUser(demoUser(email));
                    setUser(demoPractitioner(email));
                }
                setLoading(false);
                return;
            }

            // Production : l'ancien mode démo local n'est plus accepté
            localStorage.removeItem('casper_mock_auth');
            localStorage.removeItem('casper_mock_user_email');

            try {
                const { data: { session } } = await withTimeout<any>(supabase.auth.getSession(), 10000, 'délai dépassé');
                if (session?.user) {
                    const { profile } = await fetchPractitioner(session.user.id);
                    if (profile) {
                        setSupabaseUser(session.user);
                        setUser(profile);
                    } else {
                        // Session d'un compte non inscrit au cabinet : on la ferme
                        await supabase.auth.signOut();
                    }
                }
            } catch (err) {
                console.warn('Session Supabase indisponible :', err);
            } finally {
                setLoading(false);
            }
        };

        initializeAuth();

        if (!cloud) return;
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
            if (event === 'SIGNED_OUT' || !session?.user) {
                setSupabaseUser(null);
                setUser(null);
            }
        });
        return () => subscription.unsubscribe();
    }, [cloud]);

    const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
        if (!cloud) {
            // Mode démonstration local
            setSupabaseUser(demoUser(email));
            setUser(demoPractitioner(email));
            localStorage.setItem('casper_mock_auth', 'true');
            localStorage.setItem('casper_mock_user_email', email);
            return { success: true };
        }

        try {
            const { data, error } = await withTimeout<any>(
                supabase.auth.signInWithPassword({ email, password }),
                15000,
                'Le serveur ne répond pas'
            );
            if (error) {
                return {
                    success: false,
                    error: /invalid login credentials/i.test(error.message)
                        ? 'E-mail ou mot de passe incorrect.'
                        : `Connexion impossible : ${error.message}`,
                };
            }
            if (!data?.user) return { success: false, error: 'Connexion impossible.' };

            const { profile, error: profileError } = await fetchPractitioner(data.user.id);
            if (!profile) {
                await supabase.auth.signOut();
                return {
                    success: false,
                    error: profileError
                        ? `Accès au cabinet impossible (${profileError}). Le script de synchronisation Supabase a-t-il été exécuté ?`
                        : "Ce compte n'est pas inscrit comme praticien du cabinet. Ajoutez-le dans la table « practitioners » de Supabase.",
                };
            }

            setSupabaseUser(data.user);
            setUser(profile);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: `Connexion impossible : ${err.message}. Vérifiez votre connexion internet.` };
        }
    };

    const logout = async () => {
        localStorage.removeItem('casper_mock_auth');
        localStorage.removeItem('casper_mock_user_email');
        if (cloud) {
            try {
                await supabase.auth.signOut();
            } catch (e) {
                console.error('Failed to sign out from Supabase:', e);
            }
        }
        setSupabaseUser(null);
        setUser(null);
    };

    const isAuthenticated = !!supabaseUser && !!user;

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, supabaseUser, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export type { Practitioner };
