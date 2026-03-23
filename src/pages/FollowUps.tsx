import { useState, useEffect } from 'react';
import { getFollowUps, updateFollowUpStatus, FollowUp } from '../services/followUpService';
import { EmptyState } from '../components/EmptyState';
import './FollowUps.css';

const FollowUps = () => {
    const [followUps, setFollowUps] = useState<FollowUp[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchFollowUps = async () => {
            setIsLoading(true);
            try {
                const data = await getFollowUps();
                setFollowUps(data);
            } catch (error) {
                console.error("Error fetching follow-ups:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchFollowUps();
    }, []);

    const handleStatusUpdate = async (id: string, newStatus: FollowUp['status']) => {
        const success = await updateFollowUpStatus(id, newStatus);
        if (success) {
            setFollowUps(prev => prev.map(fu => fu.id === id ? { ...fu, status: newStatus } : fu));
        }
    };

    if (followUps.length === 0 && !isLoading) {
        return (
            <div className="followups-page">
                <div className="followups-header">
                    <h2>Relances</h2>
                </div>
                <EmptyState
                    title="Aucune relance en attente"
                    message="Les relances (impayés, post-op, rappels) apparaîtront ici automatiquement selon les besoins de vos patients."
                    icon="🔔"
                />
            </div>
        );
    }

    return (
        <div className="followups-page">
            <div className="followups-header">
                <h2>Relances</h2>
                <div className="header-info">
                    <span>{followUps.filter(f => f.status !== 'terminé').length} à traiter</span>
                </div>
            </div>

            <div className="followups-list">
                {followUps.map(fu => (
                    <div key={fu.id} className="followup-card">
                        <div className="fu-info">
                            <h4>{fu.patient?.prenom} {fu.patient?.nom}</h4>
                            <p className="fu-type">{fu.type}</p>
                            <span className="fu-date">Date prévue: {fu.due_date ? new Date(fu.due_date).toLocaleDateString('fr-FR') : 'Non définie'}</span>
                        </div>
                        <div className={`fu-status ${fu.status.toLowerCase().replace(' ', '-')}`}>
                            {fu.status}
                        </div>
                        <div className="fu-priority" data-priority={fu.priority}>
                            {fu.priority}
                        </div>
                        <div className="fu-actions">
                            {fu.status !== 'terminé' && (
                                <button className="fu-action-btn complete" onClick={() => handleStatusUpdate(fu.id, 'terminé')}>
                                    Marquer terminé
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FollowUps;
