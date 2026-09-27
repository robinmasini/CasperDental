import { supabase } from '../lib/supabase';
import defaultBookData from '../assets/cgs_volume_61.json';

// ============================================================================
// Moteur de recherche documentaire OrthoMind (RAG)
// ----------------------------------------------------------------------------
// La bibliothèque (54 ouvrages, ~7 100 fragments) est à ~97 % en anglais alors
// que les praticiens raisonnent en français. La recherche combine donc :
//   1. une expansion bilingue des requêtes (glossaire FR → EN + requêtes IA),
//   2. un classement BM25 sur l'ensemble du corpus (et non un simple "includes"),
//   3. des pénalités sur les fragments peu cliniques (bibliographies, index,
//      pages de garde, ouvrages hors-sujet) et une diversité par ouvrage.
// Chaque passage retourné porte un identifiant [S1], [S2]… que le modèle doit
// citer ; la liste des références est reconstruite à partir des vrais passages.
// ============================================================================

export interface KnowledgeChunk {
    content: string;
    page_number: number | null;
    book_title: string;
}

export interface RetrievedPassage extends KnowledgeChunk {
    id: string; // "S1", "S2"…
    score: number;
}

// ---------------------------------------------------------------------------
// Glossaire orthodontique FR → EN (sert à l'expansion des requêtes, y compris
// hors-ligne sans clé Gemini)
// ---------------------------------------------------------------------------
const FR_EN_GLOSSARY: [RegExp, string][] = [
    [/classe\s*(ii|2)\s*(div(ision)?\.?\s*)?1/, 'class II division 1'],
    [/classe\s*(ii|2)\s*(div(ision)?\.?\s*)?2/, 'class II division 2'],
    [/classe\s*(iii|3)\b/, 'class III malocclusion'],
    [/classe\s*(ii|2)\b/, 'class II malocclusion'],
    [/classe\s*(i|1)\b/, 'class I occlusion'],
    [/encombrement|chevauchement|dysharmonie dento-maxillaire|\bddm\b/, 'crowding arch length discrepancy'],
    [/surplomb/, 'overjet'],
    [/recouvrement|supraclusion|supracclusion/, 'deep overbite'],
    [/b[ée]ance|infraclusion/, 'open bite'],
    [/articul[ée] (crois[ée]|invers[ée])|occlusion invers[ée]e/, 'crossbite'],
    [/endognathie|arcade [ée]troite|d[ée]ficit transvers/, 'maxillary transverse deficiency constriction'],
    [/disjonct|expansion palatine|disjoncteur/, 'rapid maxillary expansion'],
    [/quad.?helix/, 'quad helix expansion'],
    [/canine.{0,15}(inclus|incluse|retenue|ectopique)|inclusion/, 'impacted canine'],
    [/ag[ée]n[ée]sie/, 'missing teeth agenesis'],
    [/lat[ée]rale.{0,20}(absente|manquante)|ag[ée]n[ée]sie.{0,20}lat[ée]rale/, 'missing maxillary lateral incisors'],
    [/diast[èe]me/, 'diastema space closure'],
    [/r[ée]trognathie|r[ée]tromandibulie/, 'mandibular retrognathism'],
    [/promandibulie|prognathie/, 'mandibular prognathism'],
    [/pro.?alv[ée]olie|vestibulo.?version/, 'incisor proclination'],
    [/r[ée]tro.?alv[ée]olie|linguo.?version/, 'incisor retroclination'],
    [/d[ée]viation mandibulaire|asym[ée]trie/, 'mandibular asymmetry functional shift'],
    [/respiration buccale|ventilation (buccale|orale)/, 'mouth breathing airway'],
    [/d[ée]glutition|pulsion linguale|interposition linguale/, 'tongue thrust atypical swallowing'],
    [/aligneur|goutti[èe]re|invisalign/, 'clear aligner'],
    [/taquet|attachement/, 'aligner attachments'],
    [/stripping|\bipr\b|r[ée]duction (inter)?proximale/, 'interproximal reduction'],
    [/[ée]lastique/, 'intermaxillary elastics'],
    [/mini.?vis|ancrage osseux|\btad/, 'temporary anchorage device miniscrew'],
    [/ancrage/, 'anchorage control'],
    [/distalisation/, 'molar distalization'],
    [/extraction/, 'extraction treatment premolar'],
    [/contention|r[ée]cidive/, 'retention relapse retainer'],
    [/parodont|gencive|gingiv|r[ée]cession/, 'periodontal gingival recession orthodontics'],
    [/r[ée]sorption radiculaire/, 'root resorption'],
    [/\batm\b|articulation temporo|dysfonction/, 'temporomandibular disorder TMD'],
    [/chirurgi|ost[ée]otomie|le fort/, 'orthognathic surgery'],
    [/torque/, 'torque control'],
    [/ingression|intrusion/, 'incisor intrusion'],
    [/[ée]gression|extrusion/, 'extrusion'],
    [/courbe de spee/, 'curve of Spee leveling'],
    [/ligne m[ée]diane|milieu inter.?incisif/, 'dental midline deviation'],
    [/sourire|esth[ée]tique/, 'smile esthetics tooth display'],
    [/croissance|pubert|interception|pr[ée]coce/, 'growth modification early interceptive treatment'],
    [/orth(o|op)[ée]die fonctionnelle|activateur|twin.?block|herbst/, 'functional appliance'],
    [/c[ée]phalom[ée]tri|t[ée]l[ée]radio/, 'cephalometric analysis'],
    [/divergen|hyperdivergen|hypodivergen|dimension verticale/, 'vertical dimension facial divergence'],
    [/adulte/, 'adult orthodontics'],
    [/enfant|p[ée]diatrique|denture mixte/, 'mixed dentition children'],
];

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------
const STOPWORDS = new Set((
    // EN
    'the a an and or of to in on for with by from at as is are was were be been being this that these those it its ' +
    'which who whom whose what when where how than then there their they them into also can may might should would could ' +
    'such not no but if so do does did has have had more most other some any each both between after before during over ' +
    'under up down out about all one two three fig figure table et al use used using well however thus therefore ' +
    // FR
    'le la les un une des du de d l et ou en au aux ce ces cet cette il elle ils elles est sont été être avec pour par ' +
    'sur dans pas plus que qui quoi dont où ne se sa son ses leur leurs nous vous je tu on y a très tout tous toute ' +
    'comme mais donc car ni si lors entre chez sans sous'
).split(/\s+/));

