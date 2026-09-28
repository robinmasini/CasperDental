import { useEffect, useState } from 'react';
import type { AnalysisMeta } from '../services/geminiService';
import { getGeminiApiKey, testGeminiKey } from '../services/geminiService';

// État de l'intelligence branchée, vérifié une fois par session auprès de Google
type AiHealth =
    | { state: 'checking' }
    | { state: 'ok'; model: string }
    | { state: 'missing' }
    | { state: 'refused'; reason: string };

let healthPromise: Promise<AiHealth> | null = null;
let healthKey = '';

const explainRefusal = (error: string): string => {
    if (/OAuth 2 access token|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(error)) {
        return "Google refuse cette clé au format « AQ. » (problème connu des nouvelles clés AI Studio). Créez à la place une clé dans Google Cloud Console › API et services › Identifiants › Créer une clé API, restreinte à « Generative Language API », puis collez-la dans Configuration.";
    }
    if (/API key not valid/i.test(error)) return 'la clé Gemini est invalide.';
    return error;
};

export const checkAiHealth = (): Promise<AiHealth> => {
    const key = getGeminiApiKey();
    if (!key) return Promise.resolve({ state: 'missing' });
    if (healthPromise && healthKey === key) return healthPromise;
    healthKey = key;
    healthPromise = testGeminiKey(key).then(result =>
        result.ok ? { state: 'ok', model: result.model } : { state: 'refused', reason: explainRefusal(result.error) }
    );
    return healthPromise;
};

export const useAiHealth = (): AiHealth => {
    const [health, setHealth] = useState<AiHealth>({ state: 'checking' });
    useEffect(() => {
        let alive = true;
        checkAiHealth().then(h => { if (alive) setHealth(h); });
        return () => { alive = false; };
    }, []);
    return health;
};

// Signale clairement quand aucune intelligence n'est branchée ou qu'elle est refusée
export const AiMissingBanner = ({ onConfigure }: { onConfigure?: () => void }) => {
    const health = useAiHealth();
    if (health.state === 'checking' || health.state === 'ok') return null;
    return (
        <div className="om-notice om-notice--danger" role="alert">
            <p>
                {health.state === 'missing' ? (
                    <><strong>Aucune intelligence branchée.</strong> Sans clé Gemini, OrthoMind ne peut ni lire les clichés, ni retranscrire, ni rédiger de compte-rendu. Ajoutez votre clé dans Configuration.</>
                ) : (
                    <><strong>L'intelligence ne répond pas : clé Gemini refusée.</strong> {health.reason}</>
                )}
            </p>
            {onConfigure && (
                <button className="om-btn om-btn--secondary om-btn--sm" onClick={onConfigure}>
                    Configurer la clé
                </button>
            )}
        </div>
    );
};

// Transparence sur la façon dont le rapport a été produit
export const AiReportMeta = ({ meta, source }: { meta?: AnalysisMeta; source: string }) => {
    if (meta?.engine === 'offline') {
        return (
            <div className="om-notice om-notice--danger" role="alert">
                <p>
                    <strong>Rapport non rédigé par l'IA.</strong> Cause : {meta.failure || 'inconnue.'}
                </p>
            </div>
        );
    }
    return (
        <div className="ai-report-meta">
            {meta?.model && <span className="om-badge om-badge--accent">IA : {meta.model}</span>}
            {meta && (
                <span className="om-badge">
                    Bibliothèque : {meta.citedPassages} passage{meta.citedPassages > 1 ? 's' : ''} cité{meta.citedPassages > 1 ? 's' : ''} sur {meta.passages} consultés
                </span>
            )}
            <span className="om-badge">{source}</span>
            <span className="om-badge om-badge--warning">À valider par le praticien</span>
        </div>
    );
};
