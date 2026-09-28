import {
    searchKnowledge,
    formatPassagesForPrompt,
    buildReferencesSection,
    formatPassagesAsExcerpts,
    expandQueriesWithGlossary,
    RetrievedPassage,
} from './knowledgeBase';

export { loadLocalCompiledKnowledge } from './knowledgeBase';

export interface AnalysisMeta {
    /** "gemini" : rapport rédigé par l'IA ; "offline" : relevé automatique sans IA */
    engine: 'gemini' | 'offline';
    model?: string;
    passages: number;
    citedPassages: number;
    /** Cause lisible quand l'IA n'a pas pu répondre */
    failure?: string;
}

export interface AnalysisResult {
    diagnostic: string;
    traitement: string;
    meta?: AnalysisMeta;
}

export const isAiConfigured = () => Boolean(getGeminiApiKey());

// Informations patient utiles au raisonnement clinique (l'âge conditionne
// fortement la stratégie : interception en croissance vs compensation adulte)
export interface PatientClinicalContext {
    age?: number;
    sexe?: string;
    typePatient?: string;
}

export const buildPatientContext = (patient?: { date_naissance?: string; sexe?: string; type_patient?: string } | null): PatientClinicalContext | undefined => {
    if (!patient) return undefined;
    let age: number | undefined;
    if (patient.date_naissance) {
        const birth = new Date(patient.date_naissance);
        if (!isNaN(birth.getTime())) {
            const now = new Date();
            age = now.getFullYear() - birth.getFullYear();
            const m = now.getMonth() - birth.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
            if (age < 0 || age > 120) age = undefined;
        }
    }
    return { age, sexe: patient.sexe, typePatient: patient.type_patient };
};

const describePatient = (patientName?: string, ctx?: PatientClinicalContext): string => {
    const parts: string[] = [];
    if (patientName) parts.push(`Patient : ${patientName}`);
    if (ctx?.age !== undefined) parts.push(`Âge : ${ctx.age} ans`);
    if (ctx?.sexe) parts.push(`Sexe : ${ctx.sexe}`);
    if (ctx?.typePatient) parts.push(`Catégorie : ${ctx.typePatient}`);
    return parts.length ? parts.join(' · ') : 'Informations patient non renseignées (âge inconnu : raisonner en conséquence et le signaler).';
};

// Retrieve the Gemini API key from localStorage or env variables
export const getGeminiApiKey = (): string => {
    const localKey = localStorage.getItem('casper_gemini_api_key') || localStorage.getItem('orthomind_gemini_api_key');
    if (localKey && localKey.trim().length > 5) return localKey.trim();

    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (envKey && envKey.trim().length > 5) return envKey.trim();

    return '';
};

// Réduit un cliché à 2048 px sur le plus grand côté (JPEG) : 10 photos pleine
// résolution dépasseraient la limite de taille d'une requête Gemini (~20 Mo).
const MAX_IMAGE_EDGE = 2048;

const downscaleImage = async (file: File): Promise<Blob | null> => {
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
        if (scale === 1 && file.size < 2.5 * 1024 * 1024 && file.type === 'image/jpeg') {
            bitmap.close();
            return null; // déjà raisonnable
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    } catch {
        return null; // format non décodable par le navigateur (ex. HEIC) : on garde l'original
    }
};

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

// Convert a File object to base64 inline data format for Gemini
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
    const resized = await downscaleImage(file);
    if (resized) {
        return { inlineData: { data: await blobToBase64(resized), mimeType: 'image/jpeg' } };
    }

    // Safe fallback for MIME type if empty (common on macOS/iOS browsers for HEIC files)
    let mimeType = file.type;
    if (!mimeType) {
        const nameLower = file.name.toLowerCase();
        if (nameLower.endsWith('.heic')) mimeType = 'image/heic';
        else if (nameLower.endsWith('.heif')) mimeType = 'image/heif';
        else if (nameLower.endsWith('.png')) mimeType = 'image/png';
        else if (nameLower.endsWith('.webp')) mimeType = 'image/webp';
        else mimeType = 'image/jpeg';
    }
    return { inlineData: { data: await blobToBase64(file), mimeType } };
};

// Convert base64 data string to inline data format
const base64ToGenerativePart = (base64String: string, mimeType: string = 'image/jpeg') => {
    // Strip header if present
    const base64Data = base64String.includes(',') ? base64String.split(',')[1] : base64String;
    return {
        inlineData: {
            data: base64Data,
            mimeType: mimeType
        }
    };
};

// Compatibilité : recherche documentaire renvoyant un bloc texte formaté
export const searchKnowledgeBase = async (keywords: string[]): Promise<string> => {
    const passages = await searchKnowledge(keywords);
    return formatPassagesForPrompt(passages);
};

// ============================================================================
// Sélection des modèles Gemini
// ----------------------------------------------------------------------------
// Les modèles Gemini sont régulièrement renommés / retirés. Plutôt que de figer
// une liste qui finit par renvoyer des 404, on interroge l'API une fois pour
// connaître les modèles disponibles sur la clé et on classe les meilleurs.
// ============================================================================
export type ModelTier = 'expert' | 'fast';

