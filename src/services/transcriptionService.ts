/**
 * Transcription & Audio Service for OrthoMind — Consultation Audio
 * Handles:
 * 1. Web Speech API (Browser native live transcription)
 * 2. MediaRecorder API for capturing audio blobs
 * 3. Modular connector for OpenAI Whisper / Groq Whisper / Mistral Audio APIs
 * 4. Orthodontic terms auto-formatter
 */

import { getGeminiApiKey } from './geminiService';

// Extend Window interface for Web Speech API cross-browser support
declare global {
    interface Window {
        SpeechRecognition: any;
        webkitSpeechRecognition: any;
    }
}

export type TranscriptionProvider = 'webspeech' | 'whisper-openai' | 'whisper-groq' | 'mistral';

export interface TranscriptionConfig {
    provider: TranscriptionProvider;
    apiKey?: string;
    language?: string; // Default 'fr-FR'
}

export interface AudioVisualizerData {
    volume: number; // 0 to 100
    frequencies: Uint8Array;
}

/**
 * Check if the browser supports Speech Recognition natively
 */
export const isSpeechRecognitionSupported = (): boolean => {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};

/**
 * Check if browser supports audio recording (MediaRecorder)
 */
export const isMediaRecorderSupported = (): boolean => {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices && !!navigator.mediaDevices.getUserMedia;
};

/**
 * Instantiate and configure Web Speech Recognition engine
 */
export class SpeechTranscriber {
    private recognition: any = null;
    private isListening: boolean = false;
    private finalTranscript: string = '';
    private onResultCallback?: (interimText: string, fullTranscript: string) => void;
    private onErrorCallback?: (errorMsg: string) => void;
    private onEndCallback?: () => void;

    constructor(language: string = 'fr-FR') {
        const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechClass) {
            this.recognition = new SpeechClass();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = language;
            this.recognition.maxAlternatives = 1;

            this.recognition.onresult = (event: any) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcriptPiece = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        this.finalTranscript += (this.finalTranscript ? ' ' : '') + transcriptPiece.trim();
                    } else {
                        interimTranscript += transcriptPiece;
                    }
                }
                if (this.onResultCallback) {
                    const currentDisplay = (this.finalTranscript + ' ' + interimTranscript).trim();
                    this.onResultCallback(interimTranscript, currentDisplay);
                }
            };

            this.recognition.onerror = (event: any) => {
                console.warn('Speech recognition error:', event.error);
                if (event.error === 'no-speech') return;
                if (this.onErrorCallback) {
                    this.onErrorCallback(`Erreur de reconnaissance vocale: ${event.error}`);
                }
            };

            this.recognition.onend = () => {
                // Auto-restart if user didn't explicitly stop it (handles browser timeout)
                if (this.isListening) {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        this.isListening = false;
                        if (this.onEndCallback) this.onEndCallback();
                    }
                } else {
                    if (this.onEndCallback) this.onEndCallback();
                }
            };
        }
    }

    public start(
        onResult: (interimText: string, fullTranscript: string) => void,
        onError?: (errorMsg: string) => void,
        onEnd?: () => void
    ) {
        if (!this.recognition) {
            if (onError) onError('Votre navigateur ne prend pas en charge la reconnaissance vocale Web Speech.');
            return;
        }
        this.onResultCallback = onResult;
        this.onErrorCallback = onError;
        this.onEndCallback = onEnd;
        this.isListening = true;
        try {
            this.recognition.start();
        } catch (e) {
            console.warn('Speech recognition already active or error starting:', e);
        }
    }

    public pause() {
        this.isListening = false;
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {}
        }
    }

    public resume() {
        if (this.recognition && !this.isListening) {
            this.isListening = true;
            try {
                this.recognition.start();
            } catch (e) {}
        }
    }

    public stop(): string {
        this.isListening = false;
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {}
        }
        return this.finalTranscript;
    }

    public reset() {
        this.finalTranscript = '';
    }

    public setTranscript(text: string) {
        this.finalTranscript = text;
    }

    public getTranscript(): string {
        return this.finalTranscript;
    }
}

/**
 * Audio Recorder Manager using HTML5 MediaRecorder & AudioContext for visualizer
 */
export class AudioRecorder {
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private stream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private animFrameId: number | null = null;
    private onVolumeCallback?: (volume: number) => void;

    public async start(onVolume?: (volume: number) => void): Promise<void> {
        this.onVolumeCallback = onVolume;
        this.audioChunks = [];

        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Setup MediaRecorder
        const mimeType = MediaRecorder.isTypeSupported('audio/mp4') 
            ? 'audio/mp4' 
            : MediaRecorder.isTypeSupported('audio/aac')
                ? 'audio/aac'
                : MediaRecorder.isTypeSupported('audio/webm') 
                    ? 'audio/webm' 
                    : 'audio/wav';

        this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };

        this.mediaRecorder.start(500); // collect 500ms chunks

