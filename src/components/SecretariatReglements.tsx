import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { Patient, getPatients } from '../services/patientService';
import {
    ActeCode, CATALOGUE, LignePlan, MODES_PAIEMENT, ModePaiement, Reglement,
    acteDuCatalogue, createPlan, deletePlan, listReglements, markPaid, markUnpaid, proposerLignes, todayIso, updateEcheance,
} from '../services/reglementsService';
import { useLiveRefresh } from '../services/liveSync';
import './SecretariatReglements.css';

// ============================================================================
// Espace Secrétariat › Règlements : catalogue des actes, échéanciers par patient,
// encaissements. Données partagées en direct entre les postes du cabinet.
// ============================================================================

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const patientLabel = (p?: Patient) => (p ? `${p.nom.toUpperCase()} ${p.prenom}` : 'Patient supprimé');
// Saisie d'un montant « 1 050,50 » ou « 1050.5 »
const parseEuros = (v: string) => {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

// Champ montant en euros, modifiable librement (cabinet libéral)
const formatEuros = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2)).replace('.', ',');
const EuroInput = ({ value, onChange, ariaLabel }: { value: number; onChange: (n: number) => void; ariaLabel: string }) => {
    const [text, setText] = useState(formatEuros(value));
    useEffect(() => { if (parseEuros(text) !== value) setText(formatEuros(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <span className="reglements-euro">
            <input
                inputMode="decimal"
                value={text}
                aria-label={ariaLabel}
                onChange={e => { setText(e.target.value); onChange(parseEuros(e.target.value)); }}
            />
            €
        </span>
    );
};

type Filtre = 'retard' | 'avenir' | 'payees' | 'toutes';

const SecretariatReglements = () => {
    const [reglements, setReglements] = useState<Reglement[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [r, p] = await Promise.all([listReglements(), getPatients()]);
            setReglements(r);
            setPatients(p);
            setError(null);
        } catch (e: any) {
            if (!silent) setError(e.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    useLiveRefresh(() => { load(true); }, ['reglements', 'patients']);

    const patientsById = useMemo(() => new Map(patients.map(p => [p.id!, p])), [patients]);
    const today = todayIso();

    // ---- Indicateurs ---------------------------------------------------------
    const stats = useMemo(() => {
        const in30 = new Date(); in30.setDate(in30.getDate() + 30);
        const in30Iso = in30.toISOString().slice(0, 10);
        const monthPrefix = today.slice(0, 7);
        const unpaid = reglements.filter(r => !r.paye_le);
        const retard = unpaid.filter(r => r.echeance < today);
        const avenir = unpaid.filter(r => r.echeance >= today && r.echeance <= in30Iso);
        const encaisse = reglements.filter(r => r.paye_le?.startsWith(monthPrefix));
        const sum = (list: Reglement[]) => list.reduce((t, r) => t + r.montant, 0);
        return {
            retard: { count: retard.length, total: sum(retard) },
            avenir: { count: avenir.length, total: sum(avenir) },
            encaisse: { count: encaisse.length, total: sum(encaisse) },
        };
    }, [reglements, today]);

    // ---- Nouveau règlement -----------------------------------------------------
    const [patientQuery, setPatientQuery] = useState('');
    const [patientId, setPatientId] = useState<string | null>(null);
    const [acte, setActe] = useState<ActeCode>('TO90');
    const [nombre, setNombre] = useState(6);
    const [base, setBase] = useState(950);      // tarif par semestre (TO90) ou montant total (autres actes)
    const [debut, setDebut] = useState(today);
    const [lignes, setLignes] = useState<LignePlan[]>(() => proposerLignes('TO90', 6, today, 950));
    const [payeNow, setPayeNow] = useState(false);
    const [modeNow, setModeNow] = useState<ModePaiement>('CB');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const catalogue = acteDuCatalogue(acte);
    // Toute modification du point de départ recalcule l'échéancier proposé (ensuite modifiable ligne par ligne)
    const propose = (next: Partial<{ acte: ActeCode; nombre: number; base: number; debut: string }>) => {
        const a = next.acte ?? acte, n = next.nombre ?? nombre, b = next.base ?? base, d = next.debut ?? debut;
        setLignes(proposerLignes(a, n, d, b));
    };
    const chooseActe = (code: ActeCode) => {
        const a = acteDuCatalogue(code);
        setActe(code);
        setNombre(a.echeancesParDefaut);
        setBase(a.tarifs[0]);
        setPayeNow(code === 'TO20');
        propose({ acte: code, nombre: a.echeancesParDefaut, base: a.tarifs[0] });
    };
    const setLigne = (index: number, changes: Partial<LignePlan>) =>
        setLignes(prev => prev.map((l, i) => (i === index ? { ...l, ...changes } : l)));

    const totals = lignes.reduce((t, l) => ({ montant: t.montant + l.montant, secu: t.secu + l.remboursement_secu }), { montant: 0, secu: 0 });

    const patientMatches = useMemo(() => {
        const q = fold(patientQuery.trim());
        if (!q || patientId) return [];
        return patients.filter(p => fold(`${p.nom} ${p.prenom} ${p.prenom} ${p.nom} ${p.portable || ''}`).includes(q)).slice(0, 6);
    }, [patientQuery, patients, patientId]);
    const selectedPatient = patientId ? patientsById.get(patientId) : undefined;

    const submit = async () => {
        if (!patientId) { setNotice('Choisissez d’abord un patient.'); return; }
        setSaving(true);
        setNotice(null);
        try {
            await createPlan({ patientId, acte, lignes, payeImmediatement: payeNow ? { mode: modeNow } : undefined });
            setNotice(`${acte} enregistré pour ${patientLabel(selectedPatient)} : ${lignes.length} échéance${lignes.length > 1 ? 's' : ''}.`);
            setPatientId(null);
            setPatientQuery('');
            await load(true);
        } catch (e: any) {
            setNotice(e.message);
        } finally {
            setSaving(false);
        }
    };

    // ---- Échéancier -------------------------------------------------------------
    const [filtre, setFiltre] = useState<Filtre>('retard');
    const [search, setSearch] = useState('');
    const [modes, setModes] = useState<Record<string, ModePaiement>>({});
    const [busyId, setBusyId] = useState<string | null>(null);
    // Modification d'une échéance existante
    const [editing, setEditing] = useState<{ id: string; echeance: string; montant: number; remboursement_secu: number } | null>(null);

    const visibles = useMemo(() => {
        const q = fold(search.trim());
        return reglements
            .filter(r => {
                if (filtre === 'retard') return !r.paye_le && r.echeance < today;
                if (filtre === 'avenir') return !r.paye_le && r.echeance >= today;
                if (filtre === 'payees') return !!r.paye_le;
                return true;
            })
            .filter(r => !q || fold(`${patientLabel(patientsById.get(r.patient_id))} ${r.acte} ${r.libelle}`).includes(q))
            .sort((a, b) => (filtre === 'payees' ? (b.paye_le || '').localeCompare(a.paye_le || '') : a.echeance.localeCompare(b.echeance)));
    }, [reglements, filtre, search, today, patientsById]);

    const act = async (id: string, action: () => Promise<void>) => {
        setBusyId(id);
        try { await action(); await load(true); } catch (e: any) { setError(e.message); } finally { setBusyId(null); }
    };

    const status = (r: Reglement) => r.paye_le ? 'payee' : r.echeance < today ? 'retard' : 'avenir';

    return (
        <div className="reglements">
            {error && <div className="om-notice om-notice--danger" role="alert"><p>{error}</p></div>}

            {/* Indicateurs */}
            <div className="reglements-kpis">
                <button type="button" className={`reglements-kpi is-danger ${filtre === 'retard' ? 'is-active' : ''}`} onClick={() => setFiltre('retard')}>
                    <span>En retard</span>
                    <strong>{eur(stats.retard.total)}</strong>
                    <small>{stats.retard.count} échéance{stats.retard.count > 1 ? 's' : ''}</small>
                </button>
                <button type="button" className={`reglements-kpi ${filtre === 'avenir' ? 'is-active' : ''}`} onClick={() => setFiltre('avenir')}>
                    <span>À encaisser sous 30 jours</span>
                    <strong>{eur(stats.avenir.total)}</strong>
                    <small>{stats.avenir.count} échéance{stats.avenir.count > 1 ? 's' : ''}</small>
                </button>
                <button type="button" className={`reglements-kpi is-success ${filtre === 'payees' ? 'is-active' : ''}`} onClick={() => setFiltre('payees')}>
                    <span>Encaissé ce mois-ci</span>
                    <strong>{eur(stats.encaisse.total)}</strong>
                    <small>{stats.encaisse.count} règlement{stats.encaisse.count > 1 ? 's' : ''}</small>
                </button>
            </div>

            <div className="reglements-layout">
                {/* Nouveau règlement */}
                <section className="reglements-card reglements-new">
                    <h2>Nouveau règlement</h2>

                    <label className="reglements-label">Patient</label>
                    {selectedPatient ? (
                        <div className="reglements-patient-chip">
                            <span>{patientLabel(selectedPatient)}</span>
                            <button type="button" onClick={() => { setPatientId(null); setPatientQuery(''); }} aria-label="Changer de patient">
                                <Icon name="x" size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="reglements-patient-search">
                            <Icon name="search" size={15} />
                            <input value={patientQuery} onChange={e => setPatientQuery(e.target.value)} placeholder="Nom, prénom ou portable…" />
                            {patientMatches.length > 0 && (
                                <ul>
                                    {patientMatches.map(p => (
                                        <li key={p.id}>
                                            <button type="button" onClick={() => { setPatientId(p.id!); setPatientQuery(''); }}>
                                                <strong>{patientLabel(p)}</strong>
                                                {p.date_naissance && <span>{dateFr(p.date_naissance)}</span>}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <label className="reglements-label">Acte</label>
                    <div className="reglements-catalogue">
                        {CATALOGUE.map(a => (
                            <button key={a.code} type="button" className={`reglements-acte ${acte === a.code ? 'is-selected' : ''}`} onClick={() => chooseActe(a.code)}>
                                <span className="reglements-acte-code">{a.code}</span>
                                <span className="reglements-acte-name">{a.libelle}</span>
                                <span className="reglements-acte-price">{a.tarifs.map(eur).join(' ou ')}{a.parEcheance ? ` / ${a.unite}` : ''}</span>
                                <span className="reglements-acte-meta">{a.description} · Remboursement Sécurité sociale {eur(a.remboursementSecu)}</span>
                            </button>
                        ))}
                    </div>

                    <div className="reglements-row">
                        <div>
                            <label className="reglements-label">{catalogue.parEcheance ? `Tarif par ${catalogue.unite}` : 'Montant total'}</label>
                            <EuroInput value={base} ariaLabel="Montant" onChange={n => { setBase(n); propose({ base: n }); }} />
                            <div className="reglements-quick-tarifs">
                                {catalogue.tarifs.map(t => (
                                    <button key={t} type="button" className={base === t ? 'is-selected' : ''} onClick={() => { setBase(t); propose({ base: t }); }}>{eur(t)}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="reglements-label">{catalogue.parEcheance ? '1er semestre' : '1er versement'}</label>
                            <input type="date" value={debut} onChange={e => { const d = e.target.value || today; setDebut(d); propose({ debut: d }); }} className="reglements-input" />
                        </div>
                    </div>

                    <label className="reglements-label">{catalogue.parEcheance ? 'Nombre de semestres' : 'Paiement en'}</label>
                    <div className="reglements-stepper" style={{ gridTemplateColumns: `repeat(${Math.min(catalogue.maxEcheances, 6)}, minmax(0, 1fr))` }}>
                        {Array.from({ length: catalogue.maxEcheances }, (_, i) => i + 1).map(n => (
                            <button key={n} type="button" className={nombre === n ? 'is-selected' : ''} onClick={() => { setNombre(n); propose({ nombre: n }); }}>
                                {catalogue.parEcheance ? n : `${n}×`}
                            </button>
                        ))}
                    </div>

                    <div className="reglements-paynow">
                        <label className="reglements-toggle">
                            <input type="checkbox" checked={payeNow} onChange={e => setPayeNow(e.target.checked)} />
                            <span>{lignes.length > 1 ? '1re échéance réglée aujourd’hui' : 'Réglé aujourd’hui'}</span>
                        </label>
                        {payeNow && (
                            <select value={modeNow} onChange={e => setModeNow(e.target.value as ModePaiement)} className="reglements-input">
                                {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
                            </select>
                        )}
                    </div>

                    {/* Échéancier proposé : chaque date et chaque montant restent modifiables */}
                    <table className="reglements-preview">
                        <thead>
                            <tr><th>Échéance</th><th>Date</th><th>Montant</th><th>Sécurité sociale</th></tr>
                        </thead>
                        <tbody>
                            {lignes.map((l, i) => (
                                <tr key={i}>
                                    <td>{lignes.length > 1 ? `${catalogue.unite} ${i + 1}` : catalogue.code}</td>
                                    <td><input type="date" value={l.echeance} onChange={e => e.target.value && setLigne(i, { echeance: e.target.value })} /></td>
                                    <td><EuroInput value={l.montant} ariaLabel={`Montant échéance ${i + 1}`} onChange={n => setLigne(i, { montant: n })} /></td>
                                    <td><EuroInput value={l.remboursement_secu} ariaLabel={`Remboursement Sécurité sociale échéance ${i + 1}`} onChange={n => setLigne(i, { remboursement_secu: n })} /></td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr><td colSpan={2}>Total</td><td>{eur(totals.montant)}</td><td>{eur(totals.secu)}</td></tr>
                            <tr className="is-muted"><td colSpan={2}>Reste à charge avant mutuelle</td><td colSpan={2}>{eur(totals.montant - totals.secu)}</td></tr>
                        </tfoot>
                    </table>
                    <p className="reglements-hint">Dates et montants modifiables ligne par ligne.</p>

                    {notice && <p className="reglements-notice">{notice}</p>}
                    <button type="button" className="om-btn om-btn--primary reglements-submit" onClick={submit} disabled={saving || !patientId}>
                        {saving ? 'Enregistrement…' : `Enregistrer le ${acte}`}
                    </button>
                </section>

                {/* Échéancier */}
                <section className="reglements-card reglements-list">
                    <div className="reglements-list-head">
                        <h2>Échéancier</h2>
                        <div className="reglements-filters">
                            {([['retard', 'En retard'], ['avenir', 'À venir'], ['payees', 'Payées'], ['toutes', 'Toutes']] as [Filtre, string][]).map(([f, label]) => (
                                <button key={f} type="button" className={filtre === f ? 'is-selected' : ''} onClick={() => setFiltre(f)}>{label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="reglements-patient-search reglements-list-search">
                        <Icon name="search" size={15} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un patient ou un acte…" />
                    </div>

                    {loading ? (
                        <p className="om-muted">Chargement des règlements…</p>
                    ) : visibles.length === 0 ? (
                        <div className="om-empty"><p>{filtre === 'retard' ? 'Aucun règlement en retard.' : 'Aucun règlement dans cette liste.'}</p></div>
                    ) : (
                        <ul className="reglements-rows">
                            {visibles.map(r => {
                                const st = status(r);
                                return (
                                    <li key={r.id} className={`reglements-item is-${st}`}>
                                        <div className="reglements-item-main">
                                            <strong>{patientLabel(patientsById.get(r.patient_id))}</strong>
                                            <span>{r.acte} · {r.libelle}</span>
                                        </div>
                                        {editing?.id === r.id ? (
                                            <div className="reglements-item-edit">
                                                <input type="date" value={editing.echeance} onChange={e => e.target.value && setEditing({ ...editing, echeance: e.target.value })} />
                                                <EuroInput value={editing.montant} ariaLabel="Montant" onChange={n => setEditing({ ...editing, montant: n })} />
                                                <span className="om-muted">Sécurité sociale</span>
                                                <EuroInput value={editing.remboursement_secu} ariaLabel="Remboursement Sécurité sociale" onChange={n => setEditing({ ...editing, remboursement_secu: n })} />
                                                <button type="button" className="om-btn om-btn--primary om-btn--sm" disabled={busyId === r.id}
                                                    onClick={() => act(r.id, async () => {
                                                        await updateEcheance(r.id, { echeance: editing.echeance, montant: editing.montant, remboursement_secu: editing.remboursement_secu });
                                                        setEditing(null);
                                                    })}>
                                                    Enregistrer
                                                </button>
                                                <button type="button" className="om-btn om-btn--ghost om-btn--sm" onClick={() => setEditing(null)}>Annuler</button>
                                            </div>
                                        ) : (<>
                                        <div className="reglements-item-date">
                                            <span className={`reglements-badge is-${st}`}>
                                                {st === 'payee' ? `Payé le ${dateFr(r.paye_le!)}` : st === 'retard' ? 'En retard' : 'À venir'}
                                            </span>
                                            <small>Échéance {dateFr(r.echeance)}</small>
                                        </div>
                                        <div className="reglements-item-amount">
                                            <strong>{eur(r.montant)}</strong>
                                            <small>Sécurité sociale {eur(r.remboursement_secu)}</small>
                                        </div>
                                        <div className="reglements-item-actions">
                                            {r.paye_le ? (
                                                <>
                                                    <span className="om-muted">{r.mode_paiement}</span>
                                                    <button type="button" className="om-btn om-btn--ghost om-btn--sm" disabled={busyId === r.id} onClick={() => act(r.id, () => markUnpaid(r.id))}>Annuler</button>
                                                </>
                                            ) : (
                                                <>
                                                    <select value={modes[r.id] || 'CB'} onChange={e => setModes(m => ({ ...m, [r.id]: e.target.value as ModePaiement }))}>
                                                        {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
                                                    </select>
                                                    <button type="button" className="om-btn om-btn--primary om-btn--sm" disabled={busyId === r.id} onClick={() => act(r.id, () => markPaid(r.id, modes[r.id] || 'CB'))}>
                                                        <Icon name="check" size={14} /> Encaissé
                                                    </button>
                                                </>
                                            )}
                                            <button
                                                type="button"
                                                className="reglements-delete"
                                                title="Modifier la date ou le montant"
                                                aria-label="Modifier l'échéance"
                                                onClick={() => setEditing({ id: r.id, echeance: r.echeance, montant: r.montant, remboursement_secu: r.remboursement_secu })}
                                            >
                                                <Icon name="edit" size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                className="reglements-delete"
                                                title="Supprimer ce traitement (toutes ses échéances)"
                                                aria-label="Supprimer ce traitement"
                                                disabled={busyId === r.id}
                                                onClick={() => {
                                                    if (window.confirm(`Supprimer le ${r.acte} de ${patientLabel(patientsById.get(r.patient_id))} et ses ${r.nombre} échéance(s) ?`)) {
                                                        act(r.id, () => deletePlan(r.plan_id));
                                                    }
                                                }}
                                            >
                                                <Icon name="trash" size={14} />
                                            </button>
                                        </div>
                                        </>)}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

export default SecretariatReglements;
