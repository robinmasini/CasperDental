import { Message, ConversationState, ConversationStep, RequestType, PainLevel } from '../types';

// Generate unique ID
const generateId = (): string => Math.random().toString(36).substring(2, 11);

// Create a new message
export const createMessage = (role: 'assistant' | 'user', content: string): Message => ({
    id: generateId(),
    role,
    content,
    timestamp: new Date(),
});

// Initial greeting
export const GREETING_MESSAGE = `Bonjour et bienvenue au cabinet dentaire ! 👋

Je suis l'assistant virtuel du Dr. Martin. Je suis là pour vous aider à :
• Prendre rendez-vous
• Répondre à vos questions
• Évaluer l'urgence de votre situation

**Important** : Je ne suis pas médecin et ne peux pas établir de diagnostic. En cas d'urgence médicale, appelez le 15 ou rendez-vous aux urgences.

Comment puis-je vous aider aujourd'hui ?`;

// Conversation flow responses
export const RESPONSES: Record<ConversationStep, Record<string, string>> = {
    greeting: {
        default: GREETING_MESSAGE,
    },
    patient_type: {
        prompt: "Êtes-vous déjà patient(e) de notre cabinet, ou est-ce votre première visite ?",
        new: "Bienvenue parmi nous ! Pour mieux vous accompagner, j'aurais besoin de quelques informations. Quel est votre prénom et nom ?",
        existing: "Ravi de vous revoir ! Pour retrouver votre dossier, pouvez-vous me rappeler votre prénom et nom ?",
    },
    patient_info: {
        phone: "Merci ! Pouvez-vous me communiquer votre numéro de téléphone ?",
        confirm: "Parfait, j'ai bien noté vos coordonnées. ",
    },
    request_type: {
        prompt: `Quel est le motif de votre demande ?

1️⃣ **Urgence dentaire** (douleur intense, accident, gonflement)
2️⃣ **Contrôle de routine** (visite annuelle, détartrage)
3️⃣ **Douleur ou gêne** (sensibilité, inconfort)
4️⃣ **Autre consultation** (esthétique, prothèse, implant...)

Vous pouvez me répondre librement, je comprendrai.`,
    },
    symptoms: {
        urgency: "Je comprends que c'est urgent. Pouvez-vous décrire brièvement ce qui vous arrive ? (douleur, gonflement, saignement...)",
        pain: "Pouvez-vous me décrire votre douleur ou gêne ? Depuis combien de temps la ressentez-vous ?",
        control: "Très bien pour le contrôle de routine. Avez-vous des préoccupations particulières à signaler au dentiste ?",
        consultation: "D'accord. Pouvez-vous me préciser l'objet de votre consultation ?",
    },
    pain_assessment: {
        prompt: `Sur une échelle de 1 à 10, comment évalueriez-vous votre douleur ?

• **1-3** : Légère, supportable
• **4-6** : Modérée, inconfortable
• **7-8** : Forte, difficile à supporter
• **9-10** : Très intense, insupportable`,
        high: "⚠️ Je note une douleur importante. Nous allons essayer de vous trouver un créneau en urgence.",
        low: "Je comprends. Nous allons trouver un créneau adapté à votre situation.",
    },
    slot_proposal: {
        prompt: "Voici les prochains créneaux disponibles. Lequel vous conviendrait ?",
        urgency: "🔴 Compte tenu de l'urgence, voici les créneaux prioritaires disponibles :",
    },
    confirmation: {
        prompt: "Souhaitez-vous confirmer ce rendez-vous ?",
        confirmed: "✅ Votre rendez-vous est confirmé ! Vous allez recevoir un récapitulatif.",
        cancelled: "D'accord, le rendez-vous n'a pas été confirmé. Souhaitez-vous choisir un autre créneau ?",
    },
    summary: {
        default: "Voici le récapitulatif de votre rendez-vous :",
    },
    completed: {
        default: "Merci de votre confiance ! N'hésitez pas à nous contacter si vous avez des questions. À bientôt ! 🦷",
    },
};

