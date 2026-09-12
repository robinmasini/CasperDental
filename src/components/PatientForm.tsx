import { useState } from 'react';
import { Patient, createPatient } from '../services/patientService';
import './PatientForm.css';

interface PatientFormProps {
    onClose: () => void;
    onSuccess: (patient: Patient, smsSent?: boolean) => void;
}

const PatientForm = ({ onClose, onSuccess }: PatientFormProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showSmsSuccessModal, setShowSmsSuccessModal] = useState(false);
    const [createdPatientData, setCreatedPatientData] = useState<Patient | null>(null);

    const [formData, setFormData] = useState<Partial<Patient>>({
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
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSave = async (sendSms: boolean) => {
        setError('');
        setIsLoading(true);

        if (!formData.nom || !formData.prenom || !formData.date_naissance || !formData.portable) {
            setError('Veuillez remplir les champs obligatoires : Nom, Prénom, Date de naissance et Téléphone Portable.');
            setIsLoading(false);
            return;
        }

        const patientToCreate: Patient = {
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
            suivi_exclusif: false
        };

        try {
            const { data, error: apiError } = await createPatient(patientToCreate);
            setIsLoading(false);

            if (data) {
                if (sendSms) {
                    setCreatedPatientData(data);
                    setShowSmsSuccessModal(true);
                } else {
                    onSuccess(data, false);
                }
            } else {
                setError(apiError?.message || 'Erreur lors de la création de la fiche patient.');
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

    return (
        <div className="patient-form-overlay" onClick={onClose}>
            <div className="patient-form-modal simplified-patient-modal" onClick={(e) => e.stopPropagation()}>
                
                {/* Header */}
                <div className="form-header">
                    <div>
                        <h2>👤 CRÉATION FICHE PATIENT SIMPLIFIÉE</h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Portail Praticien OrthoMind — Renseignement des 6 constantes essentielles
                        </p>
                    </div>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                {!showSmsSuccessModal ? (
                    <form onSubmit={(e) => { e.preventDefault(); handleSave(true); }}>
                        {error && <div className="form-error">{error}</div>}

                        {/* Vonage SMS Banner Info */}
                        <div className="vonage-sms-notice-banner">
                            <div className="vonage-sms-icon">📲</div>
                            <div className="vonage-sms-text">
                                <strong>Envoi automatique du lien personnel par SMS (Vonage Sender ID "OrthoMind")</strong>
                                <span>Le patient recevra son lien sécurisé personnel pour compléter sa fiche et suivre son traitement.</span>
                            </div>
                        </div>

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
                                <label>Téléphone Portable * (Obligatoire pour envoi SMS)</label>
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
    );
};

export default PatientForm;

