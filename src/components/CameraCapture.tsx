import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import './CameraCapture.css';

// Caméra intégrée : enchaîner les clichés sans repasser par l'interface
// (l'appareil photo natif d'iOS ne prend qu'une photo par ouverture).

// Série photographique orthodontique de référence, proposée dans l'ordre
const SUGGESTED_VIEWS = [
    'Face — sourire',
    'Face — repos',
    'Profil droit',
    'Intra-buccale — face',
    'Intra-buccale — latérale droite',
    'Intra-buccale — latérale gauche',
    'Occlusale maxillaire',
    'Occlusale mandibulaire',
    'Profil gauche',
    'Cliché complémentaire',
];

interface Shot {
    file: File;
    url: string;
}

interface CameraCaptureProps {
    maxShots: number;
    startIndex?: number;
    onDone: (files: File[]) => void;
    onClose: () => void;
}

const CameraCapture = ({ maxShots, startIndex = 0, onDone, onClose }: CameraCaptureProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
    const [shots, setShots] = useState<Shot[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [flash, setFlash] = useState(false);
    const [ready, setReady] = useState(false);
    const shotCounter = useRef(startIndex);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    // Démarrage / changement de caméra
    useEffect(() => {
        let cancelled = false;
        setReady(false);
        (async () => {
            try {
                streamRef.current?.getTracks().forEach(t => t.stop());
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        facingMode: { ideal: facingMode },
                        width: { ideal: 3840 },
                        height: { ideal: 2160 },
                    },
                });
                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {});
                }
                setError(null);
            } catch (e: any) {
                setError(e?.name === 'NotAllowedError'
                    ? "L'accès à la caméra a été refusé. Autorisez-le dans les réglages du navigateur (Réglages › Safari › Caméra sur iPhone), puis réessayez."
                    : "Impossible d'ouvrir la caméra sur cet appareil.");
            }
        })();
        return () => { cancelled = true; };
    }, [facingMode]);

    // Arrêt de la caméra et libération des aperçus à la fermeture
    useEffect(() => () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
    }, []);

    // Empêche le défilement de la page derrière la caméra
    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previous; };
    }, []);

    const remaining = maxShots - shots.length;

    const takeShot = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth || remaining <= 0) return;
        const index = ++shotCounter.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d')!;
        if (facingMode === 'user') {
            // La caméra frontale est affichée en miroir : on enregistre l'image réelle
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        setFlash(true);
        setTimeout(() => setFlash(false), 140);
        navigator.vibrate?.(20);

        canvas.toBlob(blob => {
            if (!blob) return;
            const file = new File([blob], `cliche-${String(index).padStart(2, '0')}.jpg`, { type: 'image/jpeg' });
            setShots(prev => [...prev, { file, url: URL.createObjectURL(file) }]);
        }, 'image/jpeg', 0.92);
    };

    // Import depuis la photothèque sans quitter la caméra
    const addFromGallery = (fileList: FileList | null) => {
        if (!fileList) return;
        const files = Array.from(fileList).slice(0, Math.max(0, maxShots - shots.length));
        shotCounter.current += files.length;
        setShots(prev => [...prev, ...files.map(file => ({ file, url: URL.createObjectURL(file) }))]);
        if (galleryInputRef.current) galleryInputRef.current.value = '';
    };

    const removeShot = (index: number) => {
        setShots(prev => {
            URL.revokeObjectURL(prev[index].url);
            return prev.filter((_, i) => i !== index);
        });
    };

    const finish = () => {
        const files = shots.map(s => s.file);
        shots.forEach(s => URL.revokeObjectURL(s.url));
        onDone(files);
    };

    const cancel = () => {
        if (shots.length > 0 && !window.confirm(`Abandonner les ${shots.length} cliché(s) pris ?`)) return;
        shots.forEach(s => URL.revokeObjectURL(s.url));
        onClose();
    };

    const nextView = SUGGESTED_VIEWS[Math.min(startIndex + shots.length, SUGGESTED_VIEWS.length - 1)];

    return createPortal(
        <div className="camera-capture" role="dialog" aria-modal="true" aria-label="Prise de clichés">
            <video
                ref={videoRef}
                className={`camera-video ${facingMode === 'user' ? 'is-mirrored' : ''}`}
                playsInline
                muted
                autoPlay
                onLoadedData={() => setReady(true)}
            />
            {flash && <div className="camera-flash" />}

            <header className="camera-top">
                <button className="camera-round-btn" onClick={cancel} aria-label="Fermer la caméra">
                    <Icon name="x" size={20} />
                </button>
                <div className="camera-hint">
                    {remaining > 0 ? (
                        <>
                            <span className="camera-hint-label">Vue suggérée · {startIndex + shots.length} / {startIndex + maxShots}</span>
                            <span className="camera-hint-view">{nextView}</span>
                        </>
                    ) : (
                        <span className="camera-hint-view">Maximum atteint ({maxShots} clichés)</span>
                    )}
                </div>
                <button
                    className="camera-round-btn"
                    onClick={() => setFacingMode(m => (m === 'environment' ? 'user' : 'environment'))}
                    aria-label="Changer de caméra"
                >
                    <Icon name="switchCamera" size={20} />
                </button>
            </header>

            {error && (
                <div className="camera-error">
                    <p>{error}</p>
                    <button className="om-btn om-btn--secondary" onClick={onClose}>Revenir</button>
                </div>
            )}

            <footer className="camera-bottom">
                {shots.length > 0 && (
                    <div className="camera-strip" aria-label="Clichés pris">
                        {shots.map((shot, i) => (
                            <div key={shot.url} className="camera-thumb">
                                <img src={shot.url} alt={`Cliché ${startIndex + i + 1}`} />
                                <button onClick={() => removeShot(i)} aria-label={`Supprimer le cliché ${startIndex + i + 1}`}>
                                    <Icon name="x" size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="camera-controls">
                    <input
                        ref={galleryInputRef}
                        type="file"
                        accept="image/*,.heic,.HEIC,.heif,.HEIF"
                        multiple
                        hidden
                        onChange={(e) => addFromGallery(e.target.files)}
                    />
                    <button
                        className="camera-gallery"
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={remaining <= 0}
                        aria-label="Importer depuis la photothèque"
                    >
                        <Icon name="image" size={20} />
                        <span>Galerie</span>
                    </button>
                    <button
                        className="camera-shutter"
                        onClick={takeShot}
                        disabled={!ready || remaining <= 0 || !!error}
                        aria-label="Prendre le cliché"
                    />
                    <button
                        className="camera-done"
                        onClick={finish}
                        disabled={shots.length === 0}
                    >
                        <Icon name="check" size={18} /> Terminé
                    </button>
                </div>
            </footer>
        </div>,
        document.body
    );
};

export default CameraCapture;