// Analyze user intent
export const analyzeIntent = (message: string): { requestType?: RequestType; painLevel?: PainLevel; isAffirmative?: boolean; isNegative?: boolean } => {
    const lower = message.toLowerCase();

    // Check for affirmative/negative
    const affirmativeWords = ['oui', 'yes', 'ok', 'daccord', "d'accord", 'parfait', 'confirme', 'je confirme', 'c\'est bon'];
    const negativeWords = ['non', 'no', 'annule', 'annuler', 'pas', 'autre'];

    const isAffirmative = affirmativeWords.some(word => lower.includes(word));
    const isNegative = negativeWords.some(word => lower.includes(word)) && !isAffirmative;

    // Check request type
    const urgencyWords = ['urgence', 'urgent', 'accident', 'cassé', 'tombé', 'arraché', 'gonflement', 'gonflé', 'abcès', 'insupportable'];
    const controlWords = ['contrôle', 'routine', 'annuel', 'détartrage', 'nettoyage', 'vérification', 'checkup'];
    const painWords = ['douleur', 'mal', 'sensible', 'sensibilité', 'gêne', 'inconfort', 'fait mal'];

    let requestType: RequestType | undefined;
    if (urgencyWords.some(word => lower.includes(word))) {
        requestType = 'urgency';
    } else if (controlWords.some(word => lower.includes(word))) {
        requestType = 'control';
    } else if (painWords.some(word => lower.includes(word))) {
        requestType = 'pain';
    }

    // Check pain level from numbers
    const painLevelMatch = message.match(/\b([1-9]|10)\b/);
    let painLevel: PainLevel | undefined;
    if (painLevelMatch) {
        const level = parseInt(painLevelMatch[1]);
        if (level <= 3) painLevel = 'low';
        else if (level <= 6) painLevel = 'moderate';
        else if (level <= 8) painLevel = 'high';
        else painLevel = 'severe';
    }

    return { requestType, painLevel, isAffirmative, isNegative };
};

// Check if message contains patient info
export const extractPatientInfo = (message: string): { firstName?: string; lastName?: string; phone?: string } => {
    const result: { firstName?: string; lastName?: string; phone?: string } = {};

    // Extract phone number
    const phoneMatch = message.match(/(?:0|\+33)[1-9](?:[.\- ]?\d{2}){4}/);
    if (phoneMatch) {
        result.phone = phoneMatch[0].replace(/[.\- ]/g, '');
    }

    // Extract names (simple heuristic: capitalized words)
    const words = message.split(/\s+/).filter(word => word.length > 1);
    const names = words.filter(word => /^[A-ZÀ-Ü][a-zà-ü]+$/.test(word));

    if (names.length >= 2) {
        result.firstName = names[0];
        result.lastName = names[1];
    } else if (names.length === 1) {
        result.firstName = names[0];
    }

    return result;
};

