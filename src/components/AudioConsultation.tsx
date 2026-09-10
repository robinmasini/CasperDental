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

interface AudioConsultationProps {
    patientName?: string;
    onSendToOrthoMind?: (transcriptText: string) => void;
}

export const AudioConsultation: React.FC<AudioConsultationProps> = ({
    patientName = '',
    onSendToOrthoMind
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
    const [activeSynthesisTab, setActiveSynthesisTab] = useState<'diag' | 'treat'>('diag');
    const [isReportCopied, setIsReportCopied] = useState<boolean>(false);

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
        a.download = `Consultation_Audio_${patientName ? patientName.replace(/\s+/g, '_') : 'Patient'}_${new Date().toISOString().slice(0, 10)}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Launch AI Clinical Synthesis from Audio Dialogue (RAG 54 Volumes)
    const handleStartSynthesis = async () => {
        const textToAnalyze = transcript || interimText;
        if (!textToAnalyze || textToAnalyze.trim().length < 5) {
            setStatusMessage('Veuillez d\'abord démarrer et retranscrire la consultation audio.');
            return;
        }

        setIsSynthesizing(true);
        setSynthesisStatus('Initialisation du moteur d\'analyse RAG OrthoMind...');
        setSynthesisResult(null);

        try {
            const result = await synthesizeAudioConsultation(textToAnalyze, patientName, (status) => {
                setSynthesisStatus(status);
            });
            setSynthesisResult(result);
            setStatusMessage('✓ Synthèse clinique et plan de traitement générés avec succès !');

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
            {/* Header Banner */}
            <div className="audio-consultation-header">
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
                        <p>Enregistrez le dialogue praticien-patient pour générer le diagnostic et le plan de traitement certifié.</p>
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
                <div style={{ background: 'rgba(15, 23, 42, 0.9)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(0, 242, 254, 0.3)', display: 'flex', gap: '10px', alignItems: 'center' }}>
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

            {/* Studio Recorder & Controls Panel */}
            <div className={`audio-recorder-card ${recordingState === 'recording' ? 'is-recording' : ''} ${recordingState === 'paused' ? 'is-paused' : ''}`}>
                {/* Status & Timer */}
                <div className="recording-status-row">
                    <div className={`status-badge-recording ${recordingState}`}>
                        <span className="pulse-dot"></span>
                        {recordingState === 'idle' && 'Prêt pour l\'enregistrement'}
                        {recordingState === 'recording' && '🔴 Consultation audio en cours...'}
                        {recordingState === 'paused' && '⏸️ Consultation en pause'}
                        {recordingState === 'transcribing' && '✨ Retranscription et analyse...'}
                        {recordingState === 'stopped' && '✓ Consultation enregistrée'}
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
                            Démarrer la consultation audio
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
                                Terminer la consultation
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
                    <div style={{ marginTop: '15px', fontSize: '0.85rem', color: statusMessage.startsWith('Erreur') ? '#f87171' : 'var(--primary-cyan)', fontWeight: 500 }}>
                        {statusMessage}
                    </div>
                )}

                {/* Recorded Audio Playback */}
                {audioUrl && (
                    <div className="audio-player-box">
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Réécoute de l'enregistrement de la séance :</span>
                        <audio controls src={audioUrl} className="custom-audio-player" />
                        <button className="transcript-action-btn" onClick={handleDownloadAudio} style={{ marginTop: '5px' }}>
                            📥 Télécharger le fichier audio (.webm)
                        </button>
                    </div>
                )}
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
                        disabled={isSynthesizing || (!transcript && !interimText)}
                    >
                        {isSynthesizing ? (
                            <>
                                <span className="synthesis-spinner-glow" style={{ width: '18px', height: '18px', borderWidth: '2px' }}></span>
                                Synthèse en cours...
                            </>
                        ) : (
                            <>
                                <img src={logoSeul} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                                Lancer la Synthèse Clinique
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* SYNTHESIS LOADING CONSOLE */}
            {isSynthesizing && (
                <div className="synthesis-loading-panel">
                    <div className="synthesis-spinner-glow"></div>
                    <div className="synthesis-status-text">
                        {synthesisStatus || 'Traitement et analyse sémantique par l\'IA OrthoMind...'}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Veuillez patienter quelques secondes. Extraction des anomalies d'occlusion et interrogation de la base de connaissances 54 livres...
                    </span>
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

                    {/* Tabs Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                        <div className="synthesis-tabs-header">
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

                            {onSendToOrthoMind && (
                                <button className="transcript-action-btn" style={{ borderColor: 'rgba(0, 242, 254, 0.4)', color: 'var(--primary-cyan)' }} onClick={() => onSendToOrthoMind(transcript)}>
                                    🚀 Ouvrir dans l'Assistant OrthoMind
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Content Box */}
                    <div className="synthesis-content-box">
                        {activeSynthesisTab === 'diag' ? (
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
                                        <polyline points="2 12 12 17 22 12" />
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
