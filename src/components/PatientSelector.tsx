import React, { useState, useEffect, useRef } from 'react';
import { Patient, getPatients } from '../services/patientService';
import PatientForm from './PatientForm';
import './PatientSelector.css';

interface PatientSelectorProps {
    selectedPatient: Patient | null;
    onSelectPatient: (patient: Patient | null) => void;
    label?: string;
}

export const PatientSelector: React.FC<PatientSelectorProps> = ({
    selectedPatient,
    onSelectPatient,
    label = "Rechercher ou associer un patient déjà existant :"
}) => {
    const [patients, setPatients] = useState<Patient[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [showNewPatientForm, setShowNewPatientForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch patients list
    const fetchPatientsList = async () => {
        setLoading(true);
        const data = await getPatients();
        setPatients(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchPatientsList();
    }, []);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredPatients = patients.filter(p => {
        const q = searchQuery.toLowerCase();
        const fullName = `${p.nom} ${p.prenom}`.toLowerCase();
        const reversedName = `${p.prenom} ${p.nom}`.toLowerCase();
        const phone = p.portable || p.telephone || '';
        return fullName.includes(q) || reversedName.includes(q) || phone.includes(q);
    });

    const handleSelect = (patient: Patient) => {
        onSelectPatient(patient);
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleClear = () => {
        onSelectPatient(null);
        setSearchQuery('');
    };

    const handleNewPatientCreated = (newPatient: Patient) => {
        setPatients(prev => [newPatient, ...prev]);
        onSelectPatient(newPatient);
        setShowNewPatientForm(false);
    };

    return (
        <div className="patient-selector-wrapper" ref={containerRef}>
            {showNewPatientForm && (
                <PatientForm
                    onClose={() => setShowNewPatientForm(false)}
                    onSuccess={handleNewPatientCreated}
                />
            )}

            <label className="selector-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary-cyan)" strokeWidth="2.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
                {label}
            </label>

            {selectedPatient ? (
                <div className="selected-patient-card">
                    <div className="patient-badge-info">
                        <div className="patient-avatar-circle">
                            {selectedPatient.prenom[0]}{selectedPatient.nom[0]}
                        </div>
                        <div className="patient-text-details">
                            <strong className="patient-name-title">
                                {selectedPatient.nom.toUpperCase()} {selectedPatient.prenom}
                            </strong>
                            <span className="patient-sub-meta">
                                📱 {selectedPatient.portable || selectedPatient.telephone || 'Sans tel'} • N° Dossier {selectedPatient.id?.slice(-6) || '7F89A2'}
                            </span>
                        </div>
                    </div>

                    <button className="clear-patient-btn" onClick={handleClear} title="Changer de patient">
                        ✕ Modifier
                    </button>
                </div>
            ) : (
                <div className="selector-input-container">
                    <div className="search-input-box">
                        <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>

                        <input
                            type="text"
                            className="selector-search-input"
                            placeholder="Rechercher par Nom, Prénom ou Téléphone..."
                            value={searchQuery}
                            onFocus={() => setIsOpen(true)}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setIsOpen(true);
                            }}
                        />

                        {searchQuery && (
                            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                                ✕
                            </button>
                        )}
                    </div>

                    <button className="btn-add-quick-patient" onClick={() => setShowNewPatientForm(true)}>
                        + Nouveau Patient
                    </button>

                    {/* Autocomplete Dropdown */}
                    {isOpen && (
                        <div className="selector-dropdown-menu">
                            <div className="dropdown-header-bar">
                                <span>Patients trouvés ({filteredPatients.length})</span>
                                <button className="btn-modal-new" onClick={() => { setIsOpen(false); setShowNewPatientForm(true); }}>
                                    + Créer Fiche
                                </button>
                            </div>

                            <div className="dropdown-items-list">
                                {loading ? (
                                    <div className="dropdown-loading">Chargement de la base patients...</div>
                                ) : filteredPatients.length === 0 ? (
                                    <div className="dropdown-empty">
                                        <p>Aucun patient correspondant à "{searchQuery}".</p>
                                        <button className="btn-create-missing" onClick={() => { setIsOpen(false); setShowNewPatientForm(true); }}>
                                            Créer la fiche de {searchQuery || 'ce patient'} 📲
                                        </button>
                                    </div>
                                ) : (
                                    filteredPatients.map(p => (
                                        <div
                                            key={p.id || Math.random()}
                                            className="dropdown-patient-item"
                                            onClick={() => handleSelect(p)}
                                        >
                                            <div className="item-avatar">
                                                {p.prenom[0]}{p.nom[0]}
                                            </div>
                                            <div className="item-info">
                                                <div className="item-name">{p.nom.toUpperCase()} {p.prenom}</div>
                                                <div className="item-meta">
                                                    Né(e) le {p.date_naissance ? new Date(p.date_naissance).toLocaleDateString('fr-FR') : 'NC'} • 📱 {p.portable || p.telephone || 'Pas de numéro'}
                                                </div>
                                            </div>
                                            <button className="btn-item-select">
                                                Associer ✓
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PatientSelector;
