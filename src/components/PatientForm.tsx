import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Patient, createPatient, updatePatient } from '../services/patientService';
import { extractPatientFromOrthoLeader } from '../services/geminiService';
import './PatientForm.css';

interface PatientFormProps {
    onClose: () => void;
    onSuccess: (patient: Patient, smsSent?: boolean) => void;
    initialPatient?: Patient | null;
}

const PatientForm = ({ onClose, onSuccess, initialPatient }: PatientFormProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showSmsSuccessModal, setShowSmsSuccessModal] = useState(false);
    const [createdPatientData, setCreatedPatientData] = useState<Patient | null>(null);

    const [formData, setFormData] = useState<Partial<Patient>>(() => {
        if (initialPatient) {
            return {
                civilite: initialPatient.civilite || 'M.',
                nom: initialPatient.nom || '',
                prenom: initialPatient.prenom || '',
                date_naissance: initialPatient.date_naissance || '',
                responsable_num_secu: initialPatient.responsable_num_secu || '',
                email: initialPatient.email || '',
                portable: initialPatient.portable || initialPatient.telephone || '',
                sexe: initialPatient.sexe || 'M',
                type_patient: initialPatient.type_patient || 'Adulte',
                praticien: initialPatient.praticien || 'Dr. Renaud Desouches',
                suivi_exclusif: initialPatient.suivi_exclusif || false
            };
        }
        return {
            nom: '',
            prenom: '',
            date_naissance: '',
            responsable_num_secu: '',
            email: '',
            portable: '',
            civilite: 'M.',
            sexe: 'M',
            type_patient: 'Adulte',
            praticien: 'Dr. Renaud Desouches',
            suivi_exclusif: false
        };
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Import d'une photo de la fiche OrthoLeader : pré-remplit nom, prénom, naissance et portable
    const orthoLeaderInputRef = useRef<HTMLInputElement>(null);
    const [isReadingOrthoLeader, setIsReadingOrthoLeader] = useState(false);
    const [orthoLeaderStatus, setOrthoLeaderStatus] = useState('');

    const handleOrthoLeaderFile = async (file?: File) => {
        if (!file) return;
        setError('');
        setOrthoLeaderStatus('');
        setIsReadingOrthoLeader(true);
        try {
            const fields = await extractPatientFromOrthoLeader(file);
            const filled = Object.entries(fields).filter(([, v]) => v);
            if (filled.length === 0) throw new Error("Aucune information lisible sur cette photo de la fiche OrthoLeader.");
            setFormData(prev => ({ ...prev, ...Object.fromEntries(filled) }));
            setOrthoLeaderStatus(filled.length === 4
                ? 'Fiche OrthoLeader lue : vérifiez les champs avant d’enregistrer.'
                : 'Fiche OrthoLeader lue en partie : complétez les champs restés vides.');
        } catch (e: any) {
            setError(e.message || 'Lecture de la fiche OrthoLeader impossible.');
        } finally {
            setIsReadingOrthoLeader(false);
            if (orthoLeaderInputRef.current) orthoLeaderInputRef.current.value = '';
        }
    };

    const handleSave = async (sendSms: boolean) => {
        setError('');
        setIsLoading(true);

        if (!formData.nom || !formData.prenom || !formData.date_naissance || !formData.portable) {
            setError('Veuillez remplir les champs obligatoires : Nom, Prénom, Date de naissance et Téléphone Portable.');
            setIsLoading(false);
            return;
        }

        const patientDataToSave: Patient = {
            ...initialPatient,
            civilite: formData.civilite || 'M.',
            nom: formData.nom.trim(),
            prenom: formData.prenom.trim(),
            date_naissance: formData.date_naissance!,
            sexe: formData.sexe || 'M',
            type_patient: formData.type_patient || 'Adulte',
            praticien: formData.praticien || 'Dr. Renaud Desouches',
            portable: formData.portable.trim(),
            telephone: formData.portable.trim(),
            email: formData.email ? formData.email.trim() : '',
            responsable_num_secu: formData.responsable_num_secu ? formData.responsable_num_secu.trim() : '',
            suivi_exclusif: formData.suivi_exclusif || false
        };

        try {
            let resData: Patient | null = null;
            let apiErr: any = null;

            if (initialPatient?.id) {
                resData = await updatePatient(initialPatient.id, patientDataToSave);
            } else {
                const { data, error: errRes } = await createPatient(patientDataToSave);
                resData = data;
                apiErr = errRes;
            }

            setIsLoading(false);

            if (resData) {
                if (sendSms && !initialPatient) {
                    setCreatedPatientData(resData);
                    setShowSmsSuccessModal(true);
                } else {
                    onSuccess(resData, false);
                }
            } else {
                setError(apiErr?.message || 'Erreur lors de l\'enregistrement de la fiche patient.');
            }
        } catch (err: any) {
            setIsLoading(false);
            setError(`Erreur inattendue : ${err.message || String(err)}`);
        }
    };

    const handleConfirmSmsSent = () => {
        if (createdPatientData) {
            onSuccess(createdPatientData, true);
        }
        setShowSmsSuccessModal(false);
    };

    return createPortal(
        <div className="patient-form-overlay" onClick={onClose}>
            <div className="patient-form-modal simplified-patient-modal" onClick={(e) => e.stopPropagation()}>
                
                {/* Header */}
                <div className="form-header">
                    <div>
                        <h2>{initialPatient ? '✏️ MODIFICATION FICHE PATIENT' : '👤 CRÉATION FICHE PATIENT SIMPLIFIÉE'}</h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {initialPatient ? 'Modification des données du patient' : 'Portail Praticien OrthoMind — Renseignement des 6 constantes essentielles'}
                        </p>
                    </div>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                {!showSmsSuccessModal ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleSave(!initialPatient); }}>
                        {!initialPatient && (
                            <div
                                className={`ortholeader-uploader ${isReadingOrthoLeader ? 'is-busy' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => !isReadingOrthoLeader && orthoLeaderInputRef.current?.click()}
                                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isReadingOrthoLeader) orthoLeaderInputRef.current?.click(); }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => { e.preventDefault(); handleOrthoLeaderFile(e.dataTransfer.files?.[0]); }}
                            >
                                <input
                                    ref={orthoLeaderInputRef}
                                    type="file"
                                    accept="image/*,.heic,.HEIC,.heif,.HEIF"
                                    hidden
                                    onChange={(e) => handleOrthoLeaderFile(e.target.files?.[0])}
                                />
                                <div className="ortholeader-uploader-icon">🗂️</div>
                                <div className="ortholeader-uploader-text">
                                    <strong>{isReadingOrthoLeader ? 'Lecture de la fiche OrthoLeader…' : 'Importer la fiche OrthoLeader'}</strong>
                                    <span>Photo ou capture de la fiche administrative : nom, prénom, date de naissance et portable sont remplis automatiquement.</span>
                                </div>
                            </div>
                        )}
                        {orthoLeaderStatus && <div className="ortholeader-status">{orthoLeaderStatus}</div>}
                        {error && <div className="form-error">{error}</div>}

                        {/* Vonage SMS Banner Info (seulement lors de la création) */}
                        {!initialPatient && (
                            <div className="vonage-sms-notice-banner">
                                <div className="vonage-sms-icon">📲</div>
                                <div className="vonage-sms-text">
                                    <strong>Envoi automatique du lien personnel par SMS (Vonage Sender ID "OrthoMind")</strong>
                                    <span>Le patient recevra son lien sécurisé personnel pour compléter sa fiche et suivre son traitement.</span>
                                </div>
                            </div>
                        )}

                        <div className="simplified-form-grid">
                            {/* Nom */}
                            <div className="form-group">
                                <label>Nom de famille *</label>
                                <input
                                    type="text"
                                    name="nom"
                                    value={formData.nom}
                                    onChange={handleChange}
                                    placeholder="ex: DUPONT"
                                    required
                                />
                            </div>

                            {/* Prénom */}
                            <div className="form-group">
                                <label>Prénom *</label>
                                <input
                                    type="text"
                                    name="prenom"
                                    value={formData.prenom}
                                    onChange={handleChange}
                                    placeholder="ex: Jean"
                                    required
                                />
                            </div>

                            {/* Date de naissance */}
                            <div className="form-group">
                                <label>Date de naissance *</label>
                                <input
                                    type="date"
                                    name="date_naissance"
                                    value={formData.date_naissance}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            {/* Numéro de sécurité sociale */}
                            <div className="form-group">
                                <label>Numéro de Sécurité Sociale (NIR)</label>
                                <input
                                    type="text"
                                    name="responsable_num_secu"
                                    value={formData.responsable_num_secu}
                                    onChange={handleChange}
                                    placeholder="1 85 06 75 108 123 45"
                                />
                            </div>

                            {/* Email */}
                            <div className="form-group">
                                <label>Adresse E-mail</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="patient@exemple.fr"
                                />
                            </div>

                            {/* Téléphone Portable */}
                            <div className="form-group">
                                <label>Téléphone Portable *</label>
                                <input
                                    type="tel"
                                    name="portable"
                                    value={formData.portable}
                                    onChange={handleChange}
                                    placeholder="06 12 34 56 78"
                                    required
                                />
                            </div>
                        </div>

                        {/* Form Action Buttons */}
                        <div className="simplified-form-actions">
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={onClose}
                                disabled={isLoading}
                            >
                                Annuler
                            </button>

                            {initialPatient ? (
                                <button
                                    type="button"
                                    className="btn-sms-submit"
                                    onClick={() => handleSave(false)}
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Enregistrement…' : 'Enregistrer les modifications ✓'}
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        className="btn-secondary-save"
                                        onClick={() => handleSave(false)}
                                        disabled={isLoading}
                                    >
                                        Enregistrer uniquement
                                    </button>

                                    <button
                                        type="button"
                                        className="btn-sms-submit"
                                        onClick={() => handleSave(true)}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            'Création en cours...'
                                        ) : (
                                            <>
                                                📲 Enregistrer & Envoyer le lien par SMS (Vonage)
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </form>
                ) : (
                    /* Vonage SMS Confirmation Modal View */
                    <div className="sms-sent-confirmation-card">
                        <div className="sms-sent-icon">💬</div>
                        <h3>SMS d'Invitation Envoyé via Vonage (Sender ID "OrthoMind")</h3>
                        <p>
                            Le lien d'accès personnel et sécurisé a été généré et transmis au <strong>{createdPatientData?.portable}</strong> pour le patient <strong>{createdPatientData?.nom} {createdPatientData?.prenom}</strong>.
                        </p>

                        <div className="patient-link-preview-box">
                            <span className="link-label">Lien unique généré pour le patient :</span>
                            <code className="generated-url">
                                https://orthomind.app/patient/suivi-{createdPatientData?.id?.slice(-8) || '7f89a2b1'}
                            </code>
                        </div>

                        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                            <button className="btn-sms-submit" onClick={handleConfirmSmsSent}>
                                Accéder à la Fiche Patient ✓
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    , document.body);
};

export default PatientForm;

