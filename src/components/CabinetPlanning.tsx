import { useCallback, useEffect, useState } from 'react';
import { useLiveRefresh } from '../services/liveSync';
import Icon from './Icon';
import OnyxCephTravauxTable from './OnyxCephTravauxTable';
import { Appointment, getAppointments, createAppointment, updateAppointment } from '../services/appointmentService';
import { Patient, getPatients } from '../services/patientService';
import './CabinetPlanning.css';

// Planning du cabinet (secrétariat) : rendez-vous patients + étiquettes Monday des travaux.

const APPOINTMENT_TYPES = ['Consultation', 'Contrôle', 'Pose appareil', 'Activation', 'Urgence', 'Dépose', 'Empreintes', 'Photos / radios'];
const STATUS_STYLES: Record<Appointment['status'], string> = {
    'planifié': '',
    'confirmé': 'om-badge--accent',
    'terminé': 'om-badge--success',
    'annulé': 'om-badge--danger',
};
const DAYS_AHEAD = 14;

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const dayTitle = (key: string) => {
    const date = new Date(`${key}T12:00:00`);
    const today = new Date().toISOString().slice(0, 10);
    const label = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return key === today ? `Aujourd'hui — ${label}` : label.charAt(0).toUpperCase() + label.slice(1);
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const CabinetPlanning = () => {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        patient_id: '',
        date: new Date().toISOString().slice(0, 10),
        time: '09:00',
        duration_minutes: 30,
        type: APPOINTMENT_TYPES[0],
        notes: '',
    });

    // silent : rafraîchissement en direct, sans écran de chargement ni message sur une coupure passagère
    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [appts, pts] = await Promise.all([getAppointments(), getPatients()]);
            setAppointments(appts);
            setPatients(pts);
            setError(null);
        } catch (e: any) {
            if (!silent) setError(e.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);
    useLiveRefresh(() => { load(true); }, ['appointments', 'patients']);

    useEffect(() => { load(); }, [load]);

    // Rendez-vous d'aujourd'hui aux 14 prochains jours, regroupés par jour
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + DAYS_AHEAD);
    const upcoming = appointments.filter(a => {
        const d = new Date(a.date);
        return d >= start && d < end;
    });
    const groups = upcoming.reduce<Record<string, Appointment[]>>((acc, a) => {
        (acc[dayKey(a.date)] ||= []).push(a);
        return acc;
    }, {});
    const patientName = (a: Appointment) => {
        if (a.patient) return `${a.patient.nom} ${a.patient.prenom}`;
        const p = patients.find(pt => pt.id === a.patient_id);
        return p ? `${p.nom} ${p.prenom}` : 'Patient';
    };

    const submit = async () => {
        if (!form.patient_id) {
            setError('Choisissez un patient pour le rendez-vous.');
            return;
        }
        setSaving(true);
        const created = await createAppointment({
            patient_id: form.patient_id,
            date: new Date(`${form.date}T${form.time}:00`).toISOString(),
            duration_minutes: Number(form.duration_minutes) || 30,
            type: form.type,
            status: 'planifié',
            notes: form.notes.trim() || undefined,
        });
        setSaving(false);
        if (!created) {
            setError("Le rendez-vous n'a pas pu être enregistré. Vérifiez la connexion et réessayez.");
            return;
        }
        setShowForm(false);
        setForm(f => ({ ...f, patient_id: '', notes: '' }));
        await load();
    };

    const changeStatus = async (a: Appointment, status: Appointment['status']) => {
        if (await updateAppointment(a.id, { status })) {
            setAppointments(list => list.map(x => (x.id === a.id ? { ...x, status } : x)));
        } else {
            setError('Mise à jour du rendez-vous impossible.');
        }
    };

    return (
        <div className="cabinet-planning">
            <header className="planning-header">
                <div>
                    <h1 className="om-title planning-title">Planning du cabinet</h1>
                    <p className="om-muted">Rendez-vous des {DAYS_AHEAD} prochains jours et suivi des travaux (étiquettes Monday).</p>
                </div>
            </header>

            {error && (
                <div className="om-notice om-notice--danger" role="alert">
                    <p>{error}</p>
                    <button className="om-btn om-btn--ghost om-btn--sm" onClick={() => setError(null)}>Fermer</button>
                </div>
            )}

            {/* ---------------- Rendez-vous ---------------- */}
            <section className="om-card planning-section">
                <div className="om-card-header">
                    <h2 className="om-title"><Icon name="calendar" size={18} /> Rendez-vous patients</h2>
                    <button className="om-btn om-btn--primary om-btn--sm" onClick={() => setShowForm(v => !v)}>
                        <Icon name={showForm ? 'x' : 'plus'} /> {showForm ? 'Annuler' : 'Nouveau rendez-vous'}
                    </button>
                </div>

                {showForm && (
                    <div className="planning-form">
                        <label>
                            <span className="om-label">Patient</span>
                            <select className="om-input" value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })}>
                                <option value="">Choisir…</option>
                                {patients.map(p => (
                                    <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span className="om-label">Date</span>
                            <input type="date" className="om-input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                        </label>
                        <label>
                            <span className="om-label">Heure</span>
                            <input type="time" className="om-input" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
                        </label>
                        <label>
                            <span className="om-label">Durée (min)</span>
                            <input type="number" min={5} step={5} className="om-input" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
                        </label>
                        <label>
                            <span className="om-label">Type</span>
                            <select className="om-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                {APPOINTMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                        </label>
                        <label className="planning-form-notes">
                            <span className="om-label">Note pour l'équipe</span>
                            <input className="om-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Ex : prévoir empreintes, apporter la gouttière…" />
                        </label>
                        <div className="planning-form-actions">
                            <button className="om-btn om-btn--primary" onClick={submit} disabled={saving}>
                                {saving ? 'Enregistrement…' : 'Enregistrer le rendez-vous'}
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p className="om-muted">Chargement du planning…</p>
                ) : upcoming.length === 0 ? (
                    <div className="om-empty"><p>Aucun rendez-vous sur les {DAYS_AHEAD} prochains jours.</p></div>
                ) : (
                    Object.keys(groups).sort().map(key => (
                        <div key={key} className="planning-day">
                            <h3 className="om-label planning-day-title">
                                {dayTitle(key)} · {groups[key].length} RDV
                            </h3>
                            <ul className="planning-list">
                                {groups[key]
                                    .sort((a, b) => a.date.localeCompare(b.date))
                                    .map(a => (
                                        <li key={a.id} className={`planning-item ${a.status === 'annulé' ? 'is-cancelled' : ''}`}>
                                            <span className="planning-time">{timeLabel(a.date)}</span>
                                            <span className="planning-main">
                                                <strong>{patientName(a)}</strong>
                                                <span className="om-muted">
                                                    {a.type} · {a.duration_minutes} min{a.notes ? ` · ${a.notes}` : ''}
                                                </span>
                                            </span>
                                            <span className={`om-badge ${STATUS_STYLES[a.status] || ''}`}>{a.status}</span>
                                            <span className="planning-actions">
                                                {a.status === 'planifié' && (
                                                    <button className="om-btn om-btn--ghost om-btn--sm" onClick={() => changeStatus(a, 'confirmé')}>Confirmer</button>
                                                )}
                                                {a.status !== 'terminé' && a.status !== 'annulé' && (
                                                    <>
                                                        <button className="om-btn om-btn--ghost om-btn--sm" onClick={() => changeStatus(a, 'terminé')}>Terminé</button>
                                                        <button className="om-btn om-btn--ghost om-btn--sm" onClick={() => changeStatus(a, 'annulé')}>Annuler</button>
                                                    </>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    ))
                )}
            </section>

            {/* ---------------- Étiquettes Monday (travaux) ---------------- */}
            <section className="planning-section">
                <OnyxCephTravauxTable />
            </section>
        </div>
    );
};

export default CabinetPlanning;
