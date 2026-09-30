import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import logoOnyxceph from '../assets/logo-onyxceph.png';
import { getOnyxCephUrlRecord } from '../services/recordsService';
import './PatientOnyxCeph.css';

interface PatientOnyxCephProps {
    patientId: string;
    patientName: string;
    initialUrl?: string;
    onSaveUrl: (newUrl: string) => Promise<void> | void;
}

const PatientOnyxCeph: React.FC<PatientOnyxCephProps> = ({
    patientId,
    patientName,
    initialUrl = '',
    onSaveUrl
}) => {
    const [urlInput, setUrlInput] = useState(initialUrl);
    const [savedUrl, setSavedUrl] = useState(initialUrl);
    const [isEditing, setIsEditing] = useState(!initialUrl);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setSavedUrl(initialUrl || '');
        setUrlInput(initialUrl || '');
        setIsEditing(!initialUrl);
        setErrorMessage(null);

        getOnyxCephUrlRecord(patientId, patientName).then((remoteUrl) => {
            if (isMounted && remoteUrl) {
                setSavedUrl(remoteUrl);
                setUrlInput(remoteUrl);
                setIsEditing(false);
            }
        }).catch((err) => {
            if (isMounted) console.error('Erreur lecture OnyxCeph:', err);
        });

        return () => {
            isMounted = false;
        };
    }, [patientId, patientName, initialUrl]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        let trimmed = urlInput.trim();
        if (trimmed && !trimmed.match(/^https?:\/\//i)) {
            trimmed = 'https://' + trimmed;
        }

        setSaving(true);
        setErrorMessage(null);
        try {
            await onSaveUrl(trimmed);
            setSavedUrl(trimmed);
            setIsEditing(false);
            setSuccessMessage('Lien OnyxCeph enregistré avec succès !');
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
            console.error('Erreur lors de la sauvegarde du lien OnyxCeph:', err);
            setErrorMessage(err?.message || 'Erreur lors de l\'enregistrement du lien.');
        } finally {
            setSaving(false);
        }
    };

    const handleCopy = async () => {
        if (!savedUrl) return;
        try {
            await navigator.clipboard.writeText(savedUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            window.prompt('Copiez le lien OnyxCeph :', savedUrl);
        }
    };

    const handleDelete = async () => {
        if (window.confirm('Voulez-vous vraiment supprimer le lien OnyxCeph de ce patient ?')) {
            setSaving(true);
            setErrorMessage(null);
            try {
                await onSaveUrl('');
                setSavedUrl('');
                setUrlInput('');
                setIsEditing(true);
                setSuccessMessage('Lien supprimé.');
                setTimeout(() => setSuccessMessage(null), 3000);
            } catch (err: any) {
                setErrorMessage(err?.message || 'Erreur lors de la suppression.');
            } finally {
                setSaving(false);
            }
        }
    };

    return (
        <div className="patient-onyxceph-container" onClick={(e) => e.stopPropagation()}>
            <div className="patient-onyxceph-header">
                <div className="onyxceph-badge-logo">
                    <img src={logoOnyxceph} alt="OnyxCeph Logo" className="onyxceph-header-logo-img" />
                </div>
                <div>
                    <div className="onyxceph-title-row">
                        <h2 className="onyxceph-title">Espace OnyxCeph</h2>
                        <span className="onyxceph-tag">OnyxCeph 3D / Labo</span>
                    </div>
                    <p className="onyxceph-subtitle">
                        Lien direct vers le dossier OnyxCeph et clichés 3D pour <strong>{patientName}</strong>.
                    </p>
                </div>
            </div>

            {successMessage && (
                <div className="om-notice om-notice--success animate-fade-in" role="status">
                    <Icon name="check" size={16} />
                    <span>{successMessage}</span>
                </div>
            )}

            {errorMessage && (
                <div className="om-notice om-notice--danger animate-fade-in" role="alert">
                    <Icon name="alert" size={16} />
                    <span>{errorMessage}</span>
                </div>
            )}

            {isEditing ? (
                <form
                    className="onyxceph-form-card"
                    onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSave(e);
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="onyxceph-form-header">
                        <h3 className="onyxceph-form-title">
                            <Icon name="edit" size={16} />
                            {savedUrl ? 'Modifier le lien OnyxCeph' : 'Ajouter un lien OnyxCeph'}
                        </h3>
                        <p className="onyxceph-form-desc">
                            Collez ci-dessous le lien web OnyxCeph (ex: dossier en ligne, partage 3D, viewer).
                        </p>
                    </div>

                    <div className="onyxceph-input-group">
                        <label htmlFor="onyxceph-url-input" className="om-label">
                            URL OnyxCeph
                        </label>
                        <div className="onyxceph-input-wrapper">
                            <Icon name="link" className="input-icon" size={18} />
                            <input
                                id="onyxceph-url-input"
                                type="url"
                                className="om-input onyxceph-url-input"
                                placeholder="https://onyxceph.online/case/..."
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="onyxceph-form-actions">
                        {savedUrl && (
                            <button
                                type="button"
                                className="om-btn om-btn--ghost"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setUrlInput(savedUrl);
                                    setIsEditing(false);
                                }}
                                disabled={saving}
                            >
                                Annuler
                            </button>
                        )}
                        <button
                            type="submit"
                            className="om-btn om-btn--primary"
                            disabled={saving || !urlInput.trim()}
                        >
                            <Icon name="check" size={16} />
                            {saving ? 'Enregistrement…' : 'Enregistrer le lien'}
                        </button>
                    </div>
                </form>
            ) : (
                <div className="onyxceph-link-card" onClick={(e) => e.stopPropagation()}>
                    <div className="onyxceph-card-main">
                        <div className="onyxceph-status-icon">
                            <Icon name="check" size={20} />
                        </div>
                        <div className="onyxceph-link-info">
                            <span className="om-label">Lien enregistré</span>
                            <a
                                href={savedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="onyxceph-display-url"
                                title={savedUrl}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {savedUrl}
                            </a>
                        </div>
                    </div>

                    <div className="onyxceph-actions-bar">
                        <a
                            href={savedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="om-btn om-btn--primary onyxceph-btn-main"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Icon name="externalLink" size={16} />
                            Ouvrir OnyxCeph
                        </a>

                        <button
                            type="button"
                            className="om-btn om-btn--secondary"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleCopy();
                            }}
                        >
                            <Icon name="copy" size={16} />
                            {copied ? 'Copié !' : 'Copier le lien'}
                        </button>

                        <button
                            type="button"
                            className="om-btn om-btn--ghost"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                            }}
                        >
                            <Icon name="edit" size={16} />
                            Modifier
                        </button>

                        <button
                            type="button"
                            className="om-btn om-btn--ghost om-btn--danger-text"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDelete();
                            }}
                            title="Supprimer le lien"
                        >
                            <Icon name="trash" size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientOnyxCeph;