// Utilisé seulement si la liste des modèles de la clé est inaccessible
const STATIC_MODEL_FALLBACK: Record<ModelTier, string[]> = {
    expert: ['gemini-3.8-pro', 'gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    fast: ['gemini-3.8-flash', 'gemini-2.5-flash'],
};

// Modèles retirés par Google (« no longer available », 404…) : mémorisés pour ne plus les essayer
const RETIRED_MODELS_KEY = 'orthomind_retired_gemini_models';
const retiredModels: Set<string> = (() => {
    try { return new Set(JSON.parse(localStorage.getItem(RETIRED_MODELS_KEY) || '[]')); } catch { return new Set(); }
})();
const markModelRetired = (model: string) => {
    retiredModels.add(model);
    try { localStorage.setItem(RETIRED_MODELS_KEY, JSON.stringify([...retiredModels])); } catch { /* stockage indisponible */ }
};
const isRetirementError = (status: number, message: string) =>
    status === 404 || /no longer available|not found|is not supported for generateContent|has been deprecated|was shut down/i.test(message);

let availableModelsPromise: Promise<string[] | null> | null = null;

// Authentification Gemini. Les clés AI Studio (« AIza… » comme le nouveau format
// « AQ.… ») passent par l'en-tête x-goog-api-key — jamais dans l'URL, où elles
// finiraient dans les journaux. Un jeton OAuth (« ya29.… ») passe en Bearer.
// Pour le format « AQ.… », on retente en Bearer si Google refuse l'en-tête.
type GeminiAuthMode = 'api-key' | 'bearer';
let preferredAuthMode: GeminiAuthMode | null = null;

const authModesFor = (apiKey: string): GeminiAuthMode[] => {
    if (apiKey.startsWith('ya29.')) return ['bearer'];
    if (apiKey.startsWith('AQ.')) return preferredAuthMode === 'bearer' ? ['bearer', 'api-key'] : ['api-key', 'bearer'];
    return ['api-key'];
};

export const geminiFetch = async (url: string, init: RequestInit, apiKey: string): Promise<Response> => {
    const modes = authModesFor(apiKey);
    let response: Response | null = null;
    for (const mode of modes) {
        const headers = new Headers(init.headers);
        if (mode === 'bearer') headers.set('Authorization', `Bearer ${apiKey}`);
        else headers.set('x-goog-api-key', apiKey);
        response = await fetch(url, { ...init, headers });
        if (response.status !== 401 && response.status !== 403) {
            if (modes.length > 1) preferredAuthMode = mode;
            return response;
        }
    }
    return response!;
};

const listAvailableModels = (apiKey: string): Promise<string[] | null> => {
    if (availableModelsPromise) return availableModelsPromise;
    availableModelsPromise = (async () => {
        try {
            const response = await geminiFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {}, apiKey);
            if (!response.ok) return null;
            const data = await response.json();
            return (data.models || [])
                .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
                .map((m: any) => String(m.name).replace(/^models\//, ''));
        } catch {
            return null;
        }
    })();
    return availableModelsPromise;
};

const rankModels = (models: string[], tier: ModelTier): string[] => {
    const candidates = models.filter(name =>
        /^gemini-\d/.test(name) &&
        !/(tts|image|live|audio|embedding|lite|nano|8b|robotics|computer-use|learnlm|thinking-exp|-exp-)/.test(name)
    );
    const version = (name: string) => parseFloat(name.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] || '0');
    const isPro = (name: string) => /-pro/.test(name);
    const isPreview = (name: string) => /preview|exp/.test(name);

    // La génération la plus récente passe en premier ; à version égale, « pro » pour
    // les analyses expertes, « flash » pour les tâches rapides ; les versions stables
    // avant les préversions.
    return candidates
        .filter(name => !retiredModels.has(name))
        .sort((a, b) => {
            if (version(a) !== version(b)) return version(b) - version(a);
            if (isPro(a) !== isPro(b)) return (tier === 'expert') === isPro(a) ? -1 : 1;
            if (isPreview(a) !== isPreview(b)) return isPreview(a) ? 1 : -1;
            return a.length - b.length; // alias courts ("gemini-3.8-pro") avant les versions datées
        });
};

const resolveModelChain = async (apiKey: string, tier: ModelTier): Promise<string[]> => {
    const available = await listAvailableModels(apiKey);
    const ranked = available ? rankModels(available, tier) : [];
    const fallback = STATIC_MODEL_FALLBACK[tier].filter(m => !retiredModels.has(m) && (!available || available.includes(m)));
    return [...new Set([...ranked.slice(0, 5), ...fallback])].slice(0, 6);
};

// Vérifie une clé Gemini et indique le modèle expert qui sera utilisé
export const testGeminiKey = async (apiKey: string): Promise<{ ok: true; model: string } | { ok: false; error: string }> => {
    try {
        const response = await geminiFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {}, apiKey);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return { ok: false, error: err.error?.message || `Erreur ${response.status}` };
        }
        const data = await response.json();
        const models = (data.models || [])
            .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map((m: any) => String(m.name).replace(/^models\//, ''));
        const best = rankModels(models, 'expert')[0];
        availableModelsPromise = Promise.resolve(models); // réutilisé par les analyses suivantes
        return best ? { ok: true, model: best } : { ok: false, error: 'Aucun modèle Gemini disponible pour cette clé.' };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Réseau indisponible' };
    }
};

// Dernier modèle ayant effectivement répondu (affiché dans les rapports)
let lastRespondingModel: string | null = null;
export const getLastRespondingModel = () => lastRespondingModel;

// Réglages de réflexion par famille de modèles
const withModelConfig = (apiBody: any, model: string, deepThinking: boolean, dropThinking: boolean) => {
    const body = JSON.parse(JSON.stringify(apiBody));
    const gen = (body.generationConfig = body.generationConfig || {});
    const legacy = /gemini-(1\.5|2\.0)/.test(model);
    // Les anciens modèles plafonnent à 8192 tokens de sortie
    if (legacy && gen.maxOutputTokens > 8192) gen.maxOutputTokens = 8192;
    if (deepThinking && !dropThinking && !legacy) {
        if (/gemini-2\.5/.test(model)) {
            gen.thinkingConfig = { thinkingBudget: /pro/.test(model) ? 24576 : 16384 };
        } else {
            gen.thinkingConfig = { thinkingLevel: 'high' };
        }
    }
    return body;
};

export interface GeminiCallOptions {
    /** Laisse le modèle réfléchir en profondeur avant de répondre (analyses cliniques) */
    deepThinking?: boolean;
}

// Helper to call Gemini with retries and model fallbacks
export const executeGeminiCall = async (
    endpointPath: string,
    apiBody: any,
    apiKey: string,
    onStatusUpdate?: (status: string) => void,
    tier: ModelTier = 'fast',
    options: GeminiCallOptions = {}
): Promise<any> => {
    const models = await resolveModelChain(apiKey, tier);
    const tried = new Set<string>();
    let lastError: any = null;

    for (let m = 0; m < models.length; m++) {
        const model = models[m];
        if (tried.has(model)) continue;
        tried.add(model);
        const maxRetries = 2; // 3 attempts total per model
        let dropThinking = false;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            let retryable = true;
            try {
                if (onStatusUpdate && (attempt > 0 || model !== models[0])) {
                    onStatusUpdate(`Tentative avec ${model} (essai ${attempt + 1}/${maxRetries + 1})...`);
                }

                const body = withModelConfig(apiBody, model, !!options.deepThinking, dropThinking);
                const response = await geminiFetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpointPath}`,
                    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
                    apiKey
                );

                if (response.ok) {
                    const data = await response.json();
                    if (extractText(data)) {
                        console.log(`[Gemini] Réponse obtenue avec ${model}`);
                        lastRespondingModel = model;
                        return data;
                    }
                    const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || 'raison inconnue';
                    lastError = new Error(`[${model}] Réponse vide (${reason})`);
                    // Réponse vide pour cause de limite ou de filtre : un nouvel essai identique n'y changera rien
                    retryable = false;
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    const message: string = errorData.error?.message || `Status: ${response.status}`;
                    lastError = new Error(`[${model}] ${message}`);
                    if (isRetirementError(response.status, message)) {
                        // Modèle retiré : on le mémorise et on essaie celui que Google recommande
                        markModelRetired(model);
                        const suggested = message.match(/use (?:models\/)?(gemini-[\w.-]+)/i)?.[1];
                        if (suggested && !tried.has(suggested) && !models.includes(suggested)) models.splice(m + 1, 0, suggested);
                        console.warn(`[Gemini] ${model} retiré par Google${suggested ? `, essai de ${suggested}` : ''}`);
                        break;
                    }
                    if (response.status === 400 && body.generationConfig?.thinkingConfig && !dropThinking) {
                        // Paramètre de réflexion non reconnu par ce modèle : on réessaie sans
                        dropThinking = true;
                        continue;
                    }
                    // Quota épuisé (pas une simple saturation) : on passe au modèle suivant
                    const quotaExhausted = response.status === 429 && /quota|limit: 0|billing/i.test(message);
                    retryable = !quotaExhausted && (response.status === 429 || response.status >= 500);
                }
                console.warn(`Gemini call failed on ${model} (attempt ${attempt + 1}): ${lastError.message}`);
            } catch (err: any) {
                lastError = err;
                console.warn(`Network/Fetch error for ${model} (attempt ${attempt + 1}):`, err);
            }

            if (!retryable) break;
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error("Échec de toutes les tentatives d'appel Gemini.");
};

// Traduit une erreur technique en cause compréhensible pour le praticien
export const describeAiFailure = (err: unknown): string => {
    const msg = String((err as any)?.message || err || '');
    if (/OAuth 2 access token|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(msg)) return 'Google refuse la clé au format « AQ. » (problème connu des nouvelles clés AI Studio) : créez une clé dans Google Cloud Console, restreinte à « Generative Language API ».';
    if (/API key not valid|invalid authentication|API_KEY_INVALID|401|403|PERMISSION_DENIED/i.test(msg)) return 'la clé Gemini est refusée par Google (vérifiez-la dans Configuration).';
    if (/quota|limit: 0|billing|RESOURCE_EXHAUSTED|429/i.test(msg)) return 'le quota Gemini est épuisé (activez la facturation du projet Google ou réessayez plus tard).';
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'le réseau est indisponible.';
    if (/SAFETY|blockReason|PROHIBITED/i.test(msg)) return 'la réponse a été bloquée par les filtres de Google.';
    return msg ? `erreur Gemini : ${msg.slice(0, 160)}` : 'erreur inconnue.';
};

// Concatène toutes les parties texte (les modèles "thinking" peuvent en renvoyer plusieurs)
export const extractText = (data: any): string =>
    (data?.candidates?.[0]?.content?.parts || [])
        .filter((p: any) => typeof p.text === 'string' && !p.thought)
        .map((p: any) => p.text)
        .join('')
        .trim();

const parseJsonResponse = <T>(text: string): T | null => {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try {
        return JSON.parse(cleaned) as T;
    } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]) as T; } catch { /* ignore */ }
        }
        return null;
    }
};

// Extraction robuste des sections <diagnostic> / <traitement>.
// Une réponse de l'IA n'est jamais jetée : si les balises manquent, on découpe
// sur le titre du plan de traitement, sinon tout va dans le diagnostic.
const parseReportSections = (rawText: string): AnalysisResult | null => {
    const resultText = rawText.replace(/```(?:xml|markdown)?/gi, '');
    const diagMatch = resultText.match(/<diagnostic>([\s\S]*?)<\/diagnostic>/i);
    const traitMatch = resultText.match(/<traitement>([\s\S]*?)<\/traitement>/i);

    let diagnostic = diagMatch ? diagMatch[1].trim() : '';
    let traitement = traitMatch ? traitMatch[1].trim() : '';

    // Balises non fermées (réponse tronquée)
    if (!diagnostic && /<diagnostic>/i.test(resultText)) {
        const start = resultText.search(/<diagnostic>/i) + '<diagnostic>'.length;
        const traitStart = resultText.search(/<traitement>/i);
        diagnostic = resultText.substring(start, traitStart !== -1 ? traitStart : resultText.length)
            .replace(/<\/diagnostic>/gi, '').trim();
    }
    if (!traitement && /<traitement>/i.test(resultText)) {
        const start = resultText.search(/<traitement>/i) + '<traitement>'.length;
        traitement = resultText.substring(start).replace(/<\/traitement>/gi, '').trim();
    }

    // Aucune balise : découpage sur le premier titre de traitement
    if (!diagnostic && !traitement) {
        const plain = resultText.replace(/<\/?(diagnostic|traitement)>/gi, '').trim();
        if (!plain) return null;
        const split = plain.search(/^\s*(#+\s*)?(\*\*)?\s*(\d+\.\s*)?(PLAN DE TRAITEMENT|PLAN THÉRAPEUTIQUE|TRAITEMENT|OBJECTIFS THÉRAPEUTIQUES)/im);
        if (split > 0) {
            diagnostic = plain.slice(0, split).trim();
            traitement = plain.slice(split).trim();
        } else {
            diagnostic = plain;
        }
    }

    if (!diagnostic && traitement) diagnostic = traitement;
    if (!traitement) traitement = '(Plan de traitement non généré : relancez l\'analyse pour l\'obtenir.)';
    return diagnostic ? { diagnostic, traitement } : null;
};

// Ajoute les références réellement citées à la fin du diagnostic
const attachReferences = (report: AnalysisResult, passages: RetrievedPassage[]): AnalysisResult => {
    const fullText = `${report.diagnostic}\n${report.traitement}`;
    const cited = new Set((fullText.match(/\[S\d+\]/g) || []).map(m => m.slice(1, -1)));
    return {
        diagnostic: report.diagnostic + buildReferencesSection(fullText, passages),
        traitement: report.traitement,
        meta: {
            engine: 'gemini',
            model: getLastRespondingModel() || undefined,
            passages: passages.length,
            citedPassages: passages.filter(p => cited.has(p.id)).length,
        },
    };
};

// ============================================================================
// Règles d'expertise communes à toutes les analyses
// ============================================================================
const EXPERT_PERSONA = `Tu es OrthoMind, l'assistant d'aide au diagnostic du cabinet d'orthodontie du Dr Renaud Desouches (chirurgien-dentiste spécialiste qualifié en orthodontie, cabinet YouSmile). Tu raisonnes comme un orthodontiste spécialiste chevronné qui s'adresse à un confrère.`;

const EXPERT_RULES = `RÈGLES D'EXPERTISE (impératives) :
1. Terminologie orthodontique française standard : Classe d'Angle (I, II division 1, II division 2, III), surplomb, recouvrement, supraclusion, béance, articulé inversé / occlusion inversée, endognathie, dysharmonie dento-maxillaire (DDM), proalvéolie, rétroalvéolie, rétrognathie, promandibulie, canine incluse, agénésie, notation dentaire FDI.
2. Analyse dans les trois sens de l'espace : sagittal, vertical, transversal — puis dentaire, fonctionnel (ventilation, déglutition, ATM), parodontal et esthétique.
3. Honnêteté clinique : distingue explicitement ce qui est CONSTATÉ, ce qui est PROBABLE (à confirmer) et ce qui n'est PAS ÉVALUABLE avec les données fournies. N'invente jamais une mesure chiffrée : donne une estimation qualitative, ou une valeur en mm uniquement si elle est dite par le praticien ou mesurable, en la marquant « estimé ».
4. Le diagnostic squelettique définitif requiert téléradiographie de profil et analyse céphalométrique ; la situation des germes et des racines requiert une radiographie panoramique (voire un CBCT). Indique les examens complémentaires réellement utiles.
5. Plan de traitement individualisé : tiens compte de l'âge et du potentiel de croissance (interception, orthopédie, compensation, orthodontie-chirurgie), de la sévérité et des priorités du patient. Propose l'option recommandée ET les alternatives crédibles, avec leurs indications. N'impose jamais les aligneurs par défaut : choisis l'appareillage le plus adapté au cas (aligneurs, multi-attaches, disjoncteur, appareil fonctionnel, ancrage osseux…).
6. Bibliothèque du cabinet : appuie tes points clés sur les passages fournis en citant leur identifiant entre crochets, par exemple [S3], directement dans la phrase concernée. Ne cite un passage que s'il soutient réellement l'affirmation. N'invente jamais d'ouvrage, d'auteur ni de page. Les passages sont souvent en anglais : reformule-les en français. Quand un point ne repose sur aucun passage, appuie-toi sur tes connaissances cliniques sans citation.
7. Ne rédige PAS de liste de références en fin de document : elle est générée automatiquement à partir de tes citations [S#].
8. Mise en forme : titres de sections numérotés en MAJUSCULES, puces "- ", termes clés en **gras**. Pas de tableau Markdown.`;

const buildLibraryBlock = (passages: RetrievedPassage[]): string =>
    passages.length > 0
        ? `### PASSAGES DE LA BIBLIOTHÈQUE DU CABINET (${passages.length} extraits sélectionnés parmi 54 ouvrages) :\n${formatPassagesForPrompt(passages)}`
        : `### BIBLIOTHÈQUE DU CABINET : aucun passage pertinent trouvé pour ce cas. Appuie-toi sur tes connaissances cliniques, sans citation [S#].`;

const DIAGNOSTIC_TEMPLATE = `<diagnostic>
1. CLASSIFICATION D'ANGLE : (mise en avant très visible de la Classe d'Angle molaire et canine, droite et gauche, avec justification et niveau de certitude)

2. ANALYSE OCCLUSALE TRIDIMENSIONNELLE :
- Sens sagittal (surplomb, rapports molaires et canins)
- Sens vertical (recouvrement, supraclusion / béance, courbe de Spee)
- Sens transversal (articulé inversé, endognathie, lignes médianes)

3. ANOMALIES DENTO-ALVÉOLAIRES : (encombrement / DDM, rotations, diastèmes, dents absentes ou incluses, en notation FDI)

4. PARODONTE, HYGIÈNE & TISSUS MOUS :

5. FONCTIONS & ESTHÉTIQUE : (ventilation, déglutition, ATM, sourire, profil — si évaluable)

6. SYNTHÈSE DIAGNOSTIQUE : (liste hiérarchisée des problèmes) & EXAMENS COMPLÉMENTAIRES À PRÉVOIR
</diagnostic>`;

const TREATMENT_TEMPLATE = `<traitement>
1. OBJECTIFS THÉRAPEUTIQUES :

2. OPTION RECOMMANDÉE & ALTERNATIVES : (appareillage retenu et justification, puis alternatives avec leurs indications)

3. SÉQUENCEMENT PAR PHASES : (étapes cliniques concrètes et biomécanique)

4. GESTION DE L'ESPACE & DE L'ANCRAGE : (expansion, stripping/IPR, extractions, mini-vis — uniquement ce qui est pertinent pour ce cas)

5. POINTS DE VIGILANCE & RISQUES : (parodonte, résorptions, récidive, observance, conditions préalables)

6. CONSIGNES POUR L'ÉQUIPE ET LE PATIENT : (actes préalables, hygiène, observance, rythme des contrôles)

7. DURÉE ESTIMÉE & CONTENTION :
</traitement>`;

// ============================================================================
// ANALYSE DES CLICHÉS PHOTOGRAPHIQUES
// ============================================================================
interface VisionFindings {
    observations?: string[];
    hypotheses?: string[];
    qualite_cliches?: string;
    requetes_bibliotheque?: string[];
}

export const analyzeDentition = async (
    imageFiles: File[],
    onStatusUpdate?: (status: string) => void,
    patientName?: string,
    patientContext?: PatientClinicalContext
): Promise<AnalysisResult> => {
    const apiKey = getGeminiApiKey();

    if (imageFiles.length === 0) {
        throw new Error('Veuillez fournir au moins une photo de dentition.');
    }

    onStatusUpdate?.('Préparation des clichés optiques...');
    const imageParts = await Promise.all(imageFiles.map(file => fileToGenerativePart(file)));
    const patientLine = describePatient(patientName, patientContext);

    // Étape 1 — lecture clinique des clichés et formulation des requêtes documentaires
    let findings: VisionFindings = {};
    let failure: string | undefined = apiKey ? undefined : 'aucune clé Gemini n\'est configurée.';
    if (apiKey) {
        onStatusUpdate?.('Lecture clinique des clichés (constats visuels)...');
        try {
            const prompt = `${EXPERT_PERSONA}
${patientLine}

Examine ces ${imageFiles.length} photographie(s) intra/extra-orales et produis un relevé clinique FACTUEL, sans plan de traitement.
Réponds uniquement en JSON :
{
  "observations": ["constats visuels précis, un par élément (préciser le cliché et le côté, notation FDI)"],
  "hypotheses": ["anomalies probables mais non confirmables sur photo"],
  "qualite_cliches": "vues disponibles, vues manquantes (face, profil, occlusales, latérales droite/gauche, sourire), qualité",
  "requetes_bibliotheque": ["6 à 8 requêtes de recherche en ANGLAIS technique orthodontique pour retrouver dans des manuels la prise en charge des anomalies observées (ex: 'class II division 2 deep bite correction', 'maxillary canine impaction management')"]
}`;
            const data = await executeGeminiCall('generateContent', {
                contents: [{ parts: [{ text: prompt }, ...imageParts] }],
                generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 4096 },
            }, apiKey, undefined, 'fast');
            findings = parseJsonResponse<VisionFindings>(extractText(data)) || {};
            console.log('[OrthoMind] Constats visuels :', findings);
        } catch (e) {
            console.warn('Lecture préliminaire des clichés impossible :', e);
        }
    }

    // Étape 2 — recherche dans la bibliothèque
    onStatusUpdate?.('Recherche dans la bibliothèque du cabinet (54 ouvrages)...');
    const queries = [
        ...(findings.requetes_bibliotheque || []),
        ...(findings.observations || []),
        ...(findings.hypotheses || []),
    ];
    const passages = await searchKnowledge(
        queries.length ? queries : ['orthodontic diagnosis malocclusion', 'treatment planning'],
        { topK: 16 }
    );
    onStatusUpdate?.(`${passages.length} passages de référence retenus — rédaction du rapport expert...`);

    // Étape 3 — rapport expert (vision + constats + bibliothèque)
    if (apiKey) {
        const findingsBlock = findings.observations?.length
            ? `### RELEVÉ PRÉLIMINAIRE DES CLICHÉS (à vérifier sur les images) :
Constats : ${findings.observations.map(o => `\n- ${o}`).join('')}
${findings.hypotheses?.length ? `Hypothèses : ${findings.hypotheses.map(o => `\n- ${o}`).join('')}` : ''}
${findings.qualite_cliches ? `Qualité / vues : ${findings.qualite_cliches}` : ''}`
            : '';

        const finalPrompt = `${EXPERT_PERSONA}

Tu rédiges le rapport d'analyse clinique des photographies ci-jointes pour le praticien.
${patientLine}

${findingsBlock}

${buildLibraryBlock(passages)}

${EXPERT_RULES}
9. Sur photographies seules, précise pour chaque conclusion importante sur quel cliché elle repose. Si une vue manque pour conclure (ex. Classe d'Angle d'un côté non visible), dis-le.

Rédige ton rapport en français en respectant STRICTEMENT ce format, sans aucun texte hors des balises :

${DIAGNOSTIC_TEMPLATE}

${TREATMENT_TEMPLATE}`;

        try {
            onStatusUpdate?.('Raisonnement clinique approfondi en cours (jusqu\'à 1 à 2 minutes)...');
            const resultData = await executeGeminiCall('generateContent', {
                contents: [{ parts: [{ text: finalPrompt }, ...imageParts] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 32768 },
            }, apiKey, onStatusUpdate, 'expert', { deepThinking: true });
            const report = parseReportSections(extractText(resultData));
            if (report) return attachReferences(report, passages);
            failure = 'la réponse de Gemini était vide.';
        } catch (err) {
            console.warn('API Gemini final analysis failed completely:', err);
            failure = describeAiFailure(err);
        }
    }

    // Pas de pseudo-rapport : l'échec est signalé tel quel à l'interface
    throw new Error(`Analyse impossible : ${failure || 'réponse inexploitable.'}`);
};

// ============================================================================
// ASSISTANT CONVERSATIONNEL
// ============================================================================
const planQueriesFromText = async (text: string, apiKey: string): Promise<string[]> => {
    if (!apiKey) return [];
    try {
        const data = await executeGeminiCall('generateContent', {
            contents: [{ parts: [{ text: `Voici une question ou un texte clinique d'orthodontie :
"""${text.slice(0, 4000)}"""
Génère 4 à 6 requêtes de recherche en ANGLAIS technique orthodontique pour retrouver les passages pertinents dans des manuels d'orthodontie anglophones.
Réponds uniquement en JSON : {"requetes": ["..."]}` }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 1024 },
        }, apiKey, undefined, 'fast');
        return parseJsonResponse<{ requetes?: string[] }>(extractText(data))?.requetes || [];
    } catch {
        return [];
    }
};

const getFallbackChatResponse = (passages: RetrievedPassage[], failure = 'la réponse de Gemini était vide.'): string => {
    const base = `⚠️ **Je ne peux pas raisonner sur votre question** — cause : ${failure} Corrigez-la dans l'onglet Configuration.`;
    return passages.length
        ? `${base}\n\nVoici néanmoins les passages de la bibliothèque les plus proches de votre question :\n\n${formatPassagesAsExcerpts(passages, 3)}`
        : base;
};

export const askOrthoMind = async (
    messageHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> => {
    const apiKey = getGeminiApiKey();
    const userMessage = messageHistory[messageHistory.length - 1]?.content || '';
    const previousUser = messageHistory.filter(m => m.role === 'user').slice(-2, -1)[0]?.content || '';

    const plannedQueries = await planQueriesFromText(`${previousUser}\n${userMessage}`, apiKey);
    const passages = await searchKnowledge([userMessage, ...plannedQueries], { topK: 8, maxPerBook: 2 });

    if (apiKey) {
        const formattedHistory = messageHistory.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
        }));

        const systemInstruction = `${EXPERT_PERSONA}
Tu réponds aux questions cliniques et scientifiques du praticien de façon précise, technique et rigoureuse.

${buildLibraryBlock(passages)}

RÈGLES :
- Appuie tes réponses sur les passages ci-dessus en citant leur identifiant [S#] dans la phrase concernée, uniquement s'ils soutiennent réellement ton propos. N'invente jamais de source.
- Si la bibliothèque ne couvre pas la question, dis-le brièvement puis réponds avec tes connaissances cliniques.
- Distingue consensus, données discutées et avis d'expert. Signale les limites et les examens nécessaires.
- Ne mets pas de liste de références à la fin : elle est ajoutée automatiquement.
- Réponds en français, en Markdown simple (titres courts, puces, **gras**), de façon concise mais cliniquement complète.`;

        try {
            const data = await executeGeminiCall('generateContent', {
                contents: formattedHistory,
                systemInstruction: { parts: [{ text: systemInstruction }] },
                generationConfig: { temperature: 0.3, maxOutputTokens: 16384 },
            }, apiKey, undefined, 'expert', { deepThinking: true });
            const resText = extractText(data);
            if (resText) return resText + buildReferencesSection(resText, passages);
        } catch (err) {
            console.warn('API Gemini failed for OrthoMind chat:', err);
            return getFallbackChatResponse(passages, describeAiFailure(err));
        }
    }

    return getFallbackChatResponse(passages, apiKey ? undefined : 'aucune clé Gemini n\'est configurée.');
};

// Generate a photorealistic post-treatment smile simulation using Gemini API + AI Image Engine
export const generateSmileSimulationWithGemini = async (simPhotoBase64: string): Promise<string | null> => {
    const apiKey = getGeminiApiKey();

    let featureDescription = "man's lower face with mustache and beard wearing blue shirt";

    // 1. Analyze the uploaded smile photo with Gemini Vision API (gemini-2.5-flash / gemini-1.5-flash) to extract exact framing and patient features
    if (apiKey) {
        try {
            const imagePart = base64ToGenerativePart(simPhotoBase64);
            const visionPrompt = `Analyse le cadrage et les caractéristiques exactes de cette photo du visage (ex: "close up lower face portrait of a man with mustache and beard wearing light blue shirt"). Rends uniquement 1 phrase courte en anglais séparée par des virgules sans aucun autre mot.`;

            const visionBody = {
                contents: [
                    {
                        parts: [
                            { text: visionPrompt },
                            imagePart
                        ]
                    }
                ]
            };

            const visionResult = await executeGeminiCall('generateContent', visionBody, apiKey);
            const geminiText = visionResult.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (geminiText.trim()) {
                featureDescription = geminiText.trim();
            }
            console.log('Gemini Vision feature description for simulation:', featureDescription);
        } catch (err) {
            console.warn('Gemini vision feature extraction skipped:', err);
        }
    }

    // Construct high-precision prompt for clear aligner orthodontic outcome matching the reference shot
    const prompt = `Extreme close-up clinical dental macro photography of a ${featureDescription}, smiling with clear transparent aligners fitted over perfectly aligned, straight, porcelain white teeth, showing clear aligner plastic sheen and composite attachments on teeth, 8k resolution, professional orthodontic clinic photo`;

    // 2. Try Imagen 3 API if key configured
    if (apiKey) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const resp = await geminiFetch('https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters: { sampleCount: 1, aspectRatio: "1:1" }
                })
            }, apiKey);
            clearTimeout(timeoutId);
            if (resp.ok) {
                const data = await resp.json();
                const b64 = data.predictions?.[0]?.bytesBase64Encoded || data.generatedImages?.[0]?.image?.imageBytes;
                if (b64) return `data:image/jpeg;base64,${b64}`;
            }
        } catch (e) {
            console.warn('Imagen 3 predict API skipped:', e);
        }
    }

    // 3. High-Resolution AI Photorealistic Smile Generation (Gemini-guided FLUX engine)
    try {
        const seed = Math.floor(Math.random() * 1000000);
        const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=800&nologo=true&seed=${seed}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const fluxResp = await fetch(fluxUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (fluxResp.ok) {
            const blob = await fluxResp.blob();
            return await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        }
    } catch (fluxErr) {
        console.warn('FLUX AI smile generation skipped:', fluxErr);
    }

    return null;
};


