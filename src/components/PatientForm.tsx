import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Patient, createPatient, updatePatient, getPatients } from '../services/patientService';
import { extractPatientFromOrthoLeader } from '../services/geminiService';
import './PatientForm.css';

interface PatientFormProps {
    onClose: () => void;
    onSuccess: (patient: Patient, smsSent?: boolean) => void;
    initialPatient?: Patient | null;
}

// Date tapée au clavier « JJ/MM/AAAA » (barres ajoutées automatiquement) <-> AAAA-MM-JJ enregistré
const isoToFrenchDate = (iso?: string | null) => {
    const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
const maskFrenchDate = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 8);
    return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/');
};
const frenchDateToIso = (text: string): string => {
    const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return '';
    const [, dd, mm, yyyy] = m;
    const date = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
    const valid = date.getDate() === Number(dd) && date.getMonth() + 1 === Number(mm) && Number(yyyy) >= 1900 && date <= new Date();
    return valid ? `${yyyy}-${mm}-${dd}` : '';
};

// Portable saisi après « +33 » : le 0 initial est retiré à l'affichage, enregistré au format 06 12 34 56 78
const phoneDigitsAfter33 = (raw?: string | null) => {
    let d = (raw || '').replace(/\D/g, '');
    if (d.startsWith('0033')) d = d.slice(4);
    else if (d.startsWith('33') && d.length > 9) d = d.slice(2);
    return d.replace(/^0+/, '').slice(0, 9);
};
const groupPhone = (digits: string) => digits.replace(/^(\d)(\d{0,2})(\d{0,2})(\d{0,2})(\d{0,2}).*$/, (_, a, b, c, d, e) => [a, b, c, d, e].filter(Boolean).join(' '));
const storedPhone = (digits: string) => (digits ? `0${groupPhone(digits)}` : '');

