/**
 * Transcription & Audio Service for OrthoMind — Consultation Audio
 * Handles:
 * 1. Web Speech API (Browser native live transcription)
 * 2. MediaRecorder API for capturing audio blobs
 * 3. Modular connector for OpenAI Whisper / Groq Whisper / Mistral Audio APIs
 * 4. Orthodontic terms auto-formatter
 */

import { getGeminiApiKey, executeGeminiCall, extractText, geminiFetch } from './geminiService';

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
 * Transcription médicale d'une consultation par Gemini (compréhension audio native).
 * - locuteurs identifiés (Praticien / Patient / Parent),
 * - vocabulaire orthodontique et numérotation FDI restitués,
 * - aucune invention : passages inaudibles signalés.
 * Les fichiers volumineux passent par l'API Files de Gemini (limite ~20 Mo en ligne).
 */
const TRANSCRIPTION_PROMPT = `Tu es le secrétaire médical du cabinet d'orthodontie du Dr Renaud Desouches. Retranscris intégralement et fidèlement cet enregistrement de consultation d'orthodontie, en français.

Règles :
1. Identifie chaque prise de parole sur une nouvelle ligne, préfixée par le locuteur : « Praticien : », « Patient : », « Parent : » ou « Assistante : » (déduis-le du contexte).
2. Orthographie correctement le vocabulaire orthodontique : Classe I / II division 1 / II division 2 / III d'Angle, surplomb, recouvrement, supraclusion, béance, articulé inversé, endognathie, disjoncteur, quad-helix, aligneurs, taquets, stripping (IPR), élastiques, mini-vis, contention, téléradiographie, panoramique, CBCT, canine incluse, agénésie, etc.
3. Écris les dents en notation FDI chiffrée (« la treize » → « la 13 », « vingt-trois » → « 23 ») et les mesures en chiffres (« six millimètres » → « 6 mm »).
4. N'invente rien, ne résume pas, ne corrige pas les propos. Marque un passage incompréhensible par [inaudible].
5. Réponds uniquement avec la retranscription, sans introduction ni commentaire.`;

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const res = reader.result as string;
            resolve(res.includes(',') ? res.split(',')[1] : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

const normalizeAudioMime = (blob: Blob, fileName?: string): string => {
    let mime = (blob.type || '').split(';')[0];
    const name = (fileName || '').toLowerCase();
    if (!mime) {
        if (name.endsWith('.mp3')) mime = 'audio/mp3';
        else if (name.endsWith('.wav')) mime = 'audio/wav';
        else if (name.endsWith('.ogg')) mime = 'audio/ogg';
        else if (name.endsWith('.webm')) mime = 'audio/webm';
        else mime = 'audio/mp4';
    }
    // Une vidéo MP4 importée est traitée comme sa piste audio
    if (mime === 'audio/x-m4a' || mime === 'video/mp4') mime = 'audio/mp4';
    if (mime === 'audio/mpeg') mime = 'audio/mp3';
    return mime;
};

const INLINE_AUDIO_LIMIT = 14 * 1024 * 1024; // marge sous la limite de ~20 Mo (base64 +33 %)

// Envoi d'un gros fichier via l'API Files de Gemini (upload résumable)
const uploadAudioToGeminiFiles = async (blob: Blob, mimeType: string, apiKey: string): Promise<string> => {
    const start = await geminiFetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': String(blob.size),
            'X-Goog-Upload-Header-Content-Type': mimeType,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: { display_name: 'consultation-orthomind' } }),
    }, apiKey);
    const uploadUrl = start.headers.get('X-Goog-Upload-URL') || start.headers.get('x-goog-upload-url');
    if (!start.ok || !uploadUrl) throw new Error(`Envoi du fichier audio refusé (${start.status}).`);

    const upload = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
        },
        body: blob,
    });
    const uploaded = await upload.json();
    let file = uploaded.file;
    if (!file?.uri) throw new Error('Envoi du fichier audio incomplet.');

    // Le fichier doit être « ACTIVE » avant de pouvoir être utilisé
    for (let i = 0; i < 30 && file.state === 'PROCESSING'; i++) {
        await new Promise(r => setTimeout(r, 2000));
        file = await (await geminiFetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, {}, apiKey)).json();
    }
    if (file.state === 'FAILED') throw new Error('Gemini n\'a pas pu lire ce fichier audio.');
    return file.uri;
};

export const transcribeAudioWithGemini = async (
    audioBlob: Blob,
    customApiKey?: string,
    fileName?: string
): Promise<string> => {
    const apiKey = customApiKey || getGeminiApiKey();
    if (!apiKey) throw new Error('Clé API Gemini non configurée.');

    const mimeType = normalizeAudioMime(audioBlob, fileName);
    let audioPart: any;
    if (audioBlob.size > INLINE_AUDIO_LIMIT) {
        const fileUri = await uploadAudioToGeminiFiles(audioBlob, mimeType, apiKey);
        audioPart = { fileData: { mimeType, fileUri } };
    } else {
        audioPart = { inlineData: { mimeType, data: await blobToBase64(audioBlob) } };
    }

    const data = await executeGeminiCall('generateContent', {
        contents: [{ parts: [{ text: TRANSCRIPTION_PROMPT }, audioPart] }],
        generationConfig: { temperature: 0, maxOutputTokens: 32768 },
    }, apiKey, undefined, 'fast', { thinking: 'minimal' });

    const text = extractText(data);
    if (!text) throw new Error('Retranscription vide.');
    return text;
};

/**
 * Transcribe Audio Blob using external Whisper, Groq, or Gemini API
 */
export const transcribeAudioWithAPI = async (
    audioBlob: Blob,
    provider: TranscriptionProvider,
    apiKey?: string,
    fileName?: string
): Promise<string> => {
    // Gemini en priorité : compréhension audio native, locuteurs et vocabulaire
    const geminiKey = getGeminiApiKey();
    let geminiError: unknown = null;
    if (geminiKey && audioBlob.size > 0) {
        try {
            const geminiText = await transcribeAudioWithGemini(audioBlob, geminiKey, fileName);
            if (geminiText && geminiText.trim()) return geminiText;
        } catch (geminiErr) {
            geminiError = geminiErr;
            console.warn('Gemini audio transcription failed:', geminiErr);
        }
    }

    // Whisper / Groq / Mistral uniquement avec leur propre clé
    const keyToUse = apiKey;
    if (!keyToUse || provider === 'webspeech') {
        if (geminiError) throw geminiError;
        throw new Error('Aucune clé de retranscription configurée (clé Gemini dans Configuration).');
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