const normalize = (text: string): string =>
    text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const stem = (token: string): string => {
    if (token.length > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
    if (token.length > 3 && (token.endsWith('s') || token.endsWith('x')) && !token.endsWith('ss')) return token.slice(0, -1);
    return token;
};

export const tokenize = (text: string): string[] =>
    normalize(text)
        .split(/[^a-z0-9]+/)
        .filter(t => t.length > 1 && !STOPWORDS.has(t) && !/^\d{1,3}$/.test(t))
        .map(stem);

// ---------------------------------------------------------------------------
// Qualité clinique des fragments
// ---------------------------------------------------------------------------
const EXCLUDED_SECTIONS = /^(index|copyright|dedication|front-matter|acknowledgments|contributors|preface)[_\s-]/i;
const LOW_CLINICAL_RELEVANCE: [RegExp, number][] = [
    [/skin aging atlas/i, 0.45],
    [/teaching|syllabus|continuing professional development|training programs|governance/i, 0.5],
    [/EBSCO-FullText/i, 0.8],
];

const bookWeight = (title: string): number => {
    for (const [re, w] of LOW_CLINICAL_RELEVANCE) if (re.test(title)) return w;
    return 1;
};

// Pénalise les pages de bibliographie ("Am J Orthod. 1976;69(4):371-387")
const contentWeight = (content: string): number => {
    const refs = (content.match(/\b(19|20)\d{2}\s*;\s*\d+/g) || []).length
        + (content.match(/\bet al\b/gi) || []).length;
    if (refs >= 4) return 0.15;
    if (refs >= 2) return 0.6;
    if (content.length < 200) return 0.6;
    return 1;
};

// Titres de fichiers → titres lisibles
// "Chapter-20---A-Bioefficient-Skeletal-Anc_2015_Esthetics-and-Biomechanics-in-" →
// "Esthetics and Biomechanics in Orthodontics (2015) — Ch. 20 : A Bioefficient Skeletal Anc…"
export const prettifyBookTitle = (raw: string): string => {
    if (!raw) return 'Ouvrage de référence';
    const chapter = raw.match(/^Chapter-(\d+)---(.+?)_(\d{4})_Esthetics/i);
    if (chapter) {
        const chapterTitle = chapter[2].replace(/-+/g, ' ').trim();
        return `Esthetics and Biomechanics in Orthodontics (${chapter[3]}) — Ch. ${chapter[1]} : ${chapterTitle}…`;
    }
    return raw.replace(/\s{2,}/g, ' ').trim();
};

// ---------------------------------------------------------------------------
// Index BM25
// ---------------------------------------------------------------------------
interface IndexedDoc {
    chunk: KnowledgeChunk;
    length: number;
    weight: number;
    tf: Map<string, number>;
}

interface Bm25Index {
    docs: IndexedDoc[];
    postings: Map<string, { doc: number; tf: number }[]>;
    avgLength: number;
}

const K1 = 1.2;
const B = 0.75;

const indexChunk = (chunk: KnowledgeChunk): IndexedDoc => {
    const tokens = tokenize(chunk.content);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return {
        chunk,
        length: tokens.length,
        weight: bookWeight(chunk.book_title) * contentWeight(chunk.content),
        tf,
    };
};

const buildIndex = (chunks: KnowledgeChunk[]): Bm25Index => {
    const docs: IndexedDoc[] = [];
    const postings = new Map<string, { doc: number; tf: number }[]>();
    let totalLength = 0;

    for (const chunk of chunks) {
        const doc = indexChunk(chunk);
        const docIdx = docs.length;
        docs.push(doc);
        totalLength += doc.length;
        doc.tf.forEach((tf, term) => {
            let list = postings.get(term);
            if (!list) postings.set(term, (list = []));
            list.push({ doc: docIdx, tf });
        });
    }

    return { docs, postings, avgLength: docs.length ? totalLength / docs.length : 1 };
};

const idf = (index: Bm25Index, term: string): number => {
    const n = index.docs.length;
    const df = index.postings.get(term)?.length || 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
};

const bm25Term = (tf: number, docLength: number, avgLength: number, termIdf: number): number =>
    termIdf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * docLength / avgLength));

