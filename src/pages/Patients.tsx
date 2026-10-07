import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Patient, getPatients, updatePatient, deletePatient } from '../services/patientService';
import { getLatestPhotoSession, PhotoSession } from '../services/photosService';
import { useLiveRefresh } from '../services/liveSync';
import { getAppointmentsByPatientId } from '../services/appointmentService';
import PatientForm from '../components/PatientForm';
import PatientPortal from './PatientPortal';
import OrthoMindDepForm from '../components/OrthoMindDepForm';
import ClinicalReport from '../components/ClinicalReport';
import Icon, { IconName } from '../components/Icon';
import { extractDepDataFromAnalysis } from '../services/depParser';
import { OrthoMindDepData, createDefaultDepData } from '../types/dep';
import OnyxCephTravauxTable from '../components/OnyxCephTravauxTable';
import { listRecords, listRecordSummaries, saveRecord, updateRecordDep, ClinicalRecord, getOnyxCephUrlRecord, saveOnyxCephUrlRecord } from '../services/recordsService';
import PatientPhotos from '../components/PatientPhotos';
import PatientRadios from '../components/PatientRadios';
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
const toAppointmentRow = (apt: { id: string; date: string; type: string; notes?: string | null; status: string }, praticien: string): Appointment => {
    const aptDate = new Date(apt.date);
    return {
        id: apt.id,
        date: aptDate.toLocaleDateString('fr-FR'),
        heure: aptDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: apt.type,
        commentaire: apt.notes || '',
        etat: apt.status,
        praticien,
    };
};

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
    onSelectPatientForAnalysis?: (patient: Patient, options?: { useFichePhotos?: boolean }) => void;
}

