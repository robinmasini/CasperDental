import { useEffect, useState } from 'react';
import './UpdateBanner.css';

// ============================================================================
// Nouvelle version d'OrthoMind en ligne : un onglet resté ouvert garde l'ancienne
// tant qu'il n'est pas rechargé. On compare le script principal servi par le site
// avec celui de la page ; s'il a changé, un bandeau propose de recharger.
// ============================================================================

const CHECK_EVERY_MS = 2 * 60_000;
const scriptPattern = /\/assets\/index-[\w-]+\.js/;

const currentBundle = (): string | null => {
    const script = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))
        .map(s => new URL(s.src).pathname)
        .find(src => scriptPattern.test(src));
    return script || null;
};

const UpdateBanner = () => {
    const [updateReady, setUpdateReady] = useState(false);

    useEffect(() => {
        const mine = currentBundle();
        if (!mine) return; // développement local : pas de version à comparer

        let stopped = false;
        const check = async () => {
            if (stopped || document.visibilityState !== 'visible') return;
            try {
                const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
                const live = (await res.text()).match(scriptPattern)?.[0];
                // Pas de rechargement automatique : une analyse ou une saisie en cours serait perdue
                if (live && live !== mine) setUpdateReady(true);
            } catch { /* hors ligne : on réessaiera */ }
        };

        const interval = setInterval(check, CHECK_EVERY_MS);
        window.addEventListener('focus', check);
        document.addEventListener('visibilitychange', check);
        check();
        return () => {
            stopped = true;
            clearInterval(interval);
            window.removeEventListener('focus', check);
            document.removeEventListener('visibilitychange', check);
        };
    }, []);

    if (!updateReady) return null;
    return (
        <div className="update-banner" role="status">
            <span>Une nouvelle version d'OrthoMind est disponible.</span>
            <button type="button" onClick={() => window.location.reload()}>Mettre à jour</button>
        </div>
    );
};

export default UpdateBanner;