// ---------------------------------------------------------------------------
// Chargement du corpus
// ---------------------------------------------------------------------------
let compiledKnowledgeCache: { books: any[]; chunks: any[] } | null = null;

export const loadLocalCompiledKnowledge = async (): Promise<{ books: any[]; chunks: any[] }> => {
    if (compiledKnowledgeCache) return compiledKnowledgeCache;
    try {
        const response = await fetch('/casper_knowledge.json');
        if (response.ok) {
            compiledKnowledgeCache = await response.json();
            return compiledKnowledgeCache!;
        }
    } catch (e) {
        console.warn('Failed to load compiled local knowledge from /casper_knowledge.json:', e);
    }
    compiledKnowledgeCache = { books: [], chunks: [] };
    return compiledKnowledgeCache;
};

const isCgsTitle = (title: string) => /61st volume CGS/i.test(title || '');

let staticIndexPromise: Promise<Bm25Index> | null = null;
let staticIndexKey = '';

const getStaticIndex = (): Promise<Bm25Index> => {
    const isCgsDeleted = localStorage.getItem('casper_cgs_deleted') === 'true';
    const key = `cgs:${isCgsDeleted}`;
    if (staticIndexPromise && staticIndexKey === key) return staticIndexPromise;

    staticIndexKey = key;
    staticIndexPromise = (async () => {
        const compiled = await loadLocalCompiledKnowledge();
        const seen = new Set<string>();
        const chunks: KnowledgeChunk[] = [];

        const push = (raw: any) => {
            const content = (raw?.content || '').trim();
            const title = raw?.book_title || 'Ouvrage de référence';
            if (!content || EXCLUDED_SECTIONS.test(title)) return;
            if (isCgsDeleted && isCgsTitle(title)) return;
            const dedupeKey = normalize(content.slice(0, 160));
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);
            chunks.push({ content, page_number: raw.page_number ?? null, book_title: title });
        };

        (compiled.chunks || []).forEach(push);
        if (!isCgsDeleted) (defaultBookData as any).chunks.forEach(push);

        const started = performance.now();
        const index = buildIndex(chunks);
        console.log(`[RAG] Index BM25 construit : ${chunks.length} fragments en ${Math.round(performance.now() - started)} ms`);
        return index;
    })();
    return staticIndexPromise;
};

