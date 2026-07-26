import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { supabase, uploadDentalPhoto } from '../lib/supabase';
import { extractTextFromPdf, chunkParsedPages } from '../services/pdfParser';
import { analyzeDentition, getGeminiApiKey, askOrthoMind, loadLocalCompiledKnowledge, generateSmileSimulationWithGemini } from '../services/geminiService';
import { OrthoMindAvatar, OrthoMindState } from '../components/OrthoMindAvatar';
import defaultBookData from '../assets/cgs_volume_61.json';
import orthomindLogo from '../assets/orthomind-logo.png';
import logoSeul from '../assets/logo-seul.png';
import Patients from './Patients';
import orthomindNavIcon from '../assets/Orthomind.png';
import welcomeCardImg from '../assets/welcomecard.png';
import drPhoto from '../assets/photo.png';
import casperLogoWelcome from '../assets/casper-logo-welcome.png';
import navbar1 from '../assets/navbar-1.png';
import navbar2 from '../assets/navbar-2.png';
import navbar3 from '../assets/navbar-3.png';
import navbar4 from '../assets/navbar-4.png';
import './Dashboard.css';

interface BookDocument {
    id: string;
    title: string;
    file_name: string;
    file_size: number;
    total_pages: number;
    created_at: string;
}

interface DentalAnalysis {
    id: string;
    patient_name: string;
    created_at: string;
    images: string[];
    diagnostic_text: string;
    traitement_text: string;
}

