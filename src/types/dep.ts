export interface DepBasalAnomalies {
    sagittalMaxillairePro: boolean;
    sagittalMaxillaireRetro: boolean;
    sagittalMandibulairePro: boolean;
    sagittalMandibulaireRetro: boolean;
    transversalMaxillaireEndo: boolean;
    transversalMaxillaireExo: boolean;
    transversalMandibulaireEndo: boolean;
    transversalMandibulaireExo: boolean;
    verticalHypodivergence: boolean;
    verticalHyperdivergence: boolean;
    classeMolaire: 'Cl. I' | 'Cl. II' | 'Cl. III' | '';
    classeMolaireDetails?: string;
    dysharmonieDentoMaxillaire: boolean;
    dysharmonieDentoDentaire: boolean;
    occlusionInverseeDroite: boolean;
    occlusionInverseeGauche: boolean;
    occlusionInverseeAnterieure: boolean;
}

export interface DepAlveolarAnomalies {
    sagittalMaxillairePro: boolean;
    sagittalMaxillaireRetro: boolean;
    sagittalMandibulairePro: boolean;
    sagittalMandibulaireRetro: boolean;
    transversalMaxillaireEndo: boolean;
    transversalMaxillaireExo: boolean;
    transversalMandibulaireEndo: boolean;
    transversalMandibulaireExo: boolean;
    verticalSupraclusion: boolean;
    verticalInfraclusion: boolean;
    classeCanine: 'Cl. I' | 'Cl. II' | 'Cl. III' | '';
    classeCanineDetails?: string;
    dentsIncluesOuSurnumeraires: string;
    malpositions: string;
}

export interface OrthoMindDepData {
    id?: string;
    patientNom: string;
    patientPrenom: string;
    numeroInterne: string;
    numeroDossier: string;
    semestreActive: 'AP01' | 'AP02' | 'AP03' | 'AP04' | 'AP05' | 'AP06' | 'AP07';
    dateSaisie: string;
    
    anomaliesBasales: DepBasalAnomalies;
    anomaliesAlveolaires: DepAlveolarAnomalies;
    
    agenesie: string;
    facteurFonctionnel: string;
    planDeTraitement: string;
    commentaires: string;
    
    status: 'non_saisi' | 'saisi' | 'selectionne';
}

export const createDefaultDepData = (patientNom = '', patientPrenom = '', numInterne = '7298', numDossier = ''): OrthoMindDepData => ({
    patientNom: patientNom.toUpperCase(),
    patientPrenom,
    numeroInterne: numInterne,
    numeroDossier: numDossier || '20220124',
    semestreActive: 'AP01',
    dateSaisie: new Date().toLocaleDateString('fr-FR'),
    anomaliesBasales: {
        sagittalMaxillairePro: false,
        sagittalMaxillaireRetro: false,
        sagittalMandibulairePro: false,
        sagittalMandibulaireRetro: false,
        transversalMaxillaireEndo: false,
        transversalMaxillaireExo: false,
        transversalMandibulaireEndo: false,
        transversalMandibulaireExo: false,
        verticalHypodivergence: false,
        verticalHyperdivergence: false,
        classeMolaire: '',
        classeMolaireDetails: '',
        dysharmonieDentoMaxillaire: false,
        dysharmonieDentoDentaire: false,
        occlusionInverseeDroite: false,
        occlusionInverseeGauche: false,
        occlusionInverseeAnterieure: false
    },
    anomaliesAlveolaires: {
        sagittalMaxillairePro: false,
        sagittalMaxillaireRetro: false,
        sagittalMandibulairePro: false,
        sagittalMandibulaireRetro: false,
        transversalMaxillaireEndo: false,
        transversalMaxillaireExo: false,
        transversalMandibulaireEndo: false,
        transversalMandibulaireExo: false,
        verticalSupraclusion: false,
        verticalInfraclusion: false,
        classeCanine: '',
        classeCanineDetails: '',
        dentsIncluesOuSurnumeraires: '',
        malpositions: ''
    },
    agenesie: '',
    facteurFonctionnel: '',
    planDeTraitement: '',
    commentaires: '',
    status: 'non_saisi'
});
