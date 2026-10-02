import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import {
    PatientPhoto,
    EMPREINTE_TITLES,
    EmpreinteTitle,
    listPatientEmpreintes,
    uploadPatientEmpreinte,
    deletePatientPhoto,
    photosAvailable,
    downloadPatientDossierZip,
} from '../services/photosService';
import './PatientEmpreintes.css';

interface PatientEmpreintesProps {
    patientId: string;
    patientName: string;
    hideTitleBar?: boolean;
}

const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const PatientEmpreintes = ({ patientId, patientName, hideTitleBar = false }: PatientEmpreintesProps) => {
    const [empreintesMap, setEmpreintesMap] = useState<Record<string, PatientPhoto>>({});
    const [loading, setLoading] = useState(true);
    const [uploadingTitle, setUploadingTitle] = useState<string | null>(null);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const slotInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    const loadEmpreintes = useCallback(async () => {
        setLoading(true);
        try {
            setEmpreintesMap(await listPatientEmpreintes(patientId));
            setError(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        loadEmpreintes();
    }, [loadEmpreintes]);

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

    const handleFileUpload = async (title: EmpreinteTitle, files: FileList | null) => {
        if (!files || files.length === 0) return;
        const file = files[0];
        setUploadingTitle(title);
        try {
            await uploadPatientEmpreinte(patientId, file, title);
            await loadEmpreintes();
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
        if (!window.confirm(`Supprimer définitivement l'empreinte 3D « ${title} » ?`)) return;
        try {
            await deletePatientPhoto(photo);
            await loadEmpreintes();
        } catch (e: any) {
            setError(e.message);
        }
    };

    if (!photosAvailable()) {
        return (
            <div className="om-empty">
                <p>Les empreintes 3D (.STL) sont archivées dans la base du cabinet : connectez-vous avec votre compte praticien pour les consulter.</p>
            </div>
        );
    }

    return (
        <div className="patient-empreintes">
            {!hideTitleBar && (
                <div className="empreintes-header-bar">
                    <div>
                        <h3 className="om-title" style={{ marginTop: '4px' }}>Dossier Empreintes de {patientName}</h3>
                        <p className="om-muted" style={{ fontSize: '0.84rem' }}>
                            Scans 3D au format .STL (BiteScan, BiteScan 2, UpperJawScan, LowerJawScan)
                        </p>
                    </div>
                    <button
                        type="button"
                        className="om-btn om-btn--ghost om-btn--sm"
                        onClick={handleDownloadAllZip}
                        disabled={isDownloadingAll}
                        style={{ gap: '6px', color: 'var(--om-accent)', borderColor: 'rgba(0, 242, 254, 0.3)' }}
                        title="Télécharger l'archive ZIP complète"
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
                <p className="om-muted">Chargement des empreintes 3D…</p>
            ) : (
                <div className="empreintes-grid">
                    {EMPREINTE_TITLES.map((title, idx) => {
                        const emp = empreintesMap[title];
                        const isUploading = uploadingTitle === title;
                        const originalName = emp?.label?.split('::')[2] || `${title}.stl`;

                        return (
                            <div key={title} style={{ position: 'relative' }}>
                                <input
                                    ref={el => slotInputRefs.current[title] = el}
                                    type="file"
                                    accept=".stl,.STL,.obj,.ply"
                                    hidden
                                    onChange={e => handleFileUpload(title, e.target.files)}
                                />

                                <button
                                    type="button"
                                    className="empreinte-tile"
                                    onClick={() => {
                                        if (emp && emp.url) {
                                            const a = document.createElement('a');
                                            a.href = emp.url;
                                            a.download = originalName;
                                            a.click();
                                        } else {
                                            slotInputRefs.current[title]?.click();
                                        }
                                    }}
                                >
                                    <div className="empreinte-tile-header">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            <span style={{ fontSize: '0.9rem' }}>🫆</span>
                                            {idx + 1}. {title}
                                        </span>
                                        <span style={{ fontSize: '0.66rem', opacity: emp ? 1 : 0.6, color: emp ? 'var(--om-success, #05c19c)' : 'var(--om-text-3)', flexShrink: 0 }}>
                                            {emp ? '✓ Intégré' : '＋'}
                                        </span>
                                    </div>

                                    {isUploading ? (
                                        <div className="empreinte-tile-empty">
                                            <span className="om-muted" style={{ fontSize: '0.72rem' }}>Envoi .STL…</span>
                                        </div>
                                    ) : emp ? (
                                        <>
                                            <div className="empreinte-tile-body">
                                                <span className="empreinte-tile-badge">FICHIER .STL</span>
                                                <span className="empreinte-tile-filename">{originalName}</span>
                                            </div>
                                            <div className="empreinte-tile-caption">
                                                <span>{dayLabel(emp.taken_at)}</span>
                                                <span
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(title, emp); }}
                                                    style={{ color: 'var(--om-danger, #ff49db)', cursor: 'pointer', padding: '2px 4px' }}
                                                    title="Supprimer cette empreinte 3D"
                                                >
                                                    <Icon name="trash" size={12} />
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="empreinte-tile-empty">
                                            <span className="stl-icon">🫆</span>
                                            <span>Importer .STL</span>
                                        </div>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PatientEmpreintes;
