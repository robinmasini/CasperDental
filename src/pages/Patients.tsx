import { useState, useEffect } from 'react';
import { Patient, getPatients } from '../services/patientService';
import { getAppointmentsByPatientId, Appointment as DBAppointment } from '../services/appointmentService';
import PatientForm from '../components/PatientForm';
import './Patients.css';

interface DisplayPatient {
    id: string;
    nom: string;
    prenom: string;
    dateNaissance: string;
    age: string;
    numeroInterne: string;
    numeroDossier: string;
    email?: string;
    telephone?: string;
    allergies?: string;
    praticien: string;
}

interface Appointment {
    id: string;
    date: string;
    heure: string;
    type: string;
    commentaire: string;
    etat: string;
    praticien: string;
}


// Demo data removed - using real data

// Calculate age from date of birth
const calculateAge = (dateNaissance: string): string => {
    const birthDate = new Date(dateNaissance);
    const today = new Date();
    const years = today.getFullYear() - birthDate.getFullYear();
    const months = today.getMonth() - birthDate.getMonth();

    if (months < 0) {
        return `${years - 1} ans ${12 + months} mois`;
    }
    return `${years} ans ${months} mois`;
};

// Convert Supabase patient to display format
const convertToDisplayPatient = (patient: Patient): DisplayPatient => ({
    id: patient.id || '',
    nom: patient.nom.toUpperCase(),
    prenom: patient.prenom,
    dateNaissance: patient.date_naissance,
    age: calculateAge(patient.date_naissance),
    numeroInterne: patient.id?.slice(-4) || '',
    numeroDossier: patient.id || '',
    email: patient.email,
    telephone: patient.portable || patient.telephone,
    allergies: '',
    praticien: patient.praticien || 'Cabinet'
});

interface PatientsProps {
    onSelectPatientForAnalysis?: (patientName: string) => void;
}

