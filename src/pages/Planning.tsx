import { useState, useEffect } from 'react';
import { getAppointments, Appointment } from '../services/appointmentService';
import { EmptyState } from '../components/EmptyState';
import './Planning.css';

type Status = 'suite_impr' | 'activation' | 'a_faire' | 'en_cours' | 'termine' | 'en_attente';
type Tab = 'cabinet' | 'production';

interface PlanningItem extends Appointment {
    // We'll map Appointment to the planning view
    travail: string;
    etape: Status;
    commentaires: string;
    prochaines: string;
    bib: string;
    facture: boolean;
    praticien: string;
    imprime: boolean;
}

const statusConfig: Record<Status, { label: string; color: string; bg: string }> = {
    suite_impr: { label: 'Suite à impr', color: '#fff', bg: '#00c875' },
    activation: { label: 'Activation attelle', color: '#fff', bg: '#fdab3d' },
    a_faire: { label: 'À faire', color: '#fff', bg: '#e2445c' },
    en_cours: { label: 'En cours', color: '#fff', bg: '#0086c0' },
    termine: { label: 'Terminé', color: '#fff', bg: '#9cd326' },
    en_attente: { label: 'En attente', color: '#323338', bg: '#c4c4c4' },
};

const Planning = () => {
    const [activeTab, setActiveTab] = useState<Tab>('cabinet');
    const [searchQuery, setSearchQuery] = useState('');
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchPlanning = async () => {
            setIsLoading(true);
            const data = await getAppointments();
            setAppointments(data);
            setIsLoading(false);
        };
        fetchPlanning();
    }, []);

    // Filters for Cabinet/Production. For now, since we only have 'type' in DB, 
    // we'll assume 'type' field might separate them or just show all in both for real test.
    const filteredItems = appointments.filter(apt => {
        const matchesSearch = (apt.patient?.nom + ' ' + apt.patient?.prenom).toLowerCase().includes(searchQuery.toLowerCase());
        // Simple logic for the demo transition: show all real items in both tabs if they exist
        return matchesSearch;
    });

    if (appointments.length === 0 && !isLoading) {
        return (
            <div className="planning-container">
                <div className="planning-header">
                    <div className="planning-title">
                        <h2>Organisation du Cabinet</h2>
                    </div>
                </div>
                <EmptyState
                    title="Aucun rendez-vous planifié"
                    message="Votre planning est vide. Les rendez-vous pris par l'assistant ou créés manuellement apparaîtront ici."
                    icon="📅"
                />
            </div>
        );
    }

    return (
        <div className="planning-container">
            {/* Header */}
            <div className="planning-header">
                <div className="planning-title">
                    <h2>Organisation {activeTab === 'cabinet' ? 'Cabinet' : 'Production'}</h2>
                    <span className="planning-subtitle">▼ {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).toUpperCase()}</span>
                </div>
                <div className="planning-actions">
                    <button className="btn-add-item">
                        <span>+ Ajouter élément</span>
                    </button>
                    <div className="search-box">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="planning-tabs">
                <button
                    className={`planning-tab ${activeTab === 'cabinet' ? 'active' : ''}`}
                    onClick={() => setActiveTab('cabinet')}
                >
                    🏥 Cabinet
                </button>
                <button
                    className={`planning-tab ${activeTab === 'production' ? 'active' : ''}`}
                    onClick={() => setActiveTab('production')}
                >
                    🔧 Production
                </button>
            </div>

            {/* Table */}
            <div className="planning-table-wrapper">
                <table className="planning-table">
                    <thead>
                        <tr>
                            <th className="col-patient">Patient</th>
                            <th className="col-travail">Travail à réaliser</th>
                            <th className="col-etape">Étape</th>
                            <th className="col-commentaires">Commentaires</th>
                            <th className="col-echeance">Échéance</th>
                            <th className="col-facture">Facturé</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.map((apt) => (
                            <tr key={apt.id}>
                                <td className="col-patient">
                                    <span className="patient-name">{apt.patient?.prenom} {apt.patient?.nom}</span>
                                </td>
                                <td className="col-travail">{apt.type}</td>
                                <td className="col-etape">
                                    <span className="status-badge" style={{ backgroundColor: '#0086c0', color: '#fff' }}>
                                        {apt.status}
                                    </span>
                                </td>
                                <td className="col-commentaires">{apt.notes || '-'}</td>
                                <td className="col-echeance">
                                    {new Date(apt.date).toLocaleDateString('fr-FR')}
                                </td>
                                <td className="col-facture">
                                    <span className="facture-badge non"></span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Planning;
