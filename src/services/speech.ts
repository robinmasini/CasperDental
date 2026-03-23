// Web Speech API Service for medical.ia

export interface SpeechService {
    isSupported: boolean;
    startListening: (onResult: (text: string) => void, onError: (error: string) => void) => void;
    stopListening: () => void;
    speak: (text: string, onEnd?: () => void) => void;
    stopSpeaking: () => void;
    isListening: () => boolean;
    isSpeaking: () => boolean;
}

// Check for browser support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const speechSynthesis = window.speechSynthesis;

let recognition: any = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let listening = false;
let speaking = false;

// Initialize speech recognition
const initRecognition = () => {
    if (SpeechRecognition && !recognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'fr-FR';
    }
    return recognition;
};

// Clean text for speech (remove markdown, emojis)
const cleanTextForSpeech = (text: string): string => {
    return text
        // Remove markdown formatting
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/#{1,6}\s/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove emojis
        .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
        // Remove bullet points styling
        .replace(/•/g, ',')
        .replace(/[1-9]️⃣/g, '')
        // Clean up extra whitespace
        .replace(/\s+/g, ' ')
        .trim();
};

// Get French voice
const getFrenchVoice = (): SpeechSynthesisVoice | null => {
    const voices = speechSynthesis.getVoices();
    // Prefer natural French voice
    const preferredVoices = [
        'Thomas', 'Amelie', 'Audrey', 'Aurelie', 'Google français',
        'Microsoft Paul', 'Microsoft Julie'
    ];

    for (const name of preferredVoices) {
        const voice = voices.find(v => v.name.includes(name) && v.lang.startsWith('fr'));
        if (voice) return voice;
    }

    // Fallback to any French voice
    return voices.find(v => v.lang.startsWith('fr')) || null;
};

const speechService: SpeechService = {
    isSupported: !!SpeechRecognition && !!speechSynthesis,

    startListening: (onResult, onError) => {
        const rec = initRecognition();
        if (!rec) {
            onError('La reconnaissance vocale n\'est pas supportée par votre navigateur.');
            return;
        }

        rec.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            listening = false;
            onResult(transcript);
        };

        rec.onerror = (event: any) => {
            listening = false;
            if (event.error === 'not-allowed') {
                onError('L\'accès au microphone a été refusé. Veuillez autoriser l\'accès dans les paramètres de votre navigateur.');
            } else if (event.error === 'no-speech') {
                onError('Aucune parole détectée. Réessayez.');
            } else {
                onError(`Erreur de reconnaissance vocale: ${event.error}`);
            }
        };

        rec.onend = () => {
            listening = false;
        };

        try {
            listening = true;
            rec.start();
        } catch (error) {
            listening = false;
            onError('Erreur lors du démarrage de la reconnaissance vocale.');
        }
    },

    stopListening: () => {
        if (recognition && listening) {
            recognition.stop();
            listening = false;
        }
    },

    speak: (text, onEnd) => {
        if (!speechSynthesis) {
            onEnd?.();
            return;
        }

        // Stop any current speech
        speechSynthesis.cancel();

        const cleanedText = cleanTextForSpeech(text);
        const utterance = new SpeechSynthesisUtterance(cleanedText);

        // Get French voice
        const voice = getFrenchVoice();
        if (voice) {
            utterance.voice = voice;
        }

        utterance.lang = 'fr-FR';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            speaking = true;
        };

        utterance.onend = () => {
            speaking = false;
            currentUtterance = null;
            onEnd?.();
        };

        utterance.onerror = () => {
            speaking = false;
            currentUtterance = null;
            onEnd?.();
        };

        currentUtterance = utterance;
        speechSynthesis.speak(utterance);
    },

    stopSpeaking: () => {
        if (speechSynthesis) {
            speechSynthesis.cancel();
            speaking = false;
            currentUtterance = null;
        }
    },

    isListening: () => listening,

    isSpeaking: () => speaking,
};

// Preload voices
if (speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
    };
}


export { speechService };