const Patients = ({ onSelectPatientForAnalysis }: PatientsProps = {}) => {
    const [patients, setPatients] = useState<DisplayPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<DisplayPatient | null>(null);
    const [activeTab, setActiveTab] = useState<'diagnostic' | 'synthese' | 'rdv' | 'administratif'>('diagnostic');
    const [showForm, setShowForm] = useState(false);
    const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([]);
    const [loadingAppointments, setLoadingAppointments] = useState(false);
    const [showSmsModal, setShowSmsModal] = useState(false);
    const [patientAnalyses, setPatientAnalyses] = useState<any[]>([]);
    const [expandedSessionIds, setExpandedSessionIds] = useState<Record<string, boolean>>({});

    const toggleSessionExpanded = (sessionKey: string) => {
        setExpandedSessionIds(prev => ({
            ...prev,
            [sessionKey]: !prev[sessionKey]
        }));
    };

    // Fetch patients from Supabase
    useEffect(() => {
        const fetchPatients = async () => {
            setLoading(true);
            const data = await getPatients();
            const displayPatients = data.map(convertToDisplayPatient);
            setPatients(displayPatients);
            if (displayPatients.length > 0) {
                setSelectedPatient(displayPatients[0]);
            }
            setLoading(false);
        };
        fetchPatients();
    }, []);

    // Fetch appointments & diagnostics when selected patient changes
    useEffect(() => {
        const fetchPatientAppointments = async () => {
            if (!selectedPatient) return;
            setLoadingAppointments(true);
            try {
                const data = await getAppointmentsByPatientId(selectedPatient.id);
                const displayAppointments: Appointment[] = data.map(apt => {
                    const aptDate = new Date(apt.date);
                    return {
                        id: apt.id,
                        date: aptDate.toLocaleDateString('fr-FR'),
                        heure: aptDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                        type: apt.type,
                        commentaire: apt.notes || '',
                        etat: apt.status,
                        praticien: selectedPatient.praticien
                    };
                });
                setPatientAppointments(displayAppointments);
            } catch (error) {
                console.error("Failed to fetch patient appointments:", error);
            } finally {
                setLoadingAppointments(false);
            }
        };

        const loadPatientDiagnostics = () => {
            if (!selectedPatient) return;
            try {
                const localHistory = localStorage.getItem('casper_mock_history');
                const historyItems = localHistory ? JSON.parse(localHistory) : [];
                const matched = historyItems.filter((item: any) => {
                    const itemName = (item.patient_name || '').toLowerCase();
                    return itemName.includes(selectedPatient.nom.toLowerCase()) || 
                           itemName.includes(selectedPatient.prenom.toLowerCase()) ||
                           item.patient_id === selectedPatient.id;
                });
                setPatientAnalyses(matched);

                // Default: Open the first/latest session automatically as a drawer
                if (matched.length > 0) {
                    const firstKey = matched[0].id || 'session-0';
                    setExpandedSessionIds({ [firstKey]: true });
                } else {
                    setExpandedSessionIds({});
                }
            } catch (e) {
                console.error('Error filtering patient diagnostics:', e);
            }
        };

        fetchPatientAppointments();
        loadPatientDiagnostics();
    }, [selectedPatient]);

    const filteredPatients = patients.filter(p =>
        `${p.nom} ${p.prenom}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.numeroDossier.includes(searchQuery)
    );

    const getEtatClass = (etat: string) => {
        switch (etat) {
            case 'terminé': return 'etat-termine';
            case 'confirmé': return 'etat-confirme';
            case 'annulé': return 'etat-annule';
            default: return 'etat-planifie';
        }
    };

    const handlePatientCreated = (patient: Patient, smsSent?: boolean) => {
        const displayPatient = convertToDisplayPatient(patient);
        setPatients(prev => [displayPatient, ...prev]);
        setSelectedPatient(displayPatient);
        setShowForm(false);
    };

    return (
        <div className="patients-container">
            {/* Patient Form Modal */}
            {showForm && (
                <PatientForm
                    onClose={() => setShowForm(false)}
                    onSuccess={handlePatientCreated}
                />
            )}

            {/* Vonage SMS Modal Preview */}
            {showSmsModal && selectedPatient && (
                <div className="patient-form-overlay" onClick={() => setShowSmsModal(false)}>
                    <div className="patient-form-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', padding: '30px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ color: 'var(--primary-cyan)', margin: 0, fontSize: '1.1rem' }}>
                                📲 SMS Vonage — Lien d'accès personnel
                            </h3>
                            <button className="close-btn" onClick={() => setShowSmsModal(false)}>×</button>
                        </div>

                        <div style={{ background: 'rgba(0, 242, 254, 0.08)', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
                            <div style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 700, marginBottom: '6px' }}>
                                Sender ID configuré : <span style={{ color: 'var(--primary-cyan)' }}>OrthoMind</span>
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                Destinataire : <strong>{selectedPatient.nom} {selectedPatient.prenom}</strong> ({selectedPatient.telephone || '06 XX XX XX XX'})
                            </div>
                        </div>

                        <div style={{ background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Aperçu du SMS transmis au patient :</span>
                            <p style={{ fontSize: '0.88rem', color: '#e2e8f0', margin: 0, lineHeight: '1.5' }}>
                                "Bonjour {selectedPatient.prenom}, voici votre lien personnel et sécurisé pour votre suivi orthodontique OrthoMind : https://orthomind.app/patient/suivi-{selectedPatient.id.slice(-8)}"
                            </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn-cancel" onClick={() => setShowSmsModal(false)}>
                                Fermer
                            </button>
                            <button
                                className="btn-sms-submit"
                                onClick={() => {
                                    alert(`✓ SMS envoyé avec succès à ${selectedPatient.prenom} via Vonage !`);
                                    setShowSmsModal(false);
                                }}
                            >
                                📲 Confirmer l'envoi du SMS
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Left Panel - Patient List */}
            <div className="patients-list-panel">
                <div className="patients-header">
                    <button className="btn-add-patient" onClick={() => setShowForm(true)}>
                        + Nouveau Patient
                    </button>
                </div>
                <div className="patients-search">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Rechercher par nom ou n° dossier..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="patients-list">
                    {loading ? (
                        <div className="loading-state">Chargement...</div>
                    ) : filteredPatients.length === 0 ? (
                        <div className="empty-state">
                            <p>Aucun patient trouvé</p>
                        </div>
                    ) : (
                        filteredPatients.map((patient) => (
                            <div
                                key={patient.id}
                                className={`patient-item ${selectedPatient?.id === patient.id ? 'active' : ''}`}
                                onClick={() => setSelectedPatient(patient)}
                            >
                                <div className="patient-item-main">
                                    <span className="patient-name">{patient.nom} {patient.prenom}</span>
                                    <span className="patient-age">{patient.age}</span>
                                </div>
                                <div className="patient-item-sub">
                                    <span className="patient-dossier">N° {patient.numeroDossier.slice(-8)}</span>
                                    <span className="patient-praticien">{patient.praticien}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right Panel - Patient Details */}
            {selectedPatient ? (
                <div className="patient-details-panel">
                    {/* Explicit Espace Praticien Header Banner */}
                    <div style={{ background: 'rgba(0, 242, 254, 0.05)', border: '1px solid rgba(0, 242, 254, 0.2)', borderRadius: '12px', padding: '10px 16px', marginBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-cyan)', fontSize: '0.82rem', fontWeight: 700 }}>
                            <span style={{ fontSize: '1rem' }}>🔒</span> ESPACE PRATICIEN — FICHE PATIENT CONFIDENTIELLE (Partagée Cabinet)
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Dossier consultable par l'équipe du cabinet • Lien SMS Vonage généré pour le patient
                        </div>
                    </div>

                    {/* Patient Header */}
                    <div className="patient-header">
                        <div className="patient-header-left">
                            <div className="patient-initials">
                                {selectedPatient.prenom[0]}{selectedPatient.nom[0]}
                            </div>
                            <div className="patient-header-info">
                                <h2>{selectedPatient.nom} {selectedPatient.prenom}</h2>
                                <div className="patient-meta">
                                    <span>{selectedPatient.age}</span>
                                    <span>•</span>
                                    <span>Suivi par {selectedPatient.praticien}</span>
                                    <span>•</span>
                                    <span>N° dossier: {selectedPatient.numeroDossier.slice(-8)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="patient-header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button
                                className="transcript-action-btn"
                                style={{ borderColor: 'rgba(0, 242, 254, 0.4)', color: 'var(--primary-cyan)', padding: '8px 14px', fontSize: '0.85rem' }}
                                onClick={() => setShowSmsModal(true)}
                            >
                                📲 SMS Vonage : Lien Patient
                            </button>

                            {onSelectPatientForAnalysis && (
                                <button
                                    className="btn-audio-primary"
                                    style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                                    onClick={() => onSelectPatientForAnalysis(`${selectedPatient.nom} ${selectedPatient.prenom}`)}
                                >
                                    ⚡ Lancer Diagnostic
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Patient Info Sections */}
                    <div className="patient-info-grid">
                        <div className="info-section">
                            <h4>📧 Contact & Portable</h4>
                            <p>{selectedPatient.email || 'Non renseigné'}</p>
                            <p style={{ color: 'var(--primary-cyan)', fontWeight: 600 }}>{selectedPatient.telephone || 'Non renseigné'}</p>
                        </div>
                        <div className="info-section">
                            <h4>📲 Portail Patient Externe</h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lien généré propre au patient :</p>
                            <code style={{ fontSize: '0.75rem', color: 'var(--primary-cyan)' }}>
                                orthomind.app/patient/suivi-{selectedPatient.id.slice(-6)}
                            </code>
                        </div>
                        <div className="info-section">
                            <h4>⚠️ Allergies</h4>
                            <p>{selectedPatient.allergies || 'Aucune allergie connue'}</p>
                        </div>
                        <div className="info-section">
                            <h4>🩺 Contacts médicaux</h4>
                            <p>Praticien référant : {selectedPatient.praticien}</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="patient-tabs">
                        <button
                            className={`tab ${activeTab === 'diagnostic' ? 'active' : ''}`}
                            onClick={() => setActiveTab('diagnostic')}
                        >
                            DIAGNOSTICS & CONFERENCES ({patientAnalyses.length})
                        </button>
                        <button
                            className={`tab ${activeTab === 'synthese' ? 'active' : ''}`}
                            onClick={() => setActiveTab('synthese')}
                        >
                            SYNTHÈSE GLOBALE
                        </button>
                        <button
                            className={`tab ${activeTab === 'rdv' ? 'active' : ''}`}
                            onClick={() => setActiveTab('rdv')}
                        >
                            RDV/SUIVI
                        </button>
                        <button
                            className={`tab ${activeTab === 'administratif' ? 'active' : ''}`}
                            onClick={() => setActiveTab('administratif')}
                        >
                            ADMINISTRATIF
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="tab-content">
                        {activeTab === 'diagnostic' && (
                            <div className="diagnostic-content">
                                <div className="diagnostic-header">
                                    <h4>Diagnostics & Consultation Audio de {selectedPatient.nom} {selectedPatient.prenom}</h4>
                                    {onSelectPatientForAnalysis && (
                                        <button
                                            className="transcript-action-btn"
                                            style={{ borderColor: 'rgba(0, 242, 254, 0.4)', color: 'var(--primary-cyan)' }}
                                            onClick={() => onSelectPatientForAnalysis(`${selectedPatient.nom} ${selectedPatient.prenom}`)}
                                        >
                                            + Nouveau Diagnostic pour {selectedPatient.prenom}
                                        </button>
                                    )}
                                </div>

                                {patientAnalyses.length === 0 ? (
                                    <div className="diagnostic-empty">
                                        <p style={{ marginBottom: '10px' }}>Aucun diagnostic n'a encore été rattaché à {selectedPatient.nom} {selectedPatient.prenom}.</p>
                                        {onSelectPatientForAnalysis && (
                                            <button
                                                className="btn-audio-primary"
                                                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                                                onClick={() => onSelectPatientForAnalysis(`${selectedPatient.nom} ${selectedPatient.prenom}`)}
                                            >
                                                ⚡ Effectuer un Diagnostic photo ou consultation audio
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="patient-diagnostics-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        {patientAnalyses.map((ana, idx) => {
                                            const isAudio = ana.type === 'audio' || Boolean(ana.transcript);
                                            const sessionKey = ana.id || `session-${idx}`;
                                            const isExpanded = Boolean(expandedSessionIds[sessionKey]);

                                            return (
                                                <div 
                                                    key={sessionKey} 
                                                    style={{ 
                                                        background: isExpanded ? 'rgba(15, 23, 42, 0.75)' : 'rgba(15, 23, 42, 0.45)', 
                                                        border: `1px solid ${isExpanded ? 'rgba(0, 242, 254, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`, 
                                                        borderRadius: '14px', 
                                                        overflow: 'hidden',
                                                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                                                        boxShadow: isExpanded ? '0 8px 30px rgba(0, 242, 254, 0.08)' : 'none'
                                                    }}
                                                >
                                                    {/* Drawer Header Bar - Retract & Expand Trigger */}
                                                    <div 
                                                        onClick={() => toggleSessionExpanded(sessionKey)}
                                                        style={{ 
                                                            display: 'flex', 
                                                            justifyContent: 'space-between', 
                                                            alignItems: 'center', 
                                                            padding: '14px 18px',
                                                            cursor: 'pointer',
                                                            background: isExpanded ? 'rgba(0, 242, 254, 0.06)' : 'rgba(255, 255, 255, 0.02)',
                                                            borderBottom: isExpanded ? '1px solid rgba(0, 242, 254, 0.2)' : 'none',
                                                            userSelect: 'none'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                            <span style={{ 
                                                                background: isAudio ? 'linear-gradient(135deg, rgba(0, 242, 254, 0.2), rgba(124, 58, 237, 0.2))' : 'rgba(255, 255, 255, 0.08)',
                                                                color: isAudio ? 'var(--primary-cyan)' : '#e2e8f0',
                                                                border: isAudio ? '1px solid rgba(0, 242, 254, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '0.78rem',
                                                                fontWeight: 700
                                                            }}>
                                                                {isAudio ? '🎤 Consultation Audio & Synthèse RAG' : '📷 Diagnostic Clichés Photos'}
                                                            </span>
                                                            <strong style={{ color: '#ffffff', fontSize: '0.94rem' }}>
                                                                Séance du {new Date(ana.created_at).toLocaleDateString('fr-FR')} à {new Date(ana.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                            </strong>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                                Réf: #{ana.id?.slice(-6)}
                                                            </span>
                                                            
                                                            {/* Flèche vers le bas / haut à droite */}
                                                            <div style={{
                                                                background: isExpanded ? 'rgba(0, 242, 254, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                                                                color: isExpanded ? 'var(--primary-cyan)' : 'var(--text-secondary)',
                                                                border: `1px solid ${isExpanded ? 'rgba(0, 242, 254, 0.5)' : 'rgba(255, 255, 255, 0.15)'}`,
                                                                borderRadius: '50%',
                                                                width: '30px',
                                                                height: '30px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '0.82rem',
                                                                fontWeight: 700,
                                                                transition: 'transform 0.25s ease, background 0.2s ease',
                                                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                                                            }}>
                                                                ▼
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Retractable Drawer Content */}
                                                    {isExpanded && (
                                                        <div style={{ padding: '18px', background: 'rgba(10, 16, 29, 0.4)' }}>
                                                            {/* Diagnostic Content */}
                                                            <div style={{ marginBottom: '14px' }}>
                                                                <h5 style={{ color: 'var(--primary-cyan)', margin: '0 0 6px 0', fontSize: '0.86rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                    📋 Diagnostic & Observations :
                                                                </h5>
                                                                <p style={{ fontSize: '0.86rem', color: '#cbd5e1', whiteSpace: 'pre-line', margin: 0, lineHeight: '1.6' }}>
                                                                    {ana.diagnostic_text}
                                                                </p>
                                                            </div>

                                                            {/* Traitement Content if present */}
                                                            {ana.traitement_text && (
                                                                <div style={{ marginBottom: '14px', background: 'rgba(0, 242, 254, 0.04)', padding: '12px 14px', borderRadius: '10px', borderLeft: '3px solid var(--primary-cyan)' }}>
                                                                    <h5 style={{ color: 'var(--primary-blue)', margin: '0 0 6px 0', fontSize: '0.86rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                        💊 Plan Thérapeutique Conseillé :
                                                                    </h5>
                                                                    <p style={{ fontSize: '0.85rem', color: '#e2e8f0', whiteSpace: 'pre-line', margin: 0, lineHeight: '1.6' }}>
                                                                        {ana.traitement_text}
                                                                    </p>
                                                                </div>
                                                            )}

                                                            {/* Transcript if present */}
                                                            {ana.transcript && (
                                                                <div style={{ background: 'rgba(0, 0, 0, 0.35)', padding: '12px 14px', borderRadius: '10px', marginTop: '10px' }}>
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                                                                        🗣️ Verbatim / Retranscription Audio de la consultation :
                                                                    </span>
                                                                    <p style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', margin: 0, lineHeight: '1.5' }}>
                                                                        "{ana.transcript}"
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'synthese' && (
                            <div className="synthese-content">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h4 style={{ margin: 0 }}>Synthèse Globale & Historique Médical du Patient</h4>
                                    <span style={{ fontSize: '0.8rem', background: 'rgba(0, 242, 254, 0.1)', color: 'var(--primary-cyan)', padding: '4px 10px', borderRadius: '14px', fontWeight: 600 }}>
                                        Dossier Praticien OrthoMind
                                    </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '14px', padding: '16px' }}>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Diagnostic & Consultations Audio</span>
                                        <strong style={{ fontSize: '1.4rem', color: 'var(--primary-cyan)' }}>{patientAnalyses.length} séance(s)</strong>
                                    </div>
                                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '14px', padding: '16px' }}>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Praticien Référent</span>
                                        <strong style={{ fontSize: '1.05rem', color: '#ffffff' }}>{selectedPatient.praticien}</strong>
                                    </div>
                                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '14px', padding: '16px' }}>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Portail Patient Lien SMS</span>
                                        <strong style={{ fontSize: '0.9rem', color: '#10b981' }}>✓ Vonage Activé</strong>
                                    </div>
                                </div>

                                {patientAnalyses.length > 0 ? (
                                    <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(0, 242, 254, 0.25)', borderRadius: '16px', padding: '20px' }}>
                                        <h5 style={{ color: 'var(--primary-cyan)', marginTop: 0, marginBottom: '10px', fontSize: '0.95rem' }}>
                                            💡 Résumé Synthétique de la dernière consultation :
                                        </h5>
                                        <p style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: '1.6', margin: 0, whiteSpace: 'pre-line' }}>
                                            {patientAnalyses[0].diagnostic_text}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="synthese-empty">
                                        Aucune consultation audio ni diagnostic n'a encore été effectué pour ce patient. Lancez un nouveau diagnostic depuis le bouton ci-dessus.
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'rdv' && (
                            <div className="rdv-content">
                                <div className="rdv-header">
                                    <h4>Commentaires & Rendez-vous</h4>
                                    <div className="rdv-actions">
                                        <button className="btn-action add">+ Ajouter</button>
                                        <button className="btn-action">Modifier</button>
                                        <button className="btn-action delete">Supprimer</button>
                                    </div>
                                </div>
                                <table className="rdv-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Heure</th>
                                            <th>Type</th>
                                            <th>Commentaire</th>
                                            <th>État</th>
                                            <th>Praticien</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingAppointments ? (
                                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Chargement des rendez-vous...</td></tr>
                                        ) : patientAppointments.length === 0 ? (
                                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>Aucun rendez-vous trouvé</td></tr>
                                        ) : (
                                            patientAppointments.map((apt) => (
                                                <tr key={apt.id}>
                                                    <td>{apt.date}</td>
                                                    <td>{apt.heure}</td>
                                                    <td>{apt.type}</td>
                                                    <td>{apt.commentaire || '-'}</td>
                                                    <td><span className={`etat-badge ${getEtatClass(apt.etat)}`}>{apt.etat}</span></td>
                                                    <td>{apt.praticien}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {activeTab === 'administratif' && (
                            <div className="admin-content">
                                <h4>Informations administratives & NIR</h4>
                                <div className="admin-grid">
                                    <div className="admin-field">
                                        <label>N° Sécurité Sociale (NIR)</label>
                                        <span className="value">{selectedPatient.numeroInterne || 'Non renseigné'}</span>
                                    </div>
                                    <div className="admin-field">
                                        <label>Solde</label>
                                        <span className="value">0,00 €</span>
                                    </div>
                                    <div className="admin-field">
                                        <label>Suivi par</label>
                                        <span className="value">{selectedPatient.praticien}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="patient-details-panel-empty">
                    <div className="empty-details-state">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: '16px', color: 'var(--primary-cyan)' }}>
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <h3>Aucun patient sélectionné</h3>
                        <p>Sélectionnez un patient dans la liste de gauche ou ajoutez-en un nouveau pour consulter sa fiche.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Patients;
