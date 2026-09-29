import { useEffect, useState } from 'react';
import type { AnalysisMeta } from '../services/geminiService';
import { getGeminiApiKey, testGeminiKey, describeAiFailure } from '../services/geminiService';
import { saveCabinetGeminiKey } from '../services/cabinetSettings';
import { isCloudMode } from '../services/recordsService';

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

export const useAiHealth = (): [AiHealth, () => void] => {
    const [health, setHealth] = useState<AiHealth>({ state: 'checking' });
    const [version, setVersion] = useState(0);
    useEffect(() => {
        let alive = true;
        checkAiHealth().then(h => { if (alive) setHealth(h); });
        return () => { alive = false; };
    }, [version]);
    return [health, () => { healthPromise = null; setVersion(v => v + 1); }];
};

// Signale clairement quand aucune intelligence n'est branchée ou qu'elle est refusée,
// et permet d'enregistrer la clé sur place, une fois pour tout le cabinet.
export const AiMissingBanner = ({ onConfigure }: { onConfigure?: () => void }) => {
    const [health, recheck] = useAiHealth();
    const [key, setKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    if (health.state === 'checking' || health.state === 'ok') return null;

    const save = async () => {
        const value = key.trim();
        if (!value) return;
        setSaving(true);
        setMessage('Vérification de la clé auprès de Google…');
        const result = await testGeminiKey(value);
        if (!result.ok) {
            setMessage(`Clé refusée : ${describeAiFailure(result.error)}`);
            setSaving(false);
            return;
        }
        localStorage.setItem('casper_gemini_api_key', value);
        if (isCloudMode()) {
            try {
                await saveCabinetGeminiKey(value);
            } catch (e: any) {
                setMessage(`Clé active sur cet appareil, mais pas encore partagée avec le cabinet : ${e.message}`);
            }
        }
        setSaving(false);
        setKey('');
        recheck();
    };

    return (
        <div className="om-notice om-notice--danger ai-banner" role="alert">
            <p>
                {health.state === 'missing' ? (
                    <><strong>Aucune intelligence branchée.</strong> Collez la clé Gemini ci-dessous : elle sera enregistrée <strong>une seule fois pour tout le cabinet</strong>, et plus personne n'aura à la saisir.</>
                ) : (
                    <><strong>L'intelligence ne répond pas : clé Gemini refusée.</strong> {health.reason}</>
                )}
            </p>
            <div className="ai-banner-form">
                <input
                    type="password"
                    className="om-input"
                    placeholder="Coller la clé Gemini"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    autoComplete="off"
                    aria-label="Clé Gemini"
                />
                <button className="om-btn om-btn--primary" onClick={save} disabled={saving || !key.trim()}>
                    {saving ? 'Vérification…' : 'Enregistrer pour le cabinet'}
                </button>
                {onConfigure && (
                    <button className="om-btn om-btn--ghost om-btn--sm" onClick={onConfigure}>Configuration</button>
                )}
            </div>
            {message && <p className="ai-banner-message">{message}</p>}
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
