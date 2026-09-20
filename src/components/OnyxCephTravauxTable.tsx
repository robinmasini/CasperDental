import React, { useState, useEffect } from 'react';
import {
    TravauxItem,
    getLocalTravaux,
    addTravauxItem,
    updateTravauxItem,
    deleteTravauxItem
} from '../services/travauxService';
import logoMonday from '../assets/logo-monday.png';
import './OnyxCephTravauxTable.css';

interface OnyxCephTravauxTableProps {
    patientName?: string;
    patientId?: string;
    filterCurrentPatientOnly?: boolean;
}

// Preset color map for tags matching the user's reference image
export const PRESET_TAGS = [
    { label: '1 er traitement', class: 'tag-1er-traitement' },
    { label: 'Stab/contention', class: 'tag-stab-contention' },
    { label: 'DISJONCTEUR', class: 'tag-disjoncteur' },
    { label: 'Suite a impr', class: 'tag-suite-impr' },
    { label: 'TRANSPALATIN', class: 'tag-transpalatin' },

    { label: 'Stab puis traitement', class: 'tag-stab-contention' },
    { label: 'Set up', class: 'tag-set-up' },
    { label: 'Modèle étude', class: 'tag-disjoncteur' },
    { label: 'BLANCHIMENT', class: 'tag-blanchiment' },
    { label: 'STAGGING', class: 'tag-stagging' },

    { label: '3eme traitement et +', class: 'tag-1er-traitement' },
    { label: '3.3', class: 'tag-33' },
    { label: 'A FAIRE', class: 'tag-a-faire' },
    { label: 'PLURI', class: 'tag-blanchiment' },
    { label: 'GOUTT EXPANSION', class: 'tag-goutt-expansion' },

    { label: '2e traitement', class: 'tag-1er-traitement' },
    { label: 'Activateur ailettes', class: 'tag-eln-ailettes' },
    { label: 'suite a donner', class: 'tag-suite-impr' },
    { label: 'QLX', class: 'tag-a-faire' },
    { label: 'Fils collés', class: 'tag-fils-colles' },

    { label: 'XB', class: 'tag-disjoncteur' },
    { label: 'CASPER', class: 'tag-casper' },
    { label: 'URGENCES', class: 'tag-urgences' },
    { label: 'GOUTT/SPORT', class: 'tag-goutt-sport' },
    { label: 'ELN AILETTES', class: 'tag-eln-ailettes' },

    { label: 'SURCO', class: 'tag-a-faire' },
    { label: 'MATCH', class: 'tag-match' },
    { label: 'BRUX', class: 'tag-brux' },
    { label: 'CARRIERE MOTION', class: 'tag-carriere-motion' },
    { label: 'GOUTT PROPULSION', class: 'tag-goutt-propulsion' }
];

export const getTagClass = (label: string): string => {
    const found = PRESET_TAGS.find(t => t.label.toLowerCase() === (label || '').toLowerCase());
    if (found) return found.class;

    const lower = (label || '').toLowerCase();
    if (lower.includes('stab') || lower.includes('content')) return 'tag-stab-contention';
    if (lower.includes('match')) return 'tag-match';
    if (lower.includes('brux')) return 'tag-brux';
    if (lower.includes('impr')) return 'tag-suite-impr';
    if (lower.includes('blanch')) return 'tag-blanchiment';
    if (lower.includes('urgence')) return 'tag-urgences';
    return 'tag-a-faire';
};

