import React from 'react';
import './OrthoMindAvatar.css';

export type OrthoMindState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface OrthoMindAvatarProps {
    state: OrthoMindState;
}

export const OrthoMindAvatar: React.FC<OrthoMindAvatarProps> = ({ state }) => {
    return (
        <div className={`orthomind-avatar-container ${state}`}>
            {/* Holographic background aura */}
            <div className="om-background-aura" />

            <svg viewBox="0 0 400 400" className="orthomind-svg">
                {/* GRADIENTS & GLOW FILTERS */}
                <defs>
                    {/* Glow filter for neon/cyber elements */}
                    <filter id="omGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="6" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    
                    {/* Subtle glow for the eye */}
                    <filter id="eyeGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>

                    {/* Visor Gradient: Deep Blue to Primary Blue */}
                    <linearGradient id="visorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#042C53" />
                        <stop offset="60%" stopColor="#0C447C" />
                        <stop offset="100%" stopColor="#1D4ED8" />
                    </linearGradient>

                    {/* Active Thinking Visor Accent Gradient */}
                    <linearGradient id="visorGlowThinkingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#1D4ED8" />
                        <stop offset="50%" stopColor="#378ADD" />
                        <stop offset="100%" stopColor="#85B7EB" />
                    </linearGradient>

                    {/* Pearl/White Shell Gradient */}
                    <linearGradient id="shellGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFFFFF" />
                        <stop offset="70%" stopColor="#F1F5F9" />
                        <stop offset="100%" stopColor="#E6F1FB" />
                    </linearGradient>

                    {/* Chrome/Metallic Joint Gradient */}
                    <linearGradient id="chromeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#E2E8F0" />
                        <stop offset="25%" stopColor="#94A3B8" />
                        <stop offset="50%" stopColor="#FFFFFF" />
                        <stop offset="75%" stopColor="#64748B" />
                        <stop offset="100%" stopColor="#475569" />
                    </linearGradient>

                    {/* Dark inner-casing/shadow color */}
                    <linearGradient id="darkMetalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#1E293B" />
                        <stop offset="100%" stopColor="#0F172A" />
                    </linearGradient>

                    {/* Glowing blue accent lines */}
                    <linearGradient id="accentBlueGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#1D4ED8" />
                        <stop offset="100%" stopColor="#378ADD" />
                    </linearGradient>

                    {/* Visor reflection gradient */}
                    <linearGradient id="visorReflectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                        <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                    </linearGradient>

                    {/* Visor clipping mask */}
                    <mask id="visorMask">
                        <path d="M 140,110 C 145,95 180,100 188,110 C 196,120 205,140 198,185 C 191,230 182,243 165,247 C 158,249 152,245 150,238 C 148,228 158,212 161,190 C 164,168 135,125 140,110 Z" fill="#FFFFFF" />
                    </mask>
                </defs>

                {/* BACKGROUND ELEMENT / HOLOGRAPHIC AXES */}
                <g opacity="0.15" stroke="#378ADD" strokeWidth="1" fill="none">
                    <circle cx="200" cy="180" r="140" strokeDasharray="5 5" />
                    <line x1="200" y1="20" x2="200" y2="340" />
                    <line x1="40" y1="180" x2="360" y2="180" />
                </g>

                {/* ORBITING PARTICLES (THINKING STATE ONLY) */}
                <g className="om-orbiting-group">
                    {/* Ring 1 - Outer Orbit */}
                    <g className="om-orbit-ring-1">
                        <ellipse cx="200" cy="180" rx="145" ry="60" fill="none" stroke="rgba(55, 138, 221, 0.15)" strokeWidth="1" transform="rotate(-15 200 180)" />
                        <circle cx="90" cy="140" r="4.5" fill="#378ADD" filter="url(#eyeGlow)" />
                        <circle cx="310" cy="220" r="3" fill="#85B7EB" filter="url(#eyeGlow)" />
                    </g>
                    {/* Ring 2 - Inner Orbit Cross */}
                    <g className="om-orbit-ring-2">
                        <ellipse cx="200" cy="180" rx="125" ry="95" fill="none" stroke="rgba(29, 78, 216, 0.1)" strokeWidth="0.8" transform="rotate(45 200 180)" />
                        <circle cx="200" cy="85" r="4" fill="#1D4ED8" filter="url(#eyeGlow)" />
                    </g>
                </g>

                {/* CONCENTRIC RINGS (THINKING STATE ONLY - radiating from eye) */}
                <g className="om-rings-group" stroke="#378ADD" strokeWidth="1.5" fill="none" filter="url(#eyeGlow)">
                    <circle className="om-ring om-ring-1" cx="150" cy="170" r="10" />
                    <circle className="om-ring om-ring-2" cx="150" cy="170" r="10" />
                    <circle className="om-ring om-ring-3" cx="150" cy="170" r="10" />
                </g>

                {/* BUST / SHOULDERS GROUP */}
                <g className="om-bust">
                    {/* Back shoulder plate */}
                    <path d="M 230,310 C 270,310 320,330 340,360 L 350,400 L 220,400 Z" fill="url(#darkMetalGradient)" opacity="0.6" />
                    
                    {/* Main Chest Plate (White) */}
                    <path d="M 120,335 C 120,315 160,305 210,315 C 260,325 290,320 300,340 C 310,360 320,380 320,400 L 110,400 C 110,390 120,355 120,335 Z" fill="url(#shellGradient)" stroke="#CBD5E1" strokeWidth="1" />
                    
                    {/* Glowing blue accent slots on the shoulder plate */}
                    <path d="M 160,350 Q 185,340 210,352 Q 220,357 215,367 Q 190,355 165,365 Z" fill="url(#accentBlueGradient)" filter="url(#omGlow)" />
                    <path d="M 230,360 Q 250,353 270,362 L 265,372 Q 248,365 232,370 Z" fill="url(#accentBlueGradient)" filter="url(#omGlow)" opacity="0.7" />
                </g>

                {/* NECK / CONNECTION TO HEAD */}
                <g className="om-neck">
                    {/* Mechanical Spine segments */}
                    <rect x="205" y="240" width="22" height="75" rx="5" fill="url(#darkMetalGradient)" stroke="#475569" strokeWidth="1" />
                    {/* Cervical joints */}
                    <ellipse cx="216" cy="260" rx="14" ry="5" fill="url(#chromeGradient)" />
                    <ellipse cx="216" cy="285" rx="15" ry="5" fill="url(#chromeGradient)" />
                    
                    {/* Hydraulic piston rod */}
                    <path d="M 188,275 L 198,320 L 204,318 L 194,273 Z" fill="url(#chromeGradient)" />
                </g>

                {/* HEAD GROUP (Main animation group) */}
                <g className="om-head-group">
                    {/* BACK WHITE TUBING / CORD (flexes as head tilts) */}
                    <path d="M 268,195 C 285,210 295,250 275,320" fill="none" stroke="#E2E8F0" strokeWidth="6" strokeLinecap="round" />
                    <path d="M 268,195 C 285,210 295,250 275,320" fill="none" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" />

                    {/* BACK CASING / WHITE SHELL */}
                    {/* Covers top of head, ears, and neck base */}
                    <path d="M 180,95 C 220,70 280,85 285,130 C 290,175 275,210 265,225 C 255,240 230,245 220,245 C 210,245 195,230 195,220 C 195,210 215,200 215,190 C 215,170 190,150 180,140 C 170,130 160,115 180,95 Z" fill="url(#shellGradient)" stroke="#94A3B8" strokeWidth="1.2" />
                    
                    {/* Futuristic Cat-Ear style antenna or fin (White/Blue) */}
                    <path d="M 230,90 L 275,40 C 280,45 285,55 282,75 L 255,108 Z" fill="url(#shellGradient)" stroke="#94A3B8" strokeWidth="1" />
                    <path d="M 245,85 L 270,53 C 272,56 274,62 272,72 L 258,92 Z" fill="url(#accentBlueGradient)" filter="url(#omGlow)" opacity="0.8" />

                    {/* VISOR MOUNT/BORDER FRAME (Chrome metal) */}
                    <path d="M 140,110 C 150,90 190,95 200,105 C 210,115 220,135 210,185 C 200,235 190,250 170,255 C 160,257 150,250 148,242 C 145,230 160,215 165,190 C 170,165 130,130 140,110 Z" fill="url(#chromeGradient)" />

                    {/* MAIN GLASS VISOR (Dark Blue Shield) */}
                    <path d="M 140,110 C 145,95 180,100 188,110 C 196,120 205,140 198,185 C 191,230 182,243 165,247 C 158,249 152,245 150,238 C 148,228 158,212 161,190 C 164,168 135,125 140,110 Z" fill="url(#visorGradient)" />

                    {/* Visor internal cyan lighting lines / details */}
                    <path d="M 152,122 C 162,130 185,150 182,185 C 179,215 168,230 160,235" fill="none" stroke="#378ADD" strokeWidth="1.5" filter="url(#omGlow)" opacity="0.6" />

                    {/* Visor Thinking State Accent Overlay */}
                    <path className="om-visor-glow" d="M 140,110 C 145,95 180,100 188,110 C 196,120 205,140 198,185 C 191,230 182,243 165,247 Z" fill="none" stroke="#378ADD" strokeWidth="0" opacity="0" filter="url(#omGlow)" />

                    {/* Visor glossy reflection (Slides left to right) */}
                    <g mask="url(#visorMask)">
                        <path className="om-visor-reflection" d="M 120,60 L 145,60 L 220,290 L 195,290 Z" fill="url(#visorReflectionGradient)" opacity="0.25" />
                    </g>

                    {/* THE CHROME EAR ROTATION HINGE */}
                    <g transform="translate(225, 175)">
                        {/* Outer chrome ring */}
                        <circle cx="0" cy="0" r="28" fill="url(#chromeGradient)" stroke="#64748B" strokeWidth="1" />
                        <circle cx="0" cy="0" r="22" fill="url(#darkMetalGradient)" />
                        
                        {/* Inner detail concentric ring */}
                        <circle cx="0" cy="0" r="16" fill="url(#chromeGradient)" />
                        {/* Center core */}
                        <circle cx="0" cy="0" r="9" fill="#0C447C" stroke="#378ADD" strokeWidth="1.5" />
                        <circle cx="0" cy="0" r="4" fill="#FFFFFF" filter="url(#eyeGlow)" />
                    </g>

                    {/* EYE / CENTRAL SENSOR (Holographic glowing orb) */}
                    {/* Positioned inside the blue visor */}
                    <circle className="om-eye" cx="150" cy="170" r="10" fill="#378ADD" stroke="#FFFFFF" strokeWidth="1.5" filter="url(#eyeGlow)" />
                    <circle className="om-eye-core" cx="148" cy="168" r="3.5" fill="#FFFFFF" opacity="0.9" />

                    {/* Sleek overlay decals / metal details */}
                    <path d="M 235,115 L 245,118 L 242,128 L 232,125 Z" fill="#94A3B8" opacity="0.7" />
                    <circle cx="215" cy="130" r="2" fill="#475569" />
                    <circle cx="245" cy="142" r="2" fill="#475569" />
                </g>

                {/* AUDIO WAVE VISUALIZER BARS (Active during Listening / Speaking) */}
                {/* Placed under the head/jaw area to look integrated */}
                <g className="om-audio-bars" filter="url(#omGlow)">
                    {/* Sleek semi-transparent backplate */}
                    <rect x="135" y="272" width="60" height="16" rx="8" fill="rgba(4, 44, 83, 0.4)" stroke="rgba(29, 78, 216, 0.2)" strokeWidth="1" />
                    
                    {/* Visualizer bars */}
                    <rect className="om-audio-bar om-audio-bar-1" x="143" y="276" width="3" height="8" rx="1.5" fill="#378ADD" />
                    <rect className="om-audio-bar om-audio-bar-2" x="151" y="276" width="3" height="8" rx="1.5" fill="#1D4ED8" />
                    <rect className="om-audio-bar om-audio-bar-3" x="159" y="276" width="3" height="8" rx="1.5" fill="#378ADD" />
                    <rect className="om-audio-bar om-audio-bar-4" x="167" y="276" width="3" height="8" rx="1.5" fill="#1D4ED8" />
                    <rect className="om-audio-bar om-audio-bar-5" x="175" y="276" width="3" height="8" rx="1.5" fill="#378ADD" />
                </g>
            </svg>
        </div>
    );
};
