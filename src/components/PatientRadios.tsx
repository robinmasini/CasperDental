import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import {
    PatientPhoto,
    RADIOGRAPHY_TITLES,
    RadiographyTitle,
    listPatientRadios,
    uploadPatientRadio,
    deletePatientPhoto,
    photosAvailable,
    downloadPatientDossierZip,
} from '../services/photosService';
import './PatientRadios.css';

interface PatientRadiosProps {
    patientId: string;
    patientName: string;
    hideTitleBar?: boolean;
}

const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const PatientRadios = ({ patientId, patientName, hideTitleBar = false }: PatientRadiosProps) => {
    const [radiosMap, setRadiosMap] = useState<Record<string, PatientPhoto>>({});
    const [loading, setLoading] = useState(true);
    const [uploadingTitle, setUploadingTitle] = useState<string | null>(null);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeViewerTitle, setActiveViewerTitle] = useState<RadiographyTitle | null>(null);
    const slotInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const loadRadios = useCallback(async () => {
        setLoading(true);
        try {
            setRadiosMap(await listPatientRadios(patientId));
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        loadRadios();
    }, [loadRadios]);

    const handleDownloadAllZip = async () => {
        setIsDownloadingAll(true);
        try {
            await downloadPatientDossierZip(patientId, patientName);
        } catch (e: any) {
            setError(e.message || 'Erreur lors de la création de l\'archive ZIP');
        } finally {
            setIsDownloadingAll(false);
        }
    };

    const handleFileUpload = async (title: RadiographyTitle, files: FileList | null) => {
        if (!files || files.length === 0) return;
        const file = files[0];
        setUploadingTitle(title);
        try {
            await uploadPatientRadio(patientId, file, title);
            await loadRadios();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploadingTitle(null);
            if (slotInputRefs.current[title]) {
                slotInputRefs.current[title]!.value = '';
            }
        }
    };

    const handleDelete = async (title: string, photo: PatientPhoto) => {
        if (!window.confirm(`Supprimer définitivement la radiographie « ${title} » ?`)) return;
        try {
            await deletePatientPhoto(photo);
            if (activeViewerTitle === title) setActiveViewerTitle(null);
            await loadRadios();
        } catch (e: any) {
            setError(e.message);
        }
    };

    if (!photosAvailable()) {
        return (
            <div className="om-empty">
                <p>Les radiographies sont archivées dans la base du cabinet : connectez-vous avec votre compte praticien pour les consulter.</p>
            </div>
        );
    }

    const currentViewerPhoto = activeViewerTitle ? radiosMap[activeViewerTitle] : null;

    return (
        <div className="patient-radios">
            {!hideTitleBar && (
                <div className="radios-header-bar">
                    <div>
                        <h3 className="om-title" style={{ marginTop: '4px' }}>Radiographies de {patientName}</h3>
                        <p className="om-muted" style={{ fontSize: '0.84rem' }}>
                            Dossier des 4 clichés radiographiques (scans issus des équipements d'imagerie du cabinet)
                        </p>
                    </div>
                    <button
                        type="button"
                        className="om-btn om-btn--ghost om-btn--sm"
                        onClick={handleDownloadAllZip}
                        disabled={isDownloadingAll}
                        style={{ gap: '6px', color: 'var(--om-accent)', borderColor: 'rgba(0, 242, 254, 0.3)' }}
                        title="Télécharger le dossier iconographique complet (Photos + Radios dans une archive ZIP unique)"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {isDownloadingAll ? 'Création de l\'archive ZIP…' : 'Télécharger le dossier complet (ZIP)'}
                    </button>
                </div>
            )}

            {error && (
                <div className="om-notice om-notice--danger" role="alert">
                    <p>{error}</p>
                </div>
            )}

            {loading ? (
                <p className="om-muted">Chargement des radiographies…</p>
            ) : (
                <div className="radios-grid">
                    {RADIOGRAPHY_TITLES.map((title, idx) => {
                        const radio = radiosMap[title];
                        const isUploading = uploadingTitle === title;

                        return (
                            <div key={title} style={{ position: 'relative' }}>
                                <input
                                    ref={el => slotInputRefs.current[title] = el}
                                    type="file"
                                    accept="image/*,.pdf,.heic,.dcm"
                                    hidden
                                    onChange={e => handleFileUpload(title, e.target.files)}
                                />

                                <button
                                    type="button"
                                    className="radio-tile"
                                    onClick={() => {
                                        if (radio) setActiveViewerTitle(title);
                                        else slotInputRefs.current[title]?.click();
                                    }}
                                >
                                    <div className="radio-tile-header">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            <Icon name="scan" size={13} style={{ color: 'var(--om-accent)', flexShrink: 0 }} />
                                            {idx + 1}. {title}
                                        </span>
                                        <span style={{ fontSize: '0.66rem', opacity: radio ? 1 : 0.6, color: radio ? 'var(--om-success, #05c19c)' : 'var(--om-text-3)', flexShrink: 0 }}>
                                            {radio ? '✓' : '＋'}
                                        </span>
                                    </div>

                                    {isUploading ? (
                                        <div className="radio-tile-empty">
                                            <span className="om-muted" style={{ fontSize: '0.72rem' }}>Envoi…</span>
                                        </div>
                                    ) : radio && radio.url ? (
                                        <>
                                            <img className="radio-tile-img" src={radio.url} alt={title} loading="lazy" />
                                            <div className="radio-tile-caption">
                                                <span>{dayLabel(radio.taken_at)}</span>
                                                <span
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(title, radio); }}
                                                    style={{ color: 'var(--om-danger, #ff49db)', cursor: 'pointer', padding: '2px 4px' }}
                                                    title="Supprimer cette radio"
                                                >
                                                    <Icon name="trash" size={12} />
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="radio-tile-empty">
                                            <Icon name="scan" size={20} />
                                            <span>Importer scan</span>
                                        </div>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Visionneuse plein écran pour la radiographie */}
            {activeViewerTitle && currentViewerPhoto && createPortal(
                <div className="photo-viewer" role="dialog" aria-modal="true" onClick={() => setActiveViewerTitle(null)}>
                    <div className="photo-viewer-top" onClick={e => e.stopPropagation()}>
                        <div>
                            <strong>{activeViewerTitle}</strong>
                            <span className="photo-viewer-label">Radiographie · {dayLabel(currentViewerPhoto.taken_at)}</span>
                        </div>
                        <div className="photo-viewer-actions">
                            <button
                                className="om-btn om-btn--danger om-btn--sm"
                                onClick={() => handleDelete(activeViewerTitle, currentViewerPhoto)}
                            >
                                Supprimer
                            </button>
                            <button className="om-btn om-btn--secondary om-btn--sm" onClick={() => setActiveViewerTitle(null)}>
                                <Icon name="x" /> Fermer
                            </button>
                        </div>
                    </div>

                    <img
                        className="photo-viewer-img"
                        src={currentViewerPhoto.url}
                        alt={activeViewerTitle}
                        onClick={e => e.stopPropagation()}
                    />
                </div>,
                document.body
            )}
        </div>
    );
};

export default PatientRadios;
