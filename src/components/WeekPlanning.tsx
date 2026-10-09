import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { Appointment, getAppointments, createAppointment, updateAppointment } from '../services/appointmentService';
import { Patient, getPatients } from '../services/patientService';
import { MODES_PAIEMENT, ModePaiement, Reglement, StatutReglement, listReglements, markPaid, statutReglementPatient } from '../services/reglementsService';
import { useLiveRefresh } from '../services/liveSync';
import './WeekPlanning.css';

// ============================================================================
// Agenda classique du cabinet (semaine / jour) : on clique sur un créneau pour
// placer un rendez-vous ; chaque rendez-vous affiche le statut de règlement du patient.
// ============================================================================

const APPOINTMENT_TYPES = ['Consultation', 'Contrôle', 'Pose appareil', 'Activation', 'Urgence', 'Dépose', 'Empreintes', 'Photos / radios'];
const DURATIONS = [15, 30, 45, 60, 90];
const STATUSES: Appointment['status'][] = ['planifié', 'confirmé', 'terminé', 'annulé'];
const START_HOUR = 8;
const END_HOUR = 20;
const SLOT_MIN = 30;
const SLOT_PX = 30;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mondayOf = (d: Date) => {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
    return m;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

const PAYMENT_LABEL: Record<StatutReglement['niveau'], string> = {
    retard: 'Règlement en retard',
    a_regler: 'À régler',
    a_jour: 'Règlements à jour',
    aucun: '',
};

interface Draft {
    id?: string;
    patient_id: string;
    date: string;      // AAAA-MM-JJ
    time: string;      // HH:MM
    duration_minutes: number;
    type: string;
    status: Appointment['status'];
    notes: string;
}

interface WeekPlanningProps {
    /** Fiche patient : ce patient est proposé d'office et ses rendez-vous sont mis en avant */
    focusPatient?: { id: string; label: string };
    /** Espace Secrétariat : encaisser les échéances dues directement depuis le rendez-vous */
    canCollect?: boolean;
}

const WeekPlanning = ({ focusPatient, canCollect = false }: WeekPlanningProps) => {
    const [payModes, setPayModes] = useState<Record<string, ModePaiement>>({});
    const [payingId, setPayingId] = useState<string | null>(null);
    const collect = async (r: Reglement) => {
        setPayingId(r.id);
        try {
            await markPaid(r.id, payModes[r.id] || 'CB');
            await load();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setPayingId(null);
        }
    };
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [reglements, setReglements] = useState<Reglement[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'semaine' | 'jour'>('semaine');
    const [anchor, setAnchor] = useState(() => new Date());
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [patientQuery, setPatientQuery] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        try {
            const [appts, pts, regs] = await Promise.all([
                getAppointments(),
                getPatients(),
                listReglements().catch(() => [] as Reglement[]),
            ]);
            setAppointments(appts);
            setPatients(pts);
            setReglements(regs);
            setError(null);
        } catch (e: any) {
            setError(e.message);
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    useLiveRefresh(() => { load(); }, ['appointments', 'patients', 'reglements']);

    // Ouverture positionnée sur 8 h 30 environ
    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = SLOT_PX; }, []);

    const days = useMemo(() => {
        if (view === 'jour') return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())];
        const monday = mondayOf(anchor);
        return Array.from({ length: 6 }, (_, i) => addDays(monday, i)); // lundi → samedi
    }, [view, anchor]);
    const todayKey = isoDay(new Date());
    const slots = Array.from({ length: ((END_HOUR - START_HOUR) * 60) / SLOT_MIN }, (_, i) => START_HOUR * 60 + i * SLOT_MIN);

    const patientsById = useMemo(() => new Map(patients.map(p => [p.id!, p])), [patients]);
    const nameOf = (a: Appointment) => {
        const p = a.patient || patientsById.get(a.patient_id);
        return p ? `${p.nom.toUpperCase()} ${p.prenom}` : 'Patient';
    };

    // Rendez-vous d'un jour, avec colonnes côte à côte quand ils se chevauchent
    const layoutDay = (dayKey: string) => {
        const list = appointments
            .filter(a => isoDay(new Date(a.date)) === dayKey)
            .map(a => {
                const d = new Date(a.date);
                const start = d.getHours() * 60 + d.getMinutes();
                return { a, start, end: start + (a.duration_minutes || 30) };
            })
            .sort((x, y) => x.start - y.start);
        const lanes: number[] = [];
        const placed = list.map(item => {
            let lane = lanes.findIndex(end => end <= item.start);
            if (lane === -1) { lane = lanes.length; lanes.push(item.end); } else lanes[lane] = item.end;
            return { ...item, lane };
        });
        return placed.map(item => ({
            ...item,
            lanes: Math.max(1, ...placed.filter(o => o.start < item.end && o.end > item.start).map(o => o.lane + 1)),
        }));
    };

    const title = view === 'jour'
        ? days[0].toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
        : `Semaine du ${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${days[days.length - 1].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    const move = (dir: -1 | 1) => setAnchor(a => addDays(a, dir * (view === 'jour' ? 1 : 7)));

    // ---- Création / modification --------------------------------------------------
    const openNew = (day: Date, minutes: number) => {
        setPatientQuery('');
        setDraft({
            patient_id: focusPatient?.id || '',
            date: isoDay(day),
            time: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
            duration_minutes: 30,
            type: APPOINTMENT_TYPES[1],
            status: 'planifié',
            notes: '',
        });
    };
    const openExisting = (a: Appointment) => {
        const d = new Date(a.date);
        setDraft({
            id: a.id,
            patient_id: a.patient_id,
            date: isoDay(d),
            time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
            duration_minutes: a.duration_minutes || 30,
            type: a.type,
            status: a.status,
            notes: a.notes || '',
        });
    };

    const save = async () => {
        if (!draft) return;
        if (!draft.patient_id) { setError('Choisissez un patient pour le rendez-vous.'); return; }
        setSaving(true);
        const payload = {
            patient_id: draft.patient_id,
            date: new Date(`${draft.date}T${draft.time}:00`).toISOString(),
            duration_minutes: draft.duration_minutes,
            type: draft.type,
            status: draft.status,
            notes: draft.notes.trim() || undefined,
        };
        const ok = draft.id ? await updateAppointment(draft.id, payload) : !!(await createAppointment(payload));
        setSaving(false);
        if (!ok) { setError("Le rendez-vous n'a pas pu être enregistré. Vérifiez la connexion et réessayez."); return; }
        setDraft(null);
        await load();
    };

    const patientMatches = useMemo(() => {
        const q = fold(patientQuery.trim());
        if (!q) return [];
        return patients.filter(p => fold(`${p.nom} ${p.prenom} ${p.prenom} ${p.nom} ${p.portable || ''}`).includes(q)).slice(0, 6);
    }, [patientQuery, patients]);

    const draftPayment = draft?.patient_id ? statutReglementPatient(reglements, draft.patient_id, draft.date) : null;
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    return (
        <div className={`week-planning ${focusPatient ? 'has-focus' : ''}`}>
            {error && (
                <div className="om-notice om-notice--danger" role="alert">
                    <p>{error}</p>
                    <button className="om-btn om-btn--ghost om-btn--sm" onClick={() => setError(null)}>Fermer</button>
                </div>
            )}

            <div className="wp-toolbar">
                <div className="wp-nav">
                    <button type="button" className="om-btn om-btn--secondary om-btn--sm" onClick={() => setAnchor(new Date())}>Aujourd'hui</button>
                    <button type="button" className="wp-arrow" onClick={() => move(-1)} aria-label="Précédent">‹</button>
                    <button type="button" className="wp-arrow" onClick={() => move(1)} aria-label="Suivant">›</button>
                    <h2>{title.charAt(0).toUpperCase() + title.slice(1)}</h2>
                </div>
                <div className="wp-actions">
                    <div className="wp-view">
                        <button type="button" className={view === 'jour' ? 'is-selected' : ''} onClick={() => setView('jour')}>Jour</button>
                        <button type="button" className={view === 'semaine' ? 'is-selected' : ''} onClick={() => setView('semaine')}>Semaine</button>
                    </div>
                    <button type="button" className="om-btn om-btn--primary om-btn--sm" onClick={() => openNew(view === 'jour' ? days[0] : new Date(), 9 * 60)}>
                        <Icon name="plus" /> Rendez-vous
                    </button>
                </div>
            </div>

            <div className="wp-legend">
                <span><i className="is-retard" /> Règlement en retard</span>
                <span><i className="is-a_regler" /> Échéance à régler</span>
                <span><i className="is-a_jour" /> Règlements à jour</span>
                {focusPatient && <span className="wp-legend-focus">Rendez-vous de {focusPatient.label} mis en avant</span>}
            </div>

            <div className="wp-calendar">
                {/* Grille horaire défilante */}
                <div className="wp-scroll" ref={scrollRef}>
                    {/* En-têtes des jours, collés en haut pendant le défilement */}
                    <div className="wp-heads" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
                        <div className="wp-corner" />
                        {days.map(d => (
                            <button
                                key={isoDay(d)}
                                type="button"
                                className={`wp-dayhead ${isoDay(d) === todayKey ? 'is-today' : ''}`}
                                onClick={() => { setAnchor(d); setView('jour'); }}
                                title="Voir cette journée"
                            >
                                <span>{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
                                <strong>{d.getDate()}</strong>
                            </button>
                        ))}
                    </div>
                    <div className="wp-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: slots.length * SLOT_PX }}>
                        <div className="wp-hours">
                            {slots.filter(m => m % 60 === 0).map(m => (
                                <span key={m} style={{ top: ((m - START_HOUR * 60) / SLOT_MIN) * SLOT_PX }}>{pad(m / 60)}:00</span>
                            ))}
                        </div>
                        {days.map(day => {
                            const key = isoDay(day);
                            return (
                                <div key={key} className={`wp-day ${key === todayKey ? 'is-today' : ''}`}>
                                    {slots.map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            className={`wp-slot ${m % 60 === 0 ? 'is-hour' : ''}`}
                                            style={{ height: SLOT_PX }}
                                            onClick={() => openNew(day, m)}
                                            aria-label={`Nouveau rendez-vous le ${day.toLocaleDateString('fr-FR')} à ${pad(Math.floor(m / 60))}:${pad(m % 60)}`}
                                        />
                                    ))}
                                    {key === todayKey && nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60 && (
                                        <div className="wp-now" style={{ top: ((nowMinutes - START_HOUR * 60) / SLOT_MIN) * SLOT_PX }} />
                                    )}
                                    {layoutDay(key).map(({ a, start, end, lane, lanes }) => {
                                        const top = Math.max(0, ((start - START_HOUR * 60) / SLOT_MIN) * SLOT_PX);
                                        const height = Math.max(22, ((end - start) / SLOT_MIN) * SLOT_PX - 2);
                                        const pay = statutReglementPatient(reglements, a.patient_id, key);
                                        const dimmed = focusPatient && a.patient_id !== focusPatient.id;
                                        return (
                                            <button
                                                key={a.id}
                                                type="button"
                                                className={`wp-appt status-${a.status} pay-${pay.niveau} ${dimmed ? 'is-dimmed' : ''} ${height < 44 ? 'is-compact' : ''}`}
                                                style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                                                onClick={() => openExisting(a)}
                                                title={`${timeOf(a.date)} · ${nameOf(a)} · ${a.type}${pay.niveau !== 'aucun' ? ` · ${PAYMENT_LABEL[pay.niveau]}` : ''}`}
                                            >
                                                <span className="wp-appt-line">
                                                    <b>{timeOf(a.date)}</b> {nameOf(a)}
                                                </span>
                                                <span className="wp-appt-line wp-appt-meta">{a.type}</span>
                                                {pay.niveau !== 'aucun' && (
                                                    <span className={`wp-pay is-${pay.niveau}`}>
                                                        {PAYMENT_LABEL[pay.niveau]}{pay.montant > 0 ? ` · ${eur(pay.montant)}` : ''}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Fenêtre de rendez-vous */}
            {draft && createPortal(
                <div className="wp-modal-overlay" onClick={() => setDraft(null)}>
                    <div className="wp-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
                        <div className="wp-modal-head">
                            <h3>{draft.id ? 'Rendez-vous' : 'Nouveau rendez-vous'}</h3>
                            <button type="button" className="wp-arrow" onClick={() => setDraft(null)} aria-label="Fermer"><Icon name="x" /></button>
                        </div>

                        <label className="wp-label">Patient</label>
                        {draft.patient_id ? (
                            <div className="wp-patient-chip">
                                <span>{(() => { const p = patientsById.get(draft.patient_id); return p ? `${p.nom.toUpperCase()} ${p.prenom}` : focusPatient?.label || 'Patient'; })()}</span>
                                {!draft.id && (
                                    <button type="button" onClick={() => setDraft({ ...draft, patient_id: '' })} aria-label="Changer de patient"><Icon name="x" size={14} /></button>
                                )}
                            </div>
                        ) : (
                            <div className="wp-patient-search">
                                <Icon name="search" size={15} />
                                <input autoFocus value={patientQuery} onChange={e => setPatientQuery(e.target.value)} placeholder="Nom, prénom ou portable…" />
                                {patientMatches.length > 0 && (
                                    <ul>
                                        {patientMatches.map(p => (
                                            <li key={p.id}>
                                                <button type="button" onClick={() => { setDraft({ ...draft, patient_id: p.id! }); setPatientQuery(''); }}>
                                                    {p.nom.toUpperCase()} {p.prenom}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {draftPayment && draftPayment.niveau !== 'aucun' && (
                            <div className={`wp-payment-box is-${draftPayment.niveau}`}>
                                <strong>{PAYMENT_LABEL[draftPayment.niveau]}{draftPayment.montant > 0 ? ` · ${eur(draftPayment.montant)}` : ''}</strong>
                                {draftPayment.echeances.map(r => (
                                    <div key={r.id} className="wp-payment-row">
                                        <span>{r.acte} · {r.libelle} — <b>{eur(r.montant)}</b>, échéance du {dateFr(r.echeance)}</span>
                                        {canCollect && (
                                            <span className="wp-payment-pay">
                                                <select value={payModes[r.id] || 'CB'} onChange={e => setPayModes(m => ({ ...m, [r.id]: e.target.value as ModePaiement }))} aria-label="Mode de paiement">
                                                    {MODES_PAIEMENT.map(m => <option key={m}>{m}</option>)}
                                                </select>
                                                <button type="button" className="om-btn om-btn--primary om-btn--sm" disabled={payingId === r.id} onClick={() => collect(r)}>
                                                    <Icon name="check" size={14} /> Encaissé
                                                </button>
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="wp-modal-grid">
                            <div>
                                <label className="wp-label">Date</label>
                                <input type="date" className="wp-input" value={draft.date} onChange={e => e.target.value && setDraft({ ...draft, date: e.target.value })} />
                            </div>
                            <div>
                                <label className="wp-label">Heure</label>
                                <input type="time" step={300} className="wp-input" value={draft.time} onChange={e => e.target.value && setDraft({ ...draft, time: e.target.value })} />
                            </div>
                            <div>
                                <label className="wp-label">Durée</label>
                                <select className="wp-input" value={draft.duration_minutes} onChange={e => setDraft({ ...draft, duration_minutes: Number(e.target.value) })}>
                                    {[...new Set([...DURATIONS, draft.duration_minutes])].sort((x, y) => x - y).map(d => <option key={d} value={d}>{d} min</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="wp-label">Type</label>
                                <select className="wp-input" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })}>
                                    {[...new Set([...APPOINTMENT_TYPES, draft.type])].map(t => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                        </div>

                        {draft.id && (
                            <>
                                <label className="wp-label">Statut</label>
                                <div className="wp-status">
                                    {STATUSES.map(st => (
                                        <button key={st} type="button" className={`${draft.status === st ? 'is-selected' : ''} is-${st}`} onClick={() => setDraft({ ...draft, status: st })}>
                                            {st.charAt(0).toUpperCase() + st.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}

                        <label className="wp-label">Note pour l'équipe</label>
                        <input className="wp-input" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="Ex : prévoir empreintes, apporter la gouttière…" />

                        <div className="wp-modal-actions">
                            <button type="button" className="om-btn om-btn--ghost" onClick={() => setDraft(null)}>Annuler</button>
                            <button type="button" className="om-btn om-btn--primary" onClick={save} disabled={saving || !draft.patient_id}>
                                {saving ? 'Enregistrement…' : 'Enregistrer'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default WeekPlanning;
