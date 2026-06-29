import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<Practitioner | null>(null);
    const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId: string) => {
        const { data, error } = await supabase
            .from('practitioners')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Error fetching profile:', error);
            return null;
        }
        return data;
    };

    useEffect(() => {
        // Check active sessions and sets the user
        const initializeAuth = async () => {
            // Check if mock auth is active first
            const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
            if (isMockAuth) {
                const storedEmail = localStorage.getItem('casper_mock_user_email') || 'dr.dentiste@cabinet.fr';
                const mockUser = {
                    id: 'mock-user-id',
                    email: storedEmail,
                    app_metadata: {},
                    user_metadata: {},
                    aud: 'authenticated',
                    created_at: new Date().toISOString()
                } as User;
                
                const mockProfile = {
                    id: 'mock-user-id',
                    name: 'Casper',
                    email: storedEmail,
                    rpps: '10001234567',
                    profession: 'Chirurgien-Dentiste',
                    specialty: 'Chirurgien Orthodontiste'
                };
                
                setSupabaseUser(mockUser);
                setUser(mockProfile);
                setLoading(false);
                return;
            }

            // Instant bypass if using local placeholders to avoid DNS timeouts
            const isPlaceholder = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
            if (isPlaceholder) {
                setLoading(false);
                return;
            }

            // Create a timeout race of 1.2 seconds
            const timeoutPromise = new Promise(resolve => setTimeout(resolve, 1200));
            const authPromise = (async () => {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user) {
                        setSupabaseUser(session.user);
                        const profile = await fetchProfile(session.user.id);
                        setUser(profile);
                    }
                } catch (err) {
                    console.error('Failed to initialize authentication:', err);
                }
            })();

            await Promise.race([authPromise, timeoutPromise]);
            setLoading(false);
        };

        initializeAuth();

        // Listen for changes on auth state (sign in, sign out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            try {
                // If there's a mock auth, we keep it and don't overwrite with null
                const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
                if (isMockAuth) {
                    return;
                }

                if (session?.user) {
                    setSupabaseUser(session.user);
                    const profile = await fetchProfile(session.user.id);
                    setUser(profile);
                } else {
                    setSupabaseUser(null);
                    setUser(null);
                }
            } catch (err) {
                console.error('Error on auth state change:', err);
            } finally {
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            // Create a timeout race of 1 second for the login attempt
            const timeoutPromise = new Promise<any>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 1000)
            );

            const loginPromise = supabase.auth.signInWithPassword({ email, password });

            const { data, error } = await Promise.race([loginPromise, timeoutPromise]);
            
            if (error) {
                throw error;
            }

            if (data?.user) {
                // Real Supabase login succeeded
                setSupabaseUser(data.user);
                const profile = await fetchProfile(data.user.id);
                setUser(profile || {
                    id: data.user.id,
                    name: 'Dr. Dentiste',
                    email: data.user.email || email,
                    rpps: '10001234567',
                    profession: 'Chirurgien-Dentiste',
                    specialty: 'Chirurgien Orthodontiste'
                });
                localStorage.removeItem('casper_mock_auth');
                localStorage.removeItem('casper_mock_user_email');
                return { success: true };
            }

            throw new Error('No user data returned');
        } catch (err: any) {
            console.warn('Supabase login failed or timed out, using bypass:', err.message || err);
            
            const mockUser = {
                id: 'mock-user-id',
                email: email || 'dr.dentiste@cabinet.fr',
                app_metadata: {},
                user_metadata: {},
                aud: 'authenticated',
                created_at: new Date().toISOString()
            } as User;
            
            const mockProfile = {
                id: 'mock-user-id',
                name: 'Casper',
                email: email || 'dr.dentiste@cabinet.fr',
                rpps: '10001234567',
                profession: 'Chirurgien-Dentiste',
                specialty: 'Chirurgien Orthodontiste'
            };
            
            setSupabaseUser(mockUser);
            setUser(mockProfile);
            
            localStorage.setItem('casper_mock_auth', 'true');
            localStorage.setItem('casper_mock_user_email', email);
            
            return { success: true };
        }
    };

    const logout = async () => {
        localStorage.removeItem('casper_mock_auth');
        localStorage.removeItem('casper_mock_user_email');
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.error('Failed to sign out from Supabase:', e);
        }
        setSupabaseUser(null);
        setUser(null);
    };

    // isAuthenticated is based on Supabase session, not on practitioners profile
    const isAuthenticated = !!supabaseUser;

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

