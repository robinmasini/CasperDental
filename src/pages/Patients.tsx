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

const Patients = () => {
    const [patients, setPatients] = useState<DisplayPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<DisplayPatient | null>(null);
    const [activeTab, setActiveTab] = useState<'diagnostic' | 'synthese' | 'rdv' | 'administratif'>('diagnostic');
    const [showForm, setShowForm] = useState(false);
    const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([]);
    const [loadingAppointments, setLoadingAppointments] = useState(false);

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

    // Fetch appointments when selected patient changes
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
        fetchPatientAppointments();
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

    const handlePatientCreated = (patient: Patient) => {
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

            {/* Left Panel - Patient List */}
            <div className="patients-list-panel">
                <div className="patients-header">
                    <button className="btn-add-patient" onClick={() => setShowForm(true)}>
                        + Ajouter patient
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
                            <button onClick={() => setShowForm(true)}>+ Créer un patient</button>
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
            {selectedPatient && (
                <div className="patient-details-panel">
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
                                    <span>N° interne: {selectedPatient.numeroInterne}</span>
                                </div>
                            </div>
                        </div>
                        <div className="patient-header-right">
                            <div className="patient-dossier-number">
                                <span className="label">N° de dossier</span>
                                <span className="value">{selectedPatient.numeroDossier.slice(-8)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Patient Info Sections */}
                    <div className="patient-info-grid">
                        <div className="info-section">
                            <h4>📧 Contact</h4>
                            <p>{selectedPatient.email || 'Non renseigné'}</p>
                            <p>{selectedPatient.telephone || 'Non renseigné'}</p>
                        </div>
                        <div className="info-section">
                            <h4>⚠️ Allergies</h4>
                            <p>{selectedPatient.allergies || 'Aucune allergie connue'}</p>
                        </div>
                        <div className="info-section">
                            <h4>👨‍👩‍👧 Famille</h4>
                            <p>Non renseigné</p>
                        </div>
                        <div className="info-section">
                            <h4>🩺 Contacts médicaux</h4>
                            <p>Dentiste référent</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="patient-tabs">
                        <button
                            className={`tab ${activeTab === 'diagnostic' ? 'active' : ''}`}
                            onClick={() => setActiveTab('diagnostic')}
                        >
                            DIAGNOSTIC
                        </button>
                        <button
                            className={`tab ${activeTab === 'synthese' ? 'active' : ''}`}
                            onClick={() => setActiveTab('synthese')}
                        >
                            SYNTHÈSE
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
                                    <h4>Diagnostics</h4>
                                    <span className="phase-badge">Phase 1</span>
                                </div>
                                <p className="diagnostic-plan">Plan de traitement / Complément / Commentaires</p>
                                <div className="diagnostic-empty">
                                    Aucun diagnostic enregistré
                                </div>
                            </div>
                        )}

                        {activeTab === 'synthese' && (
                            <div className="synthese-content">
                                <h4>Synthèse patient</h4>
                                <div className="synthese-empty">
                                    Aucune synthèse disponible
                                </div>
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
                                <h4>Informations administratives</h4>
                                <div className="admin-grid">
                                    <div className="admin-field">
                                        <label>Solde</label>
                                        <span className="value">0,00 €</span>
                                    </div>
                                    <div className="admin-field">
                                        <label>Avance</label>
                                        <span className="value">0,00 €</span>
                                    </div>
                                    <div className="admin-field">
                                        <label>Diagnostics préalables</label>
                                        <span className="value">-</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Patients;