// Fragments importés depuis l'interface (mode local) — lus à chaque requête
const getLocalUploadedChunks = (): KnowledgeChunk[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem('casper_mock_knowledge') || '[]');
        return (Array.isArray(parsed) ? parsed : [])
            .filter((c: any) => c?.content)
            .map((c: any) => ({ content: c.content, page_number: c.page_number ?? null, book_title: c.book_title || 'Ouvrage importé' }));
    } catch {
        return [];
    }
};

// Fragments stockés dans Supabase (ouvrages importés en mode connecté)
const fetchSupabaseCandidates = async (terms: string[]): Promise<KnowledgeChunk[]> => {
    if (localStorage.getItem('casper_mock_auth') === 'true' || terms.length === 0) return [];
    const results: KnowledgeChunk[] = [];
    await Promise.all(terms.slice(0, 6).map(async term => {
        try {
            const { data, error } = await supabase
                .from('orthodontic_knowledge')
                .select('content, page_number, orthodontic_documents(title)')
                .ilike('content', `%${term}%`)
                .limit(15);
            if (!error && data) {
                data.forEach((row: any) => results.push({
                    content: row.content,
                    page_number: row.page_number ?? null,
                    book_title: row.orthodontic_documents?.title || 'Ouvrage importé',
                }));
            }
        } catch (e) {
            console.warn('[RAG] Supabase indisponible pour la recherche :', e);
        }
    }));
    return results;
};

// ---------------------------------------------------------------------------
// Expansion des requêtes
// ---------------------------------------------------------------------------
export const expandQueriesWithGlossary = (texts: string[]): string[] => {
    const joined = normalize(texts.join(' '));
    const expansions: string[] = [];
    for (const [re, english] of FR_EN_GLOSSARY) {
        if (re.test(joined)) expansions.push(english);
    }
    return expansions;
};

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------
export interface SearchOptions {
    topK?: number;
    maxPerBook?: number;
}

