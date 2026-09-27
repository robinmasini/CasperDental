import React, { useState, lazy, Suspense } from 'react';
import orthomindImage from '../assets/Brain.png';
import './OrthoMindAvatar.css';

const Robot3D = lazy(() => import('./Robot3D'));

export type OrthoMindState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface OrthoMindAvatarProps {
    state: OrthoMindState;
    /** Affiche le robot en 3D temps réel (l'image sert de secours et d'attente) */
    use3D?: boolean;
}

export const OrthoMindAvatar: React.FC<OrthoMindAvatarProps> = ({ state, use3D = false }) => {
    const [is3DReady, setIs3DReady] = useState(false);
    const [has3DFailed, setHas3DFailed] = useState(false);
    const show3D = use3D && !has3DFailed;

    return (
        <div className={`orthomind-avatar-container state-${state} ${show3D && is3DReady ? 'is-3d' : ''}`}>
            {/* Holographic glowing backgrounds */}
            <div className="avatar-background-glow" />
            <div className="avatar-radial-accent" />
            
            {/* Animated Ring circles behind the robot */}
            <div className="avatar-pulse-ring ring-1" />
            <div className="avatar-pulse-ring ring-2" />

            {show3D && (
                <Suspense fallback={null}>
                    <Robot3D state={state} onReady={() => setIs3DReady(true)} onError={() => setHas3DFailed(true)} />
                </Suspense>
            )}

            {/* Futuristic Robot Image Container */}
            <div className="avatar-image-wrapper">
                <img 
                    src={orthomindImage} 
                    alt="OrthoMind AI" 
                    className="orthomind-robot-image"
                />
                
                {/* Cyber-HUD visor scanner bar overlay */}
                {state === 'thinking' && (
                    <>
                        <div className="visor-scan-line" />
                        <div className="hologram-grid-overlay" />
                        <div className="scan-glow-overlay" />
                    </>
                )}
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
