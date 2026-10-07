import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { supabase } from '../lib/supabase';
import { listRecords, saveRecord, updateRecordDep, migrateLocalDataToCloud, isCloudMode } from '../services/recordsService';
import { saveCabinetGeminiKey, clearCabinetGeminiKey } from '../services/cabinetSettings';
import { uploadPatientPhotos, PhotoUploadError, getLatestPhotoSession, photosToFiles, linkPhotosToRecord, PhotoSession } from '../services/photosService';
import { extractTextFromPdf, chunkParsedPages } from '../services/pdfParser';
import ClinicalReport, { formatClinicalReport } from '../components/ClinicalReport';
import { warmUpKnowledge } from '../services/knowledgeBase';
import CameraCapture from '../components/CameraCapture';
import CabinetPlanning from '../components/CabinetPlanning';
import { AiMissingBanner, AiReportMeta } from '../components/AiStatus';
import Icon from '../components/Icon';

const MAX_ANALYSIS_PHOTOS = 13;
import { analyzeDentition, getGeminiApiKey, testGeminiKey, describeAiFailure, AnalysisResult, getAnalysisMode, setAnalysisMode, AnalysisMode, askOrthoMind, loadLocalCompiledKnowledge, generateSmileSimulationWithGemini, buildPatientContext } from '../services/geminiService';
import { OrthoMindAvatar, OrthoMindState } from '../components/OrthoMindAvatar';
import { AudioConsultation } from '../components/AudioConsultation';
import defaultBookData from '../assets/cgs_volume_61.json';
import orthomindLogo from '../assets/orthomind-logo.png';
import logoSeul from '../assets/logo-seul.png';
import Patients from './Patients';
import PatientSelector from '../components/PatientSelector';
import { Patient } from '../services/patientService';
import OrthoMindDepForm from '../components/OrthoMindDepForm';
import { extractDepDataFromAnalysis } from '../services/depParser';
import orthomindNavIcon from '../assets/Orthomind.png';
import welcomeCardImg from '../assets/welcomecard.png';
import drPhoto from '../assets/photo.png';
import casperLogoWelcome from '../assets/casper-logo-welcome.png';
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
    const [activeTab, setActiveTab] = useState<'analyse' | 'audio' | 'patients' | 'config'>(() => {
        const saved = localStorage.getItem('casper_active_tab');
        if (saved === 'orthomind' || saved === 'history' || saved === 'knowledge') return 'analyse';
        return (saved as any) || 'analyse';
    });

    const isPatientAccount = (user?.email || '').toLowerCase().trim() === 'test@patient.com' || user?.profession === 'Patient OrthoMind' || user?.specialty === 'Espace Patient';

    const handleTabClick = (tab: 'analyse' | 'audio' | 'patients' | 'config') => {
        if (isPatientAccount && tab !== 'analyse') {
            alert('Fonctionnalité à venir...');
            return;
        }
        setActiveTab(tab);
    };

    // Save active tab to localStorage on changes to survive refreshes
    useEffect(() => {
        if (isPatientAccount && activeTab !== 'analyse') {
            setActiveTab('analyse');
            return;
        }
        localStorage.setItem('casper_active_tab', activeTab);
    }, [activeTab, isPatientAccount]);

    // Ref for smooth scrolling to results on mobile
    const resultsRef = useRef<HTMLDivElement>(null);

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
    const [simErrorMessage, setSimErrorMessage] = useState<string | null>(null);

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
    const [selectedPatientObj, setSelectedPatientObj] = useState<Patient | null>(null);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [isProcessingFiles, setIsProcessingFiles] = useState(false);

    // Diagnostic en différé : photos déjà archivées dans la fiche du patient
    const [ficheSession, setFicheSession] = useState<PhotoSession | null>(null);
    const [isLoadingFichePhotos, setIsLoadingFichePhotos] = useState(false);
    const fichePhotoIds = useRef(new Map<File, string>()); // fichier rechargé -> photo déjà archivée (pas de doublon)
    const autoLoadFichePhotos = useRef(false);
    
    // Scanner HUD simulation & API call states
    const [isScanning, setIsScanning] = useState(false);
    const [consoleLogs, setConsoleLogs] = useState<Array<{ time: string; msg: string }>>([]);
    const [scanStatusText, setScanStatusText] = useState('');
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [lastSavedRecordId, setLastSavedRecordId] = useState<string | null>(null);
    const [streamingReport, setStreamingReport] = useState('');
    // Dictée du praticien pendant l'examen (consultation audio), croisée avec les clichés
    const [practitionerDictation, setPractitionerDictation] = useState('');

    // Avertit avant de quitter la page pendant une analyse en cours
    useEffect(() => {
        if (!isScanning) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [isScanning]);
    useEffect(() => {
        setFicheSession(null);
        if (!selectedPatientObj?.id) return;
        let cancelled = false;
        getLatestPhotoSession(selectedPatientObj.id)
            .then(session => { if (!cancelled) setFicheSession(session); })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [selectedPatientObj?.id]);

    const loadFichePhotos = async (session: PhotoSession) => {
        setIsLoadingFichePhotos(true);
        try {
            const items = await photosToFiles(session.photos);
            previewUrls.forEach(url => URL.revokeObjectURL(url));
            fichePhotoIds.current = new Map(items.map(({ file, photoId }) => [file, photoId]));
            const files = items.map(i => i.file).slice(0, MAX_ANALYSIS_PHOTOS);
            setImageFiles(files);
            setPreviewUrls(files.map(f => URL.createObjectURL(f)));
        } catch (err: any) {
            alert(err.message || 'Récupération des photos de la fiche impossible.');
        } finally {
            setIsLoadingFichePhotos(false);
        }
    };

    // Arrivée depuis le rappel de la fiche patient : les photos sont chargées d'office
    useEffect(() => {
        if (ficheSession && autoLoadFichePhotos.current && imageFiles.length === 0) {
            autoLoadFichePhotos.current = false;
            loadFichePhotos(ficheSession);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ficheSession]);

    const [analysisMode, setAnalysisModeState] = useState<AnalysisMode>(getAnalysisMode());
    const [activeResultTab, setActiveResultTab] = useState<'diag' | 'treat' | 'dep'>('diag');

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
            content: 'Bonjour Dr Desouches,\n\nJe suis **OrthoMind**, votre assistant clinique intelligent pour le cabinet YouSmile. Je suis connecté à votre base de connaissances.\n\nPosez-moi n\'importe quelle question sur vos cours, livres de référence en orthodontie indexés, ou cas cliniques.' 
        }
    ]);
    const [chatInputValue, setChatInputValue] = useState('');
    const [chatAvatarState, setChatAvatarState] = useState<OrthoMindState>('idle');
    const [isChatTyping, setIsChatTyping] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Handler to bridge Consultation Audio transcript into OrthoMind AI Assistant
    const handleAudioTranscriptToOrthoMind = (transcriptText: string) => {
        setShowOrthoMindModal(true);
        setChatInputValue(`Voici la retranscription vocale de la consultation d'orthodontie du patient :\n\n"${transcriptText}"\n\nMerci de me faire une synthèse clinique structurée avec les observations clés et la stratégie thérapeutique recommandée.`);
    };

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
        warmUpKnowledge();
        setGeminiKey(getGeminiApiKey());
        loadBooks();
        loadHistory();
    }, []);

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

    // Historique des analyses : base du cabinet (mêmes données sur tous les appareils)
    const [syncNotice, setSyncNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
    const loadHistory = async () => {
        try {
            setHistory(await listRecords() as any);
        } catch (e: any) {
            console.error('Failed to load analyses history:', e);
            setSyncNotice({ tone: 'danger', text: e.message });
        }
    };

    // Transfert unique des données saisies auparavant sur cet appareil
    useEffect(() => {
        migrateLocalDataToCloud()
            .then(result => {
                if (result && (result.patients || result.records)) {
                    setSyncNotice({ tone: 'success', text: `Données de cet appareil transférées dans la base du cabinet : ${result.patients} patient(s), ${result.records} compte(s)-rendu(s). Elles sont maintenant visibles sur tous vos appareils.` });
                    loadHistory();
                }
            })
            .catch(e => setSyncNotice({ tone: 'danger', text: e.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Handle logout
    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // Save API key (vérifiée auprès de Google avant enregistrement)
    const [keyStatus, setKeyStatus] = useState<{ tone: 'ok' | 'error' | 'pending'; text: string } | null>(null);
    const saveApiKey = async () => {
        const key = geminiKey.trim();
        if (!key) {
            localStorage.removeItem('casper_gemini_api_key');
            if (isCloudMode()) {
                try { await clearCabinetGeminiKey(); } catch (e: any) { setKeyStatus({ tone: 'error', text: e.message }); return; }
            }
            setKeyStatus({ tone: 'error', text: 'Clé effacée : les analyses IA sont désactivées.' });
            return;
        }
        setKeyStatus({ tone: 'pending', text: 'Vérification de la clé auprès de Google…' });
        const result = await testGeminiKey(key);
        if (result.ok) {
            // Dans tous les cas, la clé fonctionne immédiatement sur cet appareil
            localStorage.setItem('casper_gemini_api_key', key);
            if (!isCloudMode()) {
                setKeyStatus({ tone: 'ok', text: `Clé valide et enregistrée sur cet appareil. Modèle : ${result.model}.` });
            } else {
                try {
                    await saveCabinetGeminiKey(key);
                    setKeyStatus({ tone: 'ok', text: `Clé valide, enregistrée pour tout le cabinet : chaque praticien connecté en profite sur tous ses appareils, sans la saisir. Modèle : ${result.model}.` });
                } catch (e: any) {
                    // Table des réglages absente (script SQL non exécuté) : la clé marche ici,
                    // et sera partagée automatiquement dès que la table existera
                    setKeyStatus({ tone: 'ok', text: `Clé valide et active sur cet appareil (modèle : ${result.model}). Elle n'a pas pu être partagée avec le cabinet : exécutez le script « photos et clé cabinet » dans Supabase, elle sera alors partagée automatiquement à la prochaine connexion.` });
                    console.warn(e);
                }
            }
        } else {
            setKeyStatus({ tone: 'error', text: `Clé refusée : ${describeAiFailure(result.error)}` });
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
            
            // Limite du nombre de clichés par analyse
            setImageFiles(prev => [...prev, ...processedFiles].slice(0, MAX_ANALYSIS_PHOTOS));

            // Generate preview URLs
            const newPreviews = processedFiles.map(file => URL.createObjectURL(file));
            setPreviewUrls(prev => [...prev, ...newPreviews].slice(0, MAX_ANALYSIS_PHOTOS));
        } finally {
            setIsProcessingFiles(false);
        }
    };

    // Handle images selection via file input
    // Caméra intégrée (prise en rafale sur mobile)
    const [showCamera, setShowCamera] = useState(false);
    const canUseCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
        && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

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
        const currentPatient = (patientName || '').trim();
        if (!currentPatient) {
            alert('⚠️ Aucune analyse ne peut être démarrée sans patient. Veuillez d\'abord sélectionner ou créer un patient.');
            return;
        }
        if (imageFiles.length === 0) {
            alert(`Veuillez déposer au moins 1 photo de dentition (jusqu'à ${MAX_ANALYSIS_PHOTOS}).`);
            return;
        }

        // Initialize scanning console and state
        setIsScanning(true);
        setConsoleLogs([]);
        setAnalysisResult(null);
        
        if (practitionerDictation.trim()) addLog('[SYSTEM] Dictée du praticien prise en compte dans le compte-rendu.');
        addLog(`[SYSTEM] ${imageFiles.length} cliché(s) — mode ${getAnalysisMode() === 'approfondi' ? 'approfondi' : 'rapide'}.`);

        setStreamingReport('');
        try {
            const result = await analyzeDentition(imageFiles, (status) => {
                setScanStatusText(status);
                addLog(`[INFO] ${status}`);
            }, currentPatient, buildPatientContext(selectedPatientObj), (text) => {
                // Le rapport s'affiche au fur et à mesure de sa rédaction
                setStreamingReport(text.replace(/<\/?(diagnostic|traitement)>/gi, ''));
            }, practitionerDictation.trim() || undefined);
            setStreamingReport('');

            clearInterval(logIntervalRef.current);
            addLog('[SUCCESS] Rapport de diagnostic clinique approfondi finalisé avec succès.');
            
            setAnalysisResult(result);
            setIsScanning(false);
            setAnalysisAvatarState('speaking');

            // Automatically scroll to the report on mobile & desktop
            setTimeout(() => {
                resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 250);

            setTimeout(() => {
                setAnalysisAvatarState('idle');
            }, 6000);

            // Enregistrement dans le dossier du patient (base du cabinet)
            try {
                addLog('[SYSTEM] Enregistrement du rapport dans le dossier du patient...');
                const thumbnails: string[] = [];
                for (const file of imageFiles) {
                    try {
                        thumbnails.push(await compressImageToThumbnail(file));
                    } catch {
                        /* miniature impossible : cliché ignoré */
                    }
                }
                const saved = await saveRecord({
                    patient_id: selectedPatientObj?.id || null,
                    patient_name: currentPatient,
                    type: 'photos',
                    images: thumbnails,
                    diagnostic_text: result.diagnostic,
                    traitement_text: result.traitement,
                    dep_data: extractDepDataFromAnalysis(result.diagnostic, result.traitement, currentPatient, selectedPatientObj?.id, result.dep),
                    transcript: practitionerDictation.trim() || null,
                    meta: result.meta ? { ...result.meta } : null,
                });
                setLastSavedRecordId(saved.id);
                // Archivage des clichés dans l'onglet Photos de la fiche patient
                if (selectedPatientObj?.id) {
                    addLog('[SYSTEM] Archivage des clichés dans l\'onglet Photos du patient...');
                    // Photos venant de la fiche : déjà archivées, simplement rattachées à ce compte-rendu
                    const alreadyArchived = imageFiles.map(f => fichePhotoIds.current.get(f)).filter((id): id is string => !!id);
                    if (alreadyArchived.length) {
                        try {
                            await linkPhotosToRecord(alreadyArchived, saved.id);
                            addLog(`[SUCCESS] ${alreadyArchived.length} cliché(s) de la fiche rattaché(s) au compte-rendu.`);
                        } catch (linkErr: any) {
                            addLog(`[WARNING] ${linkErr.message}`);
                        }
                    }
                    let pendingFiles = imageFiles.filter(f => !fichePhotoIds.current.has(f));
                    let pendingLabels: string[] | undefined;
                    let archived = alreadyArchived.length;
                    while (pendingFiles.length) {
                        try {
                            archived += await uploadPatientPhotos(selectedPatientObj.id, pendingFiles, saved.id, pendingLabels);
                            addLog(archived ? `[SUCCESS] ${archived} cliché(s) archivé(s) dans la fiche patient.` : '[WARNING] Aucun cliché archivé (patient non enregistré dans la base du cabinet).');
                            break;
                        } catch (photoErr: any) {
                            addLog(`[ERROR] ${photoErr.message}`);
                            if (!(photoErr instanceof PhotoUploadError)) {
                                alert(`Le compte-rendu est enregistré, mais les photos n'ont pas pu être archivées : ${photoErr.message}`);
                                break;
                            }
                            archived += photoErr.uploaded;
                            const retry = window.confirm(`Le compte-rendu est enregistré, mais ${photoErr.message}.\n\nGardez l'écran allumé et OrthoMind ouvert, puis touchez OK pour renvoyer les photos manquantes.`);
                            if (!retry) break;
                            pendingFiles = photoErr.failed.map(f => f.file);
                            pendingLabels = photoErr.failed.map(f => f.label);
                        }
                    }
                }
                addLog('[SUCCESS] Rapport et fiche DEP enregistrés dans le dossier du patient.');
                loadHistory();
            } catch (saveErr: any) {
                console.error('Failed to save history:', saveErr);
                addLog(`[ERROR] ${saveErr.message}`);
                setSyncNotice({ tone: 'danger', text: saveErr.message });
            }

        } catch (err: any) {
            clearInterval(logIntervalRef.current);
            setStreamingReport('');
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

    // Rendu partagé des comptes-rendus (voir components/ClinicalReport)
    const formatReportText = formatClinicalReport;

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
                        onClick={() => handleTabClick('analyse')}
                    >
                        <img 
                            src={orthomindNavIcon} 
                            alt="" 
                            style={{ 
                                width: '18px', 
                                height: '18px', 
                                objectFit: 'contain', 
                                filter: activeTab === 'analyse' ? 'none' : 'grayscale(1) opacity(0.7)', 
                                transition: 'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease',
                                borderRadius: '3px'
                            }} 
                        />
                        Diagnostic
                    </button>

                    {!isPatientAccount && (
                        <>
                            <button 
                                className={`sidebar-nav-btn ${activeTab === 'patients' ? 'active' : ''}`}
                                onClick={() => handleTabClick('patients')}
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
                                className={`sidebar-nav-btn ${activeTab === 'audio' ? 'active' : ''}`}
                                onClick={() => handleTabClick('audio')}
                            >
                                <Icon name="calendar" size={18} style={{ color: activeTab === 'audio' ? 'var(--primary-cyan)' : 'inherit' }} />
                                Planning
                            </button>

                            <button 
                                className="sidebar-nav-btn"
                                onClick={() => setShowHistoryModal(true)}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--primary-cyan)' }}>
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                </svg>
                                Historique des Scans
                            </button>

                            <button 
                                className={`sidebar-nav-btn ${activeTab === 'config' ? 'active' : ''}`}
                                onClick={() => handleTabClick('config')}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                Configuration / API
                            </button>
                        </>
                    )}
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
                {syncNotice && (
                    <div className={`om-notice om-notice--${syncNotice.tone}`} role="status">
                        <p>{syncNotice.text}</p>
                        <button className="om-btn om-btn--ghost om-btn--sm" onClick={() => setSyncNotice(null)}>Fermer</button>
                    </div>
                )}

                {activeTab === 'analyse' && (
                    <AiMissingBanner onConfigure={() => handleTabClick('config')} />
                )}

                {activeTab === 'analyse' && (
                    <>

                        <div className="analyse-grid">
                            {/* Panel unique : Robot + Formulaire */}
                            <div className="glass-panel upload-panel merged-panel">

                                {/* Robot OrthoMind en haut */}
                                <div className="merged-avatar-zone">
                                    <div className="merged-avatar-wrapper">
                                        <OrthoMindAvatar state={analysisAvatarState} use3D />
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
                                            {streamingReport && (
                                                <div className="live-report">
                                                    <span className="om-label">Rapport en cours de rédaction</span>
                                                    <ClinicalReport text={streamingReport} />
                                                </div>
                                            )}
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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <h2 style={{ margin: 0 }}>Nouveau Diagnostic</h2>
                                    <button
                                        type="button"
                                        className="om-btn om-btn--ghost om-btn--sm"
                                        onClick={() => {
                                            setSelectedPatientObj(null);
                                            setPatientName('');
                                            fichePhotoIds.current = new Map();
                                            previewUrls.forEach(url => URL.revokeObjectURL(url));
                                            setImageFiles([]);
                                            setPreviewUrls([]);
                                            setPractitionerDictation('');
                                            setAnalysisResult(null);
                                            setStreamingReport('');
                                            setConsoleLogs([]);
                                            setScanStatusText('');
                                            setIsScanning(false);
                                        }}
                                        style={{ gap: '6px', color: 'var(--primary-cyan)', borderColor: 'rgba(6, 182, 212, 0.3)' }}
                                        title="Réinitialiser les clichés et la sélection du patient"
                                    >
                                        <Icon name="refresh" size={15} style={{ color: '#ffffff' }} />Réinitialiser
                                    </button>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                                    Associez un patient et sélectionnez vos clichés pour commencer.
                                </p>

                                {/* Patient Selector dropdown & quick create */}
                                <PatientSelector
                                    selectedPatient={selectedPatientObj}
                                    onSelectPatient={(p) => {
                                        setSelectedPatientObj(p);
                                        setPatientName(p ? `${p.nom.toUpperCase()} ${p.prenom}` : '');
                                    }}
                                />

                                <div className="patient-input-group">
                                    <label>Clichés dentaires (jusqu'à {MAX_ANALYSIS_PHOTOS} photos)</label>
                                    {selectedPatientObj && ficheSession && imageFiles.length === 0 && (
                                        <div className={`fiche-photos-card ${ficheSession.analysed ? '' : 'is-pending'}`}>
                                            <div>
                                                <strong>📁 {ficheSession.photos.length} photo{ficheSession.photos.length > 1 ? 's' : ''} du {new Date(`${ficheSession.day}T12:00:00`).toLocaleDateString('fr-FR')} déjà dans la fiche</strong>
                                                <span>{ficheSession.analysed ? 'Un diagnostic a déjà été fait avec ces photos.' : 'Aucun diagnostic n’a encore été lancé avec ces photos.'}</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="om-btn om-btn--primary"
                                                onClick={() => loadFichePhotos(ficheSession)}
                                                disabled={isScanning || isProcessingFiles || isLoadingFichePhotos}
                                            >
                                                {isLoadingFichePhotos ? 'Chargement des photos…' : 'Utiliser ces photos pour le diagnostic'}
                                            </button>
                                        </div>
                                    )}
                                    {canUseCamera && (
                                        <button
                                            type="button"
                                            className="om-btn om-btn--primary camera-launch-btn"
                                            onClick={() => setShowCamera(true)}
                                            disabled={isScanning || isProcessingFiles || imageFiles.length >= MAX_ANALYSIS_PHOTOS}
                                        >
                                            <Icon name="camera" size={18} /> Prendre les clichés en rafale
                                        </button>
                                    )}
                                    {showCamera && (
                                        <CameraCapture
                                            maxShots={MAX_ANALYSIS_PHOTOS - imageFiles.length}
                                            startIndex={imageFiles.length}
                                            onClose={() => setShowCamera(false)}
                                            onDone={async (files) => {
                                                setShowCamera(false);
                                                await processAndAddFiles(files);
                                            }}
                                        />
                                    )}
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
                                                <div className="dropzone-title">{canUseCamera ? 'Ou choisir dans la photothèque' : 'Sélectionner les 13 clichés dentaires'}</div>
                                                <div className="dropzone-subtitle">Formats JPEG, PNG, HEIC supportés. Séquence de 13 clichés max (7 intra-oraux, 4 visage, 2 buste).</div>
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
                                    className="glass-btn glass-btn-primary start-scan-btn launch-analysis-btn"
                                    onClick={handleStartAnalysis}
                                    disabled={isScanning || isProcessingFiles || imageFiles.length === 0}
                                >
                                    <img src={logoSeul} alt="" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                                    Lancer l'analyse
                                </button>
                            </div>

                            {/* Section Droite : Consultation Audio (Occupe la partie droite sur bureau, bas de page sur mobile) */}
                            <div className="analyse-right-column" id="dictation-section">
                                <AudioConsultation
                                    initialTranscript={practitionerDictation}
                                    hideSynthesisCta
                                    patientName={patientName} 
                                    selectedPatientId={selectedPatientObj?.id}
                                    patient={selectedPatientObj}
                                    onTranscriptChange={setPractitionerDictation}
                                    onSendToOrthoMind={handleAudioTranscriptToOrthoMind} 
                                    onViewPatientFile={() => handleTabClick('patients')}
                                />
                            </div>
                        </div>

                        {/* Rapport d'Analyse Clinique (Si généré) */}
                        {analysisResult && (
                            <div ref={resultsRef} className="glass-panel results-panel" style={{ marginTop: '25px', width: '100%' }}>
                                
                                {/* Certified Medical Badge */}
                                <div className="certified-report-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '20px', background: 'rgba(0, 242, 254, 0.06)', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: '14px', padding: '12px 18px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary-cyan)', fontWeight: 700, fontSize: '0.9rem' }}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                            <polyline points="9 12 11 14 15 10"/>
                                        </svg>
                                        Rapport Clinique Officiel Certifié — OrthoMind AI
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        Bibliothèque du cabinet consultée
                                    </span>
                                </div>

                                <div className="results-header-row">
                                    <div className="results-patient-tag">
                                        <h2>Diagnostic & Plan Thérapeutique</h2>
                                        <div className="patient-badge">Patient: {patientName || 'Anonyme'}</div>
                                    </div>

                                    <AiReportMeta meta={analysisResult.meta} source="Source : clichés + bibliothèque du cabinet" />

                                    <div className="results-tabs">
                                        <button 
                                            className={`results-tab-btn ${activeResultTab === 'dep' ? 'active' : ''}`}
                                            onClick={() => setActiveResultTab('dep')}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: activeResultTab === 'dep' ? 'var(--primary-cyan)' : undefined }}
                                        >
                                            <img src={logoSeul} alt="" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                                            Fiche DEP (Sécurité sociale)
                                        </button>
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
                                    {activeResultTab === 'dep' ? (
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <OrthoMindDepForm
                                                depData={extractDepDataFromAnalysis(analysisResult.diagnostic, analysisResult.traitement, patientName, selectedPatientObj?.id, analysisResult.dep)}
                                                patientName={patientName}
                                                patientId={selectedPatientObj?.id}
                                                onSave={async (updatedData) => {
                                                    if (!lastSavedRecordId) {
                                                        alert("Le rapport n'a pas encore été enregistré dans le dossier du patient.");
                                                        return;
                                                    }
                                                    try {
                                                        await updateRecordDep(lastSavedRecordId, updatedData);
                                                        alert(`Fiche DEP de ${patientName || 'ce patient'} enregistrée dans son dossier.`);
                                                    } catch (e: any) {
                                                        alert(e.message);
                                                    }
                                                }}
                                            />
                                        </div>
                                    ) : activeResultTab === 'diag' ? (
                                        <div className="results-content-box" style={{ gridColumn: '1 / -1' }}>
                                            <h3>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-cyan)" strokeWidth="2.5">
                                                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                                    <polyline points="14 2 14 8 20 8" />
                                                </svg>
                                                Diagnostic & Observations Cliniques
                                            </h3>
                                            <div 
                                                className="markdown-renderer om-report"
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
                                                className="markdown-renderer om-report"
                                                dangerouslySetInnerHTML={{ __html: formatReportText(analysisResult.traitement) }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* TAB: PLANNING DU CABINET (rendez-vous + étiquettes Monday) — l'audio est dans Diagnostic */}
                {activeTab === 'audio' && <CabinetPlanning />}

                {activeTab === 'patients' && (
                    <Patients 
                        onSelectPatientForAnalysis={(patient, options) => {
                            if (patient.id !== selectedPatientObj?.id) {
                                previewUrls.forEach(url => URL.revokeObjectURL(url));
                                setImageFiles([]);
                                setPreviewUrls([]);
                                fichePhotoIds.current = new Map();
                            }
                            autoLoadFichePhotos.current = !!options?.useFichePhotos;
                            if (patient.id === selectedPatientObj?.id && options?.useFichePhotos && ficheSession && imageFiles.length === 0) {
                                autoLoadFichePhotos.current = false;
                                loadFichePhotos(ficheSession);
                            }
                            setSelectedPatientObj(patient);
                            setPatientName(`${patient.nom.toUpperCase()} ${patient.prenom}`);
                            handleTabClick('analyse');
                        }}
                    />
                )}

                {/* TAB 4: CONFIGURATION / API */}
                {activeTab === 'config' && (
                    <div className="settings-layout">
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
                                            <p>{isPatientAccount ? 'Consultez votre Espace Patient' : 'Consultez votre Espace Praticien'}</p>
                                        </div>
                                        <div className="banner-date-section">
                                            <p className="date-caption">Date d'aujourd'hui</p>
                                            <p className="date-display">{currentDate}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="dashboard-header">
                            <h1>Configuration & Statut</h1>
                            <p>Gérez vos clés d'API IA, la base de connaissances scientifique et surveillez l'état de vos services.</p>
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

                        {/* SECTION: BASE DE CONNAISSANCES PDF */}
                        <div className="kb-layout" style={{ marginTop: '10px', marginBottom: '10px' }}>
                            <div className="dashboard-header" style={{ marginBottom: '15px' }}>
                                <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Base de connaissances & ouvrages PDF</h2>
                                <p style={{ fontSize: '0.88rem' }}>Les ouvrages importés ici sont consultés par OrthoMind pour chaque analyse et consultation.</p>
                            </div>

                            {/* Upload Card */}
                            <div className="glass-panel kb-upload-card" style={{ marginBottom: '20px' }}>
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
                                <h3 style={{ display: 'flex', alignItems: 'center', fontSize: '1.1rem', marginBottom: '15px' }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', color: 'var(--primary-cyan)', filter: 'drop-shadow(0 0 4px rgba(0, 242, 254, 0.4))' }}>
                                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                    </svg>
                                    Bibliothèque du cabinet ({books.length} ouvrages indexés)
                                </h3>
                                
                                {books.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
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

                        <div className="glass-panel settings-card">
                            <h2>Intelligence artificielle (Google Gemini) <span className={`om-badge ${getGeminiApiKey() ? 'om-badge--success' : 'om-badge--warning'}`} style={{ marginLeft: '8px', verticalAlign: 'middle' }}>{getGeminiApiKey() ? 'Clé configurée' : 'Non configurée'}</span></h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '15px' }}>
                                La clé Gemini est nécessaire pour l'analyse des clichés, la retranscription et la synthèse des consultations audio, et l'assistant OrthoMind. Elle est enregistrée une seule fois pour tout le cabinet : chaque praticien connecté en profite automatiquement, sur tous ses appareils.
                            </p>
                            
                            <div className="settings-row">
                                <label htmlFor="gemini-api-key">Clé d'API Google Gemini</label>
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

                            {keyStatus && (
                                <div className={`om-notice ${keyStatus.tone === 'error' ? 'om-notice--danger' : keyStatus.tone === 'pending' ? '' : 'om-notice--success'}`} role="status">
                                    <p>{keyStatus.text}</p>
                                </div>
                            )}
                            <button 
                                className="glass-btn glass-btn-primary save-settings-btn"
                                onClick={saveApiKey}
                                disabled={keyStatus?.tone === 'pending'}
                            >
                                Vérifier et enregistrer la clé
                            </button>
                        </div>

                        <div className="glass-panel settings-card">
                            <h2>Mode d'analyse</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '15px' }}>
                                S'applique aux analyses de clichés et aux comptes-rendus de consultation sur cet appareil.
                            </p>
                            <div className="analysis-mode-options" role="radiogroup" aria-label="Mode d'analyse">
                                {([
                                    ['rapide', 'Rapide', 'Environ 20 à 40 secondes. Modèle rapide de dernière génération, raisonnement modéré, rapport dense et synthétique. Recommandé au quotidien.'],
                                    ['approfondi', 'Approfondi', '2 minutes maximum. Modèle le plus puissant, raisonnement approfondi, rapport détaillé. Pour les cas complexes.'],
                                ] as [AnalysisMode, string, string][]).map(([mode, label, description]) => (
                                    <label key={mode} className={`analysis-mode-option ${analysisMode === mode ? 'is-selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="analysis-mode"
                                            checked={analysisMode === mode}
                                            onChange={() => { setAnalysisMode(mode); setAnalysisModeState(mode); }}
                                        />
                                        <span>
                                            <strong>{label}</strong>
                                            <span className="om-muted">{description}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
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

                            {simErrorMessage && (
                                <div className="sim-error-banner" style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    color: '#f87171',
                                    padding: '14px 18px',
                                    borderRadius: '12px',
                                    fontSize: '0.92rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    margin: '15px 0',
                                    width: '100%',
                                    maxWidth: '520px',
                                    textAlign: 'left'
                                }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <div>
                                        <strong style={{ display: 'block', marginBottom: '2px', color: '#ef4444' }}>Fonctionnalité non disponible</strong>
                                        <span>{simErrorMessage}</span>
                                    </div>
                                </div>
                            )}

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
                                        onClick={() => {
                                            if (!simPhoto) return;
                                            const msg = "Cette fonctionnalité n'est pas encore disponible.";
                                            setSimErrorMessage(msg);
                                            alert(`⚠️ ${msg}`);
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
                                    className="markdown-renderer om-report"
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
                                    className="markdown-renderer om-report"
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
            {!isPatientAccount && createPortal(
                <nav className="mobile-bottom-navbar" aria-label="Navigation principale mobile">
                    <button 
                        className={`mobile-navbar-tab ${activeTab === 'analyse' ? 'active' : ''}`}
                        onClick={() => handleTabClick('analyse')}
                        title="Diagnostic"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                        <span className="mobile-navbar-label">Diagnostic</span>
                    </button>

                    <button 
                        className={`mobile-navbar-tab ${activeTab === 'patients' ? 'active' : ''}`}
                        onClick={() => handleTabClick('patients')}
                        title="Liste de patients"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span className="mobile-navbar-label">Patients</span>
                    </button>

                    {/* Center Element - OrthoMind Logo */}
                    <button 
                        className="mobile-navbar-tab mobile-navbar-logo-center"
                        onClick={() => handleTabClick('analyse')}
                        title="OrthoMind"
                    >
                        <div className="center-logo-badge">
                            <img src={logoSeul} alt="OrthoMind Logo" className="mobile-navbar-logo-img" />
                        </div>
                    </button>

                    <button 
                        className={`mobile-navbar-tab ${activeTab === 'audio' ? 'active' : ''}`}
                        onClick={() => handleTabClick('audio')}
                        title="Planning"
                    >
                        <Icon name="calendar" size={22} />
                        <span className="mobile-navbar-label">Planning</span>
                    </button>

                    <button 
                        className={`mobile-navbar-tab ${activeTab === 'config' ? 'active' : ''}`}
                        onClick={() => handleTabClick('config')}
                        title="Configuration"
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        <span className="mobile-navbar-label">Config</span>
                    </button>
                </nav>,
                document.body
            )}
        </div>
    );
};

export default Dashboard;