// Get next step based on current state and user message
export const getNextStep = (
    currentStep: ConversationStep,
    message: string,
    state: ConversationState
): { nextStep: ConversationStep; response: string } => {
    const intent = analyzeIntent(message);
    const patientInfo = extractPatientInfo(message);

    switch (currentStep) {
        case 'greeting':
            return {
                nextStep: 'patient_type',
                response: RESPONSES.patient_type.prompt,
            };

        case 'patient_type': {
            const isNew = message.toLowerCase().includes('nouveau') ||
                message.toLowerCase().includes('première') ||
                message.toLowerCase().includes('jamais');
            return {
                nextStep: 'patient_info',
                response: isNew ? RESPONSES.patient_type.new : RESPONSES.patient_type.existing,
            };
        }

        case 'patient_info': {
            if (patientInfo.firstName && !state.patient.phone) {
                if (patientInfo.phone) {
                    return {
                        nextStep: 'request_type',
                        response: RESPONSES.patient_info.confirm + RESPONSES.request_type.prompt,
                    };
                }
                return {
                    nextStep: 'patient_info',
                    response: RESPONSES.patient_info.phone,
                };
            }
            if (patientInfo.phone) {
                return {
                    nextStep: 'request_type',
                    response: RESPONSES.patient_info.confirm + RESPONSES.request_type.prompt,
                };
            }
            return {
                nextStep: 'patient_info',
                response: "Je n'ai pas bien compris. Pouvez-vous me donner votre prénom et nom ?",
            };
        }

        case 'request_type': {
            const requestType = intent.requestType || 'consultation';
            if (requestType === 'urgency') {
                return {
                    nextStep: 'symptoms',
                    response: RESPONSES.symptoms.urgency,
                };
            } else if (requestType === 'pain') {
                return {
                    nextStep: 'pain_assessment',
                    response: RESPONSES.pain_assessment.prompt,
                };
            } else if (requestType === 'control') {
                return {
                    nextStep: 'slot_proposal',
                    response: RESPONSES.symptoms.control + "\n\n" + generateSlotProposal(false),
                };
            }
            return {
                nextStep: 'symptoms',
                response: RESPONSES.symptoms.consultation,
            };
        }

        case 'symptoms': {
            if (state.request.requestType === 'urgency' || message.toLowerCase().includes('intense') || message.toLowerCase().includes('insupportable')) {
                return {
                    nextStep: 'slot_proposal',
                    response: RESPONSES.pain_assessment.high + "\n\n" + generateSlotProposal(true),
                };
            }
            return {
                nextStep: 'pain_assessment',
                response: RESPONSES.pain_assessment.prompt,
            };
        }

        case 'pain_assessment': {
            const isUrgent = intent.painLevel === 'high' || intent.painLevel === 'severe';
            return {
                nextStep: 'slot_proposal',
                response: (isUrgent ? RESPONSES.pain_assessment.high : RESPONSES.pain_assessment.low) + "\n\n" + generateSlotProposal(isUrgent),
            };
        }

        case 'slot_proposal': {
            if (message.match(/\d/) || intent.isAffirmative) {
                return {
                    nextStep: 'confirmation',
                    response: `Vous avez choisi le créneau. ${RESPONSES.confirmation.prompt}`,
                };
            }
            return {
                nextStep: 'slot_proposal',
                response: "Quel créneau préférez-vous parmi ceux proposés ?",
            };
        }

        case 'confirmation': {
            if (intent.isAffirmative) {
                return {
                    nextStep: 'summary',
                    response: RESPONSES.confirmation.confirmed,
                };
            }
            if (intent.isNegative) {
                return {
                    nextStep: 'slot_proposal',
                    response: RESPONSES.confirmation.cancelled + "\n\n" + generateSlotProposal(false),
                };
            }
            return {
                nextStep: 'confirmation',
                response: RESPONSES.confirmation.prompt,
            };
        }

        case 'summary':
            return {
                nextStep: 'completed',
                response: RESPONSES.completed.default,
            };

        case 'completed':
            return {
                nextStep: 'greeting',
                response: RESPONSES.greeting.default,
            };

        default:
            return {
                nextStep: 'greeting',
                response: RESPONSES.greeting.default,
            };
    }
};

// Generate appointment slot proposal
const generateSlotProposal = (isUrgent: boolean): string => {
    const today = new Date();
    const slots: string[] = [];

    const startDay = isUrgent ? 0 : 1;
    const daysToShow = isUrgent ? 2 : 5;

    for (let i = startDay; i < startDay + daysToShow; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);

        // Skip weekends
        if (date.getDay() === 0 || date.getDay() === 6) continue;

        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        const times = isUrgent
            ? ['9h00', '14h00']
            : ['9h30', '11h00', '14h30', '16h00'];

        const randomTime = times[Math.floor(Math.random() * times.length)];
        slots.push(`📅 **${dayName}** à **${randomTime}**`);

        if (slots.length >= 3) break;
    }

    return slots.map((slot, i) => `${i + 1}. ${slot}`).join('\n');
};

// Initial conversation state
export const createInitialState = (): ConversationState => ({
    step: 'greeting',
    patient: {},
    request: {},
    messages: [createMessage('assistant', GREETING_MESSAGE)],
});
