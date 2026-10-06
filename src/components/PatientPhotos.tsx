import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import CameraCapture from './CameraCapture';
import PatientRadios from './PatientRadios';
import PatientEmpreintes from './PatientEmpreintes';
import { PatientPhoto, listPatientPhotos, uploadPatientPhotos, deletePatientPhoto, photosAvailable, downloadPatientDossierZip, transformPatientPhoto, PhotoTransform } from '../services/photosService';
import './PatientPhotos.css';

// Onglet Photos de la fiche patient : tous les clichés archivés (13 vues ordonnées),
// avec balisage explicite des sections Photos et Radiographies visibles directement en vision continue.

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
    const [transformingId, setTransformingId] = useState<string | null>(null);

    // Miroir / rotation 90° ou 180° : enregistrés automatiquement dans le dossier
    const applyTransform = async (photo: PatientPhoto, transform: PhotoTransform) => {
        setTransformingId(photo.id);
        try {
            await transformPatientPhoto(photo, transform);
            await load();
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setTransformingId(null);
        }
    };

    const transformButtons = (photo: PatientPhoto) => (
        <div className="photo-transform-bar">
            <button
                type="button"
                className="om-btn om-btn--ghost om-btn--sm"
                onClick={(e) => { e.stopPropagation(); applyTransform(photo, 'flip'); }}
                disabled={transformingId !== null}
                title="Miroir horizontal (enregistré automatiquement)"
            >
                <span aria-hidden="true">⇋</span> Miroir
            </button>
            <button
                type="button"
                className="om-btn om-btn--ghost om-btn--sm"
                onClick={(e) => { e.stopPropagation(); applyTransform(photo, 'rotate90'); }}
                disabled={transformingId !== null}
                title="Rotation de 90° dans le sens horaire (enregistrée automatiquement)"
            >
                <span aria-hidden="true">↻</span> 90°
            </button>
            <button
                type="button"
                className="om-btn om-btn--ghost om-btn--sm"
                onClick={(e) => { e.stopPropagation(); applyTransform(photo, 'rotate180'); }}
                disabled={transformingId !== null}
                title="Rotation de 180° (enregistrée automatiquement)"
            >
                <Icon name="refresh" size={14} /> 180°
            </button>
            {transformingId === photo.id && <span className="om-muted photo-transform-busy">Enregistrement…</span>}
        </div>
    );
    const canUseCamera = !!navigator.mediaDevices?.getUserMedia && window.matchMedia('(pointer: coarse)').matches;

    const handleDownloadAllPhotos = async () => {
        setIsDownloadingAll(true);
        try {
            await downloadPatientDossierZip(patientId, patientName);
        } catch (err: any) {
            console.error("Error creating ZIP download:", err);
            setError(err.message || 'Erreur lors de la création du fichier ZIP');
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
                        Clichés orthodontiques (13 vues) & Radiographies (4 scans) balisés ci-dessous
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
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: '6px' }}>
                        <button
                            type="button"
                            className="om-btn om-btn--sm"
                            onClick={handleDownloadAllPhotos}
                            disabled={uploading || isDownloadingAll || photos.length === 0}
                            style={{ gap: '6px', color: '#fff', background: '#2563eb', borderColor: '#2563eb' }}
                            title="Télécharger l'archive ZIP complète avec les 3 sous-dossiers (Photos, Radios, Empreintes)"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            {isDownloadingAll ? 'Création du ZIP…' : '📁 Dossier complet (ZIP)'}
                        </button>
                    </div>
                </div>
            </div>

            {error && <div className="om-notice om-notice--danger" role="alert"><p>{error}</p></div>}

            {/* SECTION 1 : PHOTOS ORTHODONTIQUES */}
            <div style={{ marginTop: '16px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="om-badge om-badge--accent" style={{ fontSize: '0.8rem', padding: '4px 12px', fontWeight: 700, letterSpacing: '0.5px' }}>
                    📷 SECTION PHOTOS (13 CLICHÉS ORTHODONTIQUES)
                </span>
            </div>

            {loading ? (
                <p className="om-muted">Chargement des photos…</p>
            ) : photos.length === 0 ? (
                <div className="om-empty" style={{ margin: '12px 0 24px' }}>
                    <p>Aucune photo orthodontique enregistrée pour ce patient.</p>
                </div>
            ) : (
                groups.map(group => (
                    <section key={group.day} className="photos-day">
                        <h4 className="om-label photos-day-title">
                            <Icon name="calendar" size={14} /> {group.day} · {group.items.length} photo{group.items.length > 1 ? 's' : ''}
                        </h4>
                        <div className="photos-grid">
                            {group.items.map(({ photo, index }) => (
                                <div key={photo.id} className="photo-tile-wrap">
                                <button className="photo-tile" onClick={() => setViewerIndex(index)}>
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
                                {transformButtons(photo)}
                                </div>
                            ))}
                        </div>
                    </section>
                ))
            )}

            {/* SECTION 2 : RADIOGRAPHIES & SCANS (BALISÉ ET VISIBLE DIRECTEMENT SANS DOSSIER MASQUÉ) */}
            <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: '1px solid var(--om-border, rgba(255, 255, 255, 0.12))' }}>
                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="om-badge om-badge--warning" style={{ fontSize: '0.8rem', padding: '4px 12px', fontWeight: 700, letterSpacing: '0.5px' }}>
                        💀 SECTION RADIOGRAPHIES (4 SCANS)
                    </span>
                </div>
                <PatientRadios patientId={patientId} patientName={patientName} hideTitleBar={true} />
            </div>

            {/* SECTION 3 : EMPREINTES SCANS 3D (.STL) */}
            <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: '1px solid var(--om-border, rgba(255, 255, 255, 0.12))' }}>
                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="om-badge om-badge--accent" style={{ fontSize: '0.8rem', padding: '4px 12px', fontWeight: 700, letterSpacing: '0.5px' }}>
                        🫆 SECTION EMPREINTES (4 SCANS 3D .STL)
                    </span>
                </div>
                <PatientEmpreintes patientId={patientId} patientName={patientName} hideTitleBar={true} />
            </div>

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
                            {transformButtons(current)}
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