const Patients = ({ onSelectPatientForAnalysis }: PatientsProps = {}) => {
    const [patients, setPatients] = useState<DisplayPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<DisplayPatient | null>(null);
    const [activeTab, setActiveTab] = useState<FicheTab>('dep');
    const [showForm, setShowForm] = useState(false);
    const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
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

    type PatientFilterStatus = 'tous' | 'a_valider' | 'termines';
    const [statusFilter, setStatusFilter] = useState<PatientFilterStatus>('tous');
    const [allRecords, setAllRecords] = useState<ClinicalRecord[]>([]);

    // Liste des patients et statuts ; silent : rafraîchissement en direct (autre poste, autre écran)
    const fetchPatientsAndRecords = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [patientsData, recordsData] = await Promise.all([
                getPatients(),
                listRecordSummaries().catch(() => null)
            ]);
            const display = patientsData.map(convertToDisplayPatient);
            setPatients(display);
            if (recordsData) setAllRecords(recordsData);
            setDataError(null);
            // La fiche ouverte reprend les coordonnées à jour (le lien OnyxCeph synchronisé à part est conservé)
            setSelectedPatient(prev => {
                if (!prev) return prev;
                const fresh = display.find(p => p.id === prev.id);
                return fresh ? { ...fresh, raw: { ...fresh.raw, onyxceph_url: fresh.raw.onyxceph_url || prev.raw.onyxceph_url } } : prev;
            });
        } catch (err: any) {
            if (!silent) setDataError(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => { fetchPatientsAndRecords(); }, [fetchPatientsAndRecords]);
    useLiveRefresh(() => { fetchPatientsAndRecords(true); }, ['patients', 'clinical_records']);

    const depFromSession = (session: any, patient: DisplayPatient): OrthoMindDepData =>
        session.dep_data || extractDepDataFromAnalysis(
            session.diagnostic_text || '',
            session.traitement_text || '',
            `${patient.nom} ${patient.prenom}`,
            patient.id
        );

    // Helper to calculate validation status per patient
    const getPatientValidationStatus = (patientId: string, patientName: string): 'a_valider' | 'termines' | 'non_diagnostique' => {
        const pRecords = allRecords.filter(r =>
            r.patient_id === patientId ||
            (patientName && r.patient_name?.toLowerCase() === patientName.toLowerCase())
        );
        if (pRecords.length === 0) return 'non_diagnostique';
        const hasValidated = pRecords.some(r => r.dep_data?.status === 'selectionne' || (r.meta as any)?.validated === true);
        if (hasValidated) return 'termines';
        return 'a_valider';
    };

    const countAValider = patients.filter(p => getPatientValidationStatus(p.id, `${p.nom} ${p.prenom}`) === 'a_valider').length;
    const countTermines = patients.filter(p => getPatientValidationStatus(p.id, `${p.nom} ${p.prenom}`) === 'termines').length;

    // Fiche ouverte : rendez-vous et liste des comptes-rendus rafraîchis en direct.
    // La fiche DEP en cours d'édition n'est jamais écrasée.
    const selectedId = selectedPatient?.id;
    const selectedPraticien = selectedPatient?.praticien || '';
    useLiveRefresh(() => {
        if (!selectedId) return;
        getAppointmentsByPatientId(selectedId)
            .then(data => setPatientAppointments(data.map(apt => toAppointmentRow(apt, selectedPraticien))))
            .catch(() => undefined);
        listRecords(selectedId)
            .then(matched => setPatientAnalyses(matched.filter(ana => !ana.diagnostic_text?.startsWith('ONYXCEPH_LINK::') && ana.type !== ('onyxceph' as any))))
            .catch(() => undefined);
    }, ['appointments', 'clinical_records'], { enabled: !!selectedId });

    // Fetch appointments & diagnostics when selected patient changes
    useEffect(() => {
        if (!selectedPatient) return;

        const fetchPatientAppointments = async () => {
            setLoadingAppointments(true);
            try {
                const data = await getAppointmentsByPatientId(selectedPatient.id);
                setPatientAppointments(data.map(apt => toAppointmentRow(apt, selectedPatient.praticien)));
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
            const cleanMatched = matched.filter(ana => !ana.diagnostic_text?.startsWith('ONYXCEPH_LINK::') && ana.type !== ('onyxceph' as any));
            setPatientAnalyses(cleanMatched);

            try {
                const cloudOnyxUrl = await getOnyxCephUrlRecord(selectedPatient.id, `${selectedPatient.nom} ${selectedPatient.prenom}`);
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
    }, [selectedPatient?.id]);

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

    const filteredPatients = patients.filter(p => {
        const matchesQuery = `${p.nom} ${p.prenom}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.numeroDossier.includes(searchQuery);
        if (!matchesQuery) return false;

        const status = getPatientValidationStatus(p.id, `${p.nom} ${p.prenom}`);
        if (statusFilter === 'a_valider') return status === 'a_valider';
        if (statusFilter === 'termines') return status === 'termines';
        return true;
    });

    const handlePatientSaved = (patient: Patient) => {
        const displayPatient = convertToDisplayPatient(patient);
        setPatients(prev => {
            const existingIdx = prev.findIndex(p => p.id === displayPatient.id);
            if (existingIdx !== -1) {
                const updated = [...prev];
                updated[existingIdx] = displayPatient;
                return updated;
            }
            return [displayPatient, ...prev];
        });
        if (selectedPatient?.id === displayPatient.id || editingPatient) {
            setSelectedPatient(displayPatient);
        }
        setShowForm(false);
        setEditingPatient(null);
    };

    const handleDeletePatient = async (patientToDelete: DisplayPatient) => {
        if (!window.confirm(`Êtes-vous sûr de vouloir supprimer définitivement la fiche de ${patientToDelete.prenom} ${patientToDelete.nom} ? cette action est irréversible.`)) {
            return;
        }
        try {
            await deletePatient(patientToDelete.id);
            setPatients(prev => prev.filter(p => p.id !== patientToDelete.id));
            if (selectedPatient?.id === patientToDelete.id) {
                setSelectedPatient(null);
            }
        } catch (err: any) {
            alert(`Erreur lors de la suppression du patient : ${err.message || String(err)}`);
        }
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
                    diagnostic_text: 'Fiche DEP validée par le praticien',
                    traitement_text: updatedData.planDeTraitement || '',
                    dep_data: updatedData,
                });
                setDepSessionId(saved.id);
            }
            setPatientAnalyses(await listRecords(selectedPatient.id));
            setAllRecords(await listRecordSummaries().catch(() => []));
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

    const startAnalysis = (useFichePhotos = false) => {
        if (selectedPatient && onSelectPatientForAnalysis) {
            onSelectPatientForAnalysis(selectedPatient.raw, { useFichePhotos });
        }
    };

    // Rappel : dernière séance de photos encore sans diagnostic
    const [photoSession, setPhotoSession] = useState<PhotoSession | null>(null);
    const refreshPhotoSession = useCallback(() => {
        if (!selectedId) { setPhotoSession(null); return; }
        getLatestPhotoSession(selectedId)
            .then(setPhotoSession)
            .catch(() => undefined);
    }, [selectedId]);
    useEffect(() => { refreshPhotoSession(); }, [refreshPhotoSession, activeTab]);
    useLiveRefresh(refreshPhotoSession, ['patient_photos', 'clinical_records'], { enabled: !!selectedId });

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
            {(showForm || editingPatient) && (
                <PatientForm
                    initialPatient={editingPatient}
                    onClose={() => {
                        setShowForm(false);
                        setEditingPatient(null);
                    }}
                    onSuccess={handlePatientSaved}
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
                <div className="patients-status-filters" style={{ display: 'flex', gap: '8px', padding: '0 16px 12px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        className={`om-btn om-btn--sm ${statusFilter === 'tous' ? 'om-btn--primary' : 'om-btn--ghost'}`}
                        onClick={() => setStatusFilter('tous')}
                    >
                        Tous ({patients.length})
                    </button>
                    <button
                        type="button"
                        className={`om-btn om-btn--sm ${statusFilter === 'a_valider' ? 'om-btn--accent' : 'om-btn--ghost'}`}
                        onClick={() => setStatusFilter('a_valider')}
                        style={{ gap: '6px' }}
                    >
                        <Icon name="clock" size={14} /> À valider par Praticien ({countAValider})
                    </button>
                    <button
                        type="button"
                        className={`om-btn om-btn--sm ${statusFilter === 'termines' ? 'om-btn--success' : 'om-btn--ghost'}`}
                        onClick={() => setStatusFilter('termines')}
                        style={{ gap: '6px' }}
                    >
                        <Icon name="check" size={14} /> Terminés ({countTermines})
                    </button>
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
                            <span>Statut Diag</span>
                            <span>Naissance</span>
                            <span>Téléphone</span>
                            <span>N° de dossier</span>
                            <span />
                        </div>
                    )}
                    {loading ? (
                        <p className="patients-list-status">Chargement…</p>
                    ) : filteredPatients.length === 0 ? (
                        <p className="patients-list-status">Aucun patient dans cette catégorie</p>
                    ) : (
                        filteredPatients.map((patient) => {
                            const pStatus = getPatientValidationStatus(patient.id, `${patient.nom} ${patient.prenom}`);
                            return (
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
                                    <span className="patient-row-col">
                                        {pStatus === 'termines' && <span className="om-badge om-badge--success" style={{ fontSize: '0.72rem' }}>✓ Validé par Praticien</span>}
                                        {pStatus === 'a_valider' && <span className="om-badge om-badge--warning" style={{ fontSize: '0.72rem' }}>⚠️ À valider</span>}
                                        {pStatus === 'non_diagnostique' && <span className="om-badge om-badge--ghost" style={{ fontSize: '0.72rem' }}>Non renseigné</span>}
                                    </span>
                                    <span className="patient-row-col">{formatDate(patient.dateNaissance)}</span>
                                    <span className="patient-row-col">{patient.telephone || '—'}</span>
                                    <span className="patient-row-col patient-row-col--muted">Dossier {patient.numeroDossier.slice(-8)}</span>
                                    <span className="patient-row-open">Ouvrir la fiche</span>
                                </button>
                            );
                        })
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

                    <div className="fiche-scroll-body">
                        {/* En-tête */}
                        <header className="fiche-header">
                        <div className="fiche-identity">
                            <span className="patient-avatar patient-avatar--lg" aria-hidden="true">
                                {selectedPatient.prenom[0]}{selectedPatient.nom[0]}
                            </span>
                            <div>
                                <div className="fiche-identity-name-row">
                                    <h1 className="fiche-name">{selectedPatient.prenom} {selectedPatient.nom}</h1>
                                    <div className="patient-name-actions">
                                        <button
                                            type="button"
                                            className="patient-action-btn edit-btn"
                                            onClick={() => setEditingPatient(selectedPatient.raw)}
                                            title="Modifier la fiche patient"
                                            aria-label="Modifier la fiche patient"
                                        >
                                            <Icon name="edit" size={17} />
                                        </button>
                                        <button
                                            type="button"
                                            className="patient-action-btn delete-btn"
                                            onClick={() => handleDeletePatient(selectedPatient)}
                                            title="Supprimer la fiche patient"
                                            aria-label="Supprimer la fiche patient"
                                        >
                                            <Icon name="trash" size={17} />
                                        </button>
                                    </div>
                                </div>
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
                            {onSelectPatientForAnalysis && (
                                <button className="om-btn om-btn--primary" onClick={() => startAnalysis()}>
                                    <Icon name="sparkles" /> Lancer un diagnostic
                                </button>
                            )}
                            <button className="om-btn om-btn--ghost fiche-close" onClick={() => setSelectedPatient(null)} aria-label="Fermer la fiche" title="Fermer (Échap)">
                                <Icon name="x" /> Fermer
                            </button>
                        </div>
                    </header>

                    {photoSession && !photoSession.analysed && onSelectPatientForAnalysis && (
                        <div className="fiche-diagnostic-reminder" role="alert">
                            <span>
                                📸 <strong>{photoSession.photos.length} photo{photoSession.photos.length > 1 ? 's' : ''} du {new Date(`${photoSession.day}T12:00:00`).toLocaleDateString('fr-FR')}</strong> sans diagnostic : pensez à lancer le diagnostic pour remplir la fiche DEP.
                            </span>
                            <button className="om-btn om-btn--primary om-btn--sm" onClick={() => startAnalysis(true)}>
                                <Icon name="sparkles" /> Lancer le diagnostic avec ces photos
                            </button>
                        </div>
                    )}

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
                                <dd className="fiche-portal-actions">
                                    <a className="om-btn om-btn--secondary om-btn--sm" href={patientLink} target="_blank" rel="noopener noreferrer">
                                        <Icon name="externalLink" size={14} /> Ouvrir le portail
                                    </a>
                                    <button className="om-btn om-btn--ghost om-btn--sm" onClick={() => setShowLinkModal(true)}>
                                        <Icon name="send" size={14} /> Envoyer par SMS
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
                            ['photos', 'Photos/Radios/Empreintes', null, 'camera'],
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
                                        <button className="om-btn om-btn--primary" onClick={() => startAnalysis()}>
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
                                                            <h3 className="om-label fiche-stat-label" style={{ color: 'var(--om-accent)', fontSize: '0.92rem', fontWeight: 700 }}>
                                                                <Icon name="activity" size={15} style={{ color: 'var(--om-accent)' }} /> DIAGNOSTIC
                                                            </h3>
                                                            <ClinicalReport text={ana.diagnostic_text} />
                                                        </div>
                                                        {ana.traitement_text && (
                                                            <div className="session-section">
                                                                <h3 className="om-label fiche-stat-label" style={{ color: 'var(--om-accent)', fontSize: '0.92rem', fontWeight: 700 }}>
                                                                    <Icon name="tooth" size={15} style={{ color: 'var(--om-accent)' }} /> PLAN DE TRAITEMENT
                                                                </h3>
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
                            <PatientPhotos patientId={selectedPatient.id} patientName={`${selectedPatient.prenom} ${selectedPatient.nom}`} onPhotosUploaded={refreshPhotoSession} />
                        )}

                        {activeTab === 'onyxceph' && (
                            <PatientOnyxCeph
                                patientId={selectedPatient.id}
                                patientName={`${selectedPatient.prenom} ${selectedPatient.nom}`}
                                initialUrl={raw.onyxceph_url || ''}
                                onSaveUrl={handleSaveOnyxCephUrl}
                                onNavigateToEmpreintes={() => setActiveTab('photos')}
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
                    </div>
                </section>
                </div>,
                document.body
            )}
        </div>
    );
};

export default Patients;
