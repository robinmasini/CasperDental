import React from 'react';
import './EmptyState.css';

interface EmptyStateProps {
    title: string;
    message: string;
    icon?: string;
    actionLabel?: string;
    onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
    title,
    message,
    icon = '📁',
    actionLabel,
    onAction
}) => {
    return (
        <div className="empty-state-container">
            <div className="empty-state-icon">{icon}</div>
            <h3 className="empty-state-title">{title}</h3>
            <p className="empty-state-message">{message}</p>
            {actionLabel && onAction && (
                <button className="empty-state-action" onClick={onAction}>
                    {actionLabel}
                </button>
            )}
        </div>
    );
};

export { EmptyState };