const PatientForm = ({ onClose, onSuccess, initialPatient }: PatientFormProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState<Partial<Patient>>(() => {
        if (initialPatient) {
            return {
                civilite: initialPatient.civilite || 'M.',
                nom: initialPatient.nom || '',
                prenom: initialPatient.prenom || '',
                date_naissance: initialPatient.date_naissance || '',
                responsable_num_secu: initialPatient.responsable_num_secu || '',
                email: initialPatient.email || '',
                portable: initialPatient.portable || initialPatient.telephone || '',
                sexe: initialPatient.sexe || 'M',
                type_patient: initialPatient.type_patient || 'Adulte',
                praticien: initialPatient.praticien || 'Dr. Renaud Desouches',
                suivi_exclusif: initialPatient.suivi_exclusif || false
            };
        }
        return {
            nom: '',
            prenom: '',
            date_naissance: '',
            responsable_num_secu: '',
            email: '',
            portable: '',
            civilite: 'M.',
            sexe: 'M',
            type_patient: 'Adulte',
            praticien: 'Dr. Renaud Desouches',
            suivi_exclusif: false
        };
    });

    // Champs saisis « à la française » : affichage local, valeur enregistrée normalisée
    const [birthText, setBirthText] = useState(() => isoToFrenchDate(formData.date_naissance));
    const [phoneText, setPhoneText] = useState(() => groupPhone(phoneDigitsAfter33(formData.portable)));
    // Remplissage externe (import OrthoLeader) : les champs affichés suivent
    useEffect(() => {
        if (formData.date_naissance && frenchDateToIso(birthText) !== formData.date_naissance) setBirthText(isoToFrenchDate(formData.date_naissance));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.date_naissance]);
    useEffect(() => {
        const digits = phoneDigitsAfter33(formData.portable);
        if (digits !== phoneDigitsAfter33(phoneText)) setPhoneText(groupPhone(digits));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.portable]);

    const handleBirthChange = (value: string) => {
        const masked = maskFrenchDate(value);
        setBirthText(masked);
        setFormData(prev => ({ ...prev, date_naissance: frenchDateToIso(masked) }));
    };
    const handlePhoneChange = (value: string) => {
        const digits = phoneDigitsAfter33(value);
        setPhoneText(groupPhone(digits));
        setFormData(prev => ({ ...prev, portable: storedPhone(digits) }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Import d'une photo de la fiche OrthoLeader : pré-remplit nom, prénom, naissance et portable
    const orthoLeaderInputRef = useRef<HTMLInputElement>(null);
    const [isReadingOrthoLeader, setIsReadingOrthoLeader] = useState(false);
    const [orthoLeaderStatus, setOrthoLeaderStatus] = useState('');

    const handleOrthoLeaderFile = async (file?: File) => {
        if (!file) return;
        setError('');
        setOrthoLeaderStatus('');
        setIsReadingOrthoLeader(true);
        try {
            const fields = await extractPatientFromOrthoLeader(file);
            const filled = Object.entries(fields).filter(([, v]) => v);
            if (filled.length === 0) throw new Error("Aucune information lisible sur cette photo de la fiche OrthoLeader.");
            setFormData(prev => ({ ...prev, ...Object.fromEntries(filled) }));
            setOrthoLeaderStatus(filled.length === 4
                ? 'Fiche OrthoLeader lue : vérifiez les champs avant d’enregistrer.'
                : 'Fiche OrthoLeader lue en partie : complétez les champs restés vides.');
        } catch (e: any) {
            setError(e.message || 'Lecture de la fiche OrthoLeader impossible.');
        } finally {
            setIsReadingOrthoLeader(false);
            if (orthoLeaderInputRef.current) orthoLeaderInputRef.current.value = '';
        }
    };

    // Création : détection d'un patient déjà enregistré (même portable, ou même nom + prénom + naissance)
    const [existingPatients, setExistingPatients] = useState<Patient[]>([]);
    const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
    useEffect(() => {
        if (initialPatient) return;
        getPatients().then(setExistingPatients).catch(() => undefined);
    }, [initialPatient]);

    const phoneKey = (phone?: string | null) => (phone || '').replace(/\D/g, '').slice(-9);
    const textKey = (value?: string | null) => (value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const duplicates = useMemo(() => {
        if (initialPatient) return [];
        const phone = phoneKey(formData.portable);
        const nom = textKey(formData.nom);
        const prenom = textKey(formData.prenom);
        return existingPatients
            .map(p => {
                const samePhone = phone.length === 9 && [p.portable, p.telephone].some(t => phoneKey(t) === phone);
                const sameIdentity = !!nom && !!prenom && !!formData.date_naissance
                    && textKey(p.nom) === nom && textKey(p.prenom) === prenom && p.date_naissance === formData.date_naissance;
                return { patient: p, samePhone, sameIdentity };
            })
            .filter(d => d.samePhone || d.sameIdentity);
    }, [existingPatients, formData.portable, formData.nom, formData.prenom, formData.date_naissance, initialPatient]);

    // Une nouvelle correspondance demande une nouvelle confirmation
    const duplicateIds = duplicates.map(d => d.patient.id).join(',');
    useEffect(() => { setDuplicateAcknowledged(false); }, [duplicateIds]);
    const needsDuplicateConfirmation = duplicates.length > 0 && !duplicateAcknowledged;

    const handleSave = async () => {
        setError('');
        if (needsDuplicateConfirmation) {
            setDuplicateAcknowledged(true);
            setError('Ce patient semble déjà exister sur OrthoMind (voir ci-dessus). Vérifiez, puis cliquez à nouveau pour le créer quand même.');
            return;
        }
        setIsLoading(true);

        if (birthText && !formData.date_naissance) {
            setError('Date de naissance invalide : tapez-la sous la forme JJ/MM/AAAA (ex. 05/03/2014).');
            setIsLoading(false);
            return;
        }
        if (!initialPatient && phoneDigitsAfter33(formData.portable).length !== 9) {
            setError('Numéro de portable incomplet : 9 chiffres après +33 (ex. 6 12 34 56 78).');
            setIsLoading(false);
            return;
        }
        if (!formData.nom || !formData.prenom || !formData.date_naissance || !formData.portable) {
            setError('Veuillez remplir les champs obligatoires : Nom, Prénom, Date de naissance et Téléphone Portable.');
            setIsLoading(false);
            return;
        }

        const patientDataToSave: Patient = {
            ...initialPatient,
            civilite: formData.civilite || 'M.',
            nom: formData.nom.trim(),
            prenom: formData.prenom.trim(),
            date_naissance: formData.date_naissance!,
            sexe: formData.sexe || 'M',
            type_patient: formData.type_patient || 'Adulte',
            praticien: formData.praticien || 'Dr. Renaud Desouches',
            portable: formData.portable.trim(),
            telephone: formData.portable.trim(),
            email: formData.email ? formData.email.trim() : '',
            responsable_num_secu: formData.responsable_num_secu ? formData.responsable_num_secu.trim() : '',
            suivi_exclusif: formData.suivi_exclusif || false
        };

        try {
            let resData: Patient | null = null;
            let apiErr: any = null;

            if (initialPatient?.id) {
                resData = await updatePatient(initialPatient.id, patientDataToSave);
            } else {
                const { data, error: errRes } = await createPatient(patientDataToSave);
                resData = data;
                apiErr = errRes;
            }

            setIsLoading(false);

            if (resData) {
                onSuccess(resData, false);
            } else {
                setError(apiErr?.message || 'Erreur lors de l\'enregistrement de la fiche patient.');
            }
        } catch (err: any) {
            setIsLoading(false);
            setError(`Erreur inattendue : ${err.message || String(err)}`);
        }
    };

    return createPortal(
        <div className="patient-form-overlay" onClick={onClose}>
            <div className="patient-form-modal simplified-patient-modal" onClick={(e) => e.stopPropagation()}>
                
                {/* Header */}
                <div className="form-header">
                    <div>
                        <h2>{initialPatient ? '✏️ MODIFICATION FICHE PATIENT' : '👤 CRÉATION FICHE PATIENT SIMPLIFIÉE'}</h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {initialPatient ? 'Modification des données du patient' : 'Portail Praticien OrthoMind — Renseignement des 6 constantes essentielles'}
                        </p>
                    </div>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                    <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                        {!initialPatient && (
                            <div
                                className={`ortholeader-uploader ${isReadingOrthoLeader ? 'is-busy' : ''}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => !isReadingOrthoLeader && orthoLeaderInputRef.current?.click()}
                                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isReadingOrthoLeader) orthoLeaderInputRef.current?.click(); }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => { e.preventDefault(); handleOrthoLeaderFile(e.dataTransfer.files?.[0]); }}
                            >
                                <input
                                    ref={orthoLeaderInputRef}
                                    type="file"
                                    accept="image/*,.heic,.HEIC,.heif,.HEIF"
                                    hidden
                                    onChange={(e) => handleOrthoLeaderFile(e.target.files?.[0])}
                                />
                                <div className="ortholeader-uploader-icon">🗂️</div>
                                <div className="ortholeader-uploader-text">
                                    <strong>{isReadingOrthoLeader ? 'Lecture de la fiche OrthoLeader…' : 'Importer la fiche OrthoLeader'}</strong>
                                    <span>Photo ou capture de la fiche administrative : nom, prénom, date de naissance et portable sont remplis automatiquement.</span>
                                </div>
                            </div>
                        )}
                        {orthoLeaderStatus && <div className="ortholeader-status">{orthoLeaderStatus}</div>}
                        {error && <div className="form-error">{error}</div>}

                        <div className="simplified-form-grid">
                            {/* Nom */}
                            <div className="form-group">
                                <label>Nom de famille *</label>
                                <input
                                    type="text"
                                    name="nom"
                                    value={formData.nom}
                                    onChange={handleChange}
                                    placeholder="ex: DUPONT"
                                    required
                                />
                            </div>

                            {/* Prénom */}
                            <div className="form-group">
                                <label>Prénom *</label>
                                <input
                                    type="text"
                                    name="prenom"
                                    value={formData.prenom}
                                    onChange={handleChange}
                                    placeholder="ex: Jean"
                                    required
                                />
                            </div>

                            {/* Date de naissance */}
                            <div className="form-group">
                                <label>Date de naissance *</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    name="date_naissance"
                                    value={birthText}
                                    onChange={(e) => handleBirthChange(e.target.value)}
                                    placeholder="JJ/MM/AAAA"
                                    maxLength={10}
                                    required
                                />
                            </div>

                            {/* Numéro de sécurité sociale */}
                            <div className="form-group">
                                <label>Numéro de Sécurité Sociale (NIR)</label>
                                <input
                                    type="text"
                                    name="responsable_num_secu"
                                    value={formData.responsable_num_secu}
                                    onChange={handleChange}
                                    placeholder="1 85 06 75 108 123 45"
                                />
                            </div>

                            {/* Email */}
                            <div className="form-group">
                                <label>Adresse E-mail</label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="patient@exemple.fr"
                                />
                            </div>

                            {/* Téléphone Portable */}
                            <div className="form-group">
                                <label>Téléphone Portable *</label>
                                <div className="phone-input">
                                    <span className="phone-prefix">+33</span>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        autoComplete="tel-national"
                                        name="portable"
                                        value={phoneText}
                                        onChange={(e) => handlePhoneChange(e.target.value)}
                                        placeholder="6 12 34 56 78"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {duplicates.length > 0 && (
                            <div className="patient-duplicate-warning" role="alert">
                                <strong>⚠️ Ce patient existe déjà sur OrthoMind</strong>
                                <ul>
                                    {duplicates.map(({ patient, samePhone, sameIdentity }) => (
                                        <li key={patient.id}>
                                            <b>{patient.nom?.toUpperCase()} {patient.prenom}</b>
                                            {patient.date_naissance && <> · né(e) le {new Date(`${patient.date_naissance}T12:00:00`).toLocaleDateString('fr-FR')}</>}
                                            {' — '}
                                            {sameIdentity && samePhone ? 'même identité et même portable'
                                                : sameIdentity ? 'même nom, prénom et date de naissance'
                                                : 'même numéro de portable (frère, sœur ou parent ?)'}
                                        </li>
                                    ))}
                                </ul>
                                <span>Retrouvez-le dans la liste des patients. Pour un frère ou une sœur qui partage le même portable, vous pouvez créer la fiche quand même.</span>
                            </div>
                        )}

                        {/* Form Action Buttons */}
                        <div className="simplified-form-actions">
                            <button
                                type="button"
                                className="btn-cancel"
                                onClick={onClose}
                                disabled={isLoading}
                            >
                                Annuler
                            </button>

                            {initialPatient ? (
                                <button
                                    type="button"
                                    className="btn-sms-submit"
                                    onClick={() => handleSave()}
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Enregistrement…' : 'Enregistrer les modifications ✓'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn-sms-submit"
                                    onClick={() => handleSave()}
                                    disabled={isLoading}
                                >
                                    {isLoading ? 'Enregistrement…' : duplicateAcknowledged && duplicates.length > 0 ? 'Créer quand même' : 'Enregistrer'}
                                </button>
                            )}
                        </div>
                </form>
            </div>
        </div>
    , document.body);
};

export default PatientForm;