const OnyxCephTravauxTable: React.FC<OnyxCephTravauxTableProps> = ({
    patientName,
    patientId,
    filterCurrentPatientOnly = false
}) => {
    const [travaux, setTravaux] = useState<TravauxItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
    const [activeTagPickerItem, setActiveTagPickerItem] = useState<TravauxItem | null>(null);
    const [newRowInput, setNewRowInput] = useState<Record<string, string>>({});
    const [showOnlyThisPatient, setShowOnlyThisPatient] = useState<boolean>(filterCurrentPatientOnly);

    // Load items
    const reloadItems = () => {
        const data = getLocalTravaux();
        setTravaux(data);
    };

    useEffect(() => {
        reloadItems();
    }, []);

    // Filter items
    const displayedItems = travaux.filter(item => {
        if (showOnlyThisPatient && patientName) {
            const currentLower = patientName.toLowerCase();
            const itemLower = item.patientName.toLowerCase();
            if (!itemLower.includes(currentLower) && !currentLower.includes(itemLower) && item.patientId !== patientId) {
                return false;
            }
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                item.patientName.toLowerCase().includes(q) ||
                item.travailARealiser.toLowerCase().includes(q) ||
                (item.commentaires1 || '').toLowerCase().includes(q) ||
                (item.prothesiste || '').toLowerCase().includes(q) ||
                (item.empr || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    // Group items by monthGroup
    const monthGroupsMap: Record<string, TravauxItem[]> = {};
    const defaultMonths = ['SEPTEMBRE 2026', 'OCTOBRE 2026'];

    // Pre-seed groups
    defaultMonths.forEach(m => {
        monthGroupsMap[m] = [];
    });

    displayedItems.forEach(item => {
        const groupKey = item.monthGroup || 'OCTOBRE 2026';
        if (!monthGroupsMap[groupKey]) {
            monthGroupsMap[groupKey] = [];
        }
        monthGroupsMap[groupKey].push(item);
    });

    const toggleGroupCollapse = (month: string) => {
        setCollapsedGroups(prev => ({
            ...prev,
            [month]: !prev[month]
        }));
    };

    const handleUpdateField = (id: string, field: keyof TravauxItem, value: any) => {
        updateTravauxItem(id, { [field]: value });
        setTravaux(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const handleSelectTag = (tagLabel: string) => {
        if (!activeTagPickerItem) return;
        handleUpdateField(activeTagPickerItem.id, 'travailARealiser', tagLabel);
        setActiveTagPickerItem(null);
    };

    const handleCycleStatus = (item: TravauxItem) => {
        const statuses = ['A FAIRE', 'A IMPR', 'EN ATTENTE DE RDV', 'EN COURS', 'TERMINÉ'];
        const currentIdx = statuses.indexOf(item.travail);
        const nextIdx = (currentIdx + 1) % statuses.length;
        handleUpdateField(item.id, 'travail', statuses[nextIdx]);
    };

    const handleAddQuickRow = (monthGroup: string) => {
        const inputVal = newRowInput[monthGroup] || '';
        const nameToAdd = inputVal.trim() || (patientName ? patientName : 'Nouveau Patient');

        const created = addTravauxItem({
            monthGroup,
            patientName: nameToAdd,
            patientId: patientId || '',
            travailARealiser: 'Stab/contention',
            travail: 'A FAIRE',
            prothesiste: 'Sam',
            rdv: 'sept. 29',
            facturation: 'En attente'
        });

        setTravaux(prev => [created, ...prev]);
        setNewRowInput(prev => ({ ...prev, [monthGroup]: '' }));
    };

    return (
        <div className="onyxceph-container">
            {/* Top Controls Bar */}
            <div className="onyxceph-top-bar">
                <div className="onyxceph-header-title">
                    <h3>
                        <img src={logoMonday} alt="Monday logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                        Planning Monday cabinet
                    </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {patientName && (
                        <button
                            className="onyxceph-tool-btn"
                            style={{
                                background: showOnlyThisPatient ? 'rgba(0, 242, 254, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                                color: showOnlyThisPatient ? 'var(--primary-cyan)' : '#cbd5e1',
                                borderColor: showOnlyThisPatient ? 'var(--primary-cyan)' : 'rgba(255, 255, 255, 0.12)'
                            }}
                            onClick={() => setShowOnlyThisPatient(!showOnlyThisPatient)}
                        >
                            👤 {showOnlyThisPatient ? `Filtré : ${patientName}` : 'Voir tous les patients'}
                        </button>
                    )}
                </div>
            </div>

            {/* Views Tabs Navigation */}
            <div className="onyxceph-views-nav">
                <button className="onyxceph-view-tab active">Tableau principal</button>
                <button className="onyxceph-view-tab">Gantt</button>
                <button className="onyxceph-view-tab">Échéances</button>
                <button className="onyxceph-view-tab">Laboratoire & Impression 3D</button>
            </div>

            {/* Action Bar */}
            <div className="onyxceph-actions-row">
                <button className="btn-add-element" onClick={() => handleAddQuickRow('SEPTEMBRE 2026')}>
                    + Ajouter élément
                </button>
                <input
                    type="text"
                    className="onyxceph-search-input"
                    placeholder="🔍 Rechercher n'importe quoi..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
                <button className="onyxceph-tool-btn">👤 Personne</button>
                <button className="onyxceph-tool-btn">⚙️ Filtre</button>
                <button className="onyxceph-tool-btn">⇅ Trier</button>
                <button className="onyxceph-tool-btn">👁️ Masquer</button>
            </div>

            {/* Month Groups Loop */}
            {Object.keys(monthGroupsMap).map(month => {
                const groupItems = monthGroupsMap[month];
                const isCollapsed = Boolean(collapsedGroups[month]);
                const isSept = month.toUpperCase().includes('SEPTEMBRE');
                const isOct = month.toUpperCase().includes('OCTOBRE');

                const titleClass = isSept
                    ? 'group-title-september'
                    : isOct
                    ? 'group-title-october'
                    : 'group-title-default';

                return (
                    <div key={month} className="onyxceph-group">
                        {/* Group Header */}
                        <div className="onyxceph-group-header" onClick={() => toggleGroupCollapse(month)}>
                            <span className={`onyxceph-group-arrow ${isCollapsed ? 'collapsed' : ''}`}>▼</span>
                            <span className={`onyxceph-group-title ${titleClass}`}>{month}</span>
                            <span className="onyxceph-group-count">{groupItems.length} éléments</span>
                        </div>

                        {/* Table Content */}
                        {!isCollapsed && (
                            <div className="onyxceph-table-wrapper">
                                <table className="onyxceph-table">
                                    <thead>
                                        <tr>
                                            <th>Élément</th>
                                            <th>Travail à réaliser</th>
                                            <th>Empr</th>
                                            <th>Commentaires</th>
                                            <th>Travail</th>
                                            <th>Prothésiste</th>
                                            <th>Rdv</th>
                                            <th>Facturation</th>
                                            <th>Commentaires</th>
                                            <th>Type d'impre..</th>
                                            <th>Nb de goutt impr..</th>
                                            <th>Imprimé</th>
                                            <th>Thermoform</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groupItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={13} style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>
                                                    Aucun travail enregistré pour {month}
                                                </td>
                                            </tr>
                                        ) : (
                                            groupItems.map(item => (
                                                <tr key={item.id}>
                                                    {/* 1. Élément (Patient Name) */}
                                                    <td>
                                                        <div className="element-cell">
                                                            <input type="checkbox" className="element-checkbox" />
                                                            <input
                                                                type="text"
                                                                className="onyxceph-cell-input"
                                                                style={{ fontWeight: 700, color: '#ffffff' }}
                                                                value={item.patientName}
                                                                onChange={e => handleUpdateField(item.id, 'patientName', e.target.value)}
                                                            />
                                                        </div>
                                                    </td>

                                                    {/* 2. Travail à réaliser (Interactive Badge Tag + Popup Trigger) */}
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span
                                                            className={`badge-tag ${getTagClass(item.travailARealiser)}`}
                                                            onClick={() => setActiveTagPickerItem(item)}
                                                            title="Cliquer pour choisir une étiquette"
                                                        >
                                                            {item.travailARealiser || 'A FAIRE'}
                                                        </span>
                                                    </td>

                                                    {/* 3. Empr */}
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="onyxceph-cell-input"
                                                            placeholder="ex: 6 à 9"
                                                            value={item.empr || ''}
                                                            onChange={e => handleUpdateField(item.id, 'empr', e.target.value)}
                                                        />
                                                    </td>

                                                    {/* 4. Commentaires 1 */}
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="onyxceph-cell-input"
                                                            placeholder="Notes..."
                                                            value={item.commentaires1 || ''}
                                                            onChange={e => handleUpdateField(item.id, 'commentaires1', e.target.value)}
                                                        />
                                                    </td>

                                                    {/* 5. Travail (Status Badge) */}
                                                    <td style={{ textAlign: 'center' }}>
                                                        <span
                                                            className={`status-badge ${
                                                                item.travail === 'A IMPR'
                                                                    ? 'status-a-impr'
                                                                    : item.travail === 'EN ATTENTE DE RDV'
                                                                    ? 'status-en-attente-rdv'
                                                                    : item.travail === 'TERMINÉ'
                                                                    ? 'status-termine'
                                                                    : 'status-a-faire'
                                                            }`}
                                                            onClick={() => handleCycleStatus(item)}
                                                            title="Cliquer pour faire défiler le statut"
                                                        >
                                                            {item.travail === 'TERMINÉ' ? '✓ TERMINÉ' : item.travail}
                                                        </span>
                                                    </td>

                                                    {/* 6. Prothésiste */}
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="onyxceph-cell-input prothesiste-pill"
                                                            value={item.prothesiste || 'Sam'}
                                                            onChange={e => handleUpdateField(item.id, 'prothesiste', e.target.value)}
                                                        />
                                                    </td>

                                                    {/* 7. Rdv */}
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="onyxceph-cell-input rdv-pill"
                                                            value={item.rdv || ''}
                                                            placeholder="ex: sept 29"
                                                            onChange={e => handleUpdateField(item.id, 'rdv', e.target.value)}
                                                        />
                                                    </td>

                                                    {/* 8. Facturation */}
                                                    <td>
                                                        <span
                                                            className={`facturation-badge ${
                                                                item.facturation === 'Facturé'
                                                                    ? 'facture-paye'
                                                                    : 'facture-en-attente'
                                                            }`}
                                                            onClick={() =>
                                                                handleUpdateField(
                                                                    item.id,
                                                                    'facturation',
                                                                    item.facturation === 'Facturé' ? 'En attente' : 'Facturé'
                                                                )
                                                            }
                                                            style={{ cursor: 'pointer' }}
                                                        >
                                                            {item.facturation || 'En attente'}
                                                        </span>
                                                    </td>

                                                    {/* 9. Commentaires 2 */}
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="onyxceph-cell-input"
                                                            placeholder="Remarques..."
                                                            value={item.commentaires2 || ''}
                                                            onChange={e => handleUpdateField(item.id, 'commentaires2', e.target.value)}
                                                        />
                                                    </td>

                                                    {/* 10. Type d'impre.. */}
                                                    <td>
                                                        <input
                                                            type="text"
                                                            className="onyxceph-cell-input printer-pill"
                                                            value={item.typeImpress || ''}
                                                            placeholder="ex: BAMBULAB"
                                                            onChange={e => handleUpdateField(item.id, 'typeImpress', e.target.value)}
                                                        />
                                                    </td>

                                                    {/* 11. Nb de goutt impr.. */}
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input
                                                            type="text"
                                                            className="onyxceph-cell-input"
                                                            style={{ textAlign: 'center', width: '50px', fontWeight: 700 }}
                                                            value={item.nbGouttImpr || ''}
                                                            placeholder="0"
                                                            onChange={e => handleUpdateField(item.id, 'nbGouttImpr', e.target.value)}
                                                        />
                                                    </td>

                                                    {/* 12. Imprimé */}
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            className="element-checkbox"
                                                            checked={item.imprime}
                                                            onChange={e => handleUpdateField(item.id, 'imprime', e.target.checked)}
                                                        />
                                                    </td>

                                                    {/* 13. Thermoform */}
                                                    <td style={{ textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            className="element-checkbox"
                                                            checked={item.thermoform}
                                                            onChange={e => handleUpdateField(item.id, 'thermoform', e.target.checked)}
                                                        />
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>

                                {/* Quick inline add row bar */}
                                <div className="onyxceph-add-row-bar">
                                    <input
                                        type="text"
                                        placeholder={`+ Ajouter un élément à ${month}...`}
                                        value={newRowInput[month] || ''}
                                        onChange={e => setNewRowInput({ ...newRowInput, [month]: e.target.value })}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleAddQuickRow(month);
                                        }}
                                    />
                                    <button className="btn-add-element" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleAddQuickRow(month)}>
                                        Ajouter
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Tag Selection Popup Modal matching Image #2 */}
            {activeTagPickerItem && (
                <div className="tag-picker-overlay" onClick={() => setActiveTagPickerItem(null)}>
                    <div className="tag-picker-card" onClick={e => e.stopPropagation()}>
                        <div className="tag-picker-header">
                            <h4>🏷️ Choisir l'étiquette pour {activeTagPickerItem.patientName}</h4>
                            <button
                                style={{ background: 'transparent', border: 'none', color: '#ffffff', fontSize: '1.4rem', cursor: 'pointer' }}
                                onClick={() => setActiveTagPickerItem(null)}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="tag-picker-grid">
                            {PRESET_TAGS.map((tag, idx) => (
                                <div
                                    key={idx}
                                    className={`tag-picker-item ${tag.class}`}
                                    onClick={() => handleSelectTag(tag.label)}
                                >
                                    {tag.label}
                                </div>
                            ))}
                        </div>

                        <div className="tag-picker-footer">
                            <button className="tag-picker-footer-btn" onClick={() => setActiveTagPickerItem(null)}>
                                ✏️ Modifier les étiquettes
                            </button>
                            <span className="tag-picker-auto-btn">
                                ✦ Attribution automatique des étiquettes (IA OrthoMind)
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OnyxCephTravauxTable;
