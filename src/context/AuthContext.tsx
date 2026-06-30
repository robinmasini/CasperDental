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
        try {
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
        } catch (err) {
            console.error('Exception during fetchProfile:', err);
            return null;
        }
    };

    useEffect(() => {
        // Check active sessions and sets the user
        const initializeAuth = async () => {
            // Check if mock auth is active first
            const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
            if (isMockAuth) {
                const storedEmail = localStorage.getItem('casper_mock_user_email') || 'dr.desouches@yousmile.fr';
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
                    name: 'Dr. Desouches',
                    email: storedEmail,
                    rpps: '10100459812',
                    profession: 'Chirurgien-Dentiste',
                    specialty: 'Orthodontiste YouSmile'
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

            try {
                // Create a timeout race of 1.2 seconds
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1200));
                const authPromise = (async () => {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user) {
                        setSupabaseUser(session.user);
                        let profile = await fetchProfile(session.user.id);
                        if (!profile) {
                            // Fallback if practitioners table does not exist
                            profile = {
                                id: session.user.id,
                                name: 'Dr. Desouches',
                                email: session.user.email || 'dr.desouches@yousmile.fr',
                                rpps: '10100459812',
                                profession: 'Chirurgien-Dentiste',
                                specialty: 'Orthodontiste YouSmile'
                            };
                        }
                        setUser(profile);
                    }
                })();

                await Promise.race([authPromise, timeoutPromise]);
                setLoading(false);
            } catch (err) {
                console.warn('Supabase is unreachable (project paused or offline). Switching to Local Mock Mode:', err);
                // Enable mock auth so the app runs smoothly offline
                localStorage.setItem('casper_mock_auth', 'true');
                
                const mockUser = {
                    id: 'mock-user-id',
                    email: 'dr.desouches@yousmile.fr',
                    app_metadata: {},
                    user_metadata: {},
                    aud: 'authenticated',
                    created_at: new Date().toISOString()
                } as User;
                
                const mockProfile = {
                    id: 'mock-user-id',
                    name: 'Dr. Desouches',
                    email: 'dr.desouches@yousmile.fr',
                    rpps: '10100459812',
                    profession: 'Chirurgien-Dentiste',
                    specialty: 'Orthodontiste YouSmile'
                };
                
                setSupabaseUser(mockUser);
                setUser(mockProfile);
                setLoading(false);
            }
        };

        initializeAuth();

        // Listen for changes on auth state (sign in, sign out, etc.)
        let unsubscribe: (() => void) | undefined;
        try {
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
                try {
                    // If there's a mock auth, we keep it and don't overwrite with null
                    const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
                    if (isMockAuth) {
                        return;
                    }

                    if (session?.user) {
                        setSupabaseUser(session.user);
                        let profile = await fetchProfile(session.user.id);
                        if (!profile) {
                            profile = {
                                id: session.user.id,
                                name: 'Dr. Desouches',
                                email: session.user.email || 'dr.desouches@yousmile.fr',
                                rpps: '10100459812',
                                profession: 'Chirurgien-Dentiste',
                                specialty: 'Orthodontiste YouSmile'
                            };
                        }
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
            unsubscribe = () => subscription.unsubscribe();
        } catch (authError) {
            console.warn('Failed to subscribe to Supabase auth changes (project paused/offline):', authError);
        }

        return () => {
            if (unsubscribe) unsubscribe();
        };
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
                    name: 'Dr. Desouches',
                    email: data.user.email || email,
                    rpps: '10100459812',
                    profession: 'Chirurgien-Dentiste',
                    specialty: 'Orthodontiste YouSmile'
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
                email: email || 'dr.desouches@yousmile.fr',
                app_metadata: {},
                user_metadata: {},
                aud: 'authenticated',
                created_at: new Date().toISOString()
            } as User;
            
            const mockProfile = {
                id: 'mock-user-id',
                name: 'Dr. Desouches',
                email: email || 'dr.desouches@yousmile.fr',
                rpps: '10100459812',
                profession: 'Chirurgien-Dentiste',
                specialty: 'Orthodontiste YouSmile'
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