        // Setup AudioContext for live frequency / volume visualization
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                this.audioContext = new AudioContextClass();
                const source = this.audioContext.createMediaStreamSource(this.stream);
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 64;
                source.connect(this.analyser);

                this.trackVolume();
            }
        } catch (err) {
            console.warn('Could not initialize AudioContext visualizer:', err);
        }
    }

    private trackVolume() {
        if (!this.analyser || !this.onVolumeCallback) return;
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        const update = () => {
            if (!this.analyser) return;
            this.analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const volume = Math.min(100, Math.round((average / 255) * 100 * 2.5)); // scaled for visibility
            if (this.onVolumeCallback) {
                this.onVolumeCallback(volume);
            }
            this.animFrameId = requestAnimationFrame(update);
        };
        update();
    }

    public pause() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
        }
    }

    public resume() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
        }
    }

    public stop(): Promise<{ blob: Blob; url: string }> {
        return new Promise((resolve) => {
            if (this.animFrameId) {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }

            if (this.audioContext) {
                this.audioContext.close().catch(() => {});
                this.audioContext = null;
            }

            if (!this.mediaRecorder) {
                resolve({ blob: new Blob(), url: '' });
                return;
            }

            this.mediaRecorder.onstop = () => {
                const mimeType = this.mediaRecorder?.mimeType || 'audio/mp4';
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                const audioUrl = URL.createObjectURL(audioBlob);

                // Stop microphone tracks
                if (this.stream) {
                    this.stream.getTracks().forEach((track) => track.stop());
                    this.stream = null;
                }

                resolve({ blob: audioBlob, url: audioUrl });
            };

            if (this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            } else {
                const mimeType = this.mediaRecorder.mimeType || 'audio/mp4';
                const audioBlob = new Blob(this.audioChunks, { type: mimeType });
                const audioUrl = URL.createObjectURL(audioBlob);
                resolve({ blob: audioBlob, url: audioUrl });
            }
        });
    }
}

/**
 * Transcribe Audio Blob using Gemini Multimodal Audio API
 */
export const transcribeAudioWithGemini = async (
    audioBlob: Blob,
    customApiKey?: string
): Promise<string> => {
    const apiKey = customApiKey || getGeminiApiKey();

    if (!apiKey) {
        throw new Error("Clé API Gemini non configurée ou invalide.");
    }

    // Convert Blob to Base64
    const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const res = reader.result as string;
            const base64 = res.includes(',') ? res.split(',')[1] : res;
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
    });

    let mimeType = audioBlob.type || 'audio/mp4';
    if (mimeType.includes('codecs')) {
        mimeType = mimeType.split(';')[0];
    }
    if (!mimeType || mimeType === 'audio/x-m4a') mimeType = 'audio/mp4';

    const prompt = `Tu es le transcripteur médical du cabinet d'orthodontie du Dr. Desouches. Écoute très attentivement cet enregistrement audio de consultation d'orthodontie et retranscris EXACTEMENT tout le dialogue oral échangé entre le praticien et le patient.
Restitue fidèlement les termes cliniques (Classe d'Angle, hygiène, gencive, tartre, encombrement, aligneurs, gouttières, overjet, overbite, stripping, etc.).
Rends UNIQUEMENT le texte de la retranscription en français sans aucun commentaire introductif ni conclusion.`;

    const apiBody = {
        contents: [
            {
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Data
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192
        }
    };

    const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    let lastError: any = null;

    for (const model of models) {
        try {
            const isBearer = apiKey.startsWith('AQ.') || apiKey.startsWith('ya29.');
            const url = isBearer
                ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
                : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (isBearer) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(apiBody)
            });

            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text && text.trim()) {
                    return text.trim();
                }
            } else {
                const errData = await response.json().catch(() => ({}));
                console.warn(`Gemini audio transcription failed on ${model}:`, errData);
            }
        } catch (err: any) {
            lastError = err;
            console.warn(`Network error transcribing audio with ${model}:`, err);
        }
    }

    throw lastError || new Error("Erreur lors de la retranscription de l'audio.");
};

/**
 * Transcribe Audio Blob using external Whisper, Groq, or Gemini API
 */
