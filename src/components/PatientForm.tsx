import { useState } from 'react';
import { Patient, createPatient } from '../services/patientService';
import './PatientForm.css';

interface PatientFormProps {
    onClose: () => void;
    onSuccess: (patient: Patient) => void;
}

const PatientForm = ({ onClose, onSuccess }: PatientFormProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState<Patient>({
        civilite: '',
        nom: '',
        prenom: '',
        deuxieme_prenom: '',
        sexe: '',
        date_naissance: '',
        type_patient: 'Enfant',
        praticien: 'Cabinet Médical',
        telephone: '',
        portable: '',
        email: '',
        suivi_exclusif: false,
        responsable_civilite: '',
        responsable_nom: '',
        responsable_prenom: '',
        responsable_num_secu: '',
        responsable_date_naissance: '',
        responsable_adresse: '',
        responsable_adresse2: '',
        responsable_cp: '',
        responsable_commune: '',
        responsable_pays: 'France',
        responsable_portable1: '',
        responsable_portable2: '',
        responsable_telephone1: '',
        responsable_telephone2: '',
        responsable_email: '',
        responsable_remarque: '',
        envoye_par: '',
        dentiste: '',
        famille_membre1_prenom: '',
        famille_membre1_sexe: '',
        famille_membre1_date_naissance: '',
        famille_membre2_prenom: '',
        famille_membre2_sexe: '',
        famille_membre2_date_naissance: '',
        famille_membre3_prenom: '',
        famille_membre3_sexe: '',
        famille_membre3_date_naissance: '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('PatientForm: handleSubmit triggered');
        setError('');
        setIsLoading(true);

        if (!formData.nom || !formData.prenom || !formData.date_naissance) {
            console.warn('PatientForm: Missing required fields');
            setError('Veuillez remplir les champs obligatoires (Nom, Prénom, Date de naissance)');
            setIsLoading(false);
            return;
        }

        try {
            console.log('PatientForm: Calling createPatient with formData');
            const { data, error } = await createPatient(formData);
            console.log('PatientForm: createPatient returned', { data, error });
            setIsLoading(false);

            if (data) {
                console.log('PatientForm: Success, calling onSuccess');
                onSuccess(data);
            } else {
                console.error('PatientForm: Error branch hit', error);

                // Handle specific Supabase error structure
                let errorMessage = 'Erreur lors de la création du patient.';
                let details = '';

                if (error) {
                    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
                        errorMessage = 'Impossible de contacter le serveur (Erreur de connexion).';
                        details = 'Veuillez vérifier votre connexion internet et la configuration de la base de données.';
                        if (!window.navigator.onLine) {
                            details = 'Votre appareil semble hors ligne. Veuillez vous reconnecter à internet.';
                        }
                    } else {
                        errorMessage = error.message || errorMessage;
                        details = error.details || '';
                    }
                }

                const hint = error?.hint || '';
                setError(`Erreur: ${errorMessage}${details ? ` (${details})` : ''}${hint ? `. Astuce: ${hint}` : ''}`);
                console.error('Supabase error details:', error);
            }
        } catch (err) {
            console.error('PatientForm: Unexpected catch error:', err);
            setIsLoading(false);

            let errorMessage = 'Une erreur inattendue est survenue';
            let details = err instanceof Error ? err.message : String(err);

            if (details.includes('Failed to fetch')) {
                errorMessage = 'Erreur de réseau : Impossible de joindre le service.';
                details = 'Ceci peut être dû à un bloqueur de publicité, un pare-feu, ou une URL de base de données incorrecte.';
            }

            setError(`${errorMessage}: ${details}`);
        }
    };

    return (
        <div className="patient-form-overlay" onClick={onClose}>
            <div className="patient-form-modal" onClick={(e) => e.stopPropagation()}>
                <div className="form-header">
                    <h2>⭐ CRÉATION D'UNE NOUVELLE FICHE PATIENT</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleSubmit}>
                    {error && <div className="form-error">{error}</div>}

                    <div className="form-grid">
                        {/* Informations patient */}
                        <div className="form-section">
                            <h3>Informations patient</h3>
                            <p className="required-note">* Champs obligatoires</p>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Civilité</label>
                                    <select name="civilite" value={formData.civilite} onChange={handleChange}>
                                        <option value="">--</option>
                                        <option value="M.">M.</option>
                                        <option value="Mme">Mme</option>
                                        <option value="Mlle">Mlle</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Nom *</label>
                                    <input type="text" name="nom" value={formData.nom} onChange={handleChange} required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Prénom *</label>
                                    <input type="text" name="prenom" value={formData.prenom} onChange={handleChange} required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>2e prénom</label>
                                    <input type="text" name="deuxieme_prenom" value={formData.deuxieme_prenom} onChange={handleChange} />
                                </div>
                            </div>

                            <div className="form-row two-col">
                                <div className="form-group">
                                    <label>Sexe *</label>
                                    <select name="sexe" value={formData.sexe} onChange={handleChange} required>
                                        <option value="">--</option>
                                        <option value="M">Masculin</option>
                                        <option value="F">Féminin</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Date de naissance *</label>
                                    <input type="date" name="date_naissance" value={formData.date_naissance} onChange={handleChange} required />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Type *</label>
                                    <select name="type_patient" value={formData.type_patient} onChange={handleChange}>
                                        <option value="Enfant">Enfant</option>
                                        <option value="Adulte">Adulte</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Praticien *</label>
                                    <select name="praticien" value={formData.praticien} onChange={handleChange}>
                                        <option value="Cabinet Médical">Cabinet Médical</option>
                                    </select>
                                </div>
                                <div className="form-group checkbox-group">
                                    <label>
                                        <input type="checkbox" name="suivi_exclusif" checked={formData.suivi_exclusif} onChange={handleChange} />
                                        Suivi exclusif
                                    </label>
                                </div>
                            </div>

                            <div className="form-row two-col">
                                <div className="form-group">
                                    <label>Téléphone</label>
                                    <input type="tel" name="telephone" value={formData.telephone} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Email</label>
                                    <input type="email" name="email" value={formData.email} onChange={handleChange} />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Portable</label>
                                    <input type="tel" name="portable" value={formData.portable} onChange={handleChange} />
                                </div>
                            </div>
                        </div>

                        {/* Responsable civil */}
                        <div className="form-section">
                            <h3>Responsable civil</h3>

                            <div className="form-row two-col">
                                <div className="form-group">
                                    <label>Civilité</label>
                                    <select name="responsable_civilite" value={formData.responsable_civilite} onChange={handleChange}>
                                        <option value="">--</option>
                                        <option value="M.">M.</option>
                                        <option value="Mme">Mme</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>N° de Sécurité Sociale</label>
                                    <input type="text" name="responsable_num_secu" value={formData.responsable_num_secu} onChange={handleChange} />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Nom</label>
                                    <input type="text" name="responsable_nom" value={formData.responsable_nom} onChange={handleChange} placeholder="Nom du responsable" />
                                </div>
                            </div>

                            <div className="form-row two-col">
                                <div className="form-group">
                                    <label>Prénom</label>
                                    <input type="text" name="responsable_prenom" value={formData.responsable_prenom} onChange={handleChange} placeholder="Prénom du responsable" />
                                </div>
                                <div className="form-group">
                                    <label>Date de naissance</label>
                                    <input type="date" name="responsable_date_naissance" value={formData.responsable_date_naissance} onChange={handleChange} />
                                </div>
                            </div>

                            <div className="form-row two-col">
                                <div className="form-group">
                                    <label>Adresse</label>
                                    <input type="text" name="responsable_adresse" value={formData.responsable_adresse} onChange={handleChange} placeholder="Adresse ligne n°1" />
                                </div>
                                <div className="form-group">
                                    <label>&nbsp;</label>
                                    <input type="text" name="responsable_adresse2" value={formData.responsable_adresse2} onChange={handleChange} placeholder="Adresse ligne n°2" />
                                </div>
                            </div>

                            <div className="form-row three-col">
                                <div className="form-group small">
                                    <label>CP</label>
                                    <input type="text" name="responsable_cp" value={formData.responsable_cp} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Commune</label>
                                    <input type="text" name="responsable_commune" value={formData.responsable_commune} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Pays</label>
                                    <input type="text" name="responsable_pays" value={formData.responsable_pays} onChange={handleChange} />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Remarque</label>
                                    <textarea name="responsable_remarque" value={formData.responsable_remarque} onChange={handleChange} rows={3}></textarea>
                                </div>
                            </div>

                            <div className="form-row two-col">
                                <div className="form-group">
                                    <label>Portables</label>
                                    <input type="tel" name="responsable_portable1" value={formData.responsable_portable1} onChange={handleChange} />
                                    <input type="tel" name="responsable_portable2" value={formData.responsable_portable2} onChange={handleChange} style={{ marginTop: '0.5rem' }} />
                                </div>
                                <div className="form-group">
                                    <label>Téléphones</label>
                                    <input type="tel" name="responsable_telephone1" value={formData.responsable_telephone1} onChange={handleChange} />
                                    <input type="tel" name="responsable_telephone2" value={formData.responsable_telephone2} onChange={handleChange} style={{ marginTop: '0.5rem' }} />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Email</label>
                                    <input type="email" name="responsable_email" value={formData.responsable_email} onChange={handleChange} />
                                </div>
                            </div>
                        </div>

                        {/* Correspondants */}
                        <div className="form-section correspondants">
                            <h3>Correspondants</h3>
                            <div className="form-row two-col">
                                <div className="form-group">
                                    <label>Envoyé par</label>
                                    <input type="text" name="envoye_par" value={formData.envoye_par} onChange={handleChange} />
                                </div>
                                <div className="form-group">
                                    <label>Dentiste</label>
                                    <input type="text" name="dentiste" value={formData.dentiste} onChange={handleChange} />
                                </div>
                            </div>
                        </div>

                        {/* Famille */}
                        <div className="form-section famille">
                            <h3>Création d'une fiche pour un nouveau membre</h3>
                            <table className="famille-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>Prénom</th>
                                        <th>Sexe</th>
                                        <th>Date de naissance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>N°1</td>
                                        <td><input type="text" name="famille_membre1_prenom" value={formData.famille_membre1_prenom} onChange={handleChange} /></td>
                                        <td>
                                            <select name="famille_membre1_sexe" value={formData.famille_membre1_sexe} onChange={handleChange}>
                                                <option value="">--</option>
                                                <option value="M">M</option>
                                                <option value="F">F</option>
                                            </select>
                                        </td>
                                        <td><input type="date" name="famille_membre1_date_naissance" value={formData.famille_membre1_date_naissance} onChange={handleChange} /></td>
                                    </tr>
                                    <tr>
                                        <td>N°2</td>
                                        <td><input type="text" name="famille_membre2_prenom" value={formData.famille_membre2_prenom} onChange={handleChange} /></td>
                                        <td>
                                            <select name="famille_membre2_sexe" value={formData.famille_membre2_sexe} onChange={handleChange}>
                                                <option value="">--</option>
                                                <option value="M">M</option>
                                                <option value="F">F</option>
                                            </select>
                                        </td>
                                        <td><input type="date" name="famille_membre2_date_naissance" value={formData.famille_membre2_date_naissance} onChange={handleChange} /></td>
                                    </tr>
                                    <tr>
                                        <td>N°3</td>
                                        <td><input type="text" name="famille_membre3_prenom" value={formData.famille_membre3_prenom} onChange={handleChange} /></td>
                                        <td>
                                            <select name="famille_membre3_sexe" value={formData.famille_membre3_sexe} onChange={handleChange}>
                                                <option value="">--</option>
                                                <option value="M">M</option>
                                                <option value="F">F</option>
                                            </select>
                                        </td>
                                        <td><input type="date" name="famille_membre3_date_naissance" value={formData.famille_membre3_date_naissance} onChange={handleChange} /></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Quitter</button>
                        <button type="submit" className="btn-submit" disabled={isLoading}>
                            {isLoading ? 'Enregistrement...' : 'Enregistrer ✓'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PatientForm;
