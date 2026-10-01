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
}

const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

const PatientRadios = ({ patientId, patientName }: PatientRadiosProps) => {
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
                            <div key={title} className="radio-card">
                                <div className="radio-card-header">
                                    <div>
                                        <div className="radio-card-title">
                                            <Icon name="scan" size={16} style={{ color: 'var(--om-accent)' }} />
                                            <span>{idx + 1}. {title}</span>
                                        </div>
                                        <div className="radio-card-subtitle">
                                            {title.includes('poignet') ? 'Évaluation de la maturation osseuse' : 'Cliché radio scan'}
                                        </div>
                                    </div>
                                    <span className={`radio-badge ${radio ? 'om-badge--success' : ''}`}>
                                        {radio ? 'Intégré' : 'Manquant'}
                                    </span>
                                </div>

                                <input
                                    ref={el => slotInputRefs.current[title] = el}
                                    type="file"
                                    accept="image/*,.pdf,.heic,.dcm"
                                    hidden
                                    onChange={e => handleFileUpload(title, e.target.files)}
                                />

                                <div
                                    className={`radio-card-body ${radio ? 'has-image' : ''}`}
                                    onClick={() => {
                                        if (radio) setActiveViewerTitle(title);
                                        else slotInputRefs.current[title]?.click();
                                    }}
                                >
                                    {isUploading ? (
                                        <div className="radio-empty-placeholder">
                                            <span className="om-muted">Envoi du scan…</span>
                                        </div>
                                    ) : radio && radio.url ? (
                                        <>
                                            <img src={radio.url} alt={title} loading="lazy" />
                                            <div className="radio-card-overlay">
                                                <button
                                                    className="om-btn om-btn--primary om-btn--sm"
                                                    onClick={(e) => { e.stopPropagation(); setActiveViewerTitle(title); }}
                                                >
                                                    <Icon name="eye" size={14} /> Voir
                                                </button>
                                                <button
                                                    className="om-btn om-btn--secondary om-btn--sm"
                                                    onClick={(e) => { e.stopPropagation(); slotInputRefs.current[title]?.click(); }}
                                                    title="Remplacer le scan"
                                                >
                                                    <Icon name="edit" size={14} /> Chg.
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="radio-empty-placeholder">
                                            <Icon name="scan" size={28} />
                                            <span>Cliquez pour importer le scan {title}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="radio-card-footer">
                                    <span>{radio ? `Ajouté le ${dayLabel(radio.taken_at)}` : 'Aucun fichier importé'}</span>
                                    {radio && (
                                        <button
                                            className="om-btn om-btn--ghost om-btn--sm"
                                            style={{ padding: '2px 6px', color: 'var(--om-danger, #ff49db)' }}
                                            onClick={() => handleDelete(title, radio)}
                                            title="Supprimer cette radio"
                                        >
                                            <Icon name="trash" size={13} />
                                        </button>
                                    )}
                                </div>
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