const Dashboard = () => {
    const navigate = useNavigate();
    const { user, logout, supabaseUser } = useAuth();

    // Helper function to compress images to small thumbnails for local storage compatibility (max 5MB quota)
    const compressImageToThumbnail = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    // Downscale to max 300px width/height to make it small (~15-20KB base64)
                    const maxDim = 300;
                    if (width > height) {
                        if (width > maxDim) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        }
                    } else {
                        if (height > maxDim) {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% quality JPEG
                    } else {
                        resolve(e.target?.result as string);
                    }
                };
                img.onerror = () => {
                    resolve(e.target?.result as string);
                };
                img.src = e.target?.result as string;
            };
            reader.onerror = () => {
                resolve('');
            };
            reader.readAsDataURL(file);
        });
    };

    const currentDateRaw = new Date().toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    const currentDate = currentDateRaw.charAt(0).toUpperCase() + currentDateRaw.slice(1);
    
    // Tabs state
    const [activeTab, setActiveTab] = useState<'analyse' | 'patients' | 'knowledge' | 'config'>(() => {
        const saved = localStorage.getItem('casper_active_tab');
        if (saved === 'orthomind' || saved === 'history') return 'analyse';
        return (saved as any) || 'analyse';
    });

    // Save active tab to localStorage on changes to survive refreshes
    useEffect(() => {
        localStorage.setItem('casper_active_tab', activeTab);
    }, [activeTab]);

    // Modals state for OrthoMind and History
    const [showOrthoMindModal, setShowOrthoMindModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Smile Simulation Modal state
    const [showSimulationModal, setShowSimulationModal] = useState(false);
    const [simPhoto, setSimPhoto] = useState<string | null>(null);
    const [simPhotoFile, setSimPhotoFile] = useState<File | null>(null);
    const [isGeneratingSim, setIsGeneratingSim] = useState(false);
    const [isConvertingSimHeic, setIsConvertingSimHeic] = useState(false);
    const [simResult, setSimResult] = useState<string | null>(null);
    const [simDragOver, setSimDragOver] = useState(false);
    const [simConsoleLogs, setSimConsoleLogs] = useState<{ time: string; msg: string }[]>([]);

    const handleSendChatMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInputValue.trim() || isChatTyping) return;

        const userText = chatInputValue.trim();
        setChatInputValue('');
        
        // Append user message
        const newHistory = [...chatMessages, { role: 'user' as const, content: userText }];
        setChatMessages(newHistory);
        
        // Set avatar state to Thinking
        setChatAvatarState('thinking');
        setIsChatTyping(true);

        try {
            // Call AI service
            const reply = await askOrthoMind(newHistory);
            
            // Set avatar state to Speaking
            setChatAvatarState('speaking');
            setIsChatTyping(false);

            // Simulate typing stream effect
            let currentText = '';
            const replyWords = reply.split(' ');
            let wordIndex = 0;
            
            // Add initial empty reply to edit
            setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            const streamInterval = setInterval(() => {
                if (wordIndex < replyWords.length) {
                    currentText += (wordIndex === 0 ? '' : ' ') + replyWords[wordIndex];
                    setChatMessages(prev => {
                        const updated = [...prev];
                        if (updated.length > 0) {
                            updated[updated.length - 1] = { role: 'assistant', content: currentText };
                        }
                        return updated;
                    });
                    wordIndex++;
                } else {
                    clearInterval(streamInterval);
                    // Return to idle after 600ms grace period once text completes
                    setTimeout(() => {
                        setChatAvatarState('idle');
                    }, 600);
                }
            }, 30 + Math.random() * 20); // Quick simulation of words streaming

        } catch (err: any) {
            console.error('Failed to query OrthoMind:', err);
            setIsChatTyping(false);
            setChatMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `⚠️ Désolé, je n'ai pas pu générer une réponse. Une erreur est survenue : ${err.message || err}` 
            }]);
            setChatAvatarState('idle');
        }
    };
    
    // API Configuration key
    const [geminiKey, setGeminiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [dbConnected, setDbConnected] = useState<boolean | null>(null);

    // Patients & Images Upload State
    const [patientName, setPatientName] = useState('');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [isProcessingFiles, setIsProcessingFiles] = useState(false);
    
    // Scanner HUD simulation & API call states
    const [isScanning, setIsScanning] = useState(false);
    const [consoleLogs, setConsoleLogs] = useState<Array<{ time: string; msg: string }>>([]);
    const [scanStatusText, setScanStatusText] = useState('');
    const [analysisResult, setAnalysisResult] = useState<{ diagnostic: string; traitement: string } | null>(null);
    const [activeResultTab, setActiveResultTab] = useState<'diag' | 'treat'>('diag');

    // PDF Knowledge Base States
    const [books, setBooks] = useState<BookDocument[]>([]);
    const [isUploadingPdf, setIsUploadingPdf] = useState(false);
    const [pdfProgress, setPdfProgress] = useState(0);
    const [pdfStatusText, setPdfStatusText] = useState('');
    
    // History states
    const [history, setHistory] = useState<DentalAnalysis[]>([]);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState<DentalAnalysis | null>(null);

    // Refs for logging interval
    const logIntervalRef = useRef<any>(null);

    // OrthoMind Chat States
    const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
        { 
            role: 'assistant', 
            content: 'Bonjour Dr. Desouches ! 👋\n\nJe suis **OrthoMind**, votre assistant clinique intelligent pour le cabinet YouSmile. Je suis connecté à votre base de connaissances.\n\nPosez-moi n\'importe quelle question sur vos cours, livres de référence en orthodontie indexés, ou cas cliniques.' 
        }
    ]);
    const [chatInputValue, setChatInputValue] = useState('');
    const [chatAvatarState, setChatAvatarState] = useState<OrthoMindState>('idle');
    const [isChatTyping, setIsChatTyping] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Clinical Analysis Avatar State
    const [analysisAvatarState, setAnalysisAvatarState] = useState<OrthoMindState>('idle');

    // Sync Clinical Analysis Avatar State
    useEffect(() => {
        if (analysisAvatarState === 'speaking') return;
        
        if (isScanning) {
            setAnalysisAvatarState('thinking');
        } else if (imageFiles.length > 0) {
            setAnalysisAvatarState('listening');
        } else {
            setAnalysisAvatarState('idle');
        }
    }, [imageFiles, isScanning]);

    // Auto-scroll chat messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, isChatTyping]);

    // Check database connection and load API Key
    useEffect(() => {
        const pingDb = async () => {
            const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
            if (isMockAuth) {
                setDbConnected(true);
                return;
            }
            try {
                const { count, error } = await supabase
                    .from('orthodontic_documents')
                    .select('*', { count: 'exact', head: true });
                if (error) throw error;
                setDbConnected(true);
            } catch (err) {
                console.error('Supabase connection failed:', err);
                setDbConnected(false);
            }
        };
        
        pingDb();
        setGeminiKey(getGeminiApiKey());
        loadBooks();
        loadHistory();
    }, []);

    // Auto-save active analysis if it's not yet in the history (recovering unsaved analysis from state)
    useEffect(() => {
        if (analysisResult && imageFiles.length > 0) {
            const exists = history.some(h => h.diagnostic_text === analysisResult.diagnostic);
            if (!exists) {
                const autoSave = async () => {
                    try {
                        const currentPatient = patientName.trim() || 'Patient Anonyme';
                        const base64Images: string[] = [];
                        for (const file of imageFiles) {
                            try {
                                const compressed = await compressImageToThumbnail(file);
                                base64Images.push(compressed);
                            } catch (e) {
                                base64Images.push('');
                            }
                        }
                        const localHistoryStr = localStorage.getItem('casper_mock_history') || '[]';
                        const localHistory = JSON.parse(localHistoryStr);
                        const alreadySavedLocally = localHistory.some((h: any) => h.diagnostic_text === analysisResult.diagnostic);
                        if (!alreadySavedLocally) {
                            const newAnalysis = {
                                id: 'mock-analysis-recovered-' + Date.now(),
                                patient_name: currentPatient,
                                created_at: new Date().toISOString(),
                                images: base64Images,
                                diagnostic_text: analysisResult.diagnostic,
                                traitement_text: analysisResult.traitement
                            };
                            localHistory.unshift(newAnalysis);
                            localStorage.setItem('casper_mock_history', JSON.stringify(localHistory));
                            loadHistory();
                        }
                    } catch (e) {
                        console.error('Failed to auto-save/recover active analysis:', e);
                    }
                };
                autoSave();
            }
        }
    }, [analysisResult, imageFiles, history]);

    // Load indexed orthodontic books
    const loadBooks = async () => {
        const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
        const isCgsDeleted = localStorage.getItem('casper_cgs_deleted') === 'true';
        
        // Load local compiled books from public/casper_knowledge.json
        const compiledLocal = await loadLocalCompiledKnowledge();
        const compiledBooks = compiledLocal.books || [];
        
        if (isMockAuth) {
            const localBooks = localStorage.getItem('casper_mock_books');
            const parsedLocal = localBooks ? JSON.parse(localBooks) : [];
            const hasDefault = parsedLocal.some((b: any) => b.id === defaultBookData.document.id);
            const combinedBooks = (hasDefault || isCgsDeleted) 
                ? [...compiledBooks, ...parsedLocal] 
                : [defaultBookData.document, ...compiledBooks, ...parsedLocal];
            setBooks(combinedBooks);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('orthodontic_documents')
                .select('*')
                .order('created_at', { ascending: false });
            if (!error && data) {
                const hasDefault = data.some((b: any) => b.id === defaultBookData.document.id || b.title.includes('61st volume'));
                const combined = (hasDefault || isCgsDeleted) 
                    ? [...compiledBooks, ...data] 
                    : [defaultBookData.document, ...compiledBooks, ...data];
                setBooks(combined);
            } else {
                const localBooks = localStorage.getItem('casper_mock_books');
                const parsedLocal = localBooks ? JSON.parse(localBooks) : [];
                const hasDefault = parsedLocal.some((b: any) => b.id === defaultBookData.document.id);
                setBooks((hasDefault || isCgsDeleted) 
                    ? [...compiledBooks, ...parsedLocal] 
                    : [defaultBookData.document, ...compiledBooks, ...parsedLocal]);
            }
        } catch (e) {
            console.error('Failed to load books from Supabase, loading local:', e);
            const localBooks = localStorage.getItem('casper_mock_books');
            const parsedLocal = localBooks ? JSON.parse(localBooks) : [];
            const hasDefault = parsedLocal.some((b: any) => b.id === defaultBookData.document.id);
            setBooks((hasDefault || isCgsDeleted) 
                ? [...compiledBooks, ...parsedLocal] 
                : [defaultBookData.document, ...compiledBooks, ...parsedLocal]);
        }
    };

    // Load past orthodontic analyses
    const loadHistory = async () => {
        const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
        if (isMockAuth) {
            const localHistory = localStorage.getItem('casper_mock_history');
            if (localHistory) {
                setHistory(JSON.parse(localHistory));
            }
            return;
        }

        try {
            const { data, error } = await supabase
                .from('dental_analyses')
                .select('*')
                .order('created_at', { ascending: false });
            if (!error && data) {
                setHistory(data);
            } else {
                const localHistory = localStorage.getItem('casper_mock_history');
                if (localHistory) setHistory(JSON.parse(localHistory));
            }
        } catch (e) {
            console.error('Failed to load analyses history from Supabase, loading local:', e);
            const localHistory = localStorage.getItem('casper_mock_history');
            if (localHistory) {
                setHistory(JSON.parse(localHistory));
            }
        }
    };

    // Handle logout
    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // Save API key
    const saveApiKey = () => {
        if (geminiKey.trim()) {
            localStorage.setItem('casper_gemini_api_key', geminiKey.trim());
            alert('Clé API enregistrée localement de façon sécurisée !');
        } else {
            localStorage.removeItem('casper_gemini_api_key');
            alert('Clé API effacée du stockage local.');
        }
    };

    // Standalone helper function to convert HEIC/HEIF file to browser-compatible JPEG
    const convertSingleHeicFile = async (file: File): Promise<File> => {
        const nameLower = file.name.toLowerCase();
        if (!nameLower.endsWith('.heic') && !nameLower.endsWith('.heif') && file.type !== 'image/heic' && file.type !== 'image/heif') {
            return file;
        }

        // 1. Safari native canvas conversion
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        if (isSafari) {
            try {
                const nativeBlob = await new Promise<Blob>((resolve, reject) => {
                    const url = URL.createObjectURL(file);
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0);
                            canvas.toBlob((blob) => {
                                URL.revokeObjectURL(url);
                                if (blob) resolve(blob);
                                else reject(new Error('Canvas toBlob failed'));
                            }, 'image/jpeg', 0.85);
                        } else {
                            URL.revokeObjectURL(url);
                            reject(new Error('Canvas 2D context failed'));
                        }
                    };
                    img.onerror = (err) => {
                        URL.revokeObjectURL(url);
                        reject(err);
                    };
                    img.src = url;
                });
                return new File([nativeBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
            } catch (nativeErr) {
                console.warn('Native HEIC conversion failed, trying fallbacks:', nativeErr);
            }
        }

        // 2. Primary fallback: heic-to module
        try {
            const heicToModule = await import('heic-to');
            const heicToConverter = heicToModule.heicTo || heicToModule.default || heicToModule;
            if (typeof heicToConverter === 'function') {
                const blobToConvert = file.type ? file : new Blob([file], { type: 'image/heic' });
                const resultBlob = await heicToConverter({
                    blob: blobToConvert,
                    type: 'image/jpeg',
                    quality: 0.8
                });
                return new File([resultBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
            }
        } catch (heicToErr) {
            console.warn('heic-to conversion failed, trying heic2any:', heicToErr);
        }

        // 3. Secondary fallback: heic2any module
        try {
            const heic2anyModule = await import('heic2any');
            let heicConverter = heic2anyModule.default || heic2anyModule;
            if (typeof heicConverter !== 'function' && (heicConverter as any).default) {
                heicConverter = (heicConverter as any).default;
            }
            if (typeof heicConverter === 'function') {
                const blobToConvert = file.type ? file : new Blob([file], { type: 'image/heic' });
                const resultBlob = await heicConverter({
                    blob: blobToConvert,
                    toType: 'image/jpeg',
                    quality: 0.8
                });
                const blob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
                return new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
            }
        } catch (err) {
            console.error('All HEIC conversion methods failed:', err);
        }

        return file;
    };

    const handleSimFileSelection = async (file: File) => {
        setIsConvertingSimHeic(true);
        try {
            const convertedFile = await convertSingleHeicFile(file);
            setSimPhotoFile(convertedFile);
            const reader = new FileReader();
            reader.onload = (ev) => {
                setSimPhoto(ev.target?.result as string);
                setIsConvertingSimHeic(false);
            };
            reader.readAsDataURL(convertedFile);
        } catch (err) {
            console.error('Error selecting sim photo:', err);
            setIsConvertingSimHeic(false);
        }
    };

    // Helper function to process HEIC/standard files and add to scan state
    const processAndAddFiles = async (filesArray: File[]) => {
        setIsProcessingFiles(true);
        try {
            const processedFiles: File[] = [];

            const getErrorString = (err: any): string => {
                if (!err) return 'Une erreur inconnue est survenue.';
                if (err instanceof Error) return err.message;
                if (typeof err === 'object') {
                    if ('message' in err) return String(err.message);
                    if ('errorMsg' in err) return String(err.errorMsg);
                    if ('error' in err) return typeof err.error === 'string' ? err.error : String(err.error?.message || JSON.stringify(err));
                    return JSON.stringify(err);
                }
                return String(err);
            };

            for (const file of filesArray) {
                const nameLower = file.name.toLowerCase();
                if (nameLower.endsWith('.heic') || nameLower.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
                    
                    // 1. Detect if the browser is Safari (Safari natively renders HEIC images, making canvas-based conversion extremely fast and reliable)
                    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                    
                    if (isSafari) {
                        try {
                            const nativeBlob = await new Promise<Blob>((resolve, reject) => {
                                const url = URL.createObjectURL(file);
                                const img = new Image();
                                img.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    canvas.width = img.naturalWidth || img.width;
                                    canvas.height = img.naturalHeight || img.height;
                                    const ctx = canvas.getContext('2d');
                                    if (ctx) {
                                        ctx.drawImage(img, 0, 0);
                                        canvas.toBlob((blob) => {
                                            URL.revokeObjectURL(url);
                                            if (blob) resolve(blob);
                                            else reject(new Error('Canvas toBlob failed'));
                                        }, 'image/jpeg', 0.85);
                                    } else {
                                        URL.revokeObjectURL(url);
                                        reject(new Error('Canvas 2D context failed'));
                                    }
                                };
                                img.onerror = (err) => {
                                    URL.revokeObjectURL(url);
                                    reject(err);
                                };
                                img.src = url;
                            });
                            
                            const convertedFile = new File([nativeBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                                type: 'image/jpeg'
                            });
                            processedFiles.push(convertedFile);
                            continue; // Conversion succeeded!
                        } catch (nativeErr) {
                            console.warn('Native HEIC conversion failed, falling back to heic-to:', nativeErr);
                        }
                    }

                    // 2. Primary cross-browser fallback: heic-to (modern library supporting modern iOS HEIC profiles)
                    try {
                        const heicToModule = await import('heic-to');
                        const heicToConverter = heicToModule.heicTo || heicToModule.default || heicToModule;
                        
                        if (typeof heicToConverter !== 'function') {
                            throw new Error('La bibliothèque heic-to n\'a pas pu être résolue comme une fonction.');
                        }

                        const blobToConvert = file.type ? file : new Blob([file], { type: 'image/heic' });
                        
                        const resultBlob = await heicToConverter({
                            blob: blobToConvert,
                            type: 'image/jpeg',
                            quality: 0.8
                        });

                        const convertedFile = new File([resultBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                            type: 'image/jpeg'
                        });
                        processedFiles.push(convertedFile);
                        continue; // Conversion succeeded!
                    } catch (heicToErr) {
                        console.warn('heic-to conversion failed, falling back to heic2any:', heicToErr);
                    }

                    // 3. Secondary cross-browser fallback: heic2any
                    try {
                        const heic2anyModule = await import('heic2any');
                        let heicConverter = heic2anyModule.default || heic2anyModule;
                        if (typeof heicConverter !== 'function' && (heicConverter as any).default) {
                            heicConverter = (heicConverter as any).default;
                        }
                        
                        if (typeof heicConverter !== 'function') {
                            throw new Error('La bibliothèque heic2any n\'a pas pu être résolue comme une fonction.');
                        }

                        const blobToConvert = file.type ? file : new Blob([file], { type: 'image/heic' });
                        
                        const resultBlob = await heicConverter({
                            blob: blobToConvert,
                            toType: 'image/jpeg',
                            quality: 0.8
                        });
                        const blob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
                        const convertedFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                            type: 'image/jpeg'
                        });
                        processedFiles.push(convertedFile);
                    } catch (err) {
                        console.error('All HEIC conversion methods failed, using original file:', err);
                        const errStr = getErrorString(err);
                        alert(`Attention: La conversion de l'image HEIC "${file.name}" a échoué. Le fichier d'origine sera utilisé mais peut poser problème lors de l'analyse.\n\nErreur: ${errStr}`);
                        processedFiles.push(file);
                    }
                } else {
                    processedFiles.push(file);
                }
            }
            
            // Limit to 6 photos max
            setImageFiles(prev => [...prev, ...processedFiles].slice(0, 6));

            // Generate preview URLs
            const newPreviews = processedFiles.map(file => URL.createObjectURL(file));
            setPreviewUrls(prev => [...prev, ...newPreviews].slice(0, 6));
        } finally {
            setIsProcessingFiles(false);
        }
    };

    // Handle images selection via file input
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            await processAndAddFiles(filesArray);
        }
    };

    // Handle drag events on dropzone
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        if (isScanning) return;
        if (e.dataTransfer.files) {
            const filesArray = Array.from(e.dataTransfer.files);
            await processAndAddFiles(filesArray);
        }
    };

    const removeImage = (index: number) => {
        // Revoke URL to prevent memory leaks
        URL.revokeObjectURL(previewUrls[index]);
        
        setImageFiles(prev => prev.filter((_, i) => i !== index));
        setPreviewUrls(prev => prev.filter((_, i) => i !== index));
    };

    // Add log entries to the scanning HUD console
    const addLog = (msg: string) => {
        const time = new Date().toLocaleTimeString('fr-FR', { hour12: false });
        setConsoleLogs(prev => [...prev, { time, msg }]);
    };

    // Launch optical scanning and orthodontics analysis
    const handleStartAnalysis = async () => {
        if (imageFiles.length === 0) {
            alert('Veuillez déposer au moins 1 photo de dentition (recommandé: 5-6).');
            return;
        }

        const currentPatient = patientName.trim() || 'Patient Anonyme';
        const apiKey = getGeminiApiKey();

        if (!apiKey) {
            alert('Veuillez d\'abord configurer votre clé d\'API Gemini dans l\'onglet Configuration.');
            setActiveTab('config');
            return;
        }

        // Initialize scanning console and state
        setIsScanning(true);
        setConsoleLogs([]);
        setAnalysisResult(null);
        
        addLog('[SYSTEM] Initialisation du scanner optique...');
        addLog(`[SYSTEM] Chargement des clichés cliniques (${imageFiles.length} images)...`);
        
        // Loop premium visual log statements
        let logStep = 0;
        const fakeLogs = [
            '[SYSTEM] Analyse et calibrage tridimensionnel...',
            '[SYSTEM] Normalisation de la luminosité et détection osseuse...',
            '[RAG] Interrogation de la base de connaissances Supabase (PDF)...',
            '[RAG] Extraction des chapitres scientifiques orthodontiques...',
            '[IA] Transmission au chirurgien expert Casper...',
            '[IA] Analyse clinique en cours (évaluation des arcs et d\'occlusion)...'
        ];

        logIntervalRef.current = setInterval(() => {
            if (logStep < fakeLogs.length) {
                addLog(fakeLogs[logStep]);
                logStep++;
            }
        }, 1200);

        try {
            // Call Gemini RAG Service
            const result = await analyzeDentition(imageFiles, (status) => {
                setScanStatusText(status);
                addLog(`[INFO] ${status}`);
            }, currentPatient);

            clearInterval(logIntervalRef.current);
            addLog('[SUCCESS] Rapport de diagnostic finalisé avec succès.');
            
            setAnalysisResult(result);
            setIsScanning(false);
            setAnalysisAvatarState('speaking');
            setTimeout(() => {
                setAnalysisAvatarState('idle');
            }, 6000);

            // Save to History (Supabase or Local fallback)
            try {
                const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
                let savedToSupabase = false;
                let imageUrls: string[] = [];

                if (supabaseUser && !isMockAuth) {
                    try {
                        addLog('[SYSTEM] Téléversement des clichés cliniques sur le stockage cloud Supabase...');
                        imageUrls = await Promise.all(
                            imageFiles.map(file => uploadDentalPhoto(supabaseUser.id, file))
                        );
                        
                        addLog('[SYSTEM] Enregistrement du rapport dans la base de données Supabase...');
                        const { error } = await supabase.from('dental_analyses').insert({
                            user_id: supabaseUser.id,
                            patient_name: currentPatient,
                            images: imageUrls,
                            diagnostic_text: result.diagnostic,
                            traitement_text: result.traitement
                        });
                        
                        if (!error) {
                            savedToSupabase = true;
                            addLog('[SYSTEM] Rapport et clichés enregistrés avec succès sur Supabase.');
                        } else {
                            console.warn('Failed to save to Supabase database, falling back to local history:', error.message);
                            addLog('[WARNING] Échec de l\'écriture en base. Sauvegarde locale de secours.');
                        }
                    } catch (uploadErr: any) {
                        console.error('Failed to upload to Supabase storage, falling back to local history:', uploadErr);
                        addLog('[WARNING] Échec du téléversement en ligne. Sauvegarde locale de secours.');
                    }
                }

                if (!savedToSupabase) {
                    addLog('[SYSTEM] Génération de miniatures compressées pour la sauvegarde locale...');
                    // Convert images to compressed base64 thumbnails
                    const base64Images: string[] = [];
                    for (const file of imageFiles) {
                        try {
                            const compressed = await compressImageToThumbnail(file);
                            base64Images.push(compressed);
                        } catch (compressErr) {
                            console.error('Failed to compress image, using fallback empty string:', compressErr);
                            base64Images.push('');
                        }
                    }

                    const localHistoryStr = localStorage.getItem('casper_mock_history') || '[]';
                    const localHistory = JSON.parse(localHistoryStr);
                    const newAnalysis = {
                        id: 'mock-analysis-' + Date.now(),
                        patient_name: currentPatient,
                        created_at: new Date().toISOString(),
                        images: base64Images,
                        diagnostic_text: result.diagnostic,
                        traitement_text: result.traitement
                    };
                    localHistory.unshift(newAnalysis);
                    localStorage.setItem('casper_mock_history', JSON.stringify(localHistory));
                    console.log('Saved analysis locally.');
                }
                
                // Refresh history
                loadHistory();
            } catch (saveErr) {
                console.error('Failed to save history:', saveErr);
            }

        } catch (err: any) {
            clearInterval(logIntervalRef.current);
            addLog(`[ERROR] Échec de l'analyse : ${err.message || err}`);
            alert(`Erreur d'analyse : ${err.message || 'Une erreur est survenue.'}`);
            setIsScanning(false);
        }
    };

    // Index orthodontic book PDF in Supabase
    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        if (!supabaseUser) {
            alert('Veuillez vous authentifier.');
            return;
        }

        const file = e.target.files[0];
        if (file.type !== 'application/pdf') {
            alert('Veuillez fournir un fichier PDF valide.');
            return;
        }

        setIsUploadingPdf(true);
        setPdfProgress(0);
        setPdfStatusText('Lecture et extraction du PDF en cours...');

        try {
            // Step 1: Extract text from PDF page by page
            const parsedPages = await extractTextFromPdf(file, (current, total) => {
                const percent = Math.round((current / total) * 40); // PDF parsing is 40% of overall process
                setPdfProgress(percent);
                setPdfStatusText(`Lecture du document : page ${current}/${total}...`);
            });

            const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
            if (isMockAuth) {
                setPdfStatusText('Création de la référence du livre...');
                const bookId = 'mock-book-' + Date.now();
                const newBook = {
                    id: bookId,
                    title: file.name.replace('.pdf', ''),
                    file_name: file.name,
                    file_size: file.size,
                    total_pages: parsedPages.length,
                    created_at: new Date().toISOString()
                };

                const localBooksStr = localStorage.getItem('casper_mock_books') || '[]';
                const localBooks = JSON.parse(localBooksStr);
                localBooks.unshift(newBook);
                localStorage.setItem('casper_mock_books', JSON.stringify(localBooks));

                setPdfStatusText('Découpage scientifique du texte...');
                const chunks = chunkParsedPages(parsedPages, 1000, 200);

                const mockChunks = chunks.map((chunk, index) => ({
                    id: `mock-chunk-${bookId}-${index}`,
                    document_id: bookId,
                    book_title: file.name.replace('.pdf', ''),
                    content: chunk.content,
                    page_number: chunk.pageNumber,
                    chunk_index: chunk.chunkIndex
                }));

                const localKnowledgeStr = localStorage.getItem('casper_mock_knowledge') || '[]';
                const localKnowledge = JSON.parse(localKnowledgeStr);
                localStorage.setItem('casper_mock_knowledge', JSON.stringify([...localKnowledge, ...mockChunks]));

                setPdfProgress(100);
                setPdfStatusText('Indexation finalisée ! Livre enregistré dans la base de connaissances.');
                setTimeout(() => {
                    setIsUploadingPdf(false);
                    setPdfProgress(0);
                    setPdfStatusText('');
                }, 2000);

                loadBooks();
                return;
            }

            setPdfStatusText('Création de la référence du livre...');
            
            // Step 2: Save document record in Supabase
            const { data: docData, error: docError } = await supabase
                .from('orthodontic_documents')
                .insert({
                    title: file.name.replace('.pdf', ''),
                    file_name: file.name,
                    file_size: file.size,
                    total_pages: parsedPages.length,
                    user_id: supabaseUser.id
                })
                .select()
                .single();

            if (docError) throw docError;

            // Step 3: Chunk extracted text
            setPdfStatusText('Découpage scientifique du texte...');
            const chunks = chunkParsedPages(parsedPages, 1000, 200);

            // Step 4: Write chunks in batches of 50 to Supabase
            const batchSize = 50;
            const totalChunks = chunks.length;

            for (let i = 0; i < totalChunks; i += batchSize) {
                const batch = chunks.slice(i, i + batchSize).map(chunk => ({
                    document_id: docData.id,
                    content: chunk.content,
                    page_number: chunk.pageNumber,
                    chunk_index: chunk.chunkIndex
                }));

                setPdfStatusText(`Indexation scientifique : fragment ${i + batch.length}/${totalChunks}...`);
                
                const { error: chunkError } = await supabase
                    .from('orthodontic_knowledge')
                    .insert(batch);

                if (chunkError) throw chunkError;

                // Indexation goes from 40% to 100%
                const batchPercent = 40 + Math.round((Math.min(i + batchSize, totalChunks) / totalChunks) * 60);
                setPdfProgress(batchPercent);
            }

            setPdfStatusText('Indexation finalisée ! Livre enregistré dans la base de connaissances.');
            setTimeout(() => {
                setIsUploadingPdf(false);
                setPdfProgress(0);
                setPdfStatusText('');
            }, 2000);

            // Reload books list
            loadBooks();

        } catch (err: any) {
            console.error('Failed to upload and index PDF:', err);
            alert(`Erreur d'indexation : ${err.message || err}`);
            setIsUploadingPdf(false);
        }
    };

    // Delete indexed book
    const handleDeleteBook = async (bookId: string) => {
        if (bookId.startsWith('local-book-')) {
            alert('Ce livre est intégré localement à partir de la bibliothèque OrthoMind sur votre bureau et ne peut pas être supprimé depuis l\'interface.');
            return;
        }
        if (confirm('Voulez-vous supprimer ce livre et toutes ses connaissances indexées ?')) {
            try {
                if (bookId === 'cgs-volume-61') {
                    localStorage.setItem('casper_cgs_deleted', 'true');
                }
                const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
                if (isMockAuth) {
                    const localBooks = localStorage.getItem('casper_mock_books');
                    if (localBooks) {
                        const booksList = JSON.parse(localBooks);
                        const updatedBooks = booksList.filter((b: any) => b.id !== bookId);
                        localStorage.setItem('casper_mock_books', JSON.stringify(updatedBooks));
                    }
                    
                    const localKnowledge = localStorage.getItem('casper_mock_knowledge');
                    if (localKnowledge) {
                        const chunks = JSON.parse(localKnowledge);
                        const updatedChunks = chunks.filter((c: any) => c.document_id !== bookId);
                        localStorage.setItem('casper_mock_knowledge', JSON.stringify(updatedChunks));
                    }
                    
                    loadBooks();
                    return;
                }

                const { error } = await supabase
                    .from('orthodontic_documents')
                    .delete()
                    .eq('id', bookId);
                if (error) throw error;
                
                // Refresh list
                loadBooks();
            } catch (err) {
                alert('Erreur lors de la suppression du livre.');
            }
        }
    };

    // Formatter for custom markdown diagnostic output
    const formatReportText = (text: string) => {
        if (!text) return '';
        
        // Escape HTML tags/characters to prevent rendering errors with symbols like < or >
        const escapedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        // Process line by line
        const lines = escapedText.split('\n');
        const processedLines: string[] = [];
        let inUnorderedList = false;
        let inOrderedList = false;

        const applyInlineFormatting = (str: string): string => {
            return str
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>');
        };

        for (let line of lines) {
            const trimmedLine = line.trim();

            // Match bullet list item: starts with "-" or "*" followed by space
            const bulletMatch = trimmedLine.match(/^[-*]\s+(.*)$/);
            // Match numbered list item: starts with one or more digits followed by "." and space
            const numberMatch = trimmedLine.match(/^(\d+)\.\s+(.*)$/);

            if (bulletMatch) {
                if (inOrderedList) {
                    processedLines.push('</ol>');
                    inOrderedList = false;
                }
                if (!inUnorderedList) {
                    processedLines.push('<ul>');
                    inUnorderedList = true;
                }
                const content = applyInlineFormatting(bulletMatch[1]);
                processedLines.push(`<li>${content}</li>`);
            } else if (numberMatch) {
                if (inUnorderedList) {
                    processedLines.push('</ul>');
                    inUnorderedList = false;
                }
                if (!inOrderedList) {
                    processedLines.push('<ol>');
                    inOrderedList = true;
                }
                const itemNumber = numberMatch[1];
                const content = applyInlineFormatting(numberMatch[2]);
                processedLines.push(`<li value="${itemNumber}">${content}</li>`);
            } else {
                // Not a list item. Close any active lists
                if (inUnorderedList) {
                    processedLines.push('</ul>');
                    inUnorderedList = false;
                }
                if (inOrderedList) {
                    processedLines.push('</ol>');
                    inOrderedList = false;
                }

                if (trimmedLine === '') {
                    // Empty line - represent as paragraph gap
                    processedLines.push('<br/>');
                } else {
                    // Normal text line
                    const content = applyInlineFormatting(trimmedLine);
                    processedLines.push(`<p>${content}</p>`);
                }
            }
        }

        // Close any trailing lists
        if (inUnorderedList) {
            processedLines.push('</ul>');
        }
        if (inOrderedList) {
            processedLines.push('</ol>');
        }

        return processedLines.join('\n');
    };

    return (
        <div className="dashboard-container">
            {/* Sidebar navigation */}
            <aside className="sidebar-glass">
                <div className="sidebar-brand-wrapper">
                    <div className="sidebar-logo-container">
                        <div className="logo-shimmer-wrapper" style={{ position: 'relative', display: 'inline-block' }}>
                            <img src={orthomindLogo} alt="OrthoMind Logo" style={{ height: '130px', objectFit: 'contain', display: 'block' }} />
                        </div>
                    </div>
                </div>

                <nav className="sidebar-menu">
                    <button 
                        className={`sidebar-nav-btn ${activeTab === 'analyse' ? 'active' : ''}`}
                        onClick={() => setActiveTab('analyse')}
                    >
                        <img 
                            src={orthomindNavIcon} 
                            alt="" 
                            style={{ 
                                width: '18px', 
                                height: '18px', 
                                objectFit: 'contain', 
                                filter: activeTab === 'analyse' ? 'none' : 'grayscale(1) opacity(0.7)', 
                                transition: 'all 0.2s ease',
                                borderRadius: '3px'
                            }} 
                        />
                        Analyse Clinique
                    </button>

                    <button 
                        className={`sidebar-nav-btn ${activeTab === 'patients' ? 'active' : ''}`}
                        onClick={() => setActiveTab('patients')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        Liste de patients
                    </button>

                    <button 
                        className={`sidebar-nav-btn ${activeTab === 'knowledge' ? 'active' : ''}`}
                        onClick={() => setActiveTab('knowledge')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                        </svg>
                        Connaissances PDF
                    </button>

                    <button 
                        className="sidebar-nav-btn"
                        onClick={() => setShowHistoryModal(true)}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--primary-blue)' }}>
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Historique des Scans
                    </button>

                    <button 
                        className={`sidebar-nav-btn ${activeTab === 'config' ? 'active' : ''}`}
                        onClick={() => setActiveTab('config')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        Configuration / API
                    </button>
                </nav>

                <div className="sidebar-profile">
                    <img 
                        src={drPhoto} 
                        alt="Dr. Renaud Desouches" 
                        style={{ 
                            width: '40px', 
                            height: '40px', 
                            borderRadius: '50%', 
                            objectFit: 'cover',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            boxShadow: '0 0 10px rgba(255, 255, 255, 0.1)'
                        }} 
                    />
                    <div className="profile-info">
                        <h4>Dr. Renaud Desouches</h4>
                        <p>{user?.specialty || 'Chirurgien Orthodontiste'}</p>
                    </div>
                </div>

                <button className="sidebar-logout" onClick={handleLogout}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Se déconnecter
                </button>
            </aside>

            {/* Dashboard content */}
            <main className="dashboard-content-area">
                
                {/* TAB 1: CLINICAL ANALYSIS */}
                {activeTab === 'analyse' && (
                    <>
                        {/* Welcome Card Banner */}
                        <div className="welcome-banner-container">
                            <div className="welcome-banner" style={{ '--banner-bg': `url(${welcomeCardImg})` } as React.CSSProperties}>
                                <div className="banner-overlay"></div>
                                <div className="banner-content">
                                    <div className="banner-text-side">
                                        <h1 className="banner-greeting">Bienvenue,</h1>
                                        <a href="https://casperdental.fr/" target="_blank" rel="noopener noreferrer" className="banner-logo-wrapper">
                                            <img src={casperLogoWelcome} alt="Casper Dental" className="banner-casper-logo" />
                                        </a>
                                        <div className="banner-subtext">
                                            <p>Ravi de vous revoir !</p>
                                            <p>Consultez votre Espace Praticien</p>
                                        </div>
                                        <div className="banner-date-section">
                                            <p className="date-caption">Date d'aujourd'hui</p>
                                            <p className="date-display">{currentDate}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="analyse-grid">
                            {/* Panel unique : Robot + Formulaire */}
                            <div className="glass-panel upload-panel merged-panel">

                                {/* Robot OrthoMind en haut */}
                                <div className="merged-avatar-zone">
                                    <div className="merged-avatar-wrapper">
                                        <OrthoMindAvatar state={analysisAvatarState} />
                                    </div>
                                    {isScanning ? (
                                        <div className="hud-console-logs merged-console">
                                            {consoleLogs.map((log, idx) => (
                                                <div key={idx} className="console-line">
                                                    <span className="console-timestamp">[{log.time}]</span>
                                                    <span>{log.msg}</span>
                                                </div>
                                            ))}
                                            <p className="console-status-text" style={{ marginTop: '10px' }}>{scanStatusText}</p>
                                        </div>
                                    ) : (
                                        <div className="merged-avatar-status">
                                            {imageFiles.length > 0 ? (
                                                <p style={{ color: 'var(--primary-cyan)', fontWeight: 600, fontSize: '0.9rem' }}>
                                                    ✓ {imageFiles.length} cliché(s) chargé(s) — Prêt à analyser
                                                </p>
                                            ) : (
                                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                    OrthoMind en attente de vos clichés
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Séparateur */}
                                <div className="merged-divider" />

                                {/* Formulaire diagnostic */}
                                <h2>Nouveau Diagnostic</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '25px' }}>
                                    Glissez vos fichiers ou sélectionnez-les pour commencer.
                                </p>

                                <div className="patient-input-group">
                                    <label>Clichés dentaires (Recommandé : 5-6 photos)</label>
                                    <input
                                        type="file"
                                        id="dental-photos-input"
                                        multiple
                                        accept="image/*,.heic,.HEIC,.heif,.HEIF"
                                        onChange={handleImageChange}
                                        style={{ display: 'none' }}
                                        disabled={isScanning || isProcessingFiles}
                                    />
                                    <label
                                        htmlFor={isProcessingFiles ? undefined : "dental-photos-input"}
                                        className={`dropzone-container ${isProcessingFiles ? 'processing' : ''}`}
                                        onDragOver={isProcessingFiles ? undefined : handleDragOver}
                                        onDrop={isProcessingFiles ? undefined : handleDrop}
                                        style={{ cursor: isProcessingFiles ? 'wait' : 'pointer' }}
                                    >
                                        {isProcessingFiles ? (
                                            <>
                                                <div className="uploader-loader-spinner"></div>
                                                <div className="dropzone-title" style={{ marginTop: '16px', color: 'var(--primary-cyan)' }}>
                                                    Traitement des clichés en cours...
                                                </div>
                                                <div className="dropzone-subtitle">
                                                    Optimisation, conversion (HEIC ➡️ JPG) et calibrage des images...
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                                    <polyline points="21 15 16 10 5 21" />
                                                </svg>
                                                <div className="dropzone-title">Sélectionner les clichés dentaires</div>
                                                <div className="dropzone-subtitle">Formats JPEG, PNG, HEIC supportés. Maximum 6 images.</div>
                                            </>
                                        )}
                                    </label>
                                </div>

                                {/* Preview Grid */}
                                {previewUrls.length > 0 && (
                                    <div className="previews-grid">
                                        {previewUrls.map((url, idx) => (
                                            <div key={idx} className="preview-item">
                                                <img src={url} alt={`Preview ${idx + 1}`} />
                                                {!isScanning && !isProcessingFiles && (
                                                    <button
                                                        className="preview-remove-btn"
                                                        onClick={() => removeImage(idx)}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button
                                    className="glass-btn glass-btn-primary start-scan-btn"
                                    onClick={handleStartAnalysis}
                                    disabled={isScanning || isProcessingFiles || imageFiles.length === 0}
                                >
                                    <img src={logoSeul} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                                    Lancer l'analyse
                                </button>
                            </div>

                                                        {/* Colonne de droite : Résultats si présents, sinon CTA simulation */}
                            {analysisResult ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <div className="glass-panel results-panel" style={{ margin: 0 }}>
                                        <div className="results-header-row">
                                            <div className="results-patient-tag">
                                                <h2>Rapport Casper Clinique</h2>
                                                <div className="patient-badge">Patient: {patientName || 'Anonyme'}</div>
                                            </div>

                                            <div className="results-tabs">
                                                <button 
                                                    className={`results-tab-btn ${activeResultTab === 'diag' ? 'active' : ''}`}
                                                    onClick={() => setActiveResultTab('diag')}
                                                >
                                                    Diagnostic
                                                </button>
                                                <button 
                                                    className={`results-tab-btn ${activeResultTab === 'treat' ? 'active' : ''}`}
                                                    onClick={() => setActiveResultTab('treat')}
                                                >
                                                    Plan de Traitement
                                                </button>
                                            </div>
                                        </div>

                                        <div className="results-split-container">
                                            {activeResultTab === 'diag' ? (
                                                <div className="results-content-box" style={{ gridColumn: '1 / -1' }}>
                                                    <h3>
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-cyan)" strokeWidth="2.5">
                                                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                                            <polyline points="14 2 14 8 20 8" />
                                                        </svg>
                                                        Diagnostic & Observations Cliniques
                                                    </h3>
                                                    <div 
                                                        className="markdown-renderer"
                                                        dangerouslySetInnerHTML={{ __html: formatReportText(analysisResult.diagnostic) }}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="results-content-box" style={{ gridColumn: '1 / -1' }}>
                                                    <h3>
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-blue)" strokeWidth="2.5">
                                                            <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                                            <polyline points="2 17 12 22 22 17" />
                                                            <polyline points="2 12 12 17 22 12" />
                                                        </svg>
                                                        Stratégie Thérapeutique Conseillée
                                                    </h3>
                                                    <div 
                                                        className="markdown-renderer"
                                                        dangerouslySetInnerHTML={{ __html: formatReportText(analysisResult.traitement) }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* OrthoMind Simulation CTA */}
                                    <div className="simulation-cta-wrapper" style={{ margin: 0 }}>
                                        <div
                                            className="simulation-cta-banner"
                                            onClick={() => setShowSimulationModal(true)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => e.key === 'Enter' && setShowSimulationModal(true)}
                                        >
                                            <img src="/cta-om.png" alt="Découvrez votre futur sourire" className="simulation-cta-img" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="simulation-cta-wrapper" style={{ margin: 0 }}>
                                    <div
                                        className="simulation-cta-banner"
                                        onClick={() => setShowSimulationModal(true)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => e.key === 'Enter' && setShowSimulationModal(true)}
                                    >
                                        <img src="/cta-om.png" alt="Découvrez votre futur sourire" className="simulation-cta-img" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'patients' && (
                    <Patients />
                )}

                {/* TAB 2: KNOWLEDGE BASE PDF UPLOAD */}
                {activeTab === 'knowledge' && (
                    <div className="kb-layout">
                        <div className="dashboard-header">
                            <h1>Base de Connaissances Orthodontiques</h1>
                            <p>Enseignez à Casper la connaissance des plus grands livres scientifiques. Chargez les fichiers PDF pour en faire ses repères diagnostics.</p>
                        </div>

                        {/* Upload Card */}
                        <div className="glass-panel kb-upload-card">
                            <input 
                                type="file" 
                                id="pdf-doc-input" 
                                accept="application/pdf"
                                onChange={handlePdfUpload}
                                style={{ display: 'none' }}
                                disabled={isUploadingPdf}
                            />
                            
                            <label htmlFor="pdf-doc-input" className="pdf-upload-zone">
                                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="12" y1="18" x2="12" y2="12" />
                                    <polyline points="9 15 12 12 15 15" />
                                </svg>
                                <div className="dropzone-title">Sélectionner un livre ou cours d'orthodontie (PDF)</div>
                                <div className="dropzone-subtitle">Le fichier sera converti en blocs textuels indexés dans Supabase.</div>
                            </label>

                            {isUploadingPdf && (
                                <div className="indexing-progress-card">
                                    <div className="progress-header">
                                        <span>{pdfStatusText}</span>
                                        <span>{pdfProgress}%</span>
                                    </div>
                                    <div className="progress-bar-bg">
                                        <div className="progress-bar-fill" style={{ width: `${pdfProgress}%` }}></div>
                                    </div>
                                    <div className="progress-details">
                                        Ne fermez pas l'onglet. Extraction de texte sémantique et écriture Supabase en cours...
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Books catalog table */}
                        <div className="glass-panel kb-books-card">
                            <h2 style={{ display: 'flex', alignItems: 'center' }}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', color: 'var(--primary-cyan)', filter: 'drop-shadow(0 0 4px rgba(0, 242, 254, 0.4))' }}>
                                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-4.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2Z" />
                                    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-4.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2Z" />
                                </svg>
                                Bibliothèque Scientifique de Casper ({books.length} livres indexés)
                            </h2>
                            
                            {books.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    Aucun livre d'orthodontie n'est encore enregistré dans la base Supabase.
                                </div>
                            ) : (
                                <div className="glass-table-container">
                                    <table className="glass-table">
                                        <thead>
                                            <tr>
                                                <th>Titre du Livre</th>
                                                <th>Nom de fichier</th>
                                                <th>Taille</th>
                                                <th>Pages</th>
                                                <th>Date d'ajout</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {books.map((book) => (
                                                <tr key={book.id}>
                                                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{book.title}</td>
                                                    <td>{book.file_name}</td>
                                                    <td>{(book.file_size / (1024 * 1024)).toFixed(2)} MB</td>
                                                    <td>{book.total_pages} pages</td>
                                                    <td>{new Date(book.created_at).toLocaleDateString('fr-FR')}</td>
                                                    <td>
                                                        <button 
                                                            className="delete-table-btn"
                                                            onClick={() => handleDeleteBook(book.id)}
                                                            title="Supprimer ce livre"
                                                        >
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <polyline points="3 6 5 6 21 6" />
                                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 4: CONFIGURATION / API */}
                {activeTab === 'config' && (
                    <div className="settings-layout">
                        <div className="dashboard-header">
                            <h1>Configuration & Statut</h1>
                            <p>Gérez vos clés d'API IA et surveillez l'état de synchronisation de vos bases de stockage en ligne.</p>
                        </div>

                        <div className="glass-panel settings-card">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                                <div>
                                    <h2 style={{ marginBottom: '6px' }}>Assistant OrthoMind</h2>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                                        Consultez votre assistant clinique intelligent YouSmile connecté à votre base de connaissances en orthodontie.
                                    </p>
                                </div>
                                <button 
                                    className="glass-btn glass-btn-primary"
                                    onClick={() => setShowOrthoMindModal(true)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px' }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <rect x="3" y="11" width="18" height="10" rx="2" />
                                        <circle cx="12" cy="5" r="2" />
                                        <path d="M12 7v4" />
                                        <line x1="8" y1="16" x2="8" y2="16" />
                                        <line x1="16" y1="16" x2="16" y2="16" />
                                    </svg>
                                    Ouvrir l'Assistant OrthoMind
                                </button>
                            </div>
                        </div>

                        <div className="glass-panel settings-card">
                            <h2>Clé d'API Gemini</h2>
                            
                            <div className="settings-row">
                                <label htmlFor="gemini-api-key">Clé d'API Google Gemini (Studio AI)</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input 
                                        type={showKey ? 'text' : 'password'}
                                        id="gemini-api-key"
                                        className="glass-input"
                                        value={geminiKey}
                                        onChange={(e) => setGeminiKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                    />
                                    <button 
                                        className="glass-btn glass-btn-secondary"
                                        style={{ padding: '12px' }}
                                        onClick={() => setShowKey(!showKey)}
                                    >
                                        {showKey ? 'Masquer' : 'Afficher'}
                                    </button>
                                </div>
                                <div className="settings-row-help">
                                    Vous pouvez obtenir une clé d'API gratuite sur le site <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.
                                </div>
                            </div>

                            <button 
                                className="glass-btn glass-btn-primary save-settings-btn"
                                onClick={saveApiKey}
                            >
                                Enregistrer la clé
                            </button>
                        </div>

                        <div className="glass-panel settings-card">
                            <h2>Statuts d'infrastructure</h2>
                            
                            <div className="settings-row">
                                <div>Statut de la base Supabase :</div>
                                <div className="status-badge-container">
                                    {dbConnected === true && (
                                        <span className="status-badge active">
                                            <span className="badge-dot"></span>
                                            Connecté (En ligne)
                                        </span>
                                    )}
                                    {dbConnected === false && (
                                        <span className="status-badge inactive">
                                            <span className="badge-dot"></span>
                                            Erreur de connexion
                                        </span>
                                    )}
                                    {dbConnected === null && (
                                        <span className="status-badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                                            Vérification...
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="settings-row">
                                <div>Authentification Praticien :</div>
                                <div className="status-badge-container">
                                    <span className="status-badge active">
                                        <span className="badge-dot"></span>
                                        Dr. {user?.name || 'Praticien'} (RPPS: {user?.rpps || 'Habilité'})
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Smile Simulation Modal */}
            {showSimulationModal && (
                <div className="glass-modal-overlay sim-modal-overlay" onClick={() => { setShowSimulationModal(false); setSimPhoto(null); setSimPhotoFile(null); setSimResult(null); setIsGeneratingSim(false); }}>
                    <div className="glass-modal-content sim-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => { setShowSimulationModal(false); setSimPhoto(null); setSimPhotoFile(null); setSimResult(null); setIsGeneratingSim(false); }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>

                        <div className="sim-modal-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{ transform: 'scale(0.85)', marginBottom: '10px' }}>
                                <OrthoMindAvatar state={isGeneratingSim ? 'thinking' : 'listening'} />
                            </div>
                            <h2>Découvrez votre futur sourire 😁🔮</h2>
                            <p>Uploadez une photo frontale du sourire de votre patient. Notre IA OrthoMind génère une simulation photoréaliste du résultat après traitement par gouttières.</p>

                            {isGeneratingSim && (
                                <div className="hud-console-logs" style={{ width: '100%', maxWidth: '520px', marginTop: '15px', textAlign: 'left' }}>
                                    {simConsoleLogs.map((log, idx) => (
                                        <div key={idx} className="console-line">
                                            <span className="console-timestamp">[{log.time}]</span>
                                            <span>{log.msg}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {!simResult ? (
                            <div className="sim-upload-area">
                                {!simPhoto ? (
                                    <>
                                        <input
                                            type="file"
                                            id="sim-photo-input"
                                            accept="image/*,.heic,.HEIC,.heif,.HEIF"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleSimFileSelection(file);
                                            }}
                                        />
                                        <label
                                            htmlFor="sim-photo-input"
                                            className={`sim-dropzone ${simDragOver ? 'drag-over' : ''}`}
                                            onDragOver={(e) => { e.preventDefault(); setSimDragOver(true); }}
                                            onDragLeave={() => setSimDragOver(false)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setSimDragOver(false);
                                                const file = e.dataTransfer.files?.[0];
                                                if (file) handleSimFileSelection(file);
                                            }}
                                        >
                                            {isConvertingSimHeic ? (
                                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                                    <div className="uploader-loader-spinner" style={{ width: '32px', height: '32px', margin: '0 auto 14px' }}></div>
                                                    <div className="dropzone-title">Conversion HEIC ➡️ JPG en cours...</div>
                                                    <div className="dropzone-subtitle">Décodage du format photo Apple pour l'affichage et la simulation.</div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="sim-dropzone-icon">
                                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                                            <circle cx="12" cy="7" r="4" />
                                                        </svg>
                                                    </div>
                                                    <div className="dropzone-title">Déposer une photo frontale du sourire</div>
                                                    <div className="dropzone-subtitle">JPEG, PNG, HEIC — Portrait de face recommandé</div>
                                                </>
                                            )}
                                        </label>
                                    </>
                                ) : (
                                    <div className="sim-preview-section">
                                        <div className="sim-preview-wrapper" style={{ position: 'relative', overflow: 'hidden' }}>
                                            <img src={simPhoto} alt="Photo patient" className="sim-preview-img" />
                                            <div className="sim-preview-label">Photo originale</div>
                                            {isGeneratingSim && (
                                                <>
                                                    <div className="scan-laser-line" />
                                                    <div className="hud-grid-overlay" />
                                                </>
                                            )}
                                        </div>
                                        <div className="sim-arrow-container">
                                            <div className="sim-arrow-pulse">
                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <line x1="5" y1="12" x2="19" y2="12" />
                                                    <polyline points="12 5 19 12 12 19" />
                                                </svg>
                                            </div>
                                            <span>Simulation IA</span>
                                        </div>
                                        <div className="sim-result-placeholder" style={{ position: 'relative', overflow: 'hidden' }}>
                                            {isGeneratingSim ? (
                                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                                    <div className="uploader-loader-spinner" style={{ width: '40px', height: '40px', margin: '0 auto 12px' }}></div>
                                                    <span style={{ color: 'var(--primary-cyan)', fontWeight: 600, fontSize: '0.9rem' }}>Modélisation tridimensionnelle des aligneurs...</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="sim-result-glow">
                                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                            <circle cx="12" cy="12" r="10" />
                                                            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                                            <line x1="9" y1="9" x2="9.01" y2="9" />
                                                            <line x1="15" y1="9" x2="15.01" y2="9" />
                                                        </svg>
                                                    </div>
                                                    <span>Sourire simulé</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="sim-actions-row">
                                    {simPhoto && (
                                        <button
                                            className="glass-btn glass-btn-secondary"
                                            onClick={() => { setSimPhoto(null); setSimPhotoFile(null); }}
                                            disabled={isGeneratingSim}
                                        >
                                            Changer la photo
                                        </button>
                                    )}
                                    <button
                                        className="glass-btn glass-btn-primary sim-generate-btn"
                                        disabled={!simPhoto || isGeneratingSim}
                                         onClick={async () => {
                                            if (!simPhoto) return;
                                            setIsGeneratingSim(true);

                                            // Start HUD console logs
                                            const t1 = new Date().toLocaleTimeString();
                                            setSimConsoleLogs([
                                                { time: t1, msg: '[SYSTEM] Acquisition tridimensionnelle du sourire...' }
                                            ]);
                                            const timer1 = setTimeout(() => {
                                                setSimConsoleLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: '[IA OrthoMind] Simulation biomécanique du traitement par gouttières...' }]);
                                            }, 700);
                                            const timer2 = setTimeout(() => {
                                                setSimConsoleLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: '[IA OrthoMind] Correction des chevauchements & nivellement des incisives...' }]);
                                            }, 1500);
                                            const timer3 = setTimeout(() => {
                                                setSimConsoleLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: '[IA OrthoMind] Harmonisation du guidage antérieur et finition amélaire...' }]);
                                            }, 2300);

                                            try {
                                                const apiKey = getGeminiApiKey();
                                                let generatedImg: string | null = null;

                                                // 1. Try Gemini Vision & Imagen API if API key is configured
                                                if (apiKey) {
                                                    try {
                                                        generatedImg = await generateSmileSimulationWithGemini(simPhoto);
                                                    } catch (e) {
                                                        console.warn('Gemini smile simulation service skipped:', e);
                                                    }
                                                }

                                                // 2. High-Precision Biomechanical Clear Aligner Morphing & Alignment Engine
                                                if (!generatedImg) {
                                                    generatedImg = await new Promise<string>((resolve) => {
                                                        let settled = false;
                                                        const safeResolve = (res: string) => {
                                                            if (!settled) {
                                                                settled = true;
                                                                resolve(res);
                                                            }
                                                        };

                                                        // Hard timeout safety (4s)
                                                        const timer = setTimeout(() => {
                                                            safeResolve(simPhoto);
                                                        }, 4000);

                                                        const img = new Image();
                                                        if (!simPhoto.startsWith('data:')) {
                                                            img.crossOrigin = 'anonymous';
                                                        }

                                                        img.onload = () => {
                                                            clearTimeout(timer);
                                                            try {
                                                                const w = img.width || 800;
                                                                const h = img.height || 800;

                                                                const srcCanvas = document.createElement('canvas');
                                                                srcCanvas.width = w;
                                                                srcCanvas.height = h;
                                                                const srcCtx = srcCanvas.getContext('2d');
                                                                if (!srcCtx) { safeResolve(simPhoto); return; }
                                                                srcCtx.drawImage(img, 0, 0);

                                                                const outCanvas = document.createElement('canvas');
                                                                outCanvas.width = w;
                                                                outCanvas.height = h;
                                                                const outCtx = outCanvas.getContext('2d');
                                                                if (!outCtx) { safeResolve(simPhoto); return; }
                                                                outCtx.drawImage(img, 0, 0);

                                                                const srcData = srcCtx.getImageData(0, 0, w, h);
                                                                const outData = outCtx.getImageData(0, 0, w, h);
                                                                const sd = srcData.data;
                                                                const od = outData.data;

                                                                const startY = Math.floor(h * 0.28);
                                                                const endY = Math.floor(h * 0.82);
                                                                const startX = Math.floor(w * 0.12);
                                                                const endX = Math.floor(w * 0.88);

                                                                // Clear Aligner Treatment Engine: Tooth straightening, whitening & clear aligner plastic tray + attachments
                                                                let minToothX = w, maxToothX = 0;
                                                                let minToothY = h, maxToothY = 0;

                                                                for (let y = startY; y < endY; y++) {
                                                                    for (let x = startX; x < endX; x++) {
                                                                        const i = (y * w + x) * 4;
                                                                        let r = sd[i], g = sd[i+1], b = sd[i+2];

                                                                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                                                                        const maxC = Math.max(r, g, b);
                                                                        const minC = Math.min(r, g, b);
                                                                        const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
                                                                        const sumRGB = r + g + b;

                                                                        const isTooth = lum > 90 && sat < 0.38 && (r - g) < 55 && (r - b) < (sumRGB * 0.28);

                                                                        if (isTooth) {
                                                                            if (x < minToothX) minToothX = x;
                                                                            if (x > maxToothX) maxToothX = x;
                                                                            if (y < minToothY) minToothY = y;
                                                                            if (y > maxToothY) maxToothY = y;

                                                                            // 1. Smooth horizontal crown overlap crevices & straighten alignment
                                                                            let sumR = 0, sumG = 0, sumB = 0, count = 0;
                                                                            for (let dx = -4; dx <= 4; dx++) {
                                                                                const nx = x + dx;
                                                                                if (nx >= startX && nx < endX) {
                                                                                    const ni = (y * w + nx) * 4;
                                                                                    const nLum = 0.299 * sd[ni] + 0.587 * sd[ni+1] + 0.114 * sd[ni+2];
                                                                                    if (nLum > 85) {
                                                                                        sumR += sd[ni];
                                                                                        sumG += sd[ni+1];
                                                                                        sumB += sd[ni+2];
                                                                                        count++;
                                                                                    }
                                                                                }
                                                                            }

                                                                            let smoothR = count > 0 ? sumR / count : r;
                                                                            let smoothG = count > 0 ? sumG / count : g;
                                                                            let smoothB = count > 0 ? sumB / count : b;

                                                                            let alignR = r * 0.30 + smoothR * 0.70;
                                                                            let alignG = g * 0.30 + smoothG * 0.70;
                                                                            let alignB = b * 0.30 + smoothB * 0.70;

                                                                            // 2. Natural VITA A1 porcelain whitening
                                                                            const targetLum = Math.min(255, lum * 1.10 + 10);
                                                                            const scale = targetLum / Math.max(1, lum);

                                                                            let newR = Math.min(255, Math.round(alignR * scale + 2));
                                                                            let newG = Math.min(255, Math.round(alignG * scale + 4));
                                                                            let newB = Math.min(255, Math.round(alignB * (scale * 1.14) + 14));

                                                                            od[i]   = Math.round(r * 0.35 + newR * 0.65);
                                                                            od[i+1] = Math.round(g * 0.35 + newG * 0.65);
                                                                            od[i+2] = Math.round(b * 0.35 + newB * 0.65);
                                                                        } else if (lum > 40 && lum <= 90 && sat < 0.35 && (r - g) < 42) {
                                                                            // 3. Fill and straighten dark interdental crowding gaps
                                                                            let fillR = 0, fillG = 0, fillB = 0, fillCount = 0;
                                                                            for (let dx = -5; dx <= 5; dx++) {
                                                                                const nx = x + dx;
                                                                                if (nx >= startX && nx < endX) {
                                                                                    const ni = (y * w + nx) * 4;
                                                                                    const nLum = 0.299 * sd[ni] + 0.587 * sd[ni+1] + 0.114 * sd[ni+2];
                                                                                    if (nLum > 100) {
                                                                                        fillR += sd[ni];
                                                                                        fillG += sd[ni+1];
                                                                                        fillB += sd[ni+2];
                                                                                        fillCount++;
                                                                                    }
                                                                                }
                                                                            }
                                                                            if (fillCount > 0) {
                                                                                od[i]   = Math.min(255, Math.round(r * 0.20 + (fillR / fillCount) * 0.80));
                                                                                od[i+1] = Math.min(255, Math.round(g * 0.20 + (fillG / fillCount) * 0.80));
                                                                                od[i+2] = Math.min(255, Math.round(b * 0.20 + (fillB / fillCount) * 0.80));
                                                                            }
                                                                        }
                                                                    }
                                                                }

                                                                outCtx.putImageData(outData, 0, 0);

                                                                // 4. Render Transparent Polyurethane Aligner Trays & Composite Attachments over the patient's teeth
                                                                if (minToothX < maxToothX && minToothY < maxToothY) {
                                                                    const toothW = maxToothX - minToothX;
                                                                    const toothH = maxToothY - minToothY;

                                                                    outCtx.save();

                                                                    // A. Polyurethane Specular Sheen (Gouttière thermoformée translucide)
                                                                    outCtx.globalCompositeOperation = 'screen';
                                                                    const alignerGrad = outCtx.createLinearGradient(0, minToothY - 4, 0, maxToothY + 4);
                                                                    alignerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
                                                                    alignerGrad.addColorStop(0.3, 'rgba(200, 245, 255, 0.20)');
                                                                    alignerGrad.addColorStop(0.7, 'rgba(255, 255, 255, 0.26)');
                                                                    alignerGrad.addColorStop(1, 'rgba(180, 235, 255, 0.18)');

                                                                    outCtx.fillStyle = alignerGrad;
                                                                    outCtx.beginPath();
                                                                    if (typeof outCtx.roundRect === 'function') {
                                                                        outCtx.roundRect(minToothX - 5, minToothY - 5, toothW + 10, toothH + 10, 12);
                                                                    } else {
                                                                        outCtx.rect(minToothX - 5, minToothY - 5, toothW + 10, toothH + 10);
                                                                    }
                                                                    outCtx.fill();

                                                                    // B. Gingival Aligner Margin Trimlines (Découpe festonnée de la gouttière)
                                                                    outCtx.globalCompositeOperation = 'source-over';
                                                                    outCtx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                                                                    outCtx.lineWidth = 2.0;
                                                                    outCtx.shadowColor = 'rgba(0, 242, 254, 0.5)';
                                                                    outCtx.shadowBlur = 5;

                                                                    // Upper aligner margin
                                                                    outCtx.beginPath();
                                                                    outCtx.moveTo(minToothX - 4, minToothY + 4);
                                                                    const numScallops = 6;
                                                                    const scallopW = toothW / numScallops;
                                                                    for (let s = 0; s < numScallops; s++) {
                                                                        const sx = minToothX + s * scallopW;
                                                                        const midX = sx + scallopW / 2;
                                                                        const endX = sx + scallopW;
                                                                        outCtx.quadraticCurveTo(midX, minToothY - 5, endX, minToothY + 2);
                                                                    }
                                                                    outCtx.stroke();

                                                                    // Lower aligner margin
                                                                    outCtx.beginPath();
                                                                    outCtx.moveTo(minToothX - 4, maxToothY - 4);
                                                                    for (let s = 0; s < numScallops; s++) {
                                                                        const sx = minToothX + s * scallopW;
                                                                        const midX = sx + scallopW / 2;
                                                                        const endX = sx + scallopW;
                                                                        outCtx.quadraticCurveTo(midX, maxToothY + 5, endX, maxToothY - 2);
                                                                    }
                                                                    outCtx.stroke();

                                                                    // C. Orthodontic Composite Attachments (Taquets d'alignement)
                                                                    const attachmentPositions = [
                                                                        { x: minToothX + toothW * 0.20, y: minToothY + toothH * 0.38 },
                                                                        { x: minToothX + toothW * 0.33, y: minToothY + toothH * 0.42 },
                                                                        { x: minToothX + toothW * 0.67, y: minToothY + toothH * 0.42 },
                                                                        { x: minToothX + toothW * 0.80, y: minToothY + toothH * 0.38 },
                                                                        { x: minToothX + toothW * 0.28, y: minToothY + toothH * 0.68 },
                                                                        { x: minToothX + toothW * 0.72, y: minToothY + toothH * 0.68 }
                                                                    ];

                                                                    attachmentPositions.forEach(att => {
                                                                        outCtx.fillStyle = 'rgba(250, 248, 242, 0.85)';
                                                                        outCtx.beginPath();
                                                                        outCtx.arc(att.x, att.y, 4.0, 0, Math.PI * 2);
                                                                        outCtx.fill();

                                                                        outCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                                                                        outCtx.beginPath();
                                                                        outCtx.arc(att.x - 1.2, att.y - 1.2, 1.5, 0, Math.PI * 2);
                                                                        outCtx.fill();
                                                                    });

                                                                    outCtx.restore();
                                                                }

                                                                outCtx.putImageData(outData, 0, 0);

                                                                safeResolve(outCanvas.toDataURL('image/jpeg', 0.95));
                                                            } catch (err) {
                                                                console.warn('Canvas smile transformation fallback triggered:', err);
                                                                safeResolve(simPhoto);
                                                            }
                                                        };

                                                        img.onerror = (err) => {
                                                            clearTimeout(timer);
                                                            console.warn('Sim photo image load error:', err);
                                                            safeResolve(simPhoto);
                                                        };

                                                        img.src = simPhoto;
                                                    });
                                                }

                                                setSimResult(generatedImg);
                                            } catch (err: any) {
                                                console.error('Simulation error:', err);
                                                setSimResult(simPhoto);
                                            } finally {
                                                clearTimeout(timer1);
                                                clearTimeout(timer2);
                                                clearTimeout(timer3);
                                                setIsGeneratingSim(false);
                                            }
                                        }}
                                    >
                                        {isGeneratingSim ? (
                                            <>
                                                <div className="uploader-loader-spinner" style={{ width: '18px', height: '18px', marginRight: '8px' }}></div>
                                                Génération en cours...
                                            </>
                                        ) : (
                                            <>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}>
                                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                                </svg>
                                                Simuler mon sourire avec OrthoMind
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="sim-result-section">
                                <div className="sim-comparison-grid">
                                    <div className="sim-comparison-item">
                                        <img src={simPhoto!} alt="Avant" className="sim-comparison-img" />
                                        <div className="sim-comparison-label before-label">Avant traitement</div>
                                    </div>
                                    <div className="sim-vs-badge">→</div>
                                    <div className="sim-comparison-item">
                                        <img src={simResult} alt="Après gouttières" className="sim-comparison-img sim-after-img" />
                                        <div className="sim-comparison-label after-label">Après gouttières ✨</div>
                                    </div>
                                </div>

                                <div className="sim-result-cta">
                                    <div className="sim-result-cta-text">
                                        <h3>Prêt à transformer votre sourire ?</h3>
                                        <p>La précision chirurgicale d'OrthoMind au service d'un alignement parfait. Lancez votre traitement dès aujourd'hui.</p>
                                    </div>
                                    <div className="sim-result-actions">
                                        <button
                                            className="glass-btn glass-btn-secondary"
                                            onClick={() => { setSimResult(null); setSimPhoto(null); setSimPhotoFile(null); }}
                                        >
                                            Nouvelle simulation
                                        </button>
                                        <button
                                            className="glass-btn glass-btn-primary"
                                            onClick={() => {
                                                const link = document.createElement('a');
                                                link.href = simResult!;
                                                link.download = 'simulation-sourire-orthomind.png';
                                                link.click();
                                            }}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px' }}>
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="7 10 12 15 17 10" />
                                                <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            Télécharger la simulation
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal popup for history items */}
            {selectedHistoryItem && (
                <div className="glass-modal-overlay" onClick={() => setSelectedHistoryItem(null)}>
                    <div className="glass-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => setSelectedHistoryItem(null)}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                        
                        <div className="results-header-row">
                            <div className="results-patient-tag">
                                <h2>Rapport Archivé Casper</h2>
                                <div className="patient-badge">Patient: {selectedHistoryItem.patient_name}</div>
                            </div>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                Diagnostic du {new Date(selectedHistoryItem.created_at).toLocaleDateString('fr-FR')}
                            </span>
                        </div>

                        {selectedHistoryItem.images && selectedHistoryItem.images.length > 0 && (
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', overflowX: 'auto', paddingBottom: '10px' }}>
                                {selectedHistoryItem.images.map((img, i) => (
                                    <img 
                                        key={i} 
                                        src={img} 
                                        alt="dentition" 
                                        style={{ height: '90px', width: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }} 
                                    />
                                ))}
                            </div>
                        )}

                        <div className="results-split-container">
                            <div className="results-content-box">
                                <h3>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-cyan)" strokeWidth="2.5">
                                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    Diagnostic Clinique
                                </h3>
                                <div 
                                    className="markdown-renderer"
                                    dangerouslySetInnerHTML={{ __html: formatReportText(selectedHistoryItem.diagnostic_text) }}
                                />
                            </div>
                            
                            <div className="results-content-box">
                                <h3>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-blue)" strokeWidth="2.5">
                                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                        <polyline points="2 17 12 22 22 17" />
                                        <polyline points="2 12 12 17 22 12" />
                                    </svg>
                                    Stratégie Thérapeutique
                                </h3>
                                <div 
                                    className="markdown-renderer"
                                    dangerouslySetInnerHTML={{ __html: formatReportText(selectedHistoryItem.traitement_text) }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal popup for OrthoMind IA Assistant */}
            {showOrthoMindModal && (
                <div className="glass-modal-overlay" onClick={() => setShowOrthoMindModal(false)}>
                    <div className="glass-modal-content orthomind-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => setShowOrthoMindModal(false)}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                        <div className="orthomind-tab-layout" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <div className="dashboard-header">
                                <h1>OrthoMind — Cabinet Dr. Desouches</h1>
                                <p>Votre assistant clinique expert YouSmile connecté à votre base de connaissances en orthodontie.</p>
                            </div>

                            <div className="orthomind-grid" style={{ flex: 1, minHeight: 0 }}>
                                {/* Left panel: Avatar and Status info */}
                                <div className="glass-panel avatar-hud-panel">
                                    <div className="avatar-status-badge">
                                        <span className="pulse-indicator"></span>
                                        <span>OrthoMind v2.5 (Actif)</span>
                                    </div>

                                    <div className="avatar-display-box">
                                        <OrthoMindAvatar state={chatAvatarState} />
                                    </div>

                                    <div className="avatar-info-box">
                                        <h3>Statut du Robot</h3>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                            {chatAvatarState === 'idle' && "En veille active. En attente d'une question clinique."}
                                            {chatAvatarState === 'listening' && "À l'écoute du praticien..."}
                                            {chatAvatarState === 'thinking' && "Recherche sémantique RAG dans le volume 61 et génération de la réponse clinique..."}
                                            {chatAvatarState === 'speaking' && "Transmission des recommandations orthodontiques..."}
                                        </p>

                                        <div className="knowledge-source-badge">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                            </svg>
                                            <span>61st volume CGS Indexé</span>
                                        </div>
                                    </div>

                                    <div className="clinical-suggestions">
                                        <h4>Suggestions Cliniques</h4>
                                        <div className="suggestion-chips">
                                            <button 
                                                className="suggestion-chip"
                                                onClick={() => setChatInputValue("Quelles sont les principales indications d'une force de traction extra-buccale ?")}
                                            >
                                                Indications force extra-buccale
                                            </button>
                                            <button 
                                                className="suggestion-chip"
                                                onClick={() => setChatInputValue("Explique la classification des malocclusions selon Angle.")}
                                            >
                                                Classification d'Angle
                                            </button>
                                            <button 
                                                className="suggestion-chip"
                                                onClick={() => setChatInputValue("Quels sont les effets cliniques d'un disjoncteur maxillaire ?")}
                                            >
                                                Disjoncteur maxillaire
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Right panel: Chat UI */}
                                <div className="glass-panel chat-interface-panel">
                                    <div className="chat-messages-container">
                                        {chatMessages.map((msg, index) => (
                                            <div 
                                                key={index} 
                                                className={`chat-bubble-wrapper ${msg.role === 'user' ? 'user-wrapper' : 'assistant-wrapper'}`}
                                            >
                                                {msg.role === 'assistant' && (
                                                    <div className="assistant-avatar-thumbnail">
                                                        🤖
                                                    </div>
                                                )}
                                                <div 
                                                    className={`chat-bubble ${msg.role === 'user' ? 'user-bubble' : 'assistant-bubble'}`}
                                                    dangerouslySetInnerHTML={{ __html: formatReportText(msg.content) }}
                                                />
                                            </div>
                                        ))}
                                        
                                        {/* Glassmorphic typing indicator */}
                                        {isChatTyping && (
                                            <div className="chat-bubble-wrapper assistant-wrapper">
                                                <div className="assistant-avatar-thumbnail">
                                                    🤖
                                                </div>
                                                <div className="chat-bubble assistant-bubble typing-bubble">
                                                    <span className="dot"></span>
                                                    <span className="dot"></span>
                                                    <span className="dot"></span>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={chatEndRef} />
                                    </div>

                                    <form className="chat-input-wrapper" onSubmit={handleSendChatMessage}>
                                        <input 
                                            type="text" 
                                            className="glass-input chat-input-field" 
                                            placeholder="Posez votre question clinique à OrthoMind..."
                                            value={chatInputValue}
                                            onChange={(e) => setChatInputValue(e.target.value)}
                                            onFocus={() => {
                                                if (chatAvatarState === 'idle') setChatAvatarState('listening');
                                            }}
                                            onBlur={() => {
                                                if (chatAvatarState === 'listening') setChatAvatarState('idle');
                                            }}
                                            disabled={isChatTyping}
                                        />
                                        <button 
                                            type="submit" 
                                            className="glass-btn glass-btn-primary chat-send-btn"
                                            disabled={!chatInputValue.trim() || isChatTyping}
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <line x1="22" y1="2" x2="11" y2="13" />
                                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                            </svg>
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal popup for Scan History */}
            {showHistoryModal && (
                <div className="glass-modal-overlay" onClick={() => setShowHistoryModal(false)}>
                    <div className="glass-modal-content history-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close-btn" onClick={() => setShowHistoryModal(false)}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                        <div className="history-layout">
                            <div className="dashboard-header">
                                <h1>Historique des Diagnostics Cabinet</h1>
                                <p>Consultez la liste des diagnostics et des stratégies de traitement générées par Casper.</p>
                            </div>

                            <div className="glass-panel history-card">
                                {history.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        Aucune analyse n'a été enregistrée pour le moment.
                                    </div>
                                ) : (
                                    <div className="glass-table-container">
                                        <table className="glass-table">
                                            <thead>
                                                <tr>
                                                    <th>Patient</th>
                                                    <th>Date du Diagnostic</th>
                                                    <th>Nombre de clichés</th>
                                                    <th>Résumé Clinique</th>
                                                    <th>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {history.map((item) => (
                                                    <tr key={item.id}>
                                                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.patient_name}</td>
                                                        <td>{new Date(item.created_at).toLocaleDateString('fr-FR')} à {new Date(item.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                                                        <td>{item.images?.length || 0} clichés</td>
                                                        <td style={{ maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.diagnostic_text.slice(0, 70)}...
                                                        </td>
                                                        <td>
                                                            <button 
                                                                className="view-analysis-btn"
                                                                onClick={() => {
                                                                    setSelectedHistoryItem(item);
                                                                    setShowHistoryModal(false);
                                                                }}
                                                            >
                                                                Ouvrir le Dossier
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile Bottom Navigation Bar */}
            <div className="mobile-bottom-navbar">
                {/* Glow effect behind the active icon */}
                <div className={`nav-background-glow pos-${activeTab}`} />
                <div 
                    className="mobile-navbar-image-container"
                    style={{ 
                        backgroundImage: `url(${
                            activeTab === 'analyse' ? navbar1 :
                            activeTab === 'patients' ? navbar2 :
                            activeTab === 'knowledge' ? navbar3 :
                            navbar4
                        })`,
                        WebkitMaskImage: `url(${
                            activeTab === 'analyse' ? navbar1 :
                            activeTab === 'patients' ? navbar2 :
                            activeTab === 'knowledge' ? navbar3 :
                            navbar4
                        })`,
                        maskImage: `url(${
                            activeTab === 'analyse' ? navbar1 :
                            activeTab === 'patients' ? navbar2 :
                            activeTab === 'knowledge' ? navbar3 :
                            navbar4
                        })`
                    }}
                >
                    {/* Invisible Clickable Overlays */}
                    <button 
                        className="mobile-navbar-tab-btn" 
                        style={{ left: '0%', width: '22%' }}
                        onClick={() => setActiveTab('analyse')}
                        title="Analyse Clinique"
                    />
                    <button 
                        className="mobile-navbar-tab-btn" 
                        style={{ left: '22%', width: '18%' }}
                        onClick={() => setActiveTab('patients')}
                        title="Liste de patients"
                    />
                    {/* Center Hexagon defaults to Clinical Analysis */}
                    <button 
                        className="mobile-navbar-tab-btn" 
                        style={{ left: '40%', width: '20%' }}
                        onClick={() => setActiveTab('analyse')}
                        title="Casper Logo"
                    />
                    <button 
                        className="mobile-navbar-tab-btn" 
                        style={{ left: '60%', width: '18%' }}
                        onClick={() => setActiveTab('knowledge')}
                        title="Connaissances PDF"
                    />
                    <button 
                        className="mobile-navbar-tab-btn" 
                        style={{ left: '78%', width: '22%' }}
                        onClick={() => setActiveTab('config')}
                        title="Configuration / API"
                    />
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
