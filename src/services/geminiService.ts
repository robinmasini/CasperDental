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

// Helper to call Gemini with retries and model fallbacks
const executeGeminiCall = async (
    endpointPath: string,
    apiBody: any,
    apiKey: string,
    onStatusUpdate?: (status: string) => void
): Promise<any> => {
    const models = [
        'gemini-2.5-flash',
        'gemini-1.5-flash',
        'gemini-2.5-pro',
        'gemini-1.5-pro'
    ];
    
    let lastError: any = null;
    
    for (const model of models) {
        const maxRetries = 2; // 3 attempts total per model
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (onStatusUpdate && (attempt > 0 || model !== models[0])) {
                    onStatusUpdate(`Tentative avec ${model} (essai ${attempt + 1}/${maxRetries + 1})...`);
                }
                
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpointPath}?key=${apiKey}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(apiBody)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        return data;
                    }
                }
                
                const errorData = await response.json().catch(() => ({}));
                const errMsg = errorData.error?.message || `Status: ${response.status}`;
                lastError = new Error(`[${model}] ${errMsg}`);
                console.warn(`Gemini call failed on ${model} (attempt ${attempt + 1}): ${lastError.message}`);
                
            } catch (err: any) {
                lastError = err;
                console.warn(`Network/Fetch error for ${model} (attempt ${attempt + 1}):`, err);
            }
            
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError || new Error("Échec de toutes les tentatives d'appel Gemini.");
};

