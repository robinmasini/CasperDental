import { useState, useEffect } from 'react';
import { getCalls, getCallTranscripts, Call, CallTranscript } from '../services/callService';
import { EmptyState } from '../components/EmptyState';
import './Calls.css';

const Calls = () => {
    const [selectedCall, setSelectedCall] = useState<Call | null>(null);
    const [calls, setCalls] = useState<Call[]>([]);
    const [transcripts, setTranscripts] = useState<CallTranscript[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchCalls = async () => {
            setIsLoading(true);
            try {
                const data = await getCalls();
                setCalls(data);
            } catch (error) {
                console.error("Error fetching calls:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchCalls();
    }, []);

    useEffect(() => {
        const fetchTranscripts = async () => {
            if (selectedCall) {
                try {
                    const data = await getCallTranscripts(selectedCall.id);
                    setTranscripts(data);
                } catch (error) {
                    console.error("Error fetching transcripts:", error);
                }
            }
        };
        fetchTranscripts();
    }, [selectedCall]);

    const filteredCalls = calls.filter(call =>
        call.phone_number.includes(searchQuery) ||
        (call.classification && call.classification.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (calls.length === 0 && !isLoading) {
        return (
            <div className="calls-page">
                <div className="calls-header">
                    <h2>Historique des Appels</h2>
                </div>
                <EmptyState
                    title="Aucun appel pour le moment"
                    message="L'historique des appels apparaîtra ici dès que votre assistance téléphonique Twilio sera connectée."
                    icon="📞"
                />
            </div>
        );
    }

    if (selectedCall) {
        return (
            <div className="call-detail-view">
                <div className="detail-header">
                    <button className="back-btn" onClick={() => setSelectedCall(null)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Retour
                    </button>
                    <div className="call-info-main">
                        <h2>Détail de l'appel</h2>
                        <h3>{selectedCall.phone_number}</h3>
                    </div>
                </div>

                <div className="detail-content-grid">
                    <div className="detail-left-panel">
                        <section className="info-extracted">
                            <h4>Informations de l'appel</h4>
                            <div className="info-item">
                                <label>Date:</label>
                                <span>{new Date(selectedCall.created_at).toLocaleString('fr-FR')}</span>
                            </div>
                            <div className="info-item">
                                <label>Durée:</label>
                                <span>{Math.floor(selectedCall.duration_seconds / 60)} min {selectedCall.duration_seconds % 60} s</span>
                            </div>
                            <div className="info-item">
                                <label>Direction:</label>
                                <span>{selectedCall.direction === 'inbound' ? 'Entrant' : 'Sortant'}</span>
                            </div>
                        </section>

                        <section className="patient-file-link">
                            <h4>Fiche patient</h4>
                            <div className="empty-file-box">
                                {selectedCall.patient_id ? "Patient identifié" : "Aucune fiche patient n'est associée à cet appel."}
                            </div>
                        </section>
                    </div>

                    <div className="detail-center-panel">
                        <div className="summary-box">
                            <h4>Synthèse IA</h4>
                            <p>{selectedCall.summary || "Synthèse en cours de génération ou non disponible pour cet appel."}</p>
                        </div>

                        <div className="activity-section">
                            <h4>Actions</h4>
                            <div className="activity-buttons">
                                <button>Lier au dossier</button>
                                <button>Marquer traité</button>
                            </div>
                        </div>
                    </div>

                    <div className="detail-right-panel">
                        <h4>Transcription</h4>
                        <div className="transcript-container">
                            {transcripts.length === 0 ? (
                                <p className="no-transcript">Transcription non disponible.</p>
                            ) : (
                                transcripts.map((t) => (
                                    <div key={t.id} className={`msg ${t.role}`}>
                                        <p><strong>{t.role === 'ai' ? 'Julie' : 'Patient'}:</strong> {t.content}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="calls-page">
            <div className="calls-header">
                <h2>Historique des Appels</h2>
                <div className="calls-actions">
                    <div className="search-box">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
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

            <div className="calls-table-container">
                <table className="calls-table">
                    <thead>
                        <tr>
                            <th>DATE</th>
                            <th>TÉLÉPHONE</th>
                            <th>CLASSIFICATION</th>
                            <th>DURÉE</th>
                            <th>STATUS</th>
                            <th>ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCalls.map(call => (
                            <tr key={call.id}>
                                <td className="date-cell">
                                    {new Date(call.created_at).toLocaleString('fr-FR')}
                                </td>
                                <td>{call.phone_number}</td>
                                <td>
                                    <span className={`badge-classification ${call.classification?.toLowerCase()}`}>
                                        {call.classification || 'Indéfini'}
                                    </span>
                                </td>
                                <td>{Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s</td>
                                <td>
                                    <span className={`status-badge ${call.status}`}>
                                        {call.status}
                                    </span>
                                </td>
                                <td>
                                    <button className="voir-btn" onClick={() => setSelectedCall(call)}>Voir</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Calls;
