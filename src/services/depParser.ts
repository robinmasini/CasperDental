import { OrthoMindDepData, createDefaultDepData } from '../types/dep';

/**
 * Intelligent parser that converts raw diagnostic text & treatment plan from OrthoMind analysis
 * into structured Sécurité Sociale DEP Form data.
 */
// Champs texte de la DEP rédigés par l'IA à partir de son propre compte-rendu
export interface DepAiFields {
    agenesie?: string;
    facteurFonctionnel?: string;
    dentsIncluesOuSurnumeraires?: string;
    malpositions?: string;
    planDeTraitement?: string;
}

export const extractDepDataFromAnalysis = (
    diagnosticText: string,
    traitementText: string,
    patientFullName = '',
    patientId = '',
    aiFields?: DepAiFields
): OrthoMindDepData => {
    // Separate first and last name if provided
    let patientNom = 'PATIENT';
    let patientPrenom = 'Anonyme';
    if (patientFullName.trim()) {
        const parts = patientFullName.trim().split(/\s+/);
        if (parts.length >= 2) {
            patientNom = parts[0].toUpperCase();
            patientPrenom = parts.slice(1).join(' ');
        } else {
            patientNom = parts[0].toUpperCase();
        }
    }

    const numInterne = patientId ? patientId.slice(-4) : '7298';
    const numDossier = patientId || '20220124';

    const dep = createDefaultDepData(patientNom, patientPrenom, numInterne, numDossier);
    dep.status = 'saisi';

    const diagLower = (diagnosticText || '').toLowerCase();
    const traitLower = (traitementText || '').toLowerCase();
    const fullLower = `${diagLower}\n${traitLower}`;

    // --- 1. CLASSE DENTAIRE MOLAIRE & CANINE ---
    if (fullLower.includes('classe ii') || fullLower.includes('classe 2') || fullLower.includes('class ii')) {
        dep.anomaliesBasales.classeMolaire = 'Cl. II';
        dep.anomaliesAlveolaires.classeCanine = 'Cl. II';
    } else if (fullLower.includes('classe iii') || fullLower.includes('classe 3') || fullLower.includes('class iii')) {
        dep.anomaliesBasales.classeMolaire = 'Cl. III';
        dep.anomaliesAlveolaires.classeCanine = 'Cl. III';
    } else if (fullLower.includes('classe i') || fullLower.includes('classe 1') || fullLower.includes('class i')) {
        dep.anomaliesBasales.classeMolaire = 'Cl. I';
        dep.anomaliesAlveolaires.classeCanine = 'Cl. I';
    }

    // --- 2. SENS SAGITTAL (Basal & Alvéolaire) ---
    // Proalvéolie / Proretro / Vestibuloversion
    if (fullLower.includes('proalvéolie maxillaire') || fullLower.includes('protrusion maxillaire') || fullLower.includes('proalveolie maxillaire') || fullLower.includes('surplomb incisif') || fullLower.includes('overjet')) {
        dep.anomaliesBasales.sagittalMaxillairePro = true;
        dep.anomaliesAlveolaires.sagittalMaxillairePro = true;
    }
    if (fullLower.includes('rétrognathie mandibulaire') || fullLower.includes('retrognathie mandibulaire') || fullLower.includes('retromandibulaire') || fullLower.includes('rétroalvéolie mandibulaire') || fullLower.includes('lingualisation des incisives inférieures')) {
        dep.anomaliesBasales.sagittalMandibulaireRetro = true;
        dep.anomaliesAlveolaires.sagittalMandibulaireRetro = true;
    }
    if (fullLower.includes('promandibulie') || fullLower.includes('proalvéolie mandibulaire') || fullLower.includes('propulsion mandibulaire')) {
        dep.anomaliesBasales.sagittalMandibulairePro = true;
        dep.anomaliesAlveolaires.sagittalMandibulairePro = true;
    }

    // --- 3. SENS TRANSVERSAL (Endo / Exo) ---
    if (fullLower.includes('endognathie') || fullLower.includes('endo maxillaire') || fullLower.includes('arcade étroite') || fullLower.includes('expansion maxillaire') || fullLower.includes('encombrement maxillaire')) {
        dep.anomaliesBasales.transversalMaxillaireEndo = true;
        dep.anomaliesAlveolaires.transversalMaxillaireEndo = true;
    }
    if (fullLower.includes('endo mandibulaire') || fullLower.includes('encombrement mandibulaire')) {
        dep.anomaliesBasales.transversalMandibulaireEndo = true;
        dep.anomaliesAlveolaires.transversalMandibulaireEndo = true;
    }

    // --- 4. SENS VERTICAL (Hypo/Hyperdivergence & Supraclusion/Infraclusion) ---
    if (fullLower.includes('supraclusion') || fullLower.includes('overbite') || fullLower.includes('recouvrement excessif')) {
        dep.anomaliesAlveolaires.verticalSupraclusion = true;
        dep.anomaliesBasales.verticalHypodivergence = true;
    }
    if (fullLower.includes('béance') || fullLower.includes('beance') || fullLower.includes('infraclusion')) {
        dep.anomaliesAlveolaires.verticalInfraclusion = true;
        dep.anomaliesBasales.verticalHyperdivergence = true;
    }

    // --- 5. DYSHARMONIE & OCCLUSION INVERSÉE ---
    if (fullLower.includes('encombrement') || fullLower.includes('dysharmonie dento-maxillaire') || fullLower.includes('ddm')) {
        dep.anomaliesBasales.dysharmonieDentoMaxillaire = true;
    }
    if (fullLower.includes('diastème') || fullLower.includes('dysharmonie dento-dentaire') || fullLower.includes('rotation')) {
        dep.anomaliesBasales.dysharmonieDentoDentaire = true;
    }
    if (fullLower.includes('articulé croisé') || fullLower.includes('occlusion inversée') || fullLower.includes('articulé inversé')) {
        if (fullLower.includes('droite')) dep.anomaliesBasales.occlusionInverseeDroite = true;
        if (fullLower.includes('gauche')) dep.anomaliesBasales.occlusionInverseeGauche = true;
        if (fullLower.includes('antérieur') || fullLower.includes('anterieure')) dep.anomaliesBasales.occlusionInverseeAnterieure = true;
        if (!dep.anomaliesBasales.occlusionInverseeDroite && !dep.anomaliesBasales.occlusionInverseeGauche && !dep.anomaliesBasales.occlusionInverseeAnterieure) {
            dep.anomaliesBasales.occlusionInverseeAnterieure = true;
        }
    }

    // --- 6. MALPOSITIONS & DENTS INCLUES ---
    const inclueMatch = fullLower.match(/(impacté|incluse|surnuméraire|mesiodens)[^.\n]*[.!?\n]/i);
    if (inclueMatch) {
        dep.anomaliesAlveolaires.dentsIncluesOuSurnumeraires = inclueMatch[0].replace(/^[0-9.#*-]+\s*/, '').replace(/\*\*/g, '').slice(0, 150).trim();
    } else {
        dep.anomaliesAlveolaires.dentsIncluesOuSurnumeraires = 'Aucune dent incluse ou surnuméraire constatée';
    }

    const malposMatch = diagnosticText.match(/rotations?|lingualisation|vestibulo-version|ectopie/i);
    if (malposMatch) {
        dep.anomaliesAlveolaires.malpositions = 'Rotations et malpositions dentaires (FDI) à corriger';
    } else {
        dep.anomaliesAlveolaires.malpositions = 'Malpositions légères';
    }

    // --- 7. AGÉNÉSIE ---
    const agenesieSection = diagnosticText.match(/3\.\s*ANOMALIES DENTO-ALVÉOLAIRES[\s\S]*?(?=4\.)/i)?.[0] || diagnosticText;
    const agenesieSentenceMatch = agenesieSection.match(/[^.\n]*(agénésie|agenesie|dent[s]? manquante[s]?)[^.\n]*[.!?\n]?/i);
    if (agenesieSentenceMatch) {
        const rawAg = agenesieSentenceMatch[0].replace(/^[0-9.#*-]+\s*/, '').replace(/\*\*/g, '').trim();
        if (/aucune|pas d'|sans agénésie|non constatée|absence d'agénésie/i.test(rawAg)) {
            dep.agenesie = 'Aucune agénésie constatée';
        } else {
            dep.agenesie = rawAg.slice(0, 180);
        }
    } else {
        dep.agenesie = 'Aucune agénésie constatée';
    }

    // --- 8. FACTEUR FONCTIONNEL ---
    const foncSectionMatch = diagnosticText.match(/5\.\s*FONCTIONS[\s\S]*?(?=6\.)/i);
    let foncText = '';
    if (foncSectionMatch) {
        foncText = foncSectionMatch[0].replace(/^5\.\s*FONCTIONS & ESTHÉTIQUE\s*:\s*/i, '').replace(/[\r\n]+/g, ' ').replace(/\*\*/g, '').trim();
    } else {
        const foncSentenceMatch = diagnosticText.match(/[^.\n]*(déglutition|deglutition|ventilation|respiration|interposition|pulsion linguale|atm)[^.\n]*[.!?\n]?/i);
        if (foncSentenceMatch) foncText = foncSentenceMatch[0].replace(/^[0-9.#*-]+\s*/, '').replace(/\*\*/g, '').trim();
    }

    if (foncText) {
        if (/sans anomalie|normale?|physiologique|normales/i.test(foncText) && !/atypique|buccale|interposition|trouble|souffrance/i.test(foncText)) {
            dep.facteurFonctionnel = 'Fonctions orofaciales (ventilation, déglutition, ATM) évaluées sans anomalie majeure';
        } else {
            dep.facteurFonctionnel = foncText.slice(0, 250);
        }
    } else {
        dep.facteurFonctionnel = 'Fonctions orofaciales à préciser lors de l\'examen clinique';
    }

    // --- 9. PLAN DE TRAITEMENT (Formaté pour DEP) ---
    if (traitementText && traitementText.trim()) {
        dep.planDeTraitement = treatmentToDepString(traitementText);
    } else {
        dep.planDeTraitement = '';
    }

    // --- Champs rédigés par l'IA : prioritaires sur les déductions par mots-clés ---
    if (aiFields) {
        if (aiFields.agenesie) dep.agenesie = aiFields.agenesie;
        if (aiFields.facteurFonctionnel) dep.facteurFonctionnel = aiFields.facteurFonctionnel;
        if (aiFields.dentsIncluesOuSurnumeraires) dep.anomaliesAlveolaires.dentsIncluesOuSurnumeraires = aiFields.dentsIncluesOuSurnumeraires;
        if (aiFields.malpositions) dep.anomaliesAlveolaires.malpositions = aiFields.malpositions;
        if (aiFields.planDeTraitement) dep.planDeTraitement = aiFields.planDeTraitement;
    }

    // --- 10. COMMENTAIRES ---
    dep.commentaires = `Pré-rempli automatiquement par OrthoMind le ${dep.dateSaisie} à partir du compte-rendu. À vérifier et compléter par le praticien avant envoi.`;

    return dep;
};

/**
 * Format raw treatment text into clean DEP plan de traitement string
 */
const treatmentToDepString = (traitementText: string): string => {
    const lines = traitementText.split('\n').map(l => l.trim()).filter(Boolean);
    const cleaned: string[] = [];

    for (const l of lines) {
        if (l.startsWith('#') || l.startsWith('<')) continue;
        const cleanLine = l.replace(/^[0-9.#*-]+\s*/, '').replace(/\*\*/g, '');
        if (cleanLine.length > 5 && !cleanLine.toLowerCase().startsWith('durée') && !cleanLine.toLowerCase().startsWith('consignes')) {
            cleaned.push(cleanLine);
        }
    }

    if (cleaned.length === 0) return traitementText.slice(0, 250);
    return cleaned.slice(0, 3).join(' • ').slice(0, 280);
};
