import Icon from './Icon';
import './SecretariatSection.css';

// ============================================================================
// Espace Secrétariat : catégories réservées au compte « secretariat » (bureau)
// ============================================================================

export type SecretariatTab = 'reglements' | 'vitale' | 'messagerie';

export const SECRETARIAT_TABS: { id: SecretariatTab; label: string; icon: 'chart' | 'file' | 'mail' }[] = [
    { id: 'reglements', label: 'Règlements', icon: 'chart' },
    { id: 'vitale', label: 'CC Vitale', icon: 'file' },
    { id: 'messagerie', label: 'Messagerie', icon: 'mail' },
];

const CONTENT: Record<SecretariatTab, { title: string; subtitle: string }> = {
    reglements: {
        title: 'Règlements',
        subtitle: 'Comptabilité du cabinet : encaissements, échéanciers de traitement et impayés.',
    },
    vitale: {
        title: 'CC Vitale',
        subtitle: 'Suivi Carte Vitale : droits, mutuelles, ententes préalables et remboursements.',
    },
    messagerie: {
        title: 'Messagerie',
        subtitle: 'Boîte mail du cabinet, rattachée aux dossiers patients.',
    },
};

const SecretariatSection = ({ tab }: { tab: SecretariatTab }) => {
    const { title, subtitle } = CONTENT[tab];
    const icon = SECRETARIAT_TABS.find(t => t.id === tab)!.icon;
    return (
        <div className="secretariat-section">
            <header className="secretariat-header">
                <h1 className="om-title">{title}</h1>
                <p className="om-muted">{subtitle}</p>
            </header>
            <div className="om-empty">
                <Icon name={icon} size={28} />
                <p>Cette catégorie de l'Espace Secrétariat est en cours de préparation.</p>
            </div>
        </div>
    );
};

export default SecretariatSection;
