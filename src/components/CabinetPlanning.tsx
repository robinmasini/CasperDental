import WeekPlanning from './WeekPlanning';
import { useAuth } from '../context/AuthContext';
import './CabinetPlanning.css';

// Planning du cabinet : agenda classique des rendez-vous patients, avec le statut de règlement
// de chaque patient. Encaissement depuis le rendez-vous réservé à l'Espace Secrétariat.
const CabinetPlanning = () => {
    const { user } = useAuth();
    return (
        <div className="cabinet-planning">
            <header className="planning-header">
                <div>
                    <h1 className="om-title planning-title">Planning du cabinet</h1>
                    <p className="om-muted">Cliquez sur un créneau pour placer un rendez-vous, ou sur un rendez-vous pour le modifier.</p>
                </div>
            </header>
            <WeekPlanning canCollect={user?.role === 'secretariat'} />
        </div>
    );
};

export default CabinetPlanning;
