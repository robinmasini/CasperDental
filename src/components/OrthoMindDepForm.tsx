import React, { useState, useEffect } from 'react';
import { OrthoMindDepData, createDefaultDepData } from '../types/dep';
import logoSeul from '../assets/logo-seul.png';
import './OrthoMindDepForm.css';

interface OrthoMindDepFormProps {
    depData?: OrthoMindDepData;
    patientName?: string;
    patientId?: string;
    isLiveFilling?: boolean;
    readOnly?: boolean;
    onSave?: (data: OrthoMindDepData) => void;
    onReset?: () => void;
}

export const OrthoMindDepForm: React.FC<OrthoMindDepFormProps> = ({
    depData: initialData,
    patientName = '',
    patientId = '',
    isLiveFilling = false,
    readOnly = false,
    onSave,
    onReset
}) => {
    const [formData, setFormData] = useState<OrthoMindDepData>(() => {
        if (initialData) return initialData;
        const parts = (patientName || '').trim().split(/\s+/);
        const nom = parts[0] ? parts[0].toUpperCase() : 'PATIENT';
        const prenom = parts.slice(1).join(' ') || 'Anonyme';
        return createDefaultDepData(nom, prenom, patientId.slice(-4) || '7298', patientId || '20220124');
    });

    useEffect(() => {
        if (initialData) {
            setFormData(initialData);
        }
    }, [initialData]);

    const handleBasalCheckboxChange = (field: keyof OrthoMindDepData['anomaliesBasales']) => {
        if (readOnly) return;
        setFormData(prev => ({
            ...prev,
            status: 'saisi',
            anomaliesBasales: {
                ...prev.anomaliesBasales,
                [field]: !prev.anomaliesBasales[field]
            }
        }));
    };

    const handleAlveolarCheckboxChange = (field: keyof OrthoMindDepData['anomaliesAlveolaires']) => {
        if (readOnly) return;
        setFormData(prev => ({
            ...prev,
            status: 'saisi',
            anomaliesAlveolaires: {
                ...prev.anomaliesAlveolaires,
                [field]: !prev.anomaliesAlveolaires[field]
            }
        }));
    };

    const handleClasseMolaireSelect = (val: 'Cl. I' | 'Cl. II' | 'Cl. III') => {
        if (readOnly) return;
        setFormData(prev => ({
            ...prev,
            status: 'saisi',
            anomaliesBasales: {
                ...prev.anomaliesBasales,
                classeMolaire: prev.anomaliesBasales.classeMolaire === val ? '' : val
            }
        }));
    };

    const handleClasseCanineSelect = (val: 'Cl. I' | 'Cl. II' | 'Cl. III') => {
        if (readOnly) return;
        setFormData(prev => ({
            ...prev,
            status: 'saisi',
            anomaliesAlveolaires: {
                ...prev.anomaliesAlveolaires,
                classeCanine: prev.anomaliesAlveolaires.classeCanine === val ? '' : val
            }
        }));
    };

    const handleTextChange = (field: 'agenesie' | 'facteurFonctionnel' | 'planDeTraitement' | 'commentaires', value: string) => {
        if (readOnly) return;
        setFormData(prev => ({
            ...prev,
            status: 'saisi',
            [field]: value
        }));
    };

    const handleSemestreClick = (ap: OrthoMindDepData['semestreActive']) => {
        if (readOnly) return;
        setFormData(prev => ({
            ...prev,
            semestreActive: ap
        }));
    };

    const handleFormSubmit = () => {
        if (onSave) {
            onSave(formData);
        } else {
            alert('✓ Diagnostic DEP Sécurité Sociale enregistré avec succès dans la Fiche Patient !');
        }
    };

    return (
        <div className={`dep-form-container ${isLiveFilling ? 'is-live-filling' : ''}`}>
            {/* Header Window Bar */}
            <div className="dep-window-header">
                <div className="dep-title-zone">
                    <img src={logoSeul} alt="OrthoMind" className="dep-title-icon" />
                    <div className="dep-title-text">
                        <h3>
                            ★ DIAGNOSTIC DESTINÉ À LA SÉCURITÉ SOCIALE (DEP)
                        </h3>
                        <div className="dep-meta-info">
                            <span className="dep-patient-badge">
                                👤 {formData.patientNom} {formData.patientPrenom}
                            </span>
                            <span>• N° interne: <strong>{formData.numeroInterne}</strong></span>
                            <span>• N° dossier: <strong>{formData.numeroDossier.slice(-8)}</strong></span>
                        </div>
                    </div>
                </div>

                {/* Semestre AP Pills */}
                <div className="dep-semestre-bar">
                    <span className="semestre-label">S01 (1er semestre) :</span>
                    {(['AP01', 'AP02', 'AP03', 'AP04', 'AP05', 'AP06', 'AP07'] as const).map(ap => (
                        <button
                            key={ap}
                            type="button"
                            className={`ap-pill ${formData.semestreActive === ap ? 'active' : 'inactive'}`}
                            onClick={() => handleSemestreClick(ap)}
                        >
                            {ap}
                        </button>
                    ))}
                </div>
            </div>

            {/* PARTIE 1: Dual Column Grid */}
            <div className="dep-section-box">
                <div className="dep-section-header">
                    <h4 className="dep-section-title">PARTIE 1 — ANOMALIES BASALES & ALVÉOLAIRES</h4>
                    {isLiveFilling && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--primary-cyan)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="synthesis-spinner-glow" style={{ width: '12px', height: '12px' }}></span>
                            Saisie OrthoMind en direct pendant l'analyse...
                        </span>
                    )}
                </div>

                <div className="partie1-grid">
                    {/* Left Column: Anomalie(s) basale(s) */}
                    <div className="anomalie-column">
                        <h5 className="anomalie-column-title">Anomalie(s) basale(s)</h5>

                        {/* Sens sagittal */}
                        <div className="dep-param-row">
                            <span className="dep-param-label">Sens sagittal</span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.sagittalMaxillairePro ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.sagittalMaxillairePro}
                                        onChange={() => handleBasalCheckboxChange('sagittalMaxillairePro')}
                                        disabled={readOnly}
                                    />
                                    Maxillaire Pro
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.sagittalMaxillaireRetro ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.sagittalMaxillaireRetro}
                                        onChange={() => handleBasalCheckboxChange('sagittalMaxillaireRetro')}
                                        disabled={readOnly}
                                    />
                                    Retro
                                </label>
                            </div>
                        </div>

                        <div className="dep-param-row">
                            <span className="dep-param-label"></span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.sagittalMandibulairePro ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.sagittalMandibulairePro}
                                        onChange={() => handleBasalCheckboxChange('sagittalMandibulairePro')}
                                        disabled={readOnly}
                                    />
                                    Mandibulaire Pro
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.sagittalMandibulaireRetro ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.sagittalMandibulaireRetro}
                                        onChange={() => handleBasalCheckboxChange('sagittalMandibulaireRetro')}
                                        disabled={readOnly}
                                    />
                                    Retro
                                </label>
                            </div>
                        </div>

                        {/* Sens transversal */}
                        <div className="dep-param-row">
                            <span className="dep-param-label">Sens transversal</span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.transversalMaxillaireEndo ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.transversalMaxillaireEndo}
                                        onChange={() => handleBasalCheckboxChange('transversalMaxillaireEndo')}
                                        disabled={readOnly}
                                    />
                                    Maxillaire Endo
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.transversalMaxillaireExo ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.transversalMaxillaireExo}
                                        onChange={() => handleBasalCheckboxChange('transversalMaxillaireExo')}
                                        disabled={readOnly}
                                    />
                                    Exo
                                </label>
                            </div>
                        </div>

                        <div className="dep-param-row">
                            <span className="dep-param-label"></span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.transversalMandibulaireEndo ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.transversalMandibulaireEndo}
                                        onChange={() => handleBasalCheckboxChange('transversalMandibulaireEndo')}
                                        disabled={readOnly}
                                    />
                                    Mandibulaire Endo
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.transversalMandibulaireExo ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.transversalMandibulaireExo}
                                        onChange={() => handleBasalCheckboxChange('transversalMandibulaireExo')}
                                        disabled={readOnly}
                                    />
                                    Exo
                                </label>
                            </div>
                        </div>

                        {/* Sens vertical */}
                        <div className="dep-param-row">
                            <span className="dep-param-label">Sens vertical</span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.verticalHypodivergence ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.verticalHypodivergence}
                                        onChange={() => handleBasalCheckboxChange('verticalHypodivergence')}
                                        disabled={readOnly}
                                    />
                                    Hypodivergence
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.verticalHyperdivergence ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.verticalHyperdivergence}
                                        onChange={() => handleBasalCheckboxChange('verticalHyperdivergence')}
                                        disabled={readOnly}
                                    />
                                    Hyperdivergence
                                </label>
                            </div>
                        </div>

                        {/* Classe dentaire molaire */}
                        <div className="dep-param-row" style={{ marginTop: '12px' }}>
                            <span className="dep-param-label">Classe dentaire molaire</span>
                            <div className="dep-checkbox-group">
                                {(['Cl. I', 'Cl. II', 'Cl. III'] as const).map(c => (
                                    <label key={c} className={`dep-checkbox-item ${formData.anomaliesBasales.classeMolaire === c ? 'is-checked' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={formData.anomaliesBasales.classeMolaire === c}
                                            onChange={() => handleClasseMolaireSelect(c)}
                                            disabled={readOnly}
                                        />
                                        {c}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Dysharmonies & Occlusion inversée */}
                        <div className="dep-param-row" style={{ marginTop: '10px' }}>
                            <label className={`dep-checkbox-item ${formData.anomaliesBasales.dysharmonieDentoMaxillaire ? 'is-checked' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={formData.anomaliesBasales.dysharmonieDentoMaxillaire}
                                    onChange={() => handleBasalCheckboxChange('dysharmonieDentoMaxillaire')}
                                    disabled={readOnly}
                                />
                                Dysharmonie dento-maxillaire
                            </label>
                            <label className={`dep-checkbox-item ${formData.anomaliesBasales.dysharmonieDentoDentaire ? 'is-checked' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={formData.anomaliesBasales.dysharmonieDentoDentaire}
                                    onChange={() => handleBasalCheckboxChange('dysharmonieDentoDentaire')}
                                    disabled={readOnly}
                                />
                                Dysharmonie dento-dentaire
                            </label>
                        </div>

                        <div className="dep-param-row">
                            <span className="dep-param-label">Occlusion inversée</span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.occlusionInverseeDroite ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.occlusionInverseeDroite}
                                        onChange={() => handleBasalCheckboxChange('occlusionInverseeDroite')}
                                        disabled={readOnly}
                                    />
                                    Droite
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.occlusionInverseeGauche ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.occlusionInverseeGauche}
                                        onChange={() => handleBasalCheckboxChange('occlusionInverseeGauche')}
                                        disabled={readOnly}
                                    />
                                    Gauche
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesBasales.occlusionInverseeAnterieure ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesBasales.occlusionInverseeAnterieure}
                                        onChange={() => handleBasalCheckboxChange('occlusionInverseeAnterieure')}
                                        disabled={readOnly}
                                    />
                                    Antérieure
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Anomalie(s) alvéolaire(s) */}
                    <div className="anomalie-column">
                        <h5 className="anomalie-column-title">Anomalie(s) alvéolaire(s)</h5>

                        {/* Sens sagittal */}
                        <div className="dep-param-row">
                            <span className="dep-param-label">Sens sagittal</span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.sagittalMaxillairePro ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.sagittalMaxillairePro}
                                        onChange={() => handleAlveolarCheckboxChange('sagittalMaxillairePro')}
                                        disabled={readOnly}
                                    />
                                    Maxillaire Pro
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.sagittalMaxillaireRetro ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.sagittalMaxillaireRetro}
                                        onChange={() => handleAlveolarCheckboxChange('sagittalMaxillaireRetro')}
                                        disabled={readOnly}
                                    />
                                    Retro
                                </label>
                            </div>
                        </div>

                        <div className="dep-param-row">
                            <span className="dep-param-label"></span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.sagittalMandibulairePro ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.sagittalMandibulairePro}
                                        onChange={() => handleAlveolarCheckboxChange('sagittalMandibulairePro')}
                                        disabled={readOnly}
                                    />
                                    Mandibulaire Pro
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.sagittalMandibulaireRetro ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.sagittalMandibulaireRetro}
                                        onChange={() => handleAlveolarCheckboxChange('sagittalMandibulaireRetro')}
                                        disabled={readOnly}
                                    />
                                    Retro
                                </label>
                            </div>
                        </div>

                        {/* Sens transversal */}
                        <div className="dep-param-row">
                            <span className="dep-param-label">Sens transversal</span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.transversalMaxillaireEndo ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.transversalMaxillaireEndo}
                                        onChange={() => handleAlveolarCheckboxChange('transversalMaxillaireEndo')}
                                        disabled={readOnly}
                                    />
                                    Maxillaire Endo
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.transversalMaxillaireExo ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.transversalMaxillaireExo}
                                        onChange={() => handleAlveolarCheckboxChange('transversalMaxillaireExo')}
                                        disabled={readOnly}
                                    />
                                    Exo
                                </label>
                            </div>
                        </div>

                        <div className="dep-param-row">
                            <span className="dep-param-label"></span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.transversalMandibulaireEndo ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.transversalMandibulaireEndo}
                                        onChange={() => handleAlveolarCheckboxChange('transversalMandibulaireEndo')}
                                        disabled={readOnly}
                                    />
                                    Mandibulaire Endo
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.transversalMandibulaireExo ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.transversalMandibulaireExo}
                                        onChange={() => handleAlveolarCheckboxChange('transversalMandibulaireExo')}
                                        disabled={readOnly}
                                    />
                                    Exo
                                </label>
                            </div>
                        </div>

                        {/* Sens vertical */}
                        <div className="dep-param-row">
                            <span className="dep-param-label">Sens vertical</span>
                            <div className="dep-checkbox-group">
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.verticalSupraclusion ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.verticalSupraclusion}
                                        onChange={() => handleAlveolarCheckboxChange('verticalSupraclusion')}
                                        disabled={readOnly}
                                    />
                                    Supraclusion
                                </label>
                                <label className={`dep-checkbox-item ${formData.anomaliesAlveolaires.verticalInfraclusion ? 'is-checked' : ''}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.anomaliesAlveolaires.verticalInfraclusion}
                                        onChange={() => handleAlveolarCheckboxChange('verticalInfraclusion')}
                                        disabled={readOnly}
                                    />
                                    Infraclusion
                                </label>
                            </div>
                        </div>

                        {/* Classe dentaire canine */}
                        <div className="dep-param-row" style={{ marginTop: '12px' }}>
                            <span className="dep-param-label">Classe dentaire canine</span>
                            <div className="dep-checkbox-group">
                                {(['Cl. I', 'Cl. II', 'Cl. III'] as const).map(c => (
                                    <label key={c} className={`dep-checkbox-item ${formData.anomaliesAlveolaires.classeCanine === c ? 'is-checked' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={formData.anomaliesAlveolaires.classeCanine === c}
                                            onChange={() => handleClasseCanineSelect(c)}
                                            disabled={readOnly}
                                        />
                                        {c}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Dents incl. et malposition */}
                        <div style={{ marginTop: '10px' }}>
                            <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Dent(s) incl. ou surnum. :</div>
                            <input
                                type="text"
                                className="dep-text-input"
                                value={formData.anomaliesAlveolaires.dentsIncluesOuSurnumeraires}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    status: 'saisi',
                                    anomaliesAlveolaires: { ...prev.anomaliesAlveolaires, dentsIncluesOuSurnumeraires: e.target.value }
                                }))}
                                disabled={readOnly}
                                placeholder="Dents inclues ou surnuméraires..."
                            />
                        </div>

                        <div style={{ marginTop: '8px' }}>
                            <div style={{ fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Malposition(s) :</div>
                            <input
                                type="text"
                                className="dep-text-input"
                                value={formData.anomaliesAlveolaires.malpositions}
                                onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    status: 'saisi',
                                    anomaliesAlveolaires: { ...prev.anomaliesAlveolaires, malpositions: e.target.value }
                                }))}
                                disabled={readOnly}
                                placeholder="Malpositions dentaires..."
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* PARTIE 2: Text Fields & Functional Factors */}
            <div className="dep-section-box">
                <div className="dep-section-header">
                    <h4 className="dep-section-title">PARTIE 2 — AGÉNÉSIE, FACTEUR FONCTIONNEL & PLAN DE TRAITEMENT</h4>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-cyan)', display: 'block', marginBottom: '4px' }}>
                            AGÉNÉSIE :
                        </label>
                        <input
                            type="text"
                            className="dep-text-input"
                            value={formData.agenesie}
                            onChange={(e) => handleTextChange('agenesie', e.target.value)}
                            disabled={readOnly}
                            placeholder="Agénésies constatées..."
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-cyan)', display: 'block', marginBottom: '4px' }}>
                            FACTEUR FONCTIONNEL :
                        </label>
                        <textarea
                            className="dep-textarea"
                            value={formData.facteurFonctionnel}
                            onChange={(e) => handleTextChange('facteurFonctionnel', e.target.value)}
                            disabled={readOnly}
                            rows={2}
                            placeholder="Ex: Déglutition atypique avec interposition linguale antérieure et respiration buccale..."
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--primary-cyan)', display: 'block', marginBottom: '4px' }}>
                            PLAN DE TRAITEMENT (Y COMPRIS LES MOYENS THÉRAPEUTIQUES PRÉVUS) :
                        </label>
                        <textarea
                            className="dep-textarea"
                            value={formData.planDeTraitement}
                            onChange={(e) => handleTextChange('planDeTraitement', e.target.value)}
                            disabled={readOnly}
                            rows={3}
                            placeholder="A: Correction de la déglutition et de la respiration nasale 1°. Aligneurs sup et inf avec taquets fixes 5°. Traction intermaxillaire..."
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: '4px' }}>
                            COMMENTAIRES :
                        </label>
                        <textarea
                            className="dep-textarea"
                            value={formData.commentaires}
                            onChange={(e) => handleTextChange('commentaires', e.target.value)}
                            disabled={readOnly}
                            rows={2}
                            placeholder="Observations et précisions médicales complémentaires..."
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Status Legend */}
            <div className="dep-legend-bar">
                <div className="dep-legend-items">
                    <span className="legend-badge">
                        <span className="legend-box non-saisi"></span> Diag non saisi
                    </span>
                    <span className="legend-badge">
                        <span className="legend-box saisi"></span> Diag saisi (Validation OrthoMind)
                    </span>
                    <span className="legend-badge">
                        <span className="legend-box selectionne"></span> Diag sélectionné
                    </span>
                </div>

                {!readOnly && (
                    <div className="dep-actions-bar">
                        {onReset && (
                            <button type="button" className="btn-orthomind-danger" onClick={onReset}>
                                Tout Réinitialiser
                            </button>
                        )}
                        <button type="button" className="btn-orthomind-cta" onClick={handleFormSubmit}>
                            <img src={logoSeul} alt="" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
                            Enregistrer dans Fiche Patient
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrthoMindDepForm;