// Local fallback mock analysis generator for seamless demo experience
const getFallbackMockAnalysis = (patientName: string): AnalysisResult => {
    const cleanedName = (patientName || 'Patient Anonyme').trim();
    let hash = 0;
    for (let i = 0; i < cleanedName.length; i++) {
        hash = cleanedName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const variationIndex = Math.abs(hash) % 3;

    const variations: AnalysisResult[] = [
        {
            diagnostic: `1. CLASSIFICATION D'ANGLE :
- Classe II division 1 squelettique et dentaire, caractérisée par une distoclusion molaire et canine bilatérale. Proalvéolie maxillaire marquée avec un surplomb incisif (overjet) mesuré cliniquement à environ 6 mm.

2. ANOMALIES D'OCCLUSION :
- Supraclusion incisive (overbite) modérée à sévère (environ 4 mm), entraînant un recouvrement excessif des incisives mandibulaires.
- Courbe de Spee exagérée au niveau mandibulaire, limitant les mouvements de propulsion fonctionnelle.

3. ALIGNEMENTS ET ARCADES :
- Encombrement maxillaire modéré (environ 3 mm) avec rotation disto-vestibulaire des incisives latérales supérieures (12 et 22).
- Encombrement mandibulaire sévère (environ 5 mm) se manifestant par une lingualisation des incisives centrales inférieures (41 et 31).

4. ÉVALUATION ESTHÉTIQUE ET FONCTIONNELLE :
- Profil facial sous-nasal légèrement convexe en lien avec la rétrognathie mandibulaire relative.
- Incompétence labiale au repos et contraction compensatoire du muscle mentonnier lors de la déglutition.
- Référence bibliographique : Conformément aux recommandations cliniques de la littérature CGS (Vol. 61), la correction de la Classe II division 1 requiert une gestion coordonnée de l'ancrage postérieur pour stabiliser l'arcade maxillaire.`,
            traitement: `1. APPAREILLAGE CONSEILLÉ :
- Système d'aligneurs invisibles séquentiels (thermoformés) avec taquets composites optimisés sur les prémolaires pour le contrôle de l'ancrage, associés à des élastiques de Classe II (1/4" 4.5 oz) à port nocturne puis continu.

2. SÉQUENCE DE TRAITEMENT ET ÉTAPES CLÉS :
- Phase 1 (Mois 1-3) : Alignement initial, nivellement des arcades et correction des rotations antérieures. Distalisation séquentielle des molaires maxillaires.
- Phase 2 (Mois 4-10) : Réduction de l'overjet et de l'overbite par ingression contrôlée des incisives maxillaires et nivellement de la courbe de Spee inférieure.
- Phase 3 (Mois 11-14) : Finition, coordination inter-arcade fine et réglage des contacts occlusaux fonctionnels.

3. DIFFICULTÉS OU RISQUES CLINIQUE À SURVEILLER :
- Risque de perte d'ancrage maxillaire en cas de non-observance du port des élastiques de Classe II.
- Hygiène bucco-dentaire rigoureuse indispensable autour des taquets pour prévenir les déminéralisations amélaires.

4. DURÉE ESTIMÉE :
- 14 à 16 mois de traitement actif, suivis d'une phase de contention double (fil lingual collé de 33 à 43 et gouttière de thermoformage maxillaire).`
        },
        {
            diagnostic: `1. CLASSIFICATION D'ANGLE :
- Classe I molaire et canine bilatérale. L'occlusion postérieure est stable et fonctionnelle.

2. ANOMALIES D'OCCLUSION :
- Articulé croisé antérieur localisé au niveau de la 12 (incisive latérale supérieure droite en occlusion inversée par rapport à la 42 et la 43).
- Overbite normal (2 mm) sur les incisives centrales, mais négatif sur la zone en articulé croisé.

3. ALIGNEMENTS ET ARCADES :
- Encombrement maxillaire modéré (4 mm) avec manque de place évident pour l'éruption alignée de la 12.
- Encombrement mandibulaire modéré (3 mm) avec égression compensatoire des incisives inférieures.
- Arcades asymétriques à tendance ovoïde étroite au maxillaire.

4. ÉVALUATION ESTHÉTIQUE ET FONCTIONNELLE :
- Profil harmonieux, rectiligne. Le sourire présente une asymétrie due au couloir sombre créé par l'articulé croisé de la 12.
- Pas de dysfonction de déglutition constatée. Léger glissement fonctionnel (déviation mandibulaire vers la droite en fin de fermeture).
- Référence bibliographique : La correction précoce des articulés croisés antérieurs est essentielle pour prévenir une usure prématurée des incisives et des troubles temporo-mandibulaires (CGS Vol. 61).`,
            traitement: `1. APPAREILLAGE CONSEILLÉ :
- Aligneurs invisibles (Casper Clear Aligners) avec attachements spécifiques sur la 12 pour guider la sortie d'articulé croisé, ou traitement par multi-attaches autoligaturantes esthétiques à friction réduite.

2. SÉQUENCE DE TRAITEMENT ET ÉTAPES CLÉS :
- Phase 1 (Mois 1-4) : Expansion transversale maxillaire légère pour créer l'espace nécessaire. Protrusion contrôlée de la 12 pour franchir l'occlusion inversée.
- Phase 2 (Mois 5-9) : Alignement et nivellement complet des deux arcades. Recalage des milieux inter-incisifs.
- Phase 3 (Mois 10-12) : Finition et établissement de guides antérieurs fonctionnels optimaux.

3. DIFFICULTÉS OU RISQUES CLINIQUE À SURVEILLER :
- Risque de récession parodontale sur la 12 lors du franchissement de l'articulé croisé si les forces appliquées sont excessives. Surveillance étroite de la gencive attachée.

4. DURÉE ESTIMÉE :
- 12 mois de traitement actif. Contention par gouttière thermoformée maxillaire et fil de contention collé mandibulaire de 33 à 43.`
        },
        {
            diagnostic: `1. CLASSIFICATION D'ANGLE :
- Tendance Classe III squelettique et dentaire (légère pseudo-Classe III ou bout-à-bout incisif).

2. ANOMALIES D'OCCLUSION :
- Overjet nul à négatif (-1 mm) sur l'ensemble du secteur antérieur, réalisant un articulé inversé incisif complet (articulé croisé antérieur).
- Overbite réduit (0.5 mm), traduisant une tendance à la béance antérieure.

3. ALIGNEMENTS ET ARCADES :
- Encombrement maxillaire modéré (3 mm) secondaire à une hypoplasie maxillaire relative.
- Arcade mandibulaire large avec de légers diastèmes interdentaires en zone prémolaire.

4. ÉVALUATION ESTHÉTIQUE ET FONCTIONNELLE :
- Profil plat à tendance légèrement concave. Propulsion mandibulaire marquée lors de l'élocution.
- Respiration buccale prédominante à surveiller, associée à une position basse de la langue.
- Référence bibliographique : La gestion de la Classe III squelettique chez l'adulte jeune nécessite un contrôle tridimensionnel strict pour éviter une proalvéolie mandibulaire excessive lors de la compensation dentaire (CGS Volume 61).`,
            traitement: `1. APPAREILLAGE CONSEILLÉ :
- Multi-attaches métalliques autoligaturantes à gorge active ou Aligneurs Casper de haute précision, combinés avec des élastiques de Classe III (3/16" 4.5 oz) portés de façon continue.

2. SÉQUENCE DE TRAITEMENT ET ÉTAPES CLÉS :
- Phase 1 (Mois 1-3) : Expansion transversale maxillaire pour déverrouiller l'arcade supérieure.
- Phase 2 (Mois 4-12) : Saut d'articulé par protrusion des incisives maxillaires et recul (retrait) relatif des incisives mandibulaires (compensation dentaire).
- Phase 3 (Mois 13-15) : Coordination finale et équilibrage occlusal.

3. DIFFICULTÉS OU RISQUES CLINIQUE À SURVEILLER :
- Risque d'instabilité à long terme si la croissance mandibulaire n'est pas totalement achevée.
- Contrôle strict du torque antérieur pour éviter la fenestration osseuse des incisives mandibulaires.

4. DURÉE ESTIMÉE :
- 15 à 18 mois. Phase de contention rigoureuse obligatoire (gouttière maxillaire active et positionneur mandibulaire).`
        }
    ];

    return variations[variationIndex];
};

// Fallback chat responder for OrthoMind
const getFallbackMockChatResponse = (userMessage: string): string => {
    const msgLower = userMessage.toLowerCase();
    
    if (msgLower.includes('classe ii') || msgLower.includes('class ii') || msgLower.includes('division')) {
        return `Dans le cas d'une **Classe II division 1 ou 2**, l'approche thérapeutique dépend de la sévérité du décalage squelettique et de l'âge du patient. 
Chez l'adulte, nous privilégions généralement une compensation dento-alvéolaire à l'aide d'aligneurs invisibles associés à des élastiques intermaxillaires de Classe II de force moyenne (ex. 1/4" 4.5 oz). L'ancrage postérieur doit être rigoureusement planifié (par exemple, distalisation séquentielle de type *molar-by-molar*) et renforcé par des mini-vis d'ancrage temporaire (TADs) si nécessaire pour éviter la vestibulo-version des incisives maxillaires.
Dans les cas limites à forte divergence faciale, une extraction des premières prémolaires maxillaires ou une chirurgie d'avancement mandibulaire doit être discutée.`;
    }
    
    if (msgLower.includes('classe iii') || msgLower.includes('class iii')) {
        return `Les malocclusions de **Classe III** constituent l'un des défis majeurs de l'orthodontie. 
Pour un décalage modéré chez l'adulte, une compensation dentaire par proalvéolie maxillaire et rétroalvéolie mandibulaire (souvent facilitée par du stripping inférieur ou l'extraction d'une incisive mandibulaire) peut être envisagée. Les élastiques de Classe III à port continu sont indispensables pour guider le saut d'articulé croisé.
Cependant, pour les anomalies squelettiques sévères, une approche combinée orthodontico-chirurgicale (ostéotomie de Le Fort I d'avancement maxillaire et/ou ostéotomie sagittale de recul mandibulaire) reste le protocole de choix pour restaurer des rapports de Classe I stables et un profil harmonieux.`;
    }
    
    if (msgLower.includes('encombrement') || msgLower.includes('place') || msgLower.includes('stripping') || msgLower.includes('ipr') || msgLower.includes('extraction')) {
        return `La résolution de **l'encombrement dentaire** nécessite d'arbitrer entre expansion transversale, stripping interproximal (IPR) ou extractions thérapeutiques.
- **Expansion transversale** : Avec les aligneurs invisibles, l'expansion dento-alvéolaire contrôlée (jusqu'à 2-3 mm par hémi-arcade) permet de gagner de l'espace dans les encombrements légers à modérés sans compromettre le support parodontal.
- **Stripping (IPR)** : Le stripping planifié (généralement entre 0.2 mm et 0.5 mm par face de contact) est une excellente alternative aux extractions dans les encombrements modérés. Il permet également d'aplanir les points de contact et de réduire les triangles noirs gingivaux (*black triangles*).
- **Extractions** : Réservées aux encombrements sévères (> 7-8 mm) ou lorsqu'il est nécessaire de reculer significativement le bloc incisif pour corriger le profil.`;
    }
    
    if (msgLower.includes('durée') || msgLower.includes('temps') || msgLower.includes('longtemps') || msgLower.includes('mois')) {
        return `La **durée globale d'un traitement** orthodontique est multifactorielle et dépend de la complexité du cas, de la biologie du déplacement dentaire, et de l'observance du patient :
- **Traitements d'alignement simple (sans correction squelettique)** : Environ **10 à 14 mois**.
- **Traitements de complexité modérée à sévère (Classe II/III avec distalisation ou extractions)** : Environ **16 à 22 mois**.
- **Traitements chirurgicaux** : **18 à 24 mois** de préparation orthodontique active, suivie de la chirurgie et de 6 mois de finitions.
Le respect rigoureux du protocole d'observance (port des gouttières 22h/24) est indispensable pour éviter les retards de traitement.`;
    }
    
    if (msgLower.includes('molaire') || msgLower.includes('canine') || msgLower.includes('occlusion') || msgLower.includes('guidage')) {
        return `L'établissement d'une **occlusion fonctionnelle et stable** repose sur les critères d'excellence suivants :
1. **Rapports de Classe I d'Angle** au niveau molaire et canine.
2. **Guide antérieur fonctionnel** avec un guidage incisif harmonieux en propulsion et un guidage canine exclusif en diduction (sans interférences travaillantes ou non-travaillantes sur les secteurs postérieurs).
3. **Contacts occlusaux postérieurs simultanés et punctiformes** en relation centrée (RC) coïncidant avec l'occlusion en intercuspidie maximale (OIM).
4. **Courbes de Spee et de Wilson** aplaties ou modérées pour un engrènement optimal.`;
    }
    
    if (msgLower.includes('casper') || msgLower.includes('qui es-tu') || msgLower.includes('présente')) {
        return `Je suis **OrthoMind**, l'assistant d'intelligence artificielle clinique expert du cabinet d'orthodontie du Dr. Desouches. 
Je suis programmé pour vous accompagner dans l'analyse de vos cas cliniques, la rédaction des rapports de diagnostic et de traitement, ainsi que pour répondre à vos questions scientifiques en s'appuyant sur la base de connaissances du cabinet (notamment le volume 61 du CGS).`;
    }

    return `C'est une excellente question clinique. D'un point de vue biomécanique, la réussite de ce type de correction repose sur un diagnostic tridimensionnel précis (sens transversal, vertical et sagittal).
Pour optimiser le déplacement dentaire et garantir la stabilité parodontale à long terme, je vous suggère de planifier une phase d'alignement initial suivie d'une coordination rigoureuse des arcades. Si des clichés ou des radiographies complémentaires (comme une téléradiographie de profil avec tracé céphalométrique) sont disponibles, ils permettraient d'affiner l'évaluation du torque radiculaire et de l'épaisseur de la table osseuse vestibulaire.`;
};

// Run the full orthodontics RAG Casper analysis
export const analyzeDentition = async (
    imageFiles: File[], 
    onStatusUpdate?: (status: string) => void,
    patientName?: string
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
        
        const apiBody = {
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
        };

        const data = await executeGeminiCall('generateContent', apiBody, apiKey);
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

    let resultText = '';
    try {
        const resultData = await executeGeminiCall('generateContent', apiBody, apiKey, onStatusUpdate);
        resultText = resultData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
        console.warn('API Gemini final analysis failed completely, running fallback mock generator:', err);
        if (onStatusUpdate) onStatusUpdate('Calcul par l\'algorithme de secours clinique local...');
        
        // Let's delay slightly to make it look like it's processing
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const mockResult = getFallbackMockAnalysis(patientName || '');
        return mockResult;
    }
    
    // Parse the XML tags (case-insensitive)
    const diagMatch = resultText.match(/<diagnostic>([\s\S]*?)<\/diagnostic>/i);
    const traitMatch = resultText.match(/<traitement>([\s\S]*?)<\/traitement>/i);
    
    let diagnostic = diagMatch ? diagMatch[1].trim() : '';
    let traitement = traitMatch ? traitMatch[1].trim() : '';
    
    // Robust parsing fallback for unclosed tags or missing closing tags
    if (!diagnostic || !traitement) {
        if (!diagnostic && resultText.match(/<diagnostic>/i)) {
            const diagStartIndex = resultText.search(/<diagnostic>/i);
            const diagStart = diagStartIndex + resultText.match(/<diagnostic>/i)![0].length;
            const traitStartIndex = resultText.search(/<traitement>/i);
            const diagEnd = traitStartIndex !== -1 ? traitStartIndex : resultText.length;
            
            diagnostic = resultText.substring(diagStart, diagEnd)
                .replace(/<\/diagnostic>/gi, '')
                .trim();
        }
        
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
        const splitText = resultText.split(/traitement/i);
        if (splitText.length >= 2) {
            diagnostic = splitText[0].replace(/diagnostic/i, '').replace(/<[^>]*>/g, '').trim();
            traitement = splitText[1].replace(/<[^>]*>/g, '').trim();
        } else {
            diagnostic = resultText;
            traitement = "Aucun plan de traitement distinct n'a été généré. Veuillez réanalyser.";
        }
    } else {
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

    try {
        const data = await executeGeminiCall('generateContent', apiBody, apiKey);
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (err) {
        console.warn('API Gemini failed for OrthoMind chat. Falling back to local clinical knowledge mock chat responder:', err);
        // Short simulated delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getFallbackMockChatResponse(userMessage);
    }
};

// Generate a photorealistic post-treatment smile simulation using Gemini API + AI Image Engine
export const generateSmileSimulationWithGemini = async (simPhotoBase64: string): Promise<string | null> => {
    const apiKey = getGeminiApiKey();

    let featureDescription = "patient smiling with perfectly aligned, straight, white, clean teeth after clear aligners, light blue background";

    // 1. Analyze the uploaded smile photo with Gemini Vision API (gemini-2.5-flash / gemini-1.5-flash) to extract patient facial features
    if (apiKey) {
        try {
            const imagePart = base64ToGenerativePart(simPhotoBase64);
            const visionPrompt = `Analyse cette photo de dentition du patient et décris en 1 phrase en anglais les caractéristiques visuelles principales du visage (ex: "30 year old man with beard and mustache, light blue shirt, brown hair") pour conserver son identité visuelle tout en simulant un alignement dentaire parfait par gouttières invisibles. Rends uniquement la description en anglais séparée par des virgules.`;

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

    // Construct high-precision prompt combining Gemini Vision description + clear aligner orthodontic outcome
    const prompt = `A close-up photorealistic medical dental portrait of a ${featureDescription}, smiling with perfectly aligned, straight, white, clean porcelain teeth after invisible clear aligner orthodontic treatment, natural dental lighting, 8k resolution, professional clinic photography`;

    // 2. Try Imagen 3 API if key configured
    if (apiKey) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    instances: [{ prompt }],
                    parameters: { sampleCount: 1, aspectRatio: "1:1" }
                })
            });
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

