import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Patient, getPatients, updatePatient } from '../services/patientService';
import { getAppointmentsByPatientId } from '../services/appointmentService';
import PatientForm from '../components/PatientForm';
import PatientPortal from './PatientPortal';
import OrthoMindDepForm from '../components/OrthoMindDepForm';
import ClinicalReport from '../components/ClinicalReport';
import Icon, { IconName } from '../components/Icon';
import { extractDepDataFromAnalysis } from '../services/depParser';
import { OrthoMindDepData, createDefaultDepData } from '../types/dep';
import OnyxCephTravauxTable from '../components/OnyxCephTravauxTable';
import { listRecords, saveRecord, updateRecordDep, ClinicalRecord, getOnyxCephUrlRecord, saveOnyxCephUrlRecord } from '../services/recordsService';
import PatientPhotos from '../components/PatientPhotos';
import PatientOnyxCeph from '../components/PatientOnyxCeph';
import logoMonday from '../assets/logo-monday.png';
import logoOnyxceph from '../assets/logo-onyxceph.png';
import './Patients.css';

interface DisplayPatient {
    id: string;
    nom: string;
    prenom: string;
    dateNaissance: string;
    age: string;
    numeroDossier: string;
    email?: string;
    telephone?: string;
    praticien: string;
    raw: Patient;
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

type FicheTab = 'dep' | 'dossier' | 'photos' | 'onyxceph' | 'synthese' | 'rdv' | 'admin' | 'travaux';

// Calculate age from date of birth
const calculateAge = (dateNaissance: string): string => {
    const birthDate = new Date(dateNaissance);
    if (isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let years = today.getFullYear() - birthDate.getFullYear();
    let months = today.getMonth() - birthDate.getMonth();
    if (today.getDate() < birthDate.getDate()) months--;
    if (months < 0) {
        years--;
        months += 12;
    }
    return months > 0 ? `${years} ans ${months} mois` : `${years} ans`;
};

const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR');
};

// Convert Supabase patient to display format
const convertToDisplayPatient = (patient: Patient): DisplayPatient => ({
    id: patient.id || '',
    nom: patient.nom.toUpperCase(),
    prenom: patient.prenom,
    dateNaissance: patient.date_naissance,
    age: calculateAge(patient.date_naissance),
    numeroDossier: patient.id || '',
    email: patient.email,
    telephone: patient.portable || patient.telephone,
    praticien: patient.praticien || 'Cabinet',
    raw: patient,
});


const APPOINTMENT_STATUS: Record<string, string> = {
    'terminé': 'om-badge--success',
    'confirmé': 'om-badge--accent',
    'annulé': 'om-badge--danger',
};

// Valeur d'une propriété ou mention "Non renseigné"
const Field = ({ label, value, icon }: { label: string; value?: string | null; icon?: IconName }) => (
    <div className={icon ? 'om-dl-item--icon' : undefined}>
        {icon && <span className="om-dl-icon" aria-hidden="true"><Icon name={icon} size={16} /></span>}
        <div>
            <dt>{label}</dt>
            <dd className={value ? '' : 'is-empty'}>{value || 'Non renseigné'}</dd>
        </div>
    </div>
);

interface PatientsProps {
    onSelectPatientForAnalysis?: (patientName: string) => void;
}

const Patients = ({ onSelectPatientForAnalysis }: PatientsProps = {}) => {
    const [patients, setPatients] = useState<DisplayPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<DisplayPatient | null>(null);
    const [activeTab, setActiveTab] = useState<FicheTab>('dep');
    const [showForm, setShowForm] = useState(false);
    const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([]);
    const [loadingAppointments, setLoadingAppointments] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [showImmersionModal, setShowImmersionModal] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [patientAnalyses, setPatientAnalyses] = useState<any[]>([]);
    const [openSessionId, setOpenSessionId] = useState<string | null>(null);
    const [currentDepData, setCurrentDepData] = useState<OrthoMindDepData | null>(null);
    const [depSessionId, setDepSessionId] = useState<string | null>(null);
    const [dataError, setDataError] = useState<string | null>(null);

    // Fetch patients
    useEffect(() => {
        const fetchPatients = async () => {
            setLoading(true);
            try {
                const data = await getPatients();
                setPatients(data.map(convertToDisplayPatient));
                setDataError(null);
            } catch (err: any) {
                setDataError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchPatients();
    }, []);

    const depFromSession = (session: any, patient: DisplayPatient): OrthoMindDepData =>
        session.dep_data || extractDepDataFromAnalysis(
            session.diagnostic_text || '',
            session.traitement_text || '',
            `${patient.nom} ${patient.prenom}`,
            patient.id
        );

    // Fetch appointments & diagnostics when selected patient changes
    useEffect(() => {
        if (!selectedPatient) return;

        const fetchPatientAppointments = async () => {
            setLoadingAppointments(true);
            try {
                const data = await getAppointmentsByPatientId(selectedPatient.id);
                setPatientAppointments(data.map(apt => {
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
                }));
            } catch (error) {
                console.error('Failed to fetch patient appointments:', error);
            } finally {
                setLoadingAppointments(false);
            }
        };

        const loadPatientDiagnostics = async () => {
            let matched: ClinicalRecord[] = [];
            try {
                matched = await listRecords(selectedPatient.id);
                setDataError(null);
            } catch (err: any) {
                setDataError(err.message);
            }
            setPatientAnalyses(matched);

            try {
                const cloudOnyxUrl = await getOnyxCephUrlRecord(selectedPatient.id);
                if (cloudOnyxUrl) {
                    setSelectedPatient(prev => prev ? {
                        ...prev,
                        raw: { ...prev.raw, onyxceph_url: cloudOnyxUrl }
                    } : null);
                }
            } catch (e) {}

            if (matched.length > 0) {
                setCurrentDepData(depFromSession(matched[0], selectedPatient));
                setDepSessionId(matched[0].id || null);
                setOpenSessionId(matched[0].id || 'session-0');
            } else {
                setCurrentDepData(createDefaultDepData(
                    selectedPatient.nom,
                    selectedPatient.prenom,
                    selectedPatient.id.slice(-4),
                    selectedPatient.id
                ));
                setDepSessionId(null);
                setOpenSessionId(null);
            }
        };

        setActiveTab('dep');
        fetchPatientAppointments();
        loadPatientDiagnostics();
    }, [selectedPatient]);

    // La fiche est une fenêtre : Échap la ferme (sauf si une sous-fenêtre est ouverte)
    useEffect(() => {
        if (!selectedPatient) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (showImmersionModal) setShowImmersionModal(false);
            else if (showLinkModal) setShowLinkModal(false);
            else setSelectedPatient(null);
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [selectedPatient, showLinkModal, showImmersionModal]);

    const filteredPatients = patients.filter(p =>
        `${p.nom} ${p.prenom}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.numeroDossier.includes(searchQuery)
    );

    const handlePatientCreated = (patient: Patient) => {
        const displayPatient = convertToDisplayPatient(patient);
        setPatients(prev => [displayPatient, ...prev]);
        setSelectedPatient(displayPatient);
        setShowForm(false);
    };

    const saveDep = async (updatedData: OrthoMindDepData) => {
        if (!selectedPatient) return;
        setCurrentDepData(updatedData);
        try {
            if (depSessionId) {
                await updateRecordDep(depSessionId, updatedData);
            } else {
                const saved = await saveRecord({
                    patient_id: selectedPatient.id,
                    patient_name: `${selectedPatient.nom} ${selectedPatient.prenom}`,
                    type: 'dep',
                    images: [],
                    diagnostic_text: 'Fiche DEP saisie manuellement',
                    traitement_text: updatedData.planDeTraitement || '',
                    dep_data: updatedData,
                });
                setDepSessionId(saved.id);
            }
            setPatientAnalyses(await listRecords(selectedPatient.id));
            setDataError(null);
        } catch (err: any) {
            setDataError(err.message);
            alert(err.message);
        }
    };

    const openDepForSession = (session: any) => {
        if (!selectedPatient) return;
        setCurrentDepData(depFromSession(session, selectedPatient));
        setDepSessionId(session.id || null);
        setActiveTab('dep');
    };

    const patientLink = selectedPatient ? `${window.location.origin}/patient/suivi-${selectedPatient.id}` : '';

    const copyPatientLink = async () => {
        try {
            await navigator.clipboard.writeText(patientLink);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
        } catch {
            window.prompt('Copiez le lien patient :', patientLink);
        }
    };

    const startAnalysis = () => {
        if (selectedPatient && onSelectPatientForAnalysis) {
            onSelectPatientForAnalysis(`${selectedPatient.nom} ${selectedPatient.prenom}`);
        }
    };

    const handleSaveOnyxCephUrl = async (newUrl: string) => {
        if (!selectedPatient) return;
        await saveOnyxCephUrlRecord(selectedPatient.id, `${selectedPatient.nom} ${selectedPatient.prenom}`, newUrl);
        await updatePatient(selectedPatient.id, { onyxceph_url: newUrl });
        setSelectedPatient(prev => prev ? {
            ...prev,
            raw: { ...prev.raw, onyxceph_url: newUrl }
        } : null);
    };

    const depSession = patientAnalyses.find(a => a.id === depSessionId);
    const raw = selectedPatient?.raw;

    return (
        <div className="patients-container">
            {showForm && (
                <PatientForm
                    onClose={() => setShowForm(false)}
                    onSuccess={handlePatientCreated}
                />
            )}

            {/* Lien d'accès au portail patient */}
            {showLinkModal && selectedPatient && createPortal(
                <div className="fiche-modal-overlay" onClick={() => setShowLinkModal(false)}>
                    <div className="fiche-modal om-card" role="dialog" aria-modal="true" aria-labelledby="link-modal-title" onClick={(e) => e.stopPropagation()}>
                        <div className="om-card-header">
                            <h3 id="link-modal-title" className="om-title">SMS Vonage — lien d'accès patient</h3>
                            <button className="om-btn om-btn--ghost om-btn--icon" onClick={() => setShowLinkModal(false)} aria-label="Fermer">
                                <Icon name="x" />
                            </button>
                        </div>
                        <p className="om-muted">
                            Lien personnel de suivi pour <strong>{selectedPatient.prenom} {selectedPatient.nom}</strong>
                            {selectedPatient.telephone ? ` (${selectedPatient.telephone})` : ''}.
                        </p>
                        <div className="fiche-link-box">
                            <code>{patientLink}</code>
                        </div>
                        <div className="fiche-sms-preview">
                            <span className="om-label">Message SMS proposé</span>
                            <p>Bonjour {selectedPatient.prenom}, voici votre lien personnel et sécurisé pour suivre votre traitement orthodontique : {patientLink}</p>
                        </div>
                        <p className="fiche-note">Envoi Vonage en mode démonstration : aucun SMS réel n'est encore expédié. Vous pouvez copier le lien pour le transmettre.</p>
                        <div className="fiche-modal-actions">
                            <button className="om-btn om-btn--ghost" onClick={() => { setShowLinkModal(false); setShowImmersionModal(true); }}>
                                <Icon name="eye" /> Aperçu du portail
                            </button>
                            <button className="om-btn om-btn--secondary" onClick={copyPatientLink}>
                                <Icon name="copy" /> {linkCopied ? 'Lien copié' : 'Copier le lien'}
                            </button>
                            <button
                                className="om-btn om-btn--primary"
                                onClick={() => {
                                    alert(`SMS préparé pour ${selectedPatient.prenom} (mode démonstration Vonage).`);
                                    setShowLinkModal(false);
                                }}
                            >
                                <Icon name="send" /> Envoyer le SMS
                            </button>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Aperçu du portail patient */}
            {showImmersionModal && selectedPatient && createPortal(
                <div className="fiche-modal-overlay fiche-modal-overlay--portal" onClick={() => setShowImmersionModal(false)}>
                    <div className="fiche-portal-frame" onClick={(e) => e.stopPropagation()}>
                        <PatientPortal
                            patientData={selectedPatient}
                            onCloseImmersion={() => setShowImmersionModal(false)}
                        />
                    </div>
                </div>
            , document.body)}

            {/* Liste des patients */}
            <section className="patients-list-panel">
                <div className="patients-list-header">
                    <div className="patients-list-title">
                        <h2 className="om-title">Patients</h2>
                        <span className="om-badge">{patients.length}</span>
                    </div>
                    <button className="om-btn om-btn--primary om-btn--sm" onClick={() => setShowForm(true)}>
                        <Icon name="plus" /> Nouveau
                    </button>
                </div>
                <div className="patients-search">
                    <Icon name="search" />
                    <input
                        type="search"
                        className="om-input"
                        placeholder="Nom ou n° de dossier"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        aria-label="Rechercher un patient"
                    />
                </div>
                {dataError && (
                    <div className="om-notice om-notice--danger" role="alert" style={{ margin: '0 16px 12px' }}>
                        <p>{dataError}</p>
                    </div>
                )}
                <div className="patients-list">
                    {!loading && filteredPatients.length > 0 && (
                        <div className="patients-list-head" aria-hidden="true">
                            <span>Patient</span>
                            <span>Naissance</span>
                            <span>Téléphone</span>
                            <span>N° de dossier</span>
                            <span />
                        </div>
                    )}
                    {loading ? (
                        <p className="patients-list-status">Chargement…</p>
                    ) : filteredPatients.length === 0 ? (
                        <p className="patients-list-status">Aucun patient trouvé</p>
                    ) : (
                        filteredPatients.map((patient) => (
                            <button
                                key={patient.id}
                                className={`patient-row ${selectedPatient?.id === patient.id ? 'is-active' : ''}`}
                                onClick={() => setSelectedPatient(patient)}
                            >
                                <span className="patient-avatar" aria-hidden="true">{patient.prenom[0]}{patient.nom[0]}</span>
                                <span className="patient-row-text">
                                    <span className="patient-row-name">{patient.nom} {patient.prenom}</span>
                                    <span className="patient-row-meta">{patient.age || 'Âge inconnu'} · {patient.praticien}</span>
                                </span>
                                <span className="patient-row-col">{formatDate(patient.dateNaissance)}</span>
                                <span className="patient-row-col">{patient.telephone || '—'}</span>
                                <span className="patient-row-col patient-row-col--muted">Dossier {patient.numeroDossier.slice(-8)}</span>
                                <span className="patient-row-open">Ouvrir la fiche</span>
                            </button>
                        ))
                    )}
                </div>
            </section>

            {/* Fiche patient — fenêtre */}
            {selectedPatient && raw && createPortal(
                <div className="fiche-overlay" onClick={() => setSelectedPatient(null)}>
                <section
                    className="patient-details-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Fiche de ${selectedPatient.prenom} ${selectedPatient.nom}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="fiche-mobile-bar">
                        <button className="om-btn om-btn--ghost" onClick={() => setSelectedPatient(null)}>
                            <Icon name="arrowLeft" /> Patients
                        </button>
                        <button className="om-btn om-btn--secondary" onClick={() => setSelectedPatient(null)} aria-label="Fermer la fiche">
                            <Icon name="x" /> Fermer
                        </button>
                    </div>

                    {/* En-tête */}
                    <header className="fiche-header">
                        <div className="fiche-identity">
                            <span className="patient-avatar patient-avatar--lg" aria-hidden="true">
                                {selectedPatient.prenom[0]}{selectedPatient.nom[0]}
                            </span>
                            <div>
                                <h1 className="fiche-name">{selectedPatient.prenom} {selectedPatient.nom}</h1>
                                <p className="fiche-meta">
                                    {[
                                        selectedPatient.age,
                                        raw.sexe,
                                        raw.type_patient,
                                        `Dossier ${selectedPatient.numeroDossier.slice(-8)}`,
                                    ].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                        </div>
                        <div className="fiche-actions">
                            <button className="om-btn om-btn--ghost" onClick={() => setShowImmersionModal(true)}>
                                <Icon name="eye" /> Vision patient
                            </button>
                            <button className="om-btn om-btn--secondary" onClick={() => setShowLinkModal(true)}>
                                <Icon name="send" /> SMS Vonage
                            </button>
                            {onSelectPatientForAnalysis && (
                                <button className="om-btn om-btn--primary" onClick={startAnalysis}>
                                    <Icon name="sparkles" /> Lancer un diagnostic
                                </button>
                            )}
                            <button className="om-btn om-btn--ghost fiche-close" onClick={() => setSelectedPatient(null)} aria-label="Fermer la fiche" title="Fermer (Échap)">
                                <Icon name="x" /> Fermer
                            </button>
                        </div>
                    </header>

                    {/* Résumé */}
                    <dl className="om-dl fiche-summary">
                        <Field label="Naissance" value={formatDate(raw.date_naissance)} icon="cake" />
                        <Field label="Téléphone" value={selectedPatient.telephone} icon="phone" />
                        <Field label="E-mail" value={selectedPatient.email} icon="mail" />
                        <Field label="Praticien" value={selectedPatient.praticien} icon="stethoscope" />
                        <Field label="Allergies" value={null} icon="alert" />
                        <div className="om-dl-item--icon">
                            <span className="om-dl-icon" aria-hidden="true"><Icon name="link" size={16} /></span>
                            <div>
                                <dt>Portail patient</dt>
                                <dd>
                                    <button className="fiche-inline-link" onClick={() => setShowLinkModal(true)}>
                                        suivi-{selectedPatient.id.slice(-6)}
                                    </button>
                                </dd>
                            </div>
                        </div>
                    </dl>

                    {/* Onglets */}
                    <nav className="om-tabs fiche-tabs" role="tablist">
                        {([
                            ['dep', 'Fiche DEP', null, 'clipboard'],
                            ['dossier', 'Diagnostics', patientAnalyses.length, 'stethoscope'],
                            ['photos', 'Photos', null, 'camera'],
                            ['travaux', 'Monday', null, null],
                            ['onyxceph', 'OnyxCeph', null, 'link'],
                            ['synthese', 'Synthèse', null, 'chart'],
                            ['rdv', 'RDV / suivi', patientAppointments.length, 'calendar'],
                            ['admin', 'Administratif', null, 'folder'],
                        ] as [FicheTab, string, number | null, IconName | null][]).map(([key, label, count, icon]) => (
                            <button
                                key={key}
                                role="tab"
                                aria-selected={activeTab === key}
                                className={`om-tab ${activeTab === key ? 'is-active' : ''}`}
                                onClick={() => setActiveTab(key)}
                            >
                                {key === 'onyxceph' && <img src={logoOnyxceph} alt="" className="om-tab-logo" />}
                                {key === 'travaux' && <img src={logoMonday} alt="" className="om-tab-logo" />}
                                {key !== 'onyxceph' && key !== 'travaux' && icon && <Icon name={icon} size={16} />}
                                {label}
                                {count !== null && count > 0 && <span className="om-tab-count">{count}</span>}
                            </button>
                        ))}
                    </nav>

                    <div className="fiche-tab-content">
                        {activeTab === 'dossier' && (
                            patientAnalyses.length === 0 ? (
                                <div className="om-empty">
                                    <p>Aucune analyse n'est encore rattachée à ce patient.</p>
                                    {onSelectPatientForAnalysis && (
                                        <button className="om-btn om-btn--primary" onClick={startAnalysis}>
                                            <Icon name="sparkles" /> Lancer une analyse
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="fiche-sessions">
                                    {patientAnalyses.map((ana, idx) => {
                                        const isAudio = ana.type === 'audio' || Boolean(ana.transcript);
                                        const isDepOnly = ana.type === 'dep';
                                        const sessionKey = ana.id || `session-${idx}`;
                                        const isOpen = openSessionId === sessionKey;
                                        const date = new Date(ana.created_at);

                                        return (
                                            <article key={sessionKey} className={`om-accordion ${isOpen ? 'is-open' : ''}`}>
                                                <button
                                                    className="om-accordion-trigger"
                                                    onClick={() => setOpenSessionId(isOpen ? null : sessionKey)}
                                                    aria-expanded={isOpen}
                                                >
                                                    <span className={`session-icon ${isAudio ? 'session-icon--audio' : ''}`}>
                                                        <Icon name={isAudio ? 'mic' : 'camera'} />
                                                    </span>
                                                    <span className="session-title">
                                                        <span>{isAudio ? 'Consultation audio' : isDepOnly ? 'Fiche DEP' : 'Analyse des clichés'}</span>
                                                        <span className="session-date">
                                                            {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </span>
                                                    {idx === 0 && <span className="om-badge om-badge--accent">Plus récente</span>}
                                                    <Icon name="chevronDown" className="om-accordion-chevron" />
                                                </button>

                                                {isOpen && (
                                                    <div className="om-accordion-body">
                                                        <div className="session-section">
                                                            <h3 className="om-label fiche-stat-label"><Icon name="activity" size={14} /> Diagnostic</h3>
                                                            <ClinicalReport text={ana.diagnostic_text} />
                                                        </div>
                                                        {ana.traitement_text && (
                                                            <div className="session-section">
                                                                <h3 className="om-label fiche-stat-label"><Icon name="tooth" size={14} /> Plan de traitement</h3>
                                                                <ClinicalReport text={ana.traitement_text} />
                                                            </div>
                                                        )}
                                                        {ana.transcript && (
                                                            <details className="session-transcript">
                                                                <summary>Retranscription de la consultation</summary>
                                                                <p>{ana.transcript}</p>
                                                            </details>
                                                        )}
                                                        <div className="session-footer">
                                                            <button className="om-btn om-btn--secondary om-btn--sm" onClick={() => openDepForSession(ana)}>
                                                                <Icon name="file" /> Fiche DEP de cette séance
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>
                            )
                        )}

                        {activeTab === 'dep' && (
                            <div>
                                <p className="fiche-note fiche-note--block">
                                    {depSession
                                        ? `Pré-remplie à partir de l'analyse du ${formatDate(depSession.created_at)}. Vérifiez et complétez avant envoi.`
                                        : 'Aucune analyse rattachée : fiche vierge à compléter.'}
                                </p>
                                <OrthoMindDepForm
                                    key={depSessionId || 'blank'}
                                    depData={currentDepData || createDefaultDepData(selectedPatient.nom, selectedPatient.prenom, selectedPatient.id.slice(-4), selectedPatient.id)}
                                    patientName={`${selectedPatient.nom} ${selectedPatient.prenom}`}
                                    patientId={selectedPatient.id}
                                    onSave={saveDep}
                                />
                            </div>
                        )}

                        {activeTab === 'photos' && (
                            <PatientPhotos patientId={selectedPatient.id} patientName={`${selectedPatient.prenom} ${selectedPatient.nom}`} />
                        )}

                        {activeTab === 'onyxceph' && (
                            <PatientOnyxCeph
                                patientId={selectedPatient.id}
                                patientName={`${selectedPatient.prenom} ${selectedPatient.nom}`}
                                initialUrl={raw.onyxceph_url || ''}
                                onSaveUrl={handleSaveOnyxCephUrl}
                            />
                        )}

                        {activeTab === 'synthese' && (
                            <div className="fiche-synthese">
                                <div className="fiche-stats">
                                    <div className="om-card om-card--flat">
                                        <span className="om-label fiche-stat-label"><Icon name="stethoscope" size={14} /> Diagnostics & consultations</span>
                                        <strong className="fiche-stat-value">{patientAnalyses.length} séance{patientAnalyses.length > 1 ? 's' : ''}</strong>
                                    </div>
                                    <div className="om-card om-card--flat">
                                        <span className="om-label fiche-stat-label"><Icon name="user" size={14} /> Praticien référent</span>
                                        <strong className="fiche-stat-value">{selectedPatient.praticien}</strong>
                                    </div>
                                    <div className="om-card om-card--flat">
                                        <span className="om-label fiche-stat-label"><Icon name="calendar" size={14} /> Dernière séance</span>
                                        <strong className="fiche-stat-value">{patientAnalyses[0] ? formatDate(patientAnalyses[0].created_at) : '—'}</strong>
                                    </div>
                                </div>
                                {patientAnalyses.length > 0 ? (
                                    <div className="om-card">
                                        <h3 className="om-label fiche-admin-title">Résumé de la dernière consultation</h3>
                                        <ClinicalReport text={patientAnalyses[0].diagnostic_text} />
                                    </div>
                                ) : (
                                    <div className="om-empty"><p>Aucune consultation ni diagnostic pour ce patient.</p></div>
                                )}
                            </div>
                        )}

                        {activeTab === 'rdv' && (
                            <div className="fiche-rdv">
                                <div className="fiche-section-bar">
                                    <h3 className="om-title">Commentaires & rendez-vous</h3>
                                    <div className="fiche-section-actions">
                                        <button className="om-btn om-btn--secondary om-btn--sm"><Icon name="plus" /> Ajouter</button>
                                        <button className="om-btn om-btn--ghost om-btn--sm">Modifier</button>
                                        <button className="om-btn om-btn--danger om-btn--sm">Supprimer</button>
                                    </div>
                                </div>
                            {loadingAppointments ? (
                                <p className="om-muted">Chargement des rendez-vous…</p>
                            ) : patientAppointments.length === 0 ? (
                                <div className="om-empty"><p>Aucun rendez-vous enregistré.</p></div>
                            ) : (
                                <div className="fiche-table-wrap">
                                    <table className="om-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Heure</th>
                                                <th>Type</th>
                                                <th>Commentaire</th>
                                                <th>État</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {patientAppointments.map((apt) => (
                                                <tr key={apt.id}>
                                                    <td>{apt.date}</td>
                                                    <td>{apt.heure}</td>
                                                    <td>{apt.type}</td>
                                                    <td>{apt.commentaire || '—'}</td>
                                                    <td><span className={`om-badge ${APPOINTMENT_STATUS[apt.etat] || ''}`}>{apt.etat}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            </div>
                        )}

                        {activeTab === 'travaux' && (
                            <OnyxCephTravauxTable
                                patientName={`${selectedPatient.nom} ${selectedPatient.prenom}`}
                                patientId={selectedPatient.id}
                                filterCurrentPatientOnly={true}
                            />
                        )}

                        {activeTab === 'admin' && (
                            <div className="fiche-admin">
                                <section>
                                    <h3 className="om-label fiche-admin-title"><Icon name="user" size={14} /> Patient</h3>
                                    <dl className="om-dl">
                                        <Field label="Civilité" value={raw.civilite} />
                                        <Field label="Nom" value={raw.nom} />
                                        <Field label="Prénom(s)" value={[raw.prenom, raw.deuxieme_prenom].filter(Boolean).join(' ')} />
                                        <Field label="Date de naissance" value={formatDate(raw.date_naissance)} />
                                        <Field label="Portable" value={raw.portable} />
                                        <Field label="Téléphone fixe" value={raw.telephone} />
                                    </dl>
                                </section>
                                <section>
                                    <h3 className="om-label fiche-admin-title"><Icon name="users" size={14} /> Responsable légal / assuré</h3>
                                    <dl className="om-dl">
                                        <Field label="Nom" value={[raw.responsable_civilite, raw.responsable_prenom, raw.responsable_nom].filter(Boolean).join(' ')} />
                                        <Field label="N° de sécurité sociale" value={raw.responsable_num_secu} />
                                        <Field label="Adresse" value={[raw.responsable_adresse, raw.responsable_cp, raw.responsable_commune].filter(Boolean).join(', ')} />
                                        <Field label="Téléphone" value={raw.responsable_portable1 || raw.responsable_telephone1} />
                                        <Field label="E-mail" value={raw.responsable_email} />
                                    </dl>
                                </section>
                                <section>
                                    <h3 className="om-label fiche-admin-title"><Icon name="stethoscope" size={14} /> Correspondants</h3>
                                    <dl className="om-dl">
                                        <Field label="Adressé par" value={raw.envoye_par} />
                                        <Field label="Dentiste traitant" value={raw.dentiste} />
                                        <Field label="Praticien" value={raw.praticien} />
                                    </dl>
                                </section>
                                <section>
                                    <h3 className="om-label fiche-admin-title"><Icon name="file" size={14} /> Comptabilité</h3>
                                    <dl className="om-dl">
                                        <Field label="Solde" value="0,00 €" />
                                    </dl>
                                </section>
                            </div>
                        )}
                    </div>
                </section>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Patients;