// ============================================================================
// CONSULTATION AUDIO
// ============================================================================
interface ConsultationFacts {
    faits_cliniques?: string[];
    doleances_patient?: string[];
    decisions_praticien?: string[];
    corrections_transcription?: string[];
    requetes_bibliotheque?: string[];
}

/**
 * Synthèse d'une consultation retranscrite en compte-rendu clinique structuré :
 * 1. extraction des faits cliniques (et correction des erreurs de dictée),
 * 2. recherche ciblée dans la bibliothèque à partir de ces faits,
 * 3. rédaction du compte-rendu expert, fidèle aux décisions du praticien.
 */
export const synthesizeAudioConsultation = async (
    transcriptText: string,
    patientName?: string,
    onStatusUpdate?: (status: string) => void,
    patientContext?: PatientClinicalContext
): Promise<AnalysisResult> => {
    const apiKey = getGeminiApiKey();

    if (!transcriptText || transcriptText.trim().length < 5) {
        throw new Error('Le texte de retranscription est trop court pour effectuer une synthèse clinique.');
    }

    const patientLine = describePatient(patientName, patientContext);

    // Étape 1 — extraction des faits cliniques
    let facts: ConsultationFacts = {};
    let failure: string | undefined = apiKey ? undefined : 'aucune clé Gemini n\'est configurée.';
    if (apiKey) {
        onStatusUpdate?.('Extraction des faits cliniques du dialogue...');
        try {
            const prompt = `${EXPERT_PERSONA}
${patientLine}

Voici la retranscription automatique (reconnaissance vocale, donc possiblement bruitée) d'une consultation d'orthodontie :
"""${transcriptText}"""

Extrais les informations cliniques. Les termes techniques ont pu être mal retranscrits phonétiquement (ex. "classe de" pour "Classe II", "en do gnathie" pour "endognathie") : corrige-les en le signalant.
Réponds uniquement en JSON :
{
  "faits_cliniques": ["constats cliniques et examens évoqués, avec dents en notation FDI et mesures dictées"],
  "doleances_patient": ["motif de consultation, gênes, attentes, antécédents"],
  "decisions_praticien": ["diagnostic posé, options discutées, décisions et consignes données par le praticien"],
  "corrections_transcription": ["terme retranscrit → terme corrigé"],
  "requetes_bibliotheque": ["6 à 8 requêtes de recherche en ANGLAIS technique orthodontique pour retrouver dans des manuels la prise en charge de ce cas"]
}`;
            const data = await executeGeminiCall('generateContent', {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 4096 },
            }, apiKey, undefined, 'fast');
            facts = parseJsonResponse<ConsultationFacts>(extractText(data)) || {};
            console.log('[OrthoMind] Faits extraits de la consultation :', facts);
        } catch (e) {
            console.warn('Extraction des faits cliniques impossible :', e);
        }
    }

    // Étape 2 — recherche dans la bibliothèque, à partir des faits (et non des premiers mots du dialogue)
    onStatusUpdate?.('Recherche dans la bibliothèque du cabinet (54 ouvrages)...');
    const queries = [
        ...(facts.requetes_bibliotheque || []),
        ...(facts.faits_cliniques || []),
        ...(facts.decisions_praticien || []),
    ];
    const passages = await searchKnowledge(
        queries.length ? queries : [transcriptText.slice(0, 1500), ...expandQueriesWithGlossary([transcriptText])],
        { topK: 16 }
    );
    onStatusUpdate?.(`${passages.length} passages de référence retenus — rédaction du compte-rendu...`);

    // Étape 3 — compte-rendu expert
    if (apiKey) {
        const list = (title: string, items?: string[]) => items?.length ? `${title} :${items.map(i => `\n- ${i}`).join('')}\n` : '';
        const factsBlock = [
            list('Faits cliniques', facts.faits_cliniques),
            list('Doléances du patient', facts.doleances_patient),
            list('Décisions et propos du praticien', facts.decisions_praticien),
            list('Corrections de retranscription', facts.corrections_transcription),
        ].join('');

        const prompt = `${EXPERT_PERSONA}

Tu rédiges le COMPTE-RENDU OFFICIEL DE CONSULTATION D'ORTHODONTIE, destiné au praticien, aux assistantes et au dossier médical du patient.
${patientLine}

### RETRANSCRIPTION DE LA CONSULTATION :
"""${transcriptText}"""

${factsBlock ? `### FAITS EXTRAITS DU DIALOGUE :\n${factsBlock}` : ''}

${buildLibraryBlock(passages)}

${EXPERT_RULES}
9. Le praticien a examiné le patient : ses constats et décisions PRIMENT. Ne les contredis pas ; si la littérature suggère un point de vigilance ou une alternative, présente-le comme tel.
10. Ce qui n'a pas été abordé pendant la consultation doit être indiqué « non évalué lors de la consultation », jamais inventé.
11. Le compte-rendu doit être approfondi et directement exploitable par l'équipe : pas de résumé lapidaire.

Rédige en français médical rigoureux en respectant STRICTEMENT ce format, sans aucun texte hors des balises. Dans le diagnostic, commence par une section "0. MOTIF DE CONSULTATION & ANAMNÈSE" avant la classification d'Angle.

${DIAGNOSTIC_TEMPLATE}

${TREATMENT_TEMPLATE}`;

        try {
            onStatusUpdate?.('Raisonnement clinique approfondi en cours (jusqu\'à 1 à 2 minutes)...');
            const data = await executeGeminiCall('generateContent', {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.15, maxOutputTokens: 32768 },
            }, apiKey, onStatusUpdate, 'expert', { deepThinking: true });
            const report = parseReportSections(extractText(data));
            if (report) return attachReferences(report, passages);
            failure = 'la réponse de Gemini était vide.';
        } catch (e) {
            console.warn('Gemini Audio synthesis failed:', e);
            failure = describeAiFailure(e);
        }
    }

    // Pas de pseudo-rapport : l'échec est signalé tel quel, la retranscription est conservée
    throw new Error(`Compte-rendu impossible : ${failure || 'réponse inexploitable.'}`);
};
