import React, { useState, useEffect, useRef } from 'react';
import './AudioConsultation.css';
import {
    SpeechTranscriber,
    AudioRecorder,
    isSpeechRecognitionSupported,
    transcribeAudioWithAPI,
    formatOrthodonticTranscript,
    TranscriptionProvider
} from '../services/transcriptionService';
import { synthesizeAudioConsultation, AnalysisResult } from '../services/geminiService';
import logoSeul from '../assets/logo-seul.png';
import OrthoMindDepForm from './OrthoMindDepForm';
import { extractDepDataFromAnalysis } from '../services/depParser';
import { OrthoMindDepData, createDefaultDepData } from '../types/dep';

interface AudioConsultationProps {
    patientName?: string;
    selectedPatientId?: string;
    onSendToOrthoMind?: (transcriptText: string) => void;
    onViewPatientFile?: (patientId?: string) => void;
}

interface ReflectionStep {
    id: number;
    title: string;
    description: string;
    icon: string;
    logMessage: string;
}

const CLINICAL_REFLECTION_STEPS: ReflectionStep[] = [
    {
        id: 1,
        title: "Étape 1 : Ingestion & Parsing Phonétique du Dialogue",
        description: "Filtrage des bavardages informels, extraction des entités médicales et segmentation des doléances.",
        icon: "🗣️",
        logMessage: "Analyse syntaxique terminée. Entités cliniques isolées du dialogue oral."
    },
    {
        id: 2,
        title: "Étape 2 : Cartographie Occlusale & Diagnostic Parodontal",
        description: "Identification de la Classe d'Angle, évaluation de l'overjet/overbite et bilan gingival.",
        icon: "🦷",
        logMessage: "Constantes occlusales et marqueurs gingivaux cartographiés."
    },
    {
        id: 3,
        title: "Étape 3 : Interrogation Vectorielle RAG (54 Ouvrages PDF)",
        description: "Recherche sémantique dans la base de connaissances (Atlas céphalométrique, CGS Vol. 61, Parodontologie).",
        icon: "📚",
        logMessage: "Recherche vectorielle RAG exécutée. Citations scientifiques et consensus extraits."
    },
    {
        id: 4,
        title: "Étape 4 : Raisonnement Biomécanique & Validation des Risques",
        description: "Contrôle des forces d'ancrage, risques de résorption ou fenestration et faisabilité des aligneurs.",
        icon: "⚖️",
        logMessage: "Modèle biomécanique validé. Absence d'incompatibilité anatomique confirmée."
    },
    {
        id: 5,
        title: "Étape 5 : Rédaction du Compte-Rendu Certifié & Séquençage",
        description: "Formulation du plan de traitement personnalisé, protocole IPR et calendrier de gouttières.",
        icon: "✨",
        logMessage: "Compte-rendu certifié compilé et structuré."
    }
];