export const searchKnowledge = async (queries: string[], options: SearchOptions = {}): Promise<RetrievedPassage[]> => {
    const { topK = 14, maxPerBook = 3 } = options;
    const cleanQueries = [...new Set([...queries, ...expandQueriesWithGlossary(queries)]
        .map(q => q.trim())
        .filter(q => tokenize(q).length > 0))];
    if (cleanQueries.length === 0) return [];

    const index = await getStaticIndex();

    // Termes les plus discriminants pour interroger Supabase
    const allTerms = [...new Set(cleanQueries.flatMap(tokenize))];
    const supabaseTerms = allTerms
        .filter(t => t.length > 4)
        .sort((a, b) => idf(index, b) - idf(index, a))
        .slice(0, 6);

    const externalChunks = [...getLocalUploadedChunks(), ...(await fetchSupabaseCandidates(supabaseTerms))];
    const externalDocs = externalChunks.map(indexChunk);

    // Score fusionné : somme des scores normalisés par requête.
    // Un passage pertinent pour plusieurs requêtes remonte naturellement.
    const fused = new Map<string, { doc: IndexedDoc; score: number }>();
    const bestPerQuery: string[] = [];
    const docKey = (doc: IndexedDoc) => normalize(doc.chunk.content.slice(0, 160));

    for (const query of cleanQueries) {
        const qTerms = [...new Set(tokenize(query))];
        const scores = new Map<IndexedDoc, number>();

        for (const term of qTerms) {
            const termIdf = idf(index, term);
            for (const { doc, tf } of index.postings.get(term) || []) {
                const d = index.docs[doc];
                scores.set(d, (scores.get(d) || 0) + bm25Term(tf, d.length, index.avgLength, termIdf));
            }
            for (const d of externalDocs) {
                const tf = d.tf.get(term);
                if (tf) scores.set(d, (scores.get(d) || 0) + bm25Term(tf, d.length, index.avgLength, termIdf));
            }
        }

        let max = 0;
        scores.forEach(s => { if (s > max) max = s; });
        if (max <= 0) continue;

        const phrase = normalize(query);
        const multiWord = qTerms.length > 1;
        let queryBest: { key: string; score: number } | null = null;

        scores.forEach((raw, doc) => {
            let s = (raw / max) * doc.weight;
            if (multiWord && normalize(doc.chunk.content).includes(phrase)) s *= 1.35;
            const key = docKey(doc);
            if (!queryBest || s > queryBest.score) queryBest = { key, score: s };
            const current = fused.get(key);
            if (current) current.score += s;
            else fused.set(key, { doc, score: s });
        });
        if (queryBest) bestPerQuery.push((queryBest as { key: string }).key);
    }

    // Couverture : le meilleur passage de chaque requête (= chaque problème
    // clinique) est garanti, puis on complète par score fusionné.
    let topFused = 0;
    fused.forEach(f => { if (f.score > topFused) topFused = f.score; });
    const guaranteed = [...new Set(bestPerQuery)]
        .map(key => fused.get(key)!)
        .filter(f => f.score >= topFused * 0.35) // évite de forcer un passage faiblement pertinent
        .slice(0, Math.ceil(topK / 2))
        .sort((a, b) => b.score - a.score);
    const guaranteedKeys = new Set(guaranteed.map(g => docKey(g.doc)));
    const ranked = [
        ...guaranteed,
        ...[...fused.values()].filter(f => !guaranteedKeys.has(docKey(f.doc))).sort((a, b) => b.score - a.score),
    ];
    const perBook = new Map<string, number>();
    const passages: RetrievedPassage[] = [];

    for (const { doc, score } of ranked) {
        const title = doc.chunk.book_title;
        const count = perBook.get(title) || 0;
        if (count >= maxPerBook) continue;
        perBook.set(title, count + 1);
        passages.push({ ...doc.chunk, id: `S${passages.length + 1}`, score: Math.round(score * 100) / 100 });
        if (passages.length >= topK) break;
    }

    console.log('[RAG] Requêtes :', cleanQueries, '→', passages.map(p => `${p.id} ${p.book_title} p.${p.page_number} (${p.score})`));
    return passages;
};

// ---------------------------------------------------------------------------
// Mise en forme
// ---------------------------------------------------------------------------
export const formatPassagesForPrompt = (passages: RetrievedPassage[]): string =>
    passages
        .map(p => `[${p.id}] ${prettifyBookTitle(p.book_title)}${p.page_number ? `, p. ${p.page_number}` : ''}\n${p.content}`)
        .join('\n\n---\n\n');

// Construit la section "Références" à partir des identifiants réellement cités
// dans le texte généré : aucune référence ne peut être inventée par le modèle.
export const buildReferencesSection = (generatedText: string, passages: RetrievedPassage[]): string => {
    const cited = new Set((generatedText.match(/\[S\d+\]/g) || []).map(m => m.slice(1, -1)));
    const used = passages.filter(p => cited.has(p.id));
    if (used.length === 0) return '';
    const lines = used.map(p => `- **[${p.id}]** ${prettifyBookTitle(p.book_title)}${p.page_number ? `, p. ${p.page_number}` : ''}`);
    return `\n\n---\n📚 **RÉFÉRENCES DE LA BIBLIOTHÈQUE ORTHOMIND (${used.length} passage${used.length > 1 ? 's' : ''} cité${used.length > 1 ? 's' : ''}) :**\n${lines.join('\n')}`;
};

// Mode hors-ligne : extraits bruts des passages les plus pertinents
export const formatPassagesAsExcerpts = (passages: RetrievedPassage[], max = 4): string =>
    passages.slice(0, max)
        .map(p => `**[${p.id}] ${prettifyBookTitle(p.book_title)}${p.page_number ? `, p. ${p.page_number}` : ''}**\n« ${p.content.slice(0, 450)}${p.content.length > 450 ? '…' : ''} »`)
        .join('\n\n');
