import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { MODES_PAIEMENT, ModePaiement, Reglement, listReglements, markPaid, markUnpaid, statutReglementPatient, todayIso } from '../services/reglementsService';
import { useLiveRefresh } from '../services/liveSync';
import './PatientReglements.css';

// ============================================================================
// Fiche patient › Règlements — affiché UNIQUEMENT dans l'Espace Secrétariat.
// ============================================================================

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const LABELS = {
    retard: 'Règlement en retard',
    a_regler: 'Échéance à régler',
    a_jour: 'Règlements à jour',
    aucun: 'Aucun règlement enregistré',
} as const;

/** Pastille de statut pour l'en-tête de la fiche */
export const PatientReglementBadge = ({ patientId }: { patientId: string }) => {
    const [reglements, setReglements] = useState<Reglement[] | null>(null);
    const load = useCallback(() => { listReglements().then(setReglements).catch(() => setReglements([])); }, []);
    useEffect(() => { load(); }, [load, patientId]);
    useLiveRefresh(load, ['reglements']);
    if (!reglements) return null;
    const statut = statutReglementPatient(reglements, patientId);
    if (statut.niveau === 'aucun') return null;
    return (
        <span className={`patient-reglement-badge is-${statut.niveau}`}>
            {LABELS[statut.niveau]}{statut.montant > 0 ? ` · ${eur(statut.montant)}` : ''}
        </span>
    );
};

const PatientReglements = ({ patientId }: { patientId: string }) => {
    const [reglements, setReglements] = useState<Reglement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modes, setModes] = useState<Record<string, ModePaiement>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            setReglements(await listReglements());
            setError(null);
        } catch (e: any) {
            if (!silent) setError(e.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    useLiveRefresh(() => { load(true); }, ['reglements']);

    const act = async (id: string, action: () => Promise<void>) => {
        setBusyId(id);
        try { await action(); await load(true); } catch (e: any) { setError(e.message); } finally { setBusyId(null); }
    };

    const today = todayIso();
    const mine = reglements.filter(r => r.patient_id === patientId).sort((a, b) => a.echeance.localeCompare(b.echeance));
    const statut = statutReglementPatient(reglements, patientId);
    const total = mine.reduce((t, r) => t + r.montant, 0);
    const paye = mine.filter(r => r.paye_le).reduce((t, r) => t + r.montant, 0);
    const secu = mine.reduce((t, r) => t + r.remboursement_secu, 0);

    if (loading) return <p className="om-muted">Chargement des règlements…</p>;

    return (
        <div className="patient-reglements">
            {error && <div className="om-notice om-notice--danger" role="alert"><p>{error}</p></div>}

            <div className={`patient-reglements-summary is-${statut.niveau}`}>
                <strong>{LABELS[statut.niveau]}{statut.montant > 0 ? ` · ${eur(statut.montant)}` : ''}</strong>
                {mine.length > 0 && (
                    <span>
                        Payé {eur(paye)} sur {eur(total)} · reste {eur(total - paye)} · remboursement Sécurité sociale {eur(secu)}
                    </span>
                )}
            </div>

            {mine.length === 0 ? (
                <div className="om-empty"><p>Aucun règlement pour ce patient. Créez son échéancier dans Secrétariat › Règlements.</p></div>
            ) : (
                <ul className="patient-reglements-list">
                    {mine.map(r => {
                        const st = r.paye_le ? 'payee' : r.echeance < today ? 'retard' : 'avenir';
                        return (
                            <li key={r.id} className={`is-${st}`}>
                                <div className="pr-main">
                                    <strong>{r.acte} · {r.libelle}</strong>
                                    <span>
                                        {st === 'payee'
                                            ? `Payé le ${dateFr(r.paye_le!)} · ${r.mode_paiement || ''}`
                                            : `${st === 'retard' ? 'En retard — ' : ''}échéance du ${dateFr(r.echeance)}`}
                                    </span>
                                </div>
                                <div className="pr-amount">
                                    <strong>{eur(r.montant)}</strong>
                                    <span>Sécurité sociale {eur(r.remboursement_secu)}</span>
                                </div>
                                <div className="pr-actions">
                                    {r.paye_le ? (
                                        <button type="button" className="om-btn om-btn--ghost om-btn--sm" disabled={busyId === r.id} onClick={() => act(r.id, () => markUnpaid(r.id))}>Annuler</button>
                                    ) : (
                                        <>
                                            <select value={modes[r.id] || 'CB'} onChange={e => setModes(m => ({ ...m, [r.id]: e.target.value as ModePaiement }))} aria-label="Mode de paiement">
                                                {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
                                            </select>
                                            <button type="button" className="om-btn om-btn--primary om-btn--sm" disabled={busyId === r.id} onClick={() => act(r.id, () => markPaid(r.id, modes[r.id] || 'CB'))}>
                                                <Icon name="check" size={14} /> Encaissé
                                            </button>
                                        </>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default PatientReglements;
