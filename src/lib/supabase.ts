import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwZ3l2b2pkcmludWJwc3RqZ2hvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxOTY4MDAsImV4cCI6MjA4OTc3MjgwMH0.lX9CRRL5_YrNUdPcyRtXuGt-qGb9Bfu5oLzxiMr58sE';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    console.warn('Casper Dental: Missing Supabase environment variables. Using placeholder client fallbacks.');
}

// Safe client creation wrapper to prevent invalid environment URL strings from crashing script evaluation
let supabaseClient: any;
try {
    // If URL is invalid, createClient will throw an exception
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
} catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    // Create a safe proxy client fallback so calls don't crash
    supabaseClient = new Proxy({}, {
        get: (target, prop) => {
            if (prop === 'auth') {
                return new Proxy({}, {
                    get: (authTarget, authProp) => {
                        if (authProp === 'onAuthStateChange') {
                            return () => ({ data: { subscription: { unsubscribe: () => {} } } });
                        }
                        return () => Promise.resolve({ data: { session: null }, error: null });
                    }
                });
            }
            if (prop === 'storage') {
                return new Proxy({}, {
                    get: (storageTarget, storageProp) => {
                        return () => ({
                            upload: () => Promise.reject(new Error('Supabase Storage offline')),
                            getPublicUrl: () => ({ data: { publicUrl: '' } })
                        });
                    }
                });
            }
            return () => ({
                select: () => ({
                    eq: () => ({
                        single: () => Promise.resolve({ data: null, error: new Error('Supabase offline') }),
                        order: () => Promise.resolve({ data: [], error: new Error('Supabase offline') })
                    }),
                    order: () => Promise.resolve({ data: [], error: new Error('Supabase offline') })
                }),
                insert: () => Promise.resolve({ data: null, error: new Error('Supabase offline') }),
                order: () => Promise.resolve({ data: [], error: new Error('Supabase offline') })
            });
        }
    }) as any;
}

export const supabase = supabaseClient;

// Upload a clinical photo to Supabase storage bucket and return its public URL
export const uploadDentalPhoto = async (userId: string, file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const bucketName = 'dental-photos';

    try {
        // Try uploading directly
        let { data, error } = await supabase.storage.from(bucketName).upload(fileName, file);

        // If bucket does not exist, attempt to create it and retry the upload
        if (error && (error.message?.toLowerCase().includes('not found') || error.message?.toLowerCase().includes('does not exist') || (error as any).status === 404)) {
            console.log(`Supabase storage bucket '${bucketName}' not found. Attempting to create it...`);
            const { error: createError } = await supabase.storage.createBucket(bucketName, {
                public: true,
                fileSizeLimit: 10485760, // 10MB
                allowedMimeTypes: ['image/*']
            });

            if (!createError) {
                const retryUpload = await supabase.storage.from(bucketName).upload(fileName, file);
                data = retryUpload.data;
                error = retryUpload.error;
            } else {
                console.error('Failed to create Supabase storage bucket:', createError);
            }
        }

        if (error) {
            throw error;
        }

        // Get and return the public URL
        const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(fileName);
        return publicUrl;
    } catch (err) {
        console.error('Supabase storage upload error, falling back to base64:', err);
        throw err;
    }
};