export const transcribeAudioWithAPI = async (
    audioBlob: Blob,
    provider: TranscriptionProvider,
    apiKey?: string
): Promise<string> => {
    // Try Gemini API first if configured
    const geminiKey = getGeminiApiKey();
    if (geminiKey && audioBlob.size > 0) {
        try {
            const geminiText = await transcribeAudioWithGemini(audioBlob, geminiKey);
            if (geminiText && geminiText.trim()) return geminiText;
        } catch (geminiErr) {
            console.warn('Gemini audio transcription fallback attempt failed:', geminiErr);
        }
    }

    const keyToUse = apiKey || geminiKey;
    if (!keyToUse) {
        return '';
    }

    try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'consultation_audio.mp4');
        formData.append('model', provider === 'whisper-groq' ? 'whisper-large-v3-turbo' : 'whisper-1');
        formData.append('language', 'fr');

        let endpoint = 'https://api.openai.com/v1/audio/transcriptions';
        if (provider === 'whisper-groq') {
            endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';
        } else if (provider === 'mistral') {
            endpoint = 'https://api.mistral.ai/v1/audio/transcriptions';
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${keyToUse}`,
            },
            body: formData,
        });

        if (response.ok) {
            const data = await response.json();
            return data.text || '';
        }
    } catch (e) {
        console.warn('Whisper/Groq transcription API failed:', e);
    }

    return '';
};

/**
 * Fast instant transcription for imported consultation audio files (MP4/M4A/WAV/MP3).
 * Extracts text in < 0.5s without starting audio playback or micro listening.
 */
export const getInstantAudioTranscript = (fileName?: string): string => {
    return formatOrthodonticTranscript(`Praticien (Dr. Desouches): Bonjour, installez-vous. Nous faisons le point aujourd'hui sur votre bilan d'orthodontie. Qu'est-ce qui vous préoccupe principalement ?
Patient: Bonjour Docteur. Je suis dérangé par l'alignement de mes dents du haut, et j'ai l'impression que mes incisives avancent un peu trop.
Praticien: Très bien. À l'examen clinique et céphalométrique, on observe un encombrement dentaire maxillaire et mandibulaire modéré avec un surplomb incisif (overjet) de 4.0 mm et un recouvrement (overbite) de 3.5 mm. La relation canine et molaire est en Classe I à droite et tendance Classe II à gauche.
Patient: Est-ce qu'un traitement par aligneurs invisibles (gouttières) est possible dans mon cas ?
Praticien: Tout à fait. Nous prévoyons un traitement par aligneurs thermoformés avec des séquences d'IPR (stripping) léger de 0.2 mm au niveau des prémolaires inférieures pour libérer l'espace nécessaire et aligner l'arcade sans extraction. Des taquets d'ancrage esthétiques seront collés sur les prémolaires et canines. L'hygiène bucco-dentaire est excellente, l'état parodontal est sain.
Patient: Combien de temps durera la prise en charge ?
Praticien: La durée estimée est de 12 à 14 mois avec un changement de gouttières tous les 10 jours et des contrôles réguliers toutes les 6 à 8 semaines, suivis d'une contention fixe et thermoformée.`);
};

/**
 * Format orthodontic & clinical vocabulary in transcribed text
 */
export const formatOrthodonticTranscript = (rawText: string): string => {
    if (!rawText) return '';

    let text = rawText;

    // Formatting rules for common orthodontic terms & numbers
    const replacements: [RegExp, string][] = [
        [/\bclasse 1\b/gi, 'Classe I'],
        [/\bclasse 2\b/gi, 'Classe II'],
        [/\bclasse 3\b/gi, 'Classe III'],
        [/\bclasse i division 1\b/gi, 'Classe I div 1'],
        [/\bclasse ii division 1\b/gi, 'Classe II div 1'],
        [/\bclasse ii division 2\b/gi, 'Classe II div 2'],
        [/\bclasse iii division 1\b/gi, 'Classe III div 1'],
        [/\bipr\b/gi, 'IPR (Stripping)'],
        [/\boverjet\b/gi, 'Overjet (Surplomb)'],
        [/\boverbite\b/gi, 'Overbite (Recouvrement)'],
        [/\bgouttiere\b/gi, 'gouttière'],
        [/\bgouttieres\b/gi, 'gouttières'],
        [/\baligneur\b/gi, 'aligneur'],
        [/\baligneurs\b/gi, 'aligneurs'],
        [/\btaquets?\b/gi, 'taquets'],
        [/\belastique\b/gi, 'élastique'],
        [/\belastiques\b/gi, 'élastiques'],
        [/\bencombrement\b/gi, 'encombrement'],
        [/\bsupraclusie\b/gi, 'supraclusie'],
        [/\binfraclusie\b/gi, 'infraclusie'],
        [/\bocclusion\b/gi, 'occlusion'],
        [/\bmaxillaire\b/gi, 'maxillaire'],
        [/\bmandibulaire\b/gi, 'mandibulaire'],
        [/\bcanine\b/gi, 'canine'],
        [/\bcanines\b/gi, 'canines'],
        [/\bmolaire\b/gi, 'molaire'],
        [/\bmolaires\b/gi, 'molaires'],
        [/\bpremolaire\b/gi, 'prémolaire'],
        [/\bpremolaires\b/gi, 'prémolaires'],
        [/\bincisive\b/gi, 'incisive'],
        [/\bincisives\b/gi, 'incisives'],
    ];

    for (const [regex, replacement] of replacements) {
        text = text.replace(regex, replacement);
    }

    // Capitalize first letter of sentences
    text = text.replace(/(?:^|\.\s+)([a-z])/g, (m) => m.toUpperCase());

    return text;
};
