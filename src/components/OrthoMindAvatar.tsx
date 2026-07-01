import React from 'react';
import orthomindImage from '../assets/Orthomind.png';
import './OrthoMindAvatar.css';

export type OrthoMindState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface OrthoMindAvatarProps {
    state: OrthoMindState;
}

export const OrthoMindAvatar: React.FC<OrthoMindAvatarProps> = ({ state }) => {
    return (
        <div className={`orthomind-avatar-container state-${state}`}>
            {/* Holographic glowing backgrounds */}
            <div className="avatar-background-glow" />
            <div className="avatar-radial-accent" />
            
            {/* Animated Ring circles behind the robot */}
            <div className="avatar-pulse-ring ring-1" />
            <div className="avatar-pulse-ring ring-2" />

            {/* Futuristic Robot Image Container */}
            <div className="avatar-image-wrapper">
                <img 
                    src={orthomindImage} 
                    alt="OrthoMind AI" 
                    className="orthomind-robot-image"
                />
                
                {/* Cyber-HUD visor scanner bar overlay */}
                {state === 'thinking' && <div className="visor-scan-line" />}
            </div>

            {/* Active Status Badge Overlay */}
            <div className={`avatar-status-overlay status-${state}`}>
                {state === 'listening' && (
                    <div className="status-badge listening">
                        <span className="pulse-indicator"></span>
                        <span>À l'écoute...</span>
                    </div>
                )}
                {state === 'thinking' && (
                    <div className="status-badge thinking">
                        <span className="thinking-dots-loader">
                            <span></span><span></span><span></span>
                        </span>
                        <span>Consultation RAG...</span>
                    </div>
                )}
                {state === 'speaking' && (
                    <div className="status-badge speaking">
                        <div className="speaking-audio-waves">
                            <span></span><span></span><span></span><span></span>
                        </div>
                        <span>Conseil OrthoMind...</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OrthoMindAvatar;
