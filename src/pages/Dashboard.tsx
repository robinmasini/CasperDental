import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { supabase } from '../lib/supabase';
import { extractTextFromPdf, chunkParsedPages } from '../services/pdfParser';
import { analyzeDentition, getGeminiApiKey } from '../services/geminiService';
import defaultBookData from '../assets/cgs_volume_61.json';
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
    
    // Tabs state
    const [activeTab, setActiveTab] = useState<'analyse' | 'knowledge' | 'history' | 'config'>('analyse');
    
    // API Configuration key
    const [geminiKey, setGeminiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [dbConnected, setDbConnected] = useState<boolean | null>(null);

    // Patients & Images Upload State
    const [patientName, setPatientName] = useState('');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    
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

    // Load indexed orthodontic books
    const loadBooks = async () => {
        const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
        const isCgsDeleted = localStorage.getItem('casper_cgs_deleted') === 'true';
        
        if (isMockAuth) {
            const localBooks = localStorage.getItem('casper_mock_books');
            const parsedLocal = localBooks ? JSON.parse(localBooks) : [];
            const hasDefault = parsedLocal.some((b: any) => b.id === defaultBookData.document.id);
            const combinedBooks = (hasDefault || isCgsDeleted) ? parsedLocal : [defaultBookData.document, ...parsedLocal];
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
                const combined = (hasDefault || isCgsDeleted) ? data : [defaultBookData.document, ...data];
                setBooks(combined);
            } else {
                const localBooks = localStorage.getItem('casper_mock_books');
                const parsedLocal = localBooks ? JSON.parse(localBooks) : [];
                const hasDefault = parsedLocal.some((b: any) => b.id === defaultBookData.document.id);
                setBooks((hasDefault || isCgsDeleted) ? parsedLocal : [defaultBookData.document, ...parsedLocal]);
            }
        } catch (e) {
            console.error('Failed to load books from Supabase, loading local:', e);
            const localBooks = localStorage.getItem('casper_mock_books');
            const parsedLocal = localBooks ? JSON.parse(localBooks) : [];
            const hasDefault = parsedLocal.some((b: any) => b.id === defaultBookData.document.id);
            setBooks((hasDefault || isCgsDeleted) ? parsedLocal : [defaultBookData.document, ...parsedLocal]);
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

    // Handle images selection
    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            const processedFiles: File[] = [];

            for (const file of filesArray) {
                const nameLower = file.name.toLowerCase();
                if (nameLower.endsWith('.heic') || nameLower.endsWith('.heif') || file.type === 'image/heic') {
                    try {
                        const heic2anyModule = await import('heic2any');
                        const heic2any = heic2anyModule.default;
                        const resultBlob = await heic2any({
                            blob: file,
                            toType: 'image/jpeg',
                            quality: 0.8
                        });
                        const blob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
                        const convertedFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                            type: 'image/jpeg'
                        });
                        processedFiles.push(convertedFile);
                    } catch (err) {
                        console.error('HEIC conversion error, using original file:', err);
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
            });

            clearInterval(logIntervalRef.current);
            addLog('[SUCCESS] Rapport de diagnostic finalisé avec succès.');
            
            setAnalysisResult(result);
            setIsScanning(false);

            // Save to History (Supabase or Local fallback)
            try {
                // Convert images to base64 array for local persistence if needed
                const base64Images: string[] = [];
                for (const file of imageFiles) {
                    const reader = new FileReader();
                    const b64Promise = new Promise<string>((resolve) => {
                        reader.onloadend = () => resolve(reader.result as string);
                    });
                    reader.readAsDataURL(file);
                    base64Images.push(await b64Promise);
                }

                const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
                let savedToSupabase = false;

                if (supabaseUser && !isMockAuth) {
                    const { error } = await supabase.from('dental_analyses').insert({
                        user_id: supabaseUser.id,
                        patient_name: currentPatient,
                        images: base64Images,
                        diagnostic_text: result.diagnostic,
                        traitement_text: result.traitement
                    });
                    if (!error) {
                        savedToSupabase = true;
                    } else {
                        console.warn('Failed to save to Supabase, falling back to local history:', error.message);
                    }
                }

                if (!savedToSupabase) {
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
        // Basic Markdown-to-HTML parser for clinical display
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^-\s+(.*)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n/g, '<br/>');
    };

    return (
        <div className="dashboard-container">
            {/* Sidebar navigation */}
            <aside className="sidebar-glass">
                <div className="sidebar-brand-wrapper">
                    <div className="sidebar-logo-container">
                        <Logo size="medium" />
                    </div>
                </div>

                <nav className="sidebar-menu">
                    <button 
                        className={`sidebar-nav-btn ${activeTab === 'analyse' ? 'active' : ''}`}
                        onClick={() => setActiveTab('analyse')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                        </svg>
                        Analyse Clinique
                    </button>
                    
                    <button 
                        className={`sidebar-nav-btn ${activeTab === 'knowledge' ? 'active' : ''}`}
                        onClick={() => setActiveTab('knowledge')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        Connaissances PDF
                    </button>

                    <button 
                        className={`sidebar-nav-btn ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Historique Scans
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
                    <div className="profile-avatar-glow">
                        {user?.name?.[0] || 'D'}
                    </div>
                    <div className="profile-info">
                        <h4>{user?.name || 'Dr. Dentiste'}</h4>
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
                        <div className="dashboard-header">
                            <h1>Diagnostic Casper Expert</h1>
                            <p>Déposez les photographies intra-buccales de votre patient pour initier l'analyse clinique par RAG.</p>
                        </div>

                        <div className="analyse-grid">
                            {/* Drag and Drop Zone Card */}
                            <div className="glass-panel upload-panel">
                                <h2>Nouveau Diagnostic</h2>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '25px' }}>
                                    Glissez vos fichiers ou sélectionnez-les pour commencer.
                                </p>

                                <div className="patient-input-group">
                                    <label htmlFor="patient-name">Nom ou Référence du Patient</label>
                                    <input 
                                        type="text" 
                                        id="patient-name"
                                        className="glass-input" 
                                        value={patientName}
                                        onChange={(e) => setPatientName(e.target.value)}
                                        placeholder="Ex: Jean Dupont (N° 4015)"
                                        disabled={isScanning}
                                    />
                                </div>

                                <div className="patient-input-group">
                                    <label>Clichés dentaires (Recommandé : 5-6 photos)</label>
                                    <input 
                                        type="file" 
                                        id="dental-photos-input"
                                        multiple 
                                        accept="image/*" 
                                        onChange={handleImageChange}
                                        style={{ display: 'none' }}
                                        disabled={isScanning}
                                    />
                                    
                                    <label 
                                        htmlFor="dental-photos-input" 
                                        className="dropzone-container"
                                    >
                                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                            <circle cx="8.5" cy="8.5" r="1.5" />
                                            <polyline points="21 15 16 10 5 21" />
                                        </svg>
                                        <span className="dropzone-title">Sélectionner les clichés dentaires</span>
                                        <span className="dropzone-subtitle">Formats JPEG, PNG supportés. Maximum 6 images.</span>
                                    </label>
                                </div>

                                {/* Preview Grid */}
                                {previewUrls.length > 0 && (
                                    <div className="previews-grid">
                                        {previewUrls.map((url, idx) => (
                                            <div key={idx} className="preview-item">
                                                <img src={url} alt={`Preview ${idx + 1}`} />
                                                {!isScanning && (
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
                                    disabled={isScanning || imageFiles.length === 0}
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                        <path d="M2 12h20" />
                                    </svg>
                                    Lancer l'analyse Casper
                                </button>
                            </div>

                            {/* Scanner HUD Overlay */}
                            <div className="glass-panel hud-panel">
                                {isScanning ? (
                                    <>
                                        <div className="scan-animation-wrapper">
                                            <div className="hud-circular-radar">
                                                <div className="hud-radar-rotor"></div>
                                                <div className="hud-radar-center">🦷</div>
                                            </div>
                                            
                                            <div className="hud-images-grid">
                                                {previewUrls.slice(0, 3).map((url, i) => (
                                                    <div key={i} className="hud-image-cell">
                                                        <img src={url} alt="scanning" />
                                                        <div className="scan-laser-line"></div>
                                                    </div>
                                                ))}
                                            </div>
                                            
                                            <div className="hud-grid-overlay"></div>
                                        </div>

                                        <div>
                                            <div className="hud-console-logs">
                                                {consoleLogs.map((log, idx) => (
                                                    <div key={idx} className="console-line">
                                                        <span className="console-timestamp">[{log.time}]</span>
                                                        <span>{log.msg}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="console-status-text">{scanStatusText}</p>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', textAlign: 'center', padding: '30px' }}>
                                        <span style={{ fontSize: '3rem', marginBottom: '15px' }}>🔮</span>
                                        <h3 style={{ marginBottom: '8px' }}>Console Optique Clinique</h3>
                                        <p style={{ fontSize: '0.9rem' }}>Veuillez soumettre des photos et démarrer Casper pour observer la télémétrie de scan et les diagnostics RAG.</p>
                                    </div>
                                )}
                            </div>

                            {/* Diagnostic & Traitement split outputs */}
                            {analysisResult && (
                                <div className="glass-panel results-panel">
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
                            )}
                        </div>
                    </>
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
                                <span className="dropzone-title">Sélectionner un livre ou cours d'orthodontie (PDF)</span>
                                <span className="dropzone-subtitle">Le fichier sera converti en blocs textuels indexés dans Supabase.</span>
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
                            <h2>Bibliothèque Scientifique de Casper ({books.length} livres indexés)</h2>
                            
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

                {/* TAB 3: SCAN HISTORY */}
                {activeTab === 'history' && (
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
                                                            onClick={() => setSelectedHistoryItem(item)}
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
                )}

                {/* TAB 4: CONFIGURATION / API */}
                {activeTab === 'config' && (
                    <div className="settings-layout">
                        <div className="dashboard-header">
                            <h1>Configuration & Statut</h1>
                            <p>Gérez vos clés d'API IA et surveillez l'état de synchronisation de vos bases de stockage en ligne.</p>
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
        </div>
    );
};

export default Dashboard;
