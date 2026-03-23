import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Patient, Message } from '../types';
import './Summary.css';

interface LocationState {
    patient: Partial<Patient>;
    request: any;
    messages: Message[];
}

const Summary = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state as LocationState | null;

    // Extract appointment info from state or use placeholders
    const appointment = {
        date: state?.request?.preferredDate || 'À confirmer',
        time: state?.request?.preferredTime || '--:--',
        type: state?.request?.requestType === 'urgency' ? 'Urgence' : 'Consultation',
        doctor: 'Le cabinet',
    };

    // Extract summary from conversation
    const extractSummary = () => {
        if (!state?.messages) return 'Consultation dentaire';

        const userMessages = state.messages
            .filter(m => m.role === 'user')
            .map(m => m.content)
            .join(' ');

        if (userMessages.toLowerCase().includes('douleur')) {
            return 'Douleur dentaire - Consultation requise';
        }
        if (userMessages.toLowerCase().includes('urgence')) {
            return 'Urgence dentaire - Prise en charge prioritaire';
        }
        if (userMessages.toLowerCase().includes('contrôle')) {
            return 'Contrôle de routine - Détartrage';
        }

        return 'Consultation dentaire générale';
    };

    const handleCopy = () => {
        const summaryText = `
RENDEZ-VOUS MÉDICAL - Casper Dental
================================

Patient: ${state?.patient?.firstName || 'Non renseigné'} ${state?.patient?.lastName || ''}
Téléphone: ${state?.patient?.phone || 'Non renseigné'}

Date: ${appointment.date}
Heure: ${appointment.time}
Praticien: ${appointment.doctor}

Motif: ${extractSummary()}

---
Généré par Casper Dental
    `.trim();

        navigator.clipboard.writeText(summaryText);
        alert('Récapitulatif copié dans le presse-papier !');
    };

    const handleExportPDF = () => {
        // For demo purposes, we'll open print dialog
        window.print();
    };

    const handleNewConversation = () => {
        navigate('/chat');
    };

    return (
        <div className="summary-page">
            {/* Header */}
            <header className="summary-header">
                <Link to="/" className="back-link">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    Accueil
                </Link>
                <div className="header-title">
                    <span className="logo-icon">🩺</span>
                    <span>Medical<span className="logo-accent">Flow</span></span>
                </div>
                <div style={{ width: 80 }}></div>
            </header>

            {/* Summary Content */}
            <div className="summary-wrapper">
                <div className="summary-container">
                    {/* Success Banner */}
                    <div className="success-banner">
                        <div className="success-icon">✅</div>
                        <div className="success-text">
                            <h2>Demande de rendez-vous reçue !</h2>
                            <p>Le secrétariat vous contactera pour confirmer le créneau</p>
                        </div>
                    </div>

                    {/* Summary Card */}
                    <div className="summary-card">
                        <div className="card-header">
                            <h3>📋 Récapitulatif du rendez-vous</h3>
                        </div>

                        <div className="card-content">
                            {/* Patient Info */}
                            <div className="info-section">
                                <h4>👤 Patient</h4>
                                <div className="info-grid">
                                    <div className="info-item">
                                        <span className="info-label">Nom</span>
                                        <span className="info-value">
                                            {state?.patient?.firstName || 'Non renseigné'} {state?.patient?.lastName || ''}
                                        </span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">Téléphone</span>
                                        <span className="info-value">{state?.patient?.phone || 'Non renseigné'}</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">Statut</span>
                                        <span className="info-value">
                                            <span className={`badge ${state?.patient?.isNew ? 'badge-new' : 'badge-existing'}`}>
                                                {state?.patient?.isNew ? 'Nouveau patient' : 'Patient existant'}
                                            </span>
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Appointment Info */}
                            <div className="info-section">
                                <h4>📅 Rendez-vous</h4>
                                <div className="info-grid">
                                    <div className="info-item">
                                        <span className="info-label">Date</span>
                                        <span className="info-value">{appointment.date}</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">Heure</span>
                                        <span className="info-value highlight">{appointment.time}</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">Praticien</span>
                                        <span className="info-value">{appointment.doctor}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Request Summary */}
                            <div className="info-section">
                                <h4>📝 Motif de consultation</h4>
                                <div className="motif-box">
                                    <p>{extractSummary()}</p>
                                </div>
                            </div>

                            {/* Conversation Summary */}
                            {state?.messages && state.messages.length > 2 && (
                                <div className="info-section">
                                    <h4>💬 Résumé de l'échange</h4>
                                    <div className="conversation-summary">
                                        {state.messages
                                            .filter(m => m.role === 'user')
                                            .slice(0, 3)
                                            .map((m, i) => (
                                                <div key={i} className="summary-message">
                                                    <span className="message-label">Patient :</span>
                                                    <span className="message-content">"{m.content}"</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="card-actions">
                            <button className="btn btn-secondary" onClick={handleCopy}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                Copier
                            </button>
                            <button className="btn btn-secondary" onClick={handleExportPDF}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Exporter PDF
                            </button>
                            <button className="btn btn-primary" onClick={handleNewConversation}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                Nouvelle conversation
                            </button>
                        </div>
                    </div>

                    {/* Important Notice */}
                    <div className="notice">
                        <div className="notice-icon">ℹ️</div>
                        <div className="notice-content">
                            <strong>Rappel important</strong>
                            <p>
                                Présentez-vous 10 minutes avant l'heure de votre rendez-vous.
                                En cas d'empêchement, merci de nous prévenir au moins 24h à l'avance.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print-only content */}
            <div className="print-only">
                <div className="print-header">
                    <h1>🩺 Casper Dental</h1>
                    <p>Confirmation de rendez-vous</p>
                </div>
            </div>
        </div>
    );
};

export default Summary;
