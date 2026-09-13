import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import logoSeul from '../assets/logo-seul.png';
import orthomindLogo from '../assets/orthomind-logo.png';
import casperLogoWelcome from '../assets/casper-logo-welcome.png';
import './PatientPortal.css';

interface PatientPortalProps {
    patientData?: {
        id: string;
        nom: string;
        prenom: string;
        dateNaissance?: string;
        telephone?: string;
        email?: string;
        praticien?: string;
    };
    onCloseImmersion?: () => void;
}

export const PatientPortal = ({ patientData, onCloseImmersion }: PatientPortalProps) => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const patientName = patientData ? `${patientData.prenom} ${patientData.nom}` : 'Robin MASINI';
    const patientFirstName = patientData ? patientData.prenom : 'Robin';
    const praticienName = patientData?.praticien || 'Dr. Renaud Desouches';

    // Questionnaire state
    const [motif, setMotif] = useState('alignement');
    const [douleur, setDouleur] = useState('non');
    const [remarque, setRemarque] = useState('');
    const [photoUploaded, setPhotoUploaded] = useState<string | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [activeTab, setActiveTab] = useState<'fiche' | 'suivi' | 'conseils'>('fiche');

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                setPhotoUploaded(event.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitted(true);
    };

    return (
        <div className="patient-portal-container">
            {/* Immersion Header Bar */}
            <div className="immersion-top-bar">
                <div className="immersion-badge">
                    <span className="live-dot"></span>
                    <strong>MODE IMMERSION PATIENT</strong> — Lien sécurisé Vonage généré pour <span>{patientName}</span>
                </div>
                {onCloseImmersion ? (
                    <button className="btn-close-immersion" onClick={onCloseImmersion}>
                        ✖ Quitter la vision patient
                    </button>
                ) : (
                    <button className="btn-close-immersion" onClick={() => navigate('/dashboard')}>
                        ← Retour à l'Espace Praticien
                    </button>
                )}
            </div>

            {/* Mobile / Portal Card Wrapper */}
            <div className="portal-content-card">

                {/* Header Logo & Welcome */}
                <div className="portal-header">
                    <div className="portal-brand">
                        <img src={logoSeul} alt="OrthoMind" className="portal-logo" />
                        <div>
                            <h1>OrthoMind</h1>
                            <span>Portail Sécurisé Patient</span>
                        </div>
                    </div>
                    <div className="patient-welcome-chip">
                        <span>Patient :</span> <strong>{patientName}</strong>
                    </div>
                </div>

                {/* Welcome Card Banner with Casper Robot Mascot */}
                <div className="portal-notice-card">
                    <div className="robot-badge-wrapper">
                        <img src={casperLogoWelcome} alt="Casper Robot Mascot" className="robot-mascot-img" />
                    </div>
                    <div className="portal-notice-text">
                        <h2 className="patient-greeting-title">
                            Bonjour {patientFirstName}, bienvenue sur votre espace de suivi !
                        </h2>
                        <p className="patient-greeting-subtitle">
                            Complétez votre fiche de suivi orthodontique en direct avec le cabinet du <strong>{praticienName}</strong>.
                        </p>
                    </div>
                </div>

                {/* Portal Tabs */}
                <div className="portal-nav-tabs">
                    <button
                        className={`portal-tab-btn ${activeTab === 'fiche' ? 'active' : ''}`}
                        onClick={() => setActiveTab('fiche')}
                    >
                        📝 Ma Fiche & Bilan
                    </button>
                    <button
                        className={`portal-tab-btn ${activeTab === 'suivi' ? 'active' : ''}`}
                        onClick={() => setActiveTab('suivi')}
                    >
                        📸 Photo de Suivi
                    </button>
                    <button
                        className={`portal-tab-btn ${activeTab === 'conseils' ? 'active' : ''}`}
                        onClick={() => setActiveTab('conseils')}
                    >
                        🩺 Conseils Praticien
                    </button>
                </div>

                {/* Submission Success Screen */}
                {isSubmitted ? (
                    <div className="portal-success-card">
                        <div className="success-icon-badge">✓</div>
                        <h2>Fiche transmise avec succès !</h2>
                        <p>Merci {patientFirstName}, vos informations et votre cliché de suivi ont été transmis au cabinet du <strong>{praticienName}</strong>.</p>
                        
                        <div className="success-summary-box">
                            <div className="summary-row">
                                <span>Motif principal :</span>
                                <strong>{motif === 'alignement' ? 'Alignement des dents / Gouttières' : motif === 'esthetique' ? 'Esthétique du sourire' : 'Douleurs ou chevauchement'}</strong>
                            </div>
                            <div className="summary-row">
                                <span>Statut photo :</span>
                                <strong style={{ color: photoUploaded ? '#10b981' : '#f59e0b' }}>
                                    {photoUploaded ? '✓ Cliché de suivi transmis' : 'Aucune photo jointe'}
                                </strong>
                            </div>
                            <div className="summary-row">
                                <span>Prochain RDV :</span>
                                <strong>Séance de contrôle gouttière à venir</strong>
                            </div>
                        </div>

                        <button className="btn-submit-portal-white" onClick={() => setIsSubmitted(false)}>
                            ✏️ Modifier mes informations
                        </button>
                    </div>
                ) : (
                    <>
                        {/* TAB 1: FICHE & QUESTIONNAIRE */}
                        {activeTab === 'fiche' && (
                            <form onSubmit={handleSubmit} className="portal-form">
                                <div className="portal-section-title">
                                    <h3>1. Vos Constantes de Santé Dentaire</h3>
                                    <p>Vérifiez et renseignez vos informations avant votre séance.</p>
                                </div>

                                <div className="portal-form-group">
                                    <label>Motif principal de votre suivi :</label>
                                    <select value={motif} onChange={(e) => setMotif(e.target.value)}>
                                        <option value="alignement">🦷 Alignement des dents & Traitement par gouttières</option>
                                        <option value="esthetique">✨ Amélioration de l'esthétique du sourire</option>
                                        <option value="douleur">⚠️ Douleur dentaire ou gêne lors de la mastication</option>
                                        <option value="contention">🔒 Suivi de contention / Reteneur post-traitement</option>
                                    </select>
                                </div>

                                <div className="portal-form-group">
                                    <label>Ressentez-vous une sensibilité ou douleur récente ?</label>
                                    <div className="radio-group-options">
                                        <label className={`radio-pill ${douleur === 'non' ? 'active' : ''}`}>
                                            <input type="radio" name="douleur" value="non" checked={douleur === 'non'} onChange={() => setDouleur('non')} />
                                            <span>🟢 Non, aucune gêne</span>
                                        </label>
                                        <label className={`radio-pill ${douleur === 'legere' ? 'active' : ''}`}>
                                            <input type="radio" name="douleur" value="legere" checked={douleur === 'legere'} onChange={() => setDouleur('legere')} />
                                            <span>🟡 Gêne légère sur les gouttières</span>
                                        </label>
                                        <label className={`radio-pill ${douleur === 'forte' ? 'active' : ''}`}>
                                            <input type="radio" name="douleur" value="forte" checked={douleur === 'forte'} onChange={() => setDouleur('forte')} />
                                            <span>🔴 Douleur sensible à signaler</span>
                                        </label>
                                    </div>
                                </div>

                                <div className="portal-form-group">
                                    <label>Remarques ou questions pour le {praticienName} :</label>
                                    <textarea
                                        rows={3}
                                        value={remarque}
                                        onChange={(e) => setRemarque(e.target.value)}
                                        placeholder="Ex: J'ai changé de gouttière la semaine dernière, tout se passe bien..."
                                    />
                                </div>

                                <button type="submit" className="btn-submit-portal-white">
                                    <img src={logoSeul} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                                    Transmettre ma fiche au cabinet
                                </button>
                            </form>
                        )}

                        {/* TAB 2: PHOTO DE SUIVI */}
                        {activeTab === 'suivi' && (
                            <div className="portal-section-photo">
                                <div className="portal-section-title">
                                    <h3>2. Cliché de Suivi du Sourire</h3>
                                    <p>Prenez une photo nette de vos dents de face pour l'analyse de votre praticien.</p>
                                </div>

                                <div className="photo-upload-box">
                                    {photoUploaded ? (
                                        <div className="photo-preview-container">
                                            <img src={photoUploaded} alt="Suivi sourire" className="photo-preview-img" />
                                            <button className="btn-change-photo" onClick={() => setPhotoUploaded(null)}>
                                                🔄 Changer la photo
                                            </button>
                                        </div>
                                    ) : (
                                        <label className="upload-dropzone">
                                            <span className="upload-icon">📸</span>
                                            <strong>Prendre une photo ou sélectionner une image</strong>
                                            <span>Glissez un fichier ou cliquez ici (Sourire de face)</span>
                                            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: 'none' }} />
                                        </label>
                                    )}
                                </div>

                                <button className="btn-submit-portal-white" onClick={() => setActiveTab('fiche')}>
                                    Continuer vers la transmission →
                                </button>
                            </div>
                        )}

                        {/* TAB 3: CONSEILS PRATICIEN */}
                        {activeTab === 'conseils' && (
                            <div className="portal-section-conseils">
                                <div className="portal-section-title">
                                    <h3>3. Recommandations de votre Orthodontiste</h3>
                                    <p>Protocole personnalisé rédigé par le {praticienName}.</p>
                                </div>

                                <div className="conseils-card-list">
                                    <div className="conseil-item">
                                        <div className="conseil-badge">⏱️ Temps de port</div>
                                        <strong>22 Heures par jour</strong>
                                        <p>Retirez vos aligneurs uniquement pendant les repas et le brossage des dents.</p>
                                    </div>
                                    <div className="conseil-item">
                                        <div className="conseil-badge">🪥 Hygiène dentaire</div>
                                        <strong>Brossage rigoureux</strong>
                                        <p>Brossez-vous les dents après chaque repas avant de remettre vos gouttières.</p>
                                    </div>
                                    <div className="conseil-item">
                                        <div className="conseil-badge">📅 Changement d'aligneur</div>
                                        <strong>Toutes les 2 semaines</strong>
                                        <p>Passer au jeu de gouttières suivant le dimanche soir selon votre calendrier.</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Footer Brand */}
                <div className="portal-footer">
                    <img src={orthomindLogo} alt="OrthoMind" className="footer-logo" />
                    <span>Propulsé par OrthoMind — Sécurité et Confidentialité Données Santé</span>
                </div>
            </div>
        </div>
    );
};

export default PatientPortal;