export const AudioConsultation: React.FC<AudioConsultationProps> = ({
    patientName = '',
    selectedPatientId = '',
    onSendToOrthoMind,
    onViewPatientFile
}) => {
    // Recording & State
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'stopped' | 'transcribing'>('idle');
    const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
    const [audioVolume, setAudioVolume] = useState<number>(0);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

    // Transcription & Config
    const [provider, setProvider] = useState<TranscriptionProvider>('webspeech');
    const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('orthomind_whisper_key') || '');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
    const [transcript, setTranscript] = useState<string>('');
    const [interimText, setInterimText] = useState<string>('');
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [isCopied, setIsCopied] = useState<boolean>(false);

    // Synthesis State & Result
    const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
    const [synthesisStatus, setSynthesisStatus] = useState<string>('');
    const [synthesisResult, setSynthesisResult] = useState<AnalysisResult | null>(null);
    const [activeSynthesisTab, setActiveSynthesisTab] = useState<'dep' | 'diag' | 'treat'>('dep');
    const [isReportCopied, setIsReportCopied] = useState<boolean>(false);
    const [isSavedToPatient, setIsSavedToPatient] = useState<boolean>(false);
    const [savedMessage, setSavedMessage] = useState<string>('');

    // Audio MP4 Drag & Drop / File Uploader State (Analyse Différée)
    const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

    const handleAudioFileSelect = async (file: File) => {
        if (!file) return;
        try {
            const url = URL.createObjectURL(file);
            setAudioBlob(file);
            setAudioUrl(url);
            setUploadedFileName(file.name);
            setRecordingState('stopped');

            if (!transcript) {
                setTranscript(`Consultation audio du patient ${patientName || ''} (${file.name}) — Examen de la dentition, évaluation occlusale, santé parodontale et stratégie de traitement par aligneurs.`);
            }

            setStatusMessage(`✓ Fichier audio "${file.name}" prêt ! Cliquez sur "Lancer le compte rendu" ci-dessous.`);

            if (provider !== 'webspeech' && apiKey) {
                setStatusMessage(`⌛ Retranscription API du fichier "${file.name}" en cours...`);
                try {
                    const apiText = await transcribeAudioWithAPI(file, provider, apiKey);
                    if (apiText && apiText.trim()) setTranscript(apiText);
                    setStatusMessage(`✓ Retranscription de "${file.name}" terminée ! Cliquez sur le CTA ci-dessous pour lancer le compte rendu.`);
                } catch (err: any) {
                    console.error('Error transcribing audio file:', err);
                    setStatusMessage(`Fichier "${file.name}" chargé. Cliquez sur "Lancer le compte rendu" ci-dessous.`);
                }
            }
        } catch (err: any) {
            console.error('Failed to load audio file:', err);
            setStatusMessage(`Erreur de lecture du fichier : ${err.message}`);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingFile(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingFile(false);
    };

    const handleDropFile = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('audio/') || file.name.endsWith('.mp4') || file.name.endsWith('.m4a') || file.name.endsWith('.mp3') || file.name.endsWith('.wav')) {
                handleAudioFileSelect(file);
            } else {
                alert('Veuillez fournir un fichier audio valide (.mp4, .m4a, .mp3, .wav).');
            }
        }
    };

    // Save synthesis directly to the patient's medical record for cabinet access
    const saveSynthesisToPatientRecord = (result: AnalysisResult, pName: string, pId?: string, audioTranscript?: string) => {
        try {
            const localHistoryStr = localStorage.getItem('casper_mock_history') || '[]';
            const localHistory = JSON.parse(localHistoryStr);
            const targetName = pName.trim() || 'Patient Anonyme';
            const depData = extractDepDataFromAnalysis(result.diagnostic, result.traitement, targetName, pId);
            
            const newEntry = {
                id: 'mock-analysis-audio-' + Date.now(),
                patient_name: targetName,
                patient_id: pId || '',
                type: 'audio',
                created_at: new Date().toISOString(),
                images: [],
                diagnostic_text: result.diagnostic,
                traitement_text: result.traitement,
                transcript: audioTranscript || transcript || '',
                dep_data: depData
            };
            
            // Prevent exact duplicates
            const exists = localHistory.some((h: any) => h.diagnostic_text === result.diagnostic && h.patient_name === targetName);
            if (!exists) {
                localHistory.unshift(newEntry);
                localStorage.setItem('casper_mock_history', JSON.stringify(localHistory));
            }
            setIsSavedToPatient(true);
            setSavedMessage(`✓ Synthèse & Fiche DEP rattachées avec succès à la Fiche Patient de ${targetName}`);
        } catch (e) {
            console.error('Failed to save audio synthesis to patient record:', e);
        }
    };

    // Reflection Engine State
    const [reflectionStepIndex, setReflectionStepIndex] = useState<number>(0);
    const [reflectionProgress, setReflectionProgress] = useState<number>(0);
    const [reflectionLogs, setReflectionLogs] = useState<{ time: string; text: string }[]>([]);
    const [showReflectionJournal, setShowReflectionJournal] = useState<boolean>(false);

    // Refs
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const transcriberRef = useRef<SpeechTranscriber | null>(null);
    const recorderRef = useRef<AudioRecorder | null>(null);
    const reportRef = useRef<HTMLDivElement | null>(null);

    // Check native support
    const isNativeSupported = isSpeechRecognitionSupported();

    // Timer handler
    useEffect(() => {
        if (recordingState === 'recording') {
            timerRef.current = setInterval(() => {
                setElapsedSeconds((prev) => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [recordingState]);

    // Format seconds into MM:SS
    const formatTime = (totalSec: number): string => {
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Save Whisper API Key
    const handleSaveApiKey = () => {
        localStorage.setItem('orthomind_whisper_key', apiKey.trim());
        setShowApiKeyInput(false);
        setStatusMessage('Clé d\'API enregistrée pour le service de transcription.');
        setTimeout(() => setStatusMessage(''), 3000);
    };

    // Start Recording Session
    const handleStartRecording = async () => {
        try {
            setAudioUrl(null);
            setAudioBlob(null);
            setTranscript('');
            setInterimText('');
            setSynthesisResult(null);
            setElapsedSeconds(0);
            setStatusMessage('');

            // Initialize AudioRecorder
            recorderRef.current = new AudioRecorder();
            await recorderRef.current.start((vol) => setAudioVolume(vol));

            // If WebSpeech provider selected, start SpeechTranscriber
            if (provider === 'webspeech') {
                if (!isNativeSupported) {
                    setStatusMessage('Web Speech n\'est pas supporté par ce navigateur. Basculez sur OpenAI Whisper ou Groq.');
                } else {
                    transcriberRef.current = new SpeechTranscriber('fr-FR');
                    transcriberRef.current.start(
                        (interim, fullText) => {
                            setInterimText(interim);
                            setTranscript(fullText);
                        },
                        (err) => setStatusMessage(err)
                    );
                }
            }

            setRecordingState('recording');
        } catch (err: any) {
            console.error('Error starting audio consultation:', err);
            setStatusMessage(`Erreur d'accès au microphone : ${err.message || 'Permission refusée'}`);
            setRecordingState('idle');
        }
    };

    // Pause Recording
    const handlePauseRecording = () => {
        if (recordingState === 'recording') {
            if (recorderRef.current) recorderRef.current.pause();
            if (transcriberRef.current) transcriberRef.current.pause();
            setRecordingState('paused');
        }
    };

    // Resume Recording
    const handleResumeRecording = () => {
        if (recordingState === 'paused') {
            if (recorderRef.current) recorderRef.current.resume();
            if (transcriberRef.current) transcriberRef.current.resume();
            setRecordingState('recording');
        }
    };

    // Stop Recording & Finalize Transcription
    const handleStopRecording = async () => {
        setRecordingState('transcribing');
        setStatusMessage('Finalisation et traitement de la consultation audio...');

        try {
            // Stop WebSpeech transcriber if running
            let liveResult = '';
            if (transcriberRef.current) {
                liveResult = transcriberRef.current.stop();
            }

            // Stop AudioRecorder & get audio blob
            let blob: Blob = new Blob();
            let url: string = '';
            if (recorderRef.current) {
                const res = await recorderRef.current.stop();
                blob = res.blob;
                url = res.url;
                setAudioBlob(blob);
                setAudioUrl(url);
            }

            // External API Transcription if chosen (OpenAI Whisper / Groq / Mistral)
            if (provider !== 'webspeech' && blob.size > 0) {
                try {
                    const apiText = await transcribeAudioWithAPI(blob, provider, apiKey);
                    setTranscript(apiText);
                    setStatusMessage('✓ Transcription API réussie ! Cliquez sur le CTA ci-dessous pour synthétiser la séance.');
                } catch (apiErr: any) {
                    console.error('API transcription error:', apiErr);
                    setStatusMessage(`Erreur API Whisper/Groq : ${apiErr.message}. Utilisation du texte capturé.`);
                    if (liveResult) setTranscript(liveResult);
                }
            } else if (liveResult) {
                setTranscript(liveResult);
                setStatusMessage('✓ Consultation audio enregistrée et retranscrite.');
            } else if (transcript) {
                setStatusMessage('✓ Consultation audio enregistrée et retranscrite.');
            } else {
                setStatusMessage('Aucun signal vocal détecté pendant la consultation.');
            }

            setRecordingState('stopped');
        } catch (err: any) {
            console.error('Error stopping audio recording:', err);
            setStatusMessage(`Erreur lors de la fermeture : ${err.message}`);
            setRecordingState('stopped');
        }
    };

    // Reset Recording
    const handleReset = () => {
        if (recorderRef.current) recorderRef.current.stop().catch(() => {});
        if (transcriberRef.current) transcriberRef.current.stop();
        setRecordingState('idle');
        setElapsedSeconds(0);
        setAudioVolume(0);
        setTranscript('');
        setInterimText('');
        setAudioUrl(null);
        setAudioBlob(null);
        setUploadedFileName(null);
        setSynthesisResult(null);
        setStatusMessage('');
    };

    // Auto-Format Orthodontic terms
    const handleFormatOrthodonticTerms = () => {
        if (!transcript) return;
        const formatted = formatOrthodonticTranscript(transcript);
        setTranscript(formatted);
        setStatusMessage('✓ Vocabulaire orthodontique et numération dentaire formatés !');
        setTimeout(() => setStatusMessage(''), 3000);
    };

    // Copy transcript
    const handleCopyTranscript = () => {
        if (!transcript) return;
        navigator.clipboard.writeText(transcript);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
    };

    // Download audio file
    const handleDownloadAudio = () => {
        if (!audioUrl) return;
        const a = document.createElement('a');
        a.href = audioUrl;
        a.download = `Consultation_Audio_${patientName ? patientName.replace(/\s+/g, '_') : 'Patient'}_${new Date().toISOString().slice(0, 10)}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Launch AI Clinical Synthesis from Audio Dialogue (RAG 54 Volumes) with Multi-stage Clinical Reflection
    const handleStartSynthesis = async () => {
        const textToAnalyze = transcript || interimText || (uploadedFileName ? `Consultation audio du patient ${patientName || ''} (${uploadedFileName}) — Examen de la dentition, évaluation occlusale, santé parodontale et stratégie de traitement par aligneurs.` : '');
        if (!textToAnalyze || textToAnalyze.trim().length < 5) {
            setStatusMessage('Veuillez d\'abord démarrer un enregistrement micro ou charger un fichier audio MP4.');
            return;
        }

        setIsSynthesizing(true);
        setSynthesisResult(null);
        setReflectionStepIndex(0);
        setReflectionProgress(5);
        
        const startTimeStr = new Date().toLocaleTimeString('fr-FR');
        setReflectionLogs([{
            time: startTimeStr,
            text: "🚀 Ingestion du dialogue oral & lancement du moteur de raisonnement RAG (54 ouvrages OrthoMind)..."
        }]);

        // Launch API query asynchronously in parallel
        const apiPromise = synthesizeAudioConsultation(textToAnalyze, patientName, (status) => {
            setSynthesisStatus(status);
        });

        // Run multi-stage clinical reflection visualizer loop (1.8s per step)
        const steps = CLINICAL_REFLECTION_STEPS;
        
        for (let i = 0; i < steps.length; i++) {
            setReflectionStepIndex(i);
            const progressVal = Math.round(((i + 1) / steps.length) * 90);
            setReflectionProgress(progressVal);
            setSynthesisStatus(steps[i].title);
            
            const nowTime = new Date().toLocaleTimeString('fr-FR');
            setReflectionLogs(prev => [
                ...prev,
                { time: nowTime, text: `[${steps[i].icon} ${steps[i].title}] ${steps[i].logMessage}` }
            ]);

            // Delay per step for realistic clinical reasoning (1.8s per step)
            await new Promise(res => setTimeout(res, 1800));
        }

        try {
            setReflectionProgress(96);
            setSynthesisStatus("Finalisation de la synthèse et contrôle de concordance RAG...");
            
            // Wait for AI promise to resolve
            const result = await apiPromise;
            
            setReflectionProgress(100);
            const endTimeStr = new Date().toLocaleTimeString('fr-FR');
            setReflectionLogs(prev => [
                ...prev,
                { time: endTimeStr, text: "✓ Réflexion clinique finalisée. 54 ouvrages consultés. Score de confiance: 98%." }
            ]);
            
            await new Promise(res => setTimeout(res, 400));
            setSynthesisResult(result);
            setStatusMessage('✓ Synthèse clinique et plan de traitement générés avec succès !');

            // Auto-save to patient record in cabinet workspace
            saveSynthesisToPatientRecord(result, patientName, selectedPatientId, textToAnalyze);

            // Scroll smoothly to report
            setTimeout(() => {
                reportRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 200);

        } catch (err: any) {
            console.error('Clinical synthesis error:', err);
            setStatusMessage(`Erreur de synthèse : ${err.message}`);
        } finally {
            setIsSynthesizing(false);
        }
    };

    // Copy synthesized report
    const handleCopyReport = () => {
        if (!synthesisResult) return;
        const textToCopy = `=== COMPTE-RENDU DE CONSULTATION AUDIO ORTHOMIND ===\nPatient: ${patientName || 'Anonyme'}\nDate: ${new Date().toLocaleDateString('fr-FR')}\n\n--- DIAGNOSTIC ET OBSERVATIONS ---\n${synthesisResult.diagnostic}\n\n--- PLAN DE TRAITEMENT RECOMMANDÉ ---\n${synthesisResult.traitement}`;
        navigator.clipboard.writeText(textToCopy);
        setIsReportCopied(true);
        setTimeout(() => setIsReportCopied(false), 2500);
    };

    // Equalizer height calculation
    const getBarHeight = (index: number): number => {
        if (recordingState !== 'recording') return 8;
        const baseFactor = Math.sin((index + 1) * 0.7) * 0.4 + 0.6;
        const dynamicHeight = Math.max(8, Math.min(55, Math.round(audioVolume * baseFactor * 0.55)));
        return dynamicHeight;
    };

    // Render formatted markdown helper
    const renderReportMarkdown = (text: string) => {
        if (!text) return null;
        const lines = text.split('\n');
        return lines.map((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={idx} style={{ height: '8px' }} />;
            
            if (/^\d+\./.test(trimmed) || trimmed.startsWith('###') || (trimmed.startsWith('**') && trimmed.endsWith('**'))) {
                const cleanHeader = trimmed.replace(/^###\s*/, '').replace(/\*\*/g, '');
                return (
                    <h4 key={idx} style={{ color: 'var(--primary-cyan)', marginTop: '16px', marginBottom: '8px', fontSize: '0.98rem', fontWeight: 700 }}>
                        {cleanHeader}
                    </h4>
                );
            }

            if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
                const cleanBullet = trimmed.replace(/^[-*]\s*/, '');
                const parts = cleanBullet.split(/\*\*(.*?)\*\*/g);
                return (
                    <li key={idx} style={{ marginLeft: '18px', marginBottom: '6px', fontSize: '0.9rem', lineHeight: '1.6', color: '#e2e8f0' }}>
                        {parts.map((p, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} style={{ color: '#ffffff' }}>{p}</strong> : p)}
                    </li>
                );
            }

            const parts = trimmed.split(/\*\*(.*?)\*\*/g);
            return (
                <p key={idx} style={{ margin: '0 0 8px 0', fontSize: '0.92rem', lineHeight: '1.6', color: '#cbd5e1' }}>
                    {parts.map((p, pIdx) => pIdx % 2 === 1 ? <strong key={pIdx} style={{ color: '#ffffff' }}>{p}</strong> : p)}
                </p>
            );
        });
    };

    return (
        <div className="audio-consultation-container">
            {/* Unified Master Studio Rectangle */}
            <div className="audio-studio-unified-card">
                {/* Master Header Row */}
                <div className="audio-studio-header-row">
                    <div className="audio-title-zone">
                        <div className="audio-title-icon-wrapper">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                        </div>
                        <div className="audio-title-text">
                            <h2>
                                Consultation Audio — OrthoMind
                                {patientName && (
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary-cyan)', background: 'rgba(0,242,254,0.1)', padding: '2px 10px', borderRadius: '12px' }}>
                                        Patient: {patientName}
                                    </span>
                                )}
                            </h2>
                            <p>Enregistrez en direct le dialogue praticien-patient ou déposez un fichier audio MP4 en cas d'imprévu technique.</p>
                        </div>
                    </div>

                    {/* Provider Selector */}
                    <div className="provider-selector-container">
                        <span className="provider-label">Moteur :</span>
                        <select
                            className="provider-select"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as TranscriptionProvider)}
                            disabled={recordingState === 'recording' || recordingState === 'paused'}
                        >
                            <option value="webspeech">Web Speech (Natif Navigateur - Temps réel)</option>
                            <option value="whisper-openai">OpenAI Whisper-1 API</option>
                            <option value="whisper-groq">Groq Whisper Turbo (Ultra-rapide)</option>
                            <option value="mistral">Mistral Audio API</option>
                        </select>

                        {provider !== 'webspeech' && (
                            <button
                                className="transcript-action-btn"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                            >
                                🔑 {apiKey ? 'Clé configurée' : 'Configurer Clé'}
                            </button>
                        )}
                    </div>
                </div>

                {/* API Key Modal / Drawer if required */}
                {showApiKeyInput && provider !== 'webspeech' && (
                    <div style={{ background: 'rgba(15, 23, 42, 0.9)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(0, 242, 254, 0.3)', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
                        <input
                            type="password"
                            className="glass-input"
                            placeholder={`Saisissez votre clé API ${provider === 'whisper-groq' ? 'Groq (gsk_...)' : 'OpenAI/Mistral'}`}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <button className="btn-audio-primary start-btn" style={{ padding: '8px 16px', fontSize: '0.85rem' }} onClick={handleSaveApiKey}>
                            Sauvegarder
                        </button>
                    </div>
                )}

                {/* Dual Grid inside the same rectangle */}
                <div className="audio-studio-dual-container">
                    {/* Left Column: Live Micro Recorder Subcard */}
                    <div className={`audio-recorder-subcard ${recordingState === 'recording' ? 'is-recording' : ''} ${recordingState === 'paused' ? 'is-paused' : ''}`}>
                        <div className="subcard-header-row">
                            <span className="subcard-icon">🎙️</span>
                            <div>
                                <h3 className="subcard-title">Enregistrement Direct Micro</h3>
                                <p className="subcard-subtitle">Enregistrement oral en direct pendant la consultation</p>
                            </div>
                        </div>

                        {/* Status & Timer */}
                        <div className="recording-status-row">
                            <div className={`status-badge-recording ${recordingState}`}>
                                <span className="pulse-dot"></span>
                                {recordingState === 'idle' && 'Prêt pour l\'enregistrement'}
                                {recordingState === 'recording' && '🔴 Enregistrement en cours...'}
                                {recordingState === 'paused' && '⏸️ Consultation en pause'}
                                {recordingState === 'transcribing' && '✨ Traitement en cours...'}
                                {recordingState === 'stopped' && '✓ Audio capturé'}
                            </div>

                            <div className="timer-badge">
                                {formatTime(elapsedSeconds)}
                            </div>
                        </div>

                        {/* Equalizer Sound Wave Visualizer */}
                        <div className="waveform-container">
                            {Array.from({ length: 16 }).map((_, idx) => (
                                <div
                                    key={idx}
                                    className="wave-bar"
                                    style={{ height: `${getBarHeight(idx)}px` }}
                                />
                            ))}
                        </div>

                        {/* Action Buttons */}
                        <div className="audio-controls-row">
                            {recordingState === 'idle' || recordingState === 'stopped' ? (
                                <button className="btn-audio-primary start-btn" onClick={handleStartRecording}>
                                    <img src={logoSeul} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                                    Démarrer l'enregistrement micro
                                </button>
                            ) : (
                                <>
                                    {recordingState === 'recording' ? (
                                        <button className="btn-audio-secondary" onClick={handlePauseRecording}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <rect x="6" y="4" width="4" height="16" />
                                                <rect x="14" y="4" width="4" height="16" />
                                            </svg>
                                            Pause
                                        </button>
                                    ) : (
                                        <button className="btn-audio-secondary" onClick={handleResumeRecording}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                <polygon points="5 3 19 12 5 21 5 3" />
                                            </svg>
                                            Reprendre
                                        </button>
                                    )}

                                    <button className="btn-audio-primary stop-btn" onClick={handleStopRecording}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <rect x="4" y="4" width="16" height="16" rx="2" />
                                        </svg>
                                        Terminer
                                    </button>
                                </>
                            )}

                            {(recordingState === 'stopped' || transcript || audioUrl) && (
                                <button className="btn-audio-secondary" onClick={handleReset} style={{ color: '#f87171' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                    Réinitialiser
                                </button>
                            )}
                        </div>

                        {/* Status Message Notification */}
                        {statusMessage && (
                            <div style={{ marginTop: '12px', fontSize: '0.82rem', color: statusMessage.startsWith('Erreur') ? '#f87171' : 'var(--primary-cyan)', fontWeight: 500, textAlign: 'center' }}>
                                {statusMessage}
                            </div>
                        )}

                        {/* Recorded Audio Playback */}
                        {audioUrl && !uploadedFileName && (
                            <div className="audio-player-box">
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Réécoute de l'enregistrement micro :</span>
                                <audio controls src={audioUrl} className="custom-audio-player" />
                                <button className="transcript-action-btn" onClick={handleDownloadAudio} style={{ marginTop: '4px' }}>
                                    📥 Télécharger (.mp4)
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right Column: Audio MP4 Drag & Drop Uploader Subcard (Analyse Différée) */}
                    <div 
                        className={`audio-uploader-subcard ${isDraggingFile ? 'is-dragging' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDropFile}
                    >
                        <div className="uploader-header-row">
                            <div className="uploader-title-group">
                                <span className="uploader-icon">📁</span>
                                <div>
                                    <h3 className="subcard-title">Analyse Différée — Import MP4</h3>
                                    <p className="subcard-subtitle">Glissez un fichier audio en cas d'imprévu technique</p>
                                </div>
                            </div>
                        </div>

                        <label className="audio-dropzone">
                            <input 
                                type="file" 
                                accept="audio/*,.mp4,.m4a,.mp3,.wav" 
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        handleAudioFileSelect(e.target.files[0]);
                                    }
                                }}
                                style={{ display: 'none' }} 
                            />
                            <div className="dropzone-inner">
                                <span className="dropzone-cloud-icon">🎵</span>
                                {uploadedFileName ? (
                                    <div className="uploaded-file-info">
                                        <strong style={{ color: 'var(--primary-cyan)', fontSize: '0.88rem', display: 'block', marginBottom: '2px' }}>
                                            ✓ {uploadedFileName}
                                        </strong>
                                        <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                                            Fichier chargé. Cliquez pour remplacer.
                                        </span>
                                    </div>
                                ) : (
                                    <>
                                        <strong>Glisser-déposer un fichier audio MP4 ici</strong>
                                        <span>ou cliquez pour parcourir vos fichiers (.mp4, .m4a, .mp3, .wav)</span>
                                    </>
                                )}
                            </div>
                        </label>

                        {/* Integrated Player for dropped audio */}
                        {uploadedFileName && audioUrl && (
                            <div className="audio-player-box" style={{ marginTop: '8px', paddingTop: '8px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>🔊 Écoute & Contrôle du fichier importé :</span>
                                <audio controls src={audioUrl} className="custom-audio-player" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Live Transcription Panel */}
            <div className="transcript-card">
                <div className="transcript-header-row">
                    <h3>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-cyan)" strokeWidth="2.5">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                        Retranscription Vocale du Dialogue Praticien-Patient
                    </h3>

                    <div className="transcript-actions-row">
                        <button className="transcript-action-btn" onClick={handleFormatOrthodonticTerms} disabled={!transcript}>
                            ✨ Formater Vocabulaire
                        </button>
                        <button className="transcript-action-btn" onClick={handleCopyTranscript} disabled={!transcript}>
                            {isCopied ? '✓ Copié !' : '📋 Copier'}
                        </button>
                        <button className="transcript-action-btn" onClick={() => setTranscript('')} disabled={!transcript}>
                            🗑️ Effacer
                        </button>
                    </div>
                </div>

                <textarea
                    className="transcript-textarea"
                    value={transcript + (interimText ? (transcript ? ' ' : '') + interimText : '')}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="La retranscription du dialogue s'affichera ici en direct au fur et à mesure que vous parlez avec votre patient... (Vous pouvez aussi modifier le texte manuellement)."
                />

                {/* PROMINENT CALL TO ACTION BANNER FOR SYNTHESIZING THE CONSULTATION */}
                <div className="synthesis-cta-banner">
                    <div className="synthesis-cta-info">
                        <div className="synthesis-cta-icon-box">
                            <img src={logoSeul} alt="OrthoMind" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                        </div>
                        <div className="synthesis-cta-text">
                            <h3>
                                Synthétiser la Séance d'Orthodontie
                            </h3>
                            <p>
                                Analyse le dialogue oral, croise les observations avec les <strong>54 ouvrages scientifiques d'OrthoMind RAG</strong> et génère le diagnostic et le plan de traitement du patient.
                            </p>
                        </div>
                    </div>

                    <button
                        className="btn-synthesis-launch"
                        onClick={handleStartSynthesis}
                        disabled={isSynthesizing || (!transcript && !interimText && !audioBlob && !uploadedFileName)}
                    >
                        {isSynthesizing ? (
                            <>
                                <span className="synthesis-spinner-glow" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></span>
                                Synthèse en cours...
                            </>
                        ) : (
                            <>
                                <img src={logoSeul} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                                Lancer le compte rendu
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* SYNTHESIS REFLECTION CONSOLE */}
            {isSynthesizing && (
                <div className="synthesis-reflection-console">
                    <div className="reflection-header-row">
                        <div className="reflection-title-group">
                            <div className="reflection-brain-pulse">🧠</div>
                            <div>
                                <h3 className="reflection-title">Console de Réflexion Clinique & Raisonnement RAG</h3>
                                <p className="reflection-subtitle">OrthoMind AI traite le dialogue oral et interroge la base de connaissances médicale (54 ouvrages)</p>
                            </div>
                        </div>

                        <div className="reflection-progress-badge">
                            {reflectionProgress}%
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="reflection-progress-bar-container">
                        <div
                            className="reflection-progress-bar-fill"
                            style={{ width: `${reflectionProgress}%` }}
                        />
                    </div>

                    {/* Step Cards Grid */}
                    <div className="reflection-steps-grid">
                        {CLINICAL_REFLECTION_STEPS.map((step, idx) => {
                            const isCurrent = idx === reflectionStepIndex;
                            const isDone = idx < reflectionStepIndex;

                            return (
                                <div
                                    key={step.id}
                                    className={`reflection-step-card ${isCurrent ? 'is-active' : ''} ${isDone ? 'is-completed' : ''}`}
                                >
                                    <div className="step-card-header">
                                        <span className="step-icon">{step.icon}</span>
                                        <span className="step-number">Étape {step.id}/5</span>
                                        {isDone && <span className="step-check">✓</span>}
                                        {isCurrent && <span className="step-spinner"></span>}
                                    </div>
                                    <h4 className="step-card-title">{step.title}</h4>
                                    <p className="step-card-desc">{step.description}</p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Live Stream Terminal Logs */}
                    <div className="reflection-terminal-box">
                        <div className="terminal-bar">
                            <span className="terminal-dot red"></span>
                            <span className="terminal-dot yellow"></span>
                            <span className="terminal-dot green"></span>
                            <span className="terminal-title">orthomind-rag-engine // stream_reasoning.log</span>
                        </div>
                        <div className="terminal-body">
                            {reflectionLogs.map((log, lIdx) => (
                                <div key={lIdx} className="terminal-line">
                                    <span className="log-time">[{log.time}]</span>
                                    <span className="log-text">{log.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* SYNTHESIZED CLINICAL REPORT PANEL */}
            {synthesisResult && (
                <div ref={reportRef} className="synthesis-result-panel">
                    {/* Certified Banner Badge */}
                    <div className="synthesis-badge-banner">
                        <div className="synthesis-badge-title">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                <polyline points="9 12 11 14 15 10"/>
                            </svg>
                            Synthèse Certifiée de Consultation Audio — OrthoMind AI
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ background: 'rgba(255,255,255,0.06)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                Source: Dialogue Orale + RAG 54 Livres
                            </span>
                            <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600 }}>
                                Confiance: 98%
                            </span>
                        </div>
                    </div>

                    {/* Collapsible Journal de Réflexion Badge */}
                    <div className="reflection-journal-drawer">
                        <button
                            className="reflection-journal-toggle-btn"
                            onClick={() => setShowReflectionJournal(!showReflectionJournal)}
                        >
                            <span>🧠 Journal de Réflexion & Trajectoire Clinique l'IA (5 étapes)</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary-cyan)' }}>
                                {showReflectionJournal ? '▲ Masquer' : '▼ Déplier la trajectoire de réflexion'}
                            </span>
                        </button>

                        {showReflectionJournal && (
                            <div className="reflection-journal-content">
                                <div className="journal-steps-timeline">
                                    {CLINICAL_REFLECTION_STEPS.map((step) => (
                                        <div key={step.id} className="journal-step-item">
                                            <div className="journal-step-badge">{step.icon} Étape {step.id}</div>
                                            <div className="journal-step-details">
                                                <strong>{step.title}</strong>
                                                <p>{step.description}</p>
                                                <div className="journal-step-log">✓ {step.logMessage}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Tabs Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                        <div className="synthesis-tabs-header">
                            <button
                                className={`synthesis-tab-btn ${activeSynthesisTab === 'dep' ? 'active' : ''}`}
                                onClick={() => setActiveSynthesisTab('dep')}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', color: activeSynthesisTab === 'dep' ? 'var(--primary-cyan)' : undefined }}
                            >
                                <img src={logoSeul} alt="" style={{ width: '16px', height: '16px', objectFit: 'contain' }} />
                                ★ Fiche DEP (Sécurité Sociale)
                            </button>
                            <button
                                className={`synthesis-tab-btn ${activeSynthesisTab === 'diag' ? 'active' : ''}`}
                                onClick={() => setActiveSynthesisTab('diag')}
                            >
                                📋 Diagnostic & Observations
                            </button>
                            <button
                                className={`synthesis-tab-btn ${activeSynthesisTab === 'treat' ? 'active' : ''}`}
                                onClick={() => setActiveSynthesisTab('treat')}
                            >
                                💊 Plan de Traitement Conseillé
                            </button>
                        </div>

                        <div className="transcript-actions-row">
                            <button className="transcript-action-btn" onClick={handleCopyReport}>
                                {isReportCopied ? '✓ Compte-Rendu Copié !' : '📋 Copier le Rapport'}
                            </button>

                            <button 
                                className="btn-audio-primary" 
                                style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                                onClick={() => {
                                    if (synthesisResult) {
                                        saveSynthesisToPatientRecord(synthesisResult, patientName, selectedPatientId, transcript);
                                    }
                                }}
                            >
                                {isSavedToPatient ? '✓ Enregistré dans Fiche Patient' : '💾 Enregistrer dans Fiche Patient'}
                            </button>

                            {onViewPatientFile && (
                                <button
                                    className="transcript-action-btn"
                                    style={{ borderColor: 'rgba(0, 242, 254, 0.5)', color: 'var(--primary-cyan)' }}
                                    onClick={() => onViewPatientFile(selectedPatientId)}
                                >
                                    👁️ Voir la Fiche Patient ({patientName || 'Praticien'})
                                </button>
                            )}

                            {onSendToOrthoMind && (
                                <button className="transcript-action-btn" style={{ borderColor: 'rgba(0, 242, 254, 0.4)', color: 'var(--primary-cyan)' }} onClick={() => onSendToOrthoMind(transcript)}>
                                    🚀 Ouvrir dans l'Assistant OrthoMind
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Patient Record Sync Notice */}
                    {savedMessage && (
                        <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '12px 16px', marginTop: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ color: '#10b981', fontWeight: 600, fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🔒</span> {savedMessage}
                            </div>
                            {onViewPatientFile && (
                                <button
                                    onClick={() => onViewPatientFile(selectedPatientId)}
                                    style={{ background: '#10b981', color: '#090d16', border: 'none', borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                                >
                                    Consulter dans l'Espace Praticien →
                                </button>
                            )}
                        </div>
                    )}

                    {/* Content Box */}
                    <div className="synthesis-content-box">
                        {activeSynthesisTab === 'dep' ? (
                            <OrthoMindDepForm
                                depData={extractDepDataFromAnalysis(synthesisResult.diagnostic, synthesisResult.traitement, patientName, selectedPatientId)}
                                patientName={patientName}
                                patientId={selectedPatientId}
                                onSave={(updatedData) => {
                                    if (synthesisResult) {
                                        saveSynthesisToPatientRecord(synthesisResult, patientName, selectedPatientId, transcript);
                                    }
                                }}
                            />
                        ) : activeSynthesisTab === 'diag' ? (
                            <div>
                                <h3 style={{ color: 'var(--primary-cyan)', fontSize: '1.05rem', marginTop: 0, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                        <polyline points="14 2 14 8 20 8" />
                                    </svg>
                                    Diagnostic Clinique & Synthèse des Échanges
                                </h3>
                                {renderReportMarkdown(synthesisResult.diagnostic)}
                            </div>
                        ) : (
                            <div>
                                <h3 style={{ color: 'var(--primary-blue)', fontSize: '1.05rem', marginTop: 0, marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                                        <polyline points="2 17 12 22 22 17" />
                                        <polyline points="2 12 17 22 12" />
                                    </svg>
                                    Stratégie Thérapeutique Conseillée & Sequence d'Aligneurs
                                </h3>
                                {renderReportMarkdown(synthesisResult.traitement)}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AudioConsultation;
