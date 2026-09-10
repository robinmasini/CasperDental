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

    // Refs
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const transcriberRef = useRef<SpeechTranscriber | null>(null);
    const recorderRef = useRef<AudioRecorder | null>(null);

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
                    setStatusMessage('✓ Transcription API réussie !');
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

    // Send to OrthoMind for AI Clinical Summary
    const handleSendToOrthoMind = () => {
        if (!transcript || !onSendToOrthoMind) return;
        onSendToOrthoMind(transcript);
    };

    // Equalizer height calculation
    const getBarHeight = (index: number): number => {
        if (recordingState !== 'recording') return 8;
        // Generate responsive wave height based on audioVolume decibels
        const baseFactor = Math.sin((index + 1) * 0.7) * 0.4 + 0.6;
        const dynamicHeight = Math.max(8, Math.min(55, Math.round(audioVolume * baseFactor * 0.55)));
        return dynamicHeight;
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
                        <p>Enregistrez la séance d'orthodontie et retranscrivez les observations cliniques en temps réel.</p>
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
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10" />
                                <polygon points="10 8 16 12 10 16 10 8" />
                            </svg>
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
                        Retranscription Vocale de la Séance
                    </h3>

                    <div className="transcript-actions-row">
                        <button className="transcript-action-btn" onClick={handleFormatOrthodonticTerms} disabled={!transcript}>
                            ✨ Formater Vocabulaire Orthodontique
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
                    placeholder="La retranscription de la consultation s'affichera ici en direct au fur et à mesure que vous parlez... (Vous pouvez aussi éditer ou coller votre texte manuellement)."
                />

                {/* AI Integration Footer Card */}
                {transcript && onSendToOrthoMind && (
                    <div className="ai-summary-trigger-card">
                        <div className="ai-summary-text-info">
                            <h4>Générer la Synthèse & Diagnostic OrthoMind</h4>
                            <p>Transforme la retranscription brute de la consultation en un rapport clinique structuré avec plan de traitement.</p>
                        </div>
                        <button className="btn-generate-ai" onClick={handleSendToOrthoMind}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                            Envoyer à l'IA OrthoMind
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AudioConsultation;
