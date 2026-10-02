import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import './CameraCapture.css';

// Caméra intégrée : enchaîner les clichés sans repasser par l'interface.
// Série photographique orthodontique de référence (13 clichés DANS L'ORDRE).
export const PHOTO_SUGGESTED_VIEWS = [
    'Intra-oral — face',
    'Intra-oral — face dessous',
    'Intra-oral — courbe de Spee',
    'Intra-oral — droit',
    'Intra-oral — gauche',
    'Intra-oral — haut',
    'Intra-oral — bas',
    'Visage — face',
    'Visage — sourire',
    'Visage — gauche',
    'Visage — droit',
    'Buste — face',
    'Buste — profil',
];

interface Shot {
    file: File;
    url: string;
}

interface CameraCaptureProps {
    maxShots?: number;
    startIndex?: number;
    onDone: (files: File[]) => void;
    onClose: () => void;
}

const CameraCapture = ({ maxShots = 13, startIndex = 0, onDone, onClose }: CameraCaptureProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
    const [shots, setShots] = useState<Shot[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [flash, setFlash] = useState(false);
    const [ready, setReady] = useState(false);
    const [zoomScale, setZoomScale] = useState(1);
    const shotCounter = useRef(startIndex);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const touchStartDistRef = useRef<number | null>(null);
    const initialZoomRef = useRef<number>(1);

    // Empêcher le zoom global de la page du navigateur lors du pincement dans la caméra
    useEffect(() => {
        const preventViewportZoom = (e: TouchEvent) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        };
        window.addEventListener('touchmove', preventViewportZoom, { passive: false });
        return () => {
            window.removeEventListener('touchmove', preventViewportZoom);
        };
    }, []);

    // Démarrage / changement de caméra
    useEffect(() => {
        let cancelled = false;
        setReady(false);
        setZoomScale(1);
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

    const applyZoom = (newZoom: number) => {
        const clamped = Math.min(5, Math.max(1, Number(newZoom.toFixed(2))));
        setZoomScale(clamped);
        try {
            const track = streamRef.current?.getVideoTracks()[0];
            if (track) {
                const capabilities = (track as any).getCapabilities?.();
                if (capabilities && capabilities.zoom) {
                    const min = capabilities.zoom.min || 1;
                    const max = capabilities.zoom.max || 5;
                    const hwZoom = Math.min(max, Math.max(min, clamped));
                    (track as any).applyConstraints({ advanced: [{ zoom: hwZoom }] });
                }
            }
        } catch {
            // Ignorer silencieusement si la contrainte matérielle n'est pas supportée
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            touchStartDistRef.current = dist;
            initialZoomRef.current = zoomScale;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && touchStartDistRef.current !== null) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const factor = dist / touchStartDistRef.current;
            applyZoom(initialZoomRef.current * factor);
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (e.touches.length < 2) {
            touchStartDistRef.current = null;
        }
    };

    const remaining = maxShots - shots.length;

    const takeShot = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth || remaining <= 0) return;
        const index = ++shotCounter.current;
        const currentIdx = startIndex + shots.length;
        const viewLabel = PHOTO_SUGGESTED_VIEWS[Math.min(currentIdx, PHOTO_SUGGESTED_VIEWS.length - 1)];

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d')!;

        const sWidth = video.videoWidth / zoomScale;
        const sHeight = video.videoHeight / zoomScale;
        const sx = (video.videoWidth - sWidth) / 2;
        const sy = (video.videoHeight - sHeight) / 2;

        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

        setFlash(true);
        setTimeout(() => setFlash(false), 140);
        navigator.vibrate?.(20);

        canvas.toBlob(blob => {
            if (!blob) return;
            const file = new File([blob], `cliche-${String(index).padStart(2, '0')}__${viewLabel}.jpg`, { type: 'image/jpeg' });
            setShots(prev => [...prev, { file, url: URL.createObjectURL(file) }]);
        }, 'image/jpeg', 0.92);
    };

    // Import depuis la photothèque sans quitter la caméra
    const addFromGallery = (fileList: FileList | null) => {
        if (!fileList) return;
        const rawFiles = Array.from(fileList).slice(0, Math.max(0, maxShots - shots.length));
        
        const newShots: Shot[] = rawFiles.map((file, i) => {
            const currentIdx = startIndex + shots.length + i;
            const viewLabel = PHOTO_SUGGESTED_VIEWS[Math.min(currentIdx, PHOTO_SUGGESTED_VIEWS.length - 1)];
            const fileName = file.name.includes('__') ? file.name : `cliche-${String(currentIdx + 1).padStart(2, '0')}__${viewLabel}.jpg`;
            const taggedFile = new File([file], fileName, { type: file.type || 'image/jpeg' });
            return { file: taggedFile, url: URL.createObjectURL(taggedFile) };
        });

        shotCounter.current += rawFiles.length;
        setShots(prev => [...prev, ...newShots]);
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

    const currentIdx = startIndex + shots.length;
    const nextView = PHOTO_SUGGESTED_VIEWS[Math.min(currentIdx, PHOTO_SUGGESTED_VIEWS.length - 1)];

    return createPortal(
        <div className="camera-capture" role="dialog" aria-modal="true" aria-label="Prise de clichés">
            <div
                className="camera-video-wrapper"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                <video
                    ref={videoRef}
                    className={`camera-video ${facingMode === 'user' ? 'is-mirrored' : ''}`}
                    style={{
                        transform: facingMode === 'user'
                            ? `scale(-${zoomScale}, ${zoomScale})`
                            : `scale(${zoomScale})`
                    }}
                    playsInline
                    muted
                    autoPlay
                    onLoadedData={() => setReady(true)}
                />
            </div>

            {flash && <div className="camera-flash" />}

            <header className="camera-top">
                <button className="camera-round-btn" onClick={cancel} aria-label="Fermer la caméra">
                    <Icon name="x" size={20} />
                </button>
                <div className="camera-hint">
                    {remaining > 0 ? (
                        <>
                            <span className="camera-hint-label">Vue suggérée · {startIndex + shots.length + 1} / {startIndex + maxShots}</span>
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
