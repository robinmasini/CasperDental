import { supabase } from '../lib/supabase';
import defaultBookData from '../assets/cgs_volume_61.json';

export interface AnalysisResult {
    diagnostic: string;
    traitement: string;
}

// Retrieve the Gemini API key from localStorage or env variables
export const getGeminiApiKey = (): string => {
    const localKey = localStorage.getItem('casper_gemini_api_key');
    if (localKey) return localKey;
    
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (envKey) return envKey;
    
    return '';
};

// Convert a File object to base64 inline data format for Gemini
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = (reader.result as string).split(',')[1];
            
            // Safe fallback for MIME type if empty (common on macOS/iOS browsers for HEIC files)
            let mimeType = file.type;
            if (!mimeType) {
                const nameLower = file.name.toLowerCase();
                if (nameLower.endsWith('.heic')) {
                    mimeType = 'image/heic';
                } else if (nameLower.endsWith('.heif')) {
                    mimeType = 'image/heif';
                } else if (nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg')) {
                    mimeType = 'image/jpeg';
                } else if (nameLower.endsWith('.png')) {
                    mimeType = 'image/png';
                } else if (nameLower.endsWith('.webp')) {
                    mimeType = 'image/webp';
                } else {
                    mimeType = 'image/jpeg'; // Safe fallback
                }
            }

            resolve({
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
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

let cachedLocalKnowledge: { books: any[]; chunks: any[] } | null = null;

export const loadLocalCompiledKnowledge = async (): Promise<{ books: any[]; chunks: any[] }> => {
    if (cachedLocalKnowledge) return cachedLocalKnowledge;
    try {
        const response = await fetch('/casper_knowledge.json');
        if (response.ok) {
            const data = await response.json();
            cachedLocalKnowledge = data;
            return data;
        }
    } catch (e) {
        console.warn('Failed to load compiled local knowledge from /casper_knowledge.json:', e);
    }
    cachedLocalKnowledge = { books: [], chunks: [] };
    return cachedLocalKnowledge;
};

// Search Supabase and local compiled files for orthodontic knowledge chunks matching key terms
export const searchKnowledgeBase = async (keywords: string[]): Promise<string> => {
    if (!keywords || keywords.length === 0) return '';
    
    const isMockAuth = localStorage.getItem('casper_mock_auth') === 'true';
    const isCgsDeleted = localStorage.getItem('casper_cgs_deleted') === 'true';

    // Load local compiled knowledge from desktop library
    const compiledLocal = await loadLocalCompiledKnowledge();
    const compiledChunks = compiledLocal.chunks || [];

    try {
        if (isMockAuth) {
            const localKnowledge = localStorage.getItem('casper_mock_knowledge');
            const parsedLocal = localKnowledge ? JSON.parse(localKnowledge) : [];
            const chunks = isCgsDeleted 
                ? [...compiledChunks, ...parsedLocal] 
                : [...defaultBookData.chunks, ...compiledChunks, ...parsedLocal];
            
            let matchingChunks: any[] = [];
            for (const kw of keywords.slice(0, 5)) {
                const kwLower = kw.toLowerCase();
                const matched = chunks.filter(c => c.content?.toLowerCase().includes(kwLower)).slice(0, 3);
                matchingChunks = [...matchingChunks, ...matched];
            }
            
            if (matchingChunks.length === 0) return '';
            
            const uniqueChunks = Array.from(new Map(matchingChunks.map(item => [item.content, item])).values());
            return uniqueChunks
                .map((chunk: any) => {
                    const bookTitle = chunk.book_title || 'Livre de Référence';
                    return `[Source: ${bookTitle}, Page: ${chunk.page_number}]\n${chunk.content}`;
                })
                .join('\n\n---\n\n');
        }

        // Construct query filter and perform search in local compiled chunks too
        let allChunks: any[] = [];
        
        // 1. Search in local compiled chunks first
        let localMatchingChunks: any[] = [];
        for (const kw of keywords.slice(0, 5)) {
            const kwLower = kw.toLowerCase();
            const matched = compiledChunks.filter(c => c.content?.toLowerCase().includes(kwLower)).slice(0, 3);
            localMatchingChunks = [...localMatchingChunks, ...matched];
        }
        
        if (localMatchingChunks.length > 0) {
            const formattedLocal = localMatchingChunks.map(chunk => ({
                content: chunk.content,
                page_number: chunk.page_number,
                orthodontic_documents: {
                    title: chunk.book_title || 'Livre de Référence'
                }
            }));
            allChunks = [...allChunks, ...formattedLocal];
        }

        // 2. Search in default book chunks (if not deleted)
        if (!isCgsDeleted) {
            let defaultMatchingChunks: any[] = [];
            const defaultChunks = defaultBookData.chunks || [];
            for (const kw of keywords.slice(0, 5)) {
                const kwLower = kw.toLowerCase();
                const matched = defaultChunks.filter(c => c.content?.toLowerCase().includes(kwLower)).slice(0, 3);
                defaultMatchingChunks = [...defaultMatchingChunks, ...matched];
            }
            if (defaultMatchingChunks.length > 0) {
                const formattedDefault = defaultMatchingChunks.map(chunk => ({
                    content: chunk.content,
                    page_number: chunk.page_number,
                    orthodontic_documents: {
                        title: chunk.book_title || 'Livre de Référence'
                    }
                }));
                allChunks = [...allChunks, ...formattedDefault];
            }
        }

        // 3. Search in Supabase (if available)
        for (const kw of keywords.slice(0, 5)) {
            try {
                const { data, error } = await supabase
                    .from('orthodontic_knowledge')
                    .select('content, page_number, orthodontic_documents(title)')
                    .ilike('content', `%${kw}%`)
                    .limit(3);
                    
                if (!error && data) {
                    allChunks = [...allChunks, ...data];
                }
            } catch (e) {
                console.warn('Supabase query failed during RAG search:', e);
            }
        }

        if (allChunks.length === 0) {
            return '';
        }
        
        // Remove duplicates and construct context string
        const uniqueChunks = Array.from(new Map(allChunks.map(item => [item.content, item])).values());
        
        return uniqueChunks
            .map((chunk: any) => {
                const bookTitle = chunk.orthodontic_documents?.title || 'Livre de Référence';
                return `[Source: ${bookTitle}, Page: ${chunk.page_number}]\n${chunk.content}`;
            })
            .join('\n\n---\n\n');
            
    } catch (err) {
        console.error('Error querying Supabase knowledge base, using local fallback:', err);
        try {
            const localKnowledge = localStorage.getItem('casper_mock_knowledge');
            const parsedLocal = localKnowledge ? JSON.parse(localKnowledge) : [];
            const chunks = isCgsDeleted 
                ? [...compiledChunks, ...parsedLocal] 
                : [...defaultBookData.chunks, ...compiledChunks, ...parsedLocal];
            
            let matchingChunks: any[] = [];
            for (const kw of keywords.slice(0, 5)) {
                const kwLower = kw.toLowerCase();
                const matched = chunks.filter(c => c.content?.toLowerCase().includes(kwLower)).slice(0, 3);
                matchingChunks = [...matchingChunks, ...matched];
            }
            
            if (matchingChunks.length === 0) return '';
            
            const uniqueChunks = Array.from(new Map(matchingChunks.map(item => [item.content, item])).values());
            return uniqueChunks
                .map((chunk: any) => {
                    const bookTitle = chunk.book_title || 'Livre de Référence';
                    return `[Source: ${bookTitle}, Page: ${chunk.page_number}]\n${chunk.content}`;
                })
                .join('\n\n---\n\n');
        } catch (fallbackErr) {
            console.error('Local fallback search failed:', fallbackErr);
            return '';
        }
    }
};

// Run the full orthodontics RAG Casper analysis
export const analyzeDentition = async (
    imageFiles: File[], 
    onStatusUpdate?: (status: string) => void
): Promise<AnalysisResult> => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error('Clé API Gemini manquante. Veuillez la configurer dans l\'onglet Configuration.');
    }

    if (imageFiles.length === 0) {
        throw new Error('Veuillez fournir au moins une photo de dentition.');
    }

    // Step 1: Prepare images
    if (onStatusUpdate) onStatusUpdate('Préparation des clichés optiques...');
    const imageParts = await Promise.all(imageFiles.map(file => fileToGenerativePart(file)));

    // Step 2: Extract medical keywords from photos to search the knowledge base
    if (onStatusUpdate) onStatusUpdate('Analyse préliminaire des clichés & extraction des mots-clés cliniques...');
    
    let keywords: string[] = ['orthodontie', 'malocclusion', 'encombrement'];
    try {
        const keywordPrompt = `Analyse brièvement ces photos de dentition et retourne UNIQUEMENT une liste de 5 termes techniques d'orthodontie en français qui correspondent à ce que tu vois (ex: "encombrement", "supraclusion", "classe II", "rotation", "articulé croisé"). Sépare-les par des virgules sans autre texte.`;
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: keywordPrompt },
                                ...imageParts
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: 0.1
                    }
                })
            }
        );
        
        if (response.ok) {
            const data = await response.json();
            const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResponse) {
                const extracted = textResponse
                    .split(',')
                    .map((s: string) => s.trim().toLowerCase())
                    .filter((s: string) => s.length > 2);
                if (extracted.length > 0) {
                    keywords = extracted;
                    console.log('Extracted keywords for RAG:', keywords);
                }
            }
        }
    } catch (e) {
        console.warn('Failed to do first-pass keywords extraction, using defaults:', e);
    }

    // Step 3: Query Supabase for orthodontic citations (RAG)
    if (onStatusUpdate) onStatusUpdate('Recherche de corrélations scientifiques dans la base de connaissances...');
    const searchContext = await searchKnowledgeBase(keywords);
    if (searchContext) {
        console.log('Retrieved clinical context from uploaded books!');
    } else {
        console.log('No clinical context found in database (Knowledge base empty).');
    }

    // Step 4: Run the final analysis with vision + RAG context
    if (onStatusUpdate) onStatusUpdate('Consultation de Casper l\'expert mondial (Génération du rapport)...');
    
    const finalPrompt = `Tu es "Casper", un chirurgien-dentiste et orthodontiste expert mondial d'une intelligence extrême.
Tu as sous les yeux les clichés dentaires d'un patient et des extraits de livres de référence ci-dessous.

${searchContext ? `### LECTURES DE RÉFÉRENCE ISSUES DE TA BASE DE CONNAISSANCES :
${searchContext}
` : 'Note : Aucune base de connaissances externe n\'est disponible. Fie-toi à tes connaissances internes approfondies.'}

Fais une analyse clinique extrêmement pointue, exhaustive et rigoureuse des photos dentaires fournies.
Rédige ton diagnostic en français sous la forme de deux catégories strictement séparées. Ta réponse doit impérativement respecter le format balisé XML ci-dessous pour que l'interface puisse les séparer :

Dans la section diagnostic, commence impérativement par mettre en valeur et de manière très visible la Classe d'Angle (Classe I, Classe II division 1, Classe II division 2, Classe III, etc.) car c'est le point clinique le plus important attendu par le praticien.

<diagnostic>
(Écris ici ton diagnostic clinique détaillé. Commence impérativement par :
1. CLASSIFICATION D'ANGLE : Détermine précisément la Classe d'Angle (Classe I, Classe II, ou Classe III) et justifie-la.
Ensuite, décris en détail :
- Les autres anomalies d'occlusion (surplomb, recouvrement, articulé croisé, etc.)
- Les alignements et arcades (encombrements, rotations, diastèmes)
- L'évaluation esthétique et fonctionnelle
- Références aux extraits de livres s'ils s'appliquent)
</diagnostic>

<traitement>
(Écris ici tes recommandations thérapeutiques précises et exhaustives. Inclus :
- Les types d'appareillage conseillés (aligneurs invisibles, bagues multi-attaches, expansion palatine, etc.)
- La séquence de traitement suggérée et les étapes clés
- Les difficultés ou risques cliniques à surveiller
- La durée estimée du traitement)
</traitement>

Sois technique, précis, exhaustif, et adopte le ton d'un éminent chirurgien-dentiste s'adressant à un confrère. Ne mets aucun texte d'introduction ni de conclusion en dehors des balises.`;

    const apiBody = {
        contents: [
            {
                parts: [
                    { text: finalPrompt },
                    ...imageParts
                ]
            }
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
        }
    };

    const resultResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiBody)
        }
    );

    if (!resultResponse.ok) {
        const errorData = await resultResponse.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Erreur API Gemini: ${resultResponse.status}`);
    }

    const resultData = await resultResponse.json();
    const resultText = resultData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Parse the XML tags (case-insensitive)
    const diagMatch = resultText.match(/<diagnostic>([\s\S]*?)<\/diagnostic>/i);
    const traitMatch = resultText.match(/<traitement>([\s\S]*?)<\/traitement>/i);
    
    let diagnostic = diagMatch ? diagMatch[1].trim() : '';
    let traitement = traitMatch ? traitMatch[1].trim() : '';
    
    // Robust parsing fallback for unclosed tags or missing closing tags
    if (!diagnostic || !traitement) {
        // If we have <diagnostic> but no </diagnostic>
        if (!diagnostic && resultText.match(/<diagnostic>/i)) {
            const diagStartIndex = resultText.search(/<diagnostic>/i);
            const diagStart = diagStartIndex + resultText.match(/<diagnostic>/i)![0].length;
            const traitStartIndex = resultText.search(/<traitement>/i);
            const diagEnd = traitStartIndex !== -1 ? traitStartIndex : resultText.length;
            
            diagnostic = resultText.substring(diagStart, diagEnd)
                .replace(/<\/diagnostic>/gi, '')
                .trim();
        }
        
        // If we have <traitement> but no </traitement>
        if (!traitement && resultText.match(/<traitement>/i)) {
            const traitStartIndex = resultText.search(/<traitement>/i);
            const traitStart = traitStartIndex + resultText.match(/<traitement>/i)![0].length;
            
            traitement = resultText.substring(traitStart)
                .replace(/<\/traitement>/gi, '')
                .trim();
        }
    }
    
    // Absolute fallback if still empty
    if (!diagnostic && !traitement) {
        // Try split by headings
        const splitText = resultText.split(/traitement/i);
        if (splitText.length >= 2) {
            diagnostic = splitText[0].replace(/diagnostic/i, '').replace(/<[^>]*>/g, '').trim();
            traitement = splitText[1].replace(/<[^>]*>/g, '').trim();
        } else {
            diagnostic = resultText;
            traitement = "Aucun plan de traitement distinct n'a été généré. Veuillez réanalyser.";
        }
    } else {
        // Ensure neither is blank
        if (!diagnostic) {
            diagnostic = "Analyse diagnostique incomplète ou non générée.";
        }
        if (!traitement) {
            traitement = "Plan de traitement non généré ou interrompu. Veuillez réanalyser.";
        }
    }

    return { diagnostic, traitement };
};

// Ask a clinical question to OrthoMind (RAG from PDFs)
export const askOrthoMind = async (
    messageHistory: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error('Clé API Gemini manquante. Veuillez la configurer dans l\'onglet Configuration.');
    }

    const userMessage = messageHistory[messageHistory.length - 1]?.content || '';
    
    // Extract keywords from user message for semantic search
    const keywords = userMessage
        .toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 5);

    // Search the Supabase or local knowledge base for these terms
    const searchContext = await searchKnowledgeBase(keywords.length > 0 ? keywords : ['orthodontie']);

    // Format chat history for Gemini API
    const formattedHistory = messageHistory.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
    }));

    const systemInstruction = `Tu es "OrthoMind", l'assistant d'intelligence artificielle clinique expert du cabinet d'orthodontie du Dr. Desouches (YouSmile).
Tu disposes d'un niveau d'expertise médicale orthodontique extrême. Ton rôle est de conseiller le praticien en répondant de façon précise, technique, rigoureuse et scientifique à ses questions cliniques ou sur la base de connaissances.
Adopte un ton éminent, professionnel, et confraternel (de chirurgien-dentiste à chirurgien-dentiste).

${searchContext ? `### CONTEXTE SCIENTIFIQUE D'ORTHODONTIE (extrait de la base de connaissances du cabinet) :
${searchContext}

Utilise en priorité ce contexte sémantique pour étayer tes réponses. Cite les sources (titre du livre et page) si approprié.` : 'Note : Aucune base de connaissances externe n\'est disponible. Fie-toi à tes connaissances internes approfondies pour guider le praticien.'}

Réponds de façon structurée en français, en utilisant du formatage Markdown propre. Sois concis mais cliniquement exhaustif.`;

    const apiBody = {
        contents: formattedHistory,
        systemInstruction: {
            parts: [
                { text: systemInstruction }
            ]
        },
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048
        }
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiBody)
        }
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Erreur API Gemini: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
};

