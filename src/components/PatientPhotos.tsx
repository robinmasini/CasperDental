import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import CameraCapture from './CameraCapture';
import { PatientPhoto, listPatientPhotos, uploadPatientPhotos, deletePatientPhoto, photosAvailable } from '../services/photosService';
import './PatientPhotos.css';

// Onglet Photos de la fiche patient : tous les clichés archivés (13 vues ordonnées),
// regroupés par jour, avec titre explicite en haut de chaque photo et visionneuse plein écran.

interface PatientPhotosProps {
    patientId: string;
    patientName: string;
}

const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const PatientPhotos = ({ patientId, patientName }: PatientPhotosProps) => {
    const [photos, setPhotos] = useState<PatientPhoto[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewerIndex, setViewerIndex] = useState<number | null>(null);
    const [showCamera, setShowCamera] = useState(false);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const galleryRef = useRef<HTMLInputElement>(null);
    const canUseCamera = !!navigator.mediaDevices?.getUserMedia && window.matchMedia('(pointer: coarse)').matches;

    const handleDownloadAllPhotos = async () => {
        if (photos.length === 0) return;
        setIsDownloadingAll(true);
        try {
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                if (!photo.url) continue;
                try {
                    const response = await fetch(photo.url);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const dateStr = photo.taken_at ? new Date(photo.taken_at).toISOString().slice(0, 10) : `photo_${i + 1}`;
                    const cleanPatient = (patientName || 'patient').replace(/[^a-zA-Z0-9_-]/g, '_');
                    const cleanLabel = (photo.label || `cliche_${i + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_');
                    a.download = `${cleanPatient}_${cleanLabel}_${dateStr}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => window.URL.revokeObjectURL(url), 1000);
                    await new Promise(r => setTimeout(r, 350));
                } catch (err) {
                    console.error("Error downloading image:", err);
                }
            }
        } finally {
            setIsDownloadingAll(false);
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setPhotos(await listPatientPhotos(patientId));
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => { load(); }, [load]);

    const addPhotos = async (files: File[]) => {
        if (files.length === 0) return;
        setUploading(true);
        try {
            await uploadPatientPhotos(patientId, files);
            await load();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploading(false);
            if (galleryRef.current) galleryRef.current.value = '';
        }
    };

    // Navigation clavier dans la visionneuse
    useEffect(() => {
        if (viewerIndex === null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopImmediatePropagation(); setViewerIndex(null); }
            if (e.key === 'ArrowRight') setViewerIndex(i => (i === null ? i : Math.min(photos.length - 1, i + 1)));
            if (e.key === 'ArrowLeft') setViewerIndex(i => (i === null ? i : Math.max(0, i - 1)));
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [viewerIndex, photos.length]);

    if (!photosAvailable()) {
        return <div className="om-empty"><p>Les photos sont archivées dans la base du cabinet : connectez-vous avec votre compte praticien pour les consulter.</p></div>;
    }

    // Regroupement par jour de prise
    const groups: { day: string; items: { photo: PatientPhoto; index: number }[] }[] = [];
    photos.forEach((photo, index) => {
        const day = dayLabel(photo.taken_at);
        const group = groups.find(g => g.day === day);
        if (group) group.items.push({ photo, index });
        else groups.push({ day, items: [{ photo, index }] });
    });

    const current = viewerIndex !== null ? photos[viewerIndex] : null;

    const removeCurrent = async () => {
        if (!current || !window.confirm('Supprimer définitivement cette photo du dossier ?')) return;
        try {
            await deletePatientPhoto(current);
            setViewerIndex(null);
            await load();
        } catch (e: any) {
            setError(e.message);
        }
    };

    return (
        <div className="patient-photos">
            <div className="fiche-section-bar" style={{ alignItems: 'flex-start' }}>
                <div>
                    <h3 className="om-title" style={{ marginTop: '6px' }}>Photos de {patientName}</h3>
                    <p className="om-muted" style={{ fontSize: '0.84rem' }}>
                        Clichés orthodontiques (séquence de 13 vues : 7 intra-orales, 4 visage, 2 buste)
                    </p>
                </div>
                <div className="fiche-section-actions" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <input
                        ref={galleryRef}
                        type="file"
                        accept="image/*,.heic,.HEIC,.heif,.HEIF"
                        multiple
                        hidden
                        onChange={(e) => addPhotos(Array.from(e.target.files || []))}
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {canUseCamera && (
                            <button className="om-btn om-btn--primary om-btn--sm" onClick={() => setShowCamera(true)} disabled={uploading}>
                                <Icon name="camera" /> Prendre les 13 clichés
                            </button>
                        )}
                        <button className="om-btn om-btn--secondary om-btn--sm" onClick={() => galleryRef.current?.click()} disabled={uploading}>
                            <Icon name="image" /> {uploading ? 'Envoi…' : 'Ajouter depuis la galerie'}
                        </button>
                    </div>
                    <button
                        type="button"
                        className="om-btn om-btn--ghost om-btn--sm"
                        onClick={handleDownloadAllPhotos}
                        disabled={uploading || isDownloadingAll || photos.length === 0}
                        style={{ gap: '6px', color: photos.length > 0 ? 'var(--om-accent)' : 'var(--om-text-3)', borderColor: photos.length > 0 ? 'rgba(0, 242, 254, 0.3)' : undefined }}
                        title={photos.length === 0 ? "Aucune photo à télécharger" : "Télécharger tous les clichés du patient"}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {isDownloadingAll ? 'Téléchargement…' : 'Télécharger toutes les photos'}
                    </button>
                </div>
            </div>

            {error && <div className="om-notice om-notice--danger" role="alert"><p>{error}</p></div>}

            {loading ? (
                <p className="om-muted">Chargement des photos…</p>
            ) : photos.length === 0 ? (
                <div className="om-empty">
                    <p>Aucune photo pour ce patient. Les clichés de chaque analyse sont archivés ici automatiquement.</p>
                </div>
            ) : (
                groups.map(group => (
                    <section key={group.day} className="photos-day">
                        <h4 className="om-label photos-day-title">
                            <Icon name="calendar" size={14} /> {group.day} · {group.items.length} photo{group.items.length > 1 ? 's' : ''}
                        </h4>
                        <div className="photos-grid">
                            {group.items.map(({ photo, index }) => (
                                <button key={photo.id} className="photo-tile" onClick={() => setViewerIndex(index)}>
                                    {photo.label && (
                                        <div className="photo-tile-header" style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.85), transparent)',
                                            color: 'var(--om-accent, #00f2fe)',
                                            fontSize: '0.74rem',
                                            fontWeight: 600,
                                            padding: '6px 8px',
                                            zIndex: 2,
                                            textAlign: 'left',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            {photo.label}
                                        </div>
                                    )}
                                    {photo.url ? <img src={photo.url} alt={photo.label || `Photo du ${group.day}`} loading="lazy" /> : <span className="photo-missing">Indisponible</span>}
                                    <span className="photo-caption">
                                        <span>{timeLabel(photo.taken_at)}</span>
                                        {photo.label && <span className="photo-label">{photo.label}</span>}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                ))
            )}

            {showCamera && (
                <CameraCapture
                    maxShots={13}
                    onClose={() => setShowCamera(false)}
                    onDone={(files) => { setShowCamera(false); addPhotos(files); }}
                />
            )}

            {current && viewerIndex !== null && createPortal(
                <div className="photo-viewer" role="dialog" aria-modal="true" onClick={() => setViewerIndex(null)}>
                    <div className="photo-viewer-top" onClick={e => e.stopPropagation()}>
                        <div>
                            <strong>{current.label ? current.label : `${dayLabel(current.taken_at)} à ${timeLabel(current.taken_at)}`}</strong>
                            <span className="photo-viewer-label">{dayLabel(current.taken_at)} à {timeLabel(current.taken_at)}</span>
                        </div>
                        <div className="photo-viewer-actions">
                            <button className="om-btn om-btn--danger om-btn--sm" onClick={removeCurrent}>Supprimer</button>
                            <button className="om-btn om-btn--secondary om-btn--sm" onClick={() => setViewerIndex(null)}><Icon name="x" /> Fermer</button>
                        </div>
                    </div>
                    <img className="photo-viewer-img" src={current.url} alt={current.label || 'Photo patient'} onClick={e => e.stopPropagation()} />
                    {viewerIndex > 0 && (
                        <button className="photo-viewer-nav photo-viewer-nav--prev" aria-label="Photo précédente" onClick={e => { e.stopPropagation(); setViewerIndex(viewerIndex - 1); }}>‹</button>
                    )}
                    {viewerIndex < photos.length - 1 && (
                        <button className="photo-viewer-nav photo-viewer-nav--next" aria-label="Photo suivante" onClick={e => { e.stopPropagation(); setViewerIndex(viewerIndex + 1); }}>›</button>
                    )}
                    <span className="photo-viewer-count">{viewerIndex + 1} / {photos.length}</span>
                </div>,
                document.body
            )}
        </div>
    );
};

export default PatientPhotos;
