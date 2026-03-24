import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import { EmptyState } from '../components/EmptyState';
import Patients from './Patients';
import Planning from './Planning';
import Calls from './Calls';
import FollowUps from './FollowUps';
import { getUpcomingAppointments, Appointment } from '../services/appointmentService';
import { createInitialState, getNextStep, createMessage } from '../services/conversation';
import { speechService } from '../services/speech';
import { ConversationState, Message } from '../types';
import avatarDesouches from '../assets/avatar-desouches.png';
import assistantAvatar from '../assets/assistant-avatar.png';
import welcomeBannerImg from '../assets/welcomecard.png';
import casperLogo from '../assets/casper-logo.png';
import casperLogoWelcome from '../assets/casper-logo-welcome.png';
import './Dashboard.css';

const Dashboard = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [aiInput, setAiInput] = useState('');
    const [activeMenu, setActiveMenu] = useState('dashboard');
    const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [convState, setConvState] = useState<ConversationState>(createInitialState());
    const [isListening, setIsListening] = useState(false);

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            try {
                const appointments = await getUpcomingAppointments(5);
                setUpcomingAppointments(appointments);
            } catch (error) {
                console.error("Failed to fetch appointments:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDashboardData();
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleAISubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (aiInput.trim()) {
            const userMessage = createMessage('user', aiInput);
            const { nextStep, response } = getNextStep(convState.step, aiInput, convState);
            const assistantMessage = createMessage('assistant', response);

            setConvState(prev => ({
                ...prev,
                step: nextStep,
                messages: [...prev.messages, userMessage, assistantMessage]
            }));

            setAiInput('');

            // Speak response if possible
            if (speechService.isSupported) {
                speechService.speak(response);
            }
        }
    };

    const handleVoiceCommand = () => {
        if (!speechService.isSupported) return;

        if (isListening) {
            speechService.stopListening();
            setIsListening(false);
        } else {
            speechService.startListening(
                (text) => {
                    setAiInput(text);
                    setIsListening(false);
                    // Automatically submit voice result
                    const userMessage = createMessage('user', text);
                    const { nextStep, response } = getNextStep(convState.step, text, convState);
                    const assistantMessage = createMessage('assistant', response);

                    setConvState(prev => ({
                        ...prev,
                        step: nextStep,
                        messages: [...prev.messages, userMessage, assistantMessage]
                    }));

                    setAiInput('');
                    speechService.speak(response);
                },
                (error) => {
                    console.error('Speech recognition error:', error);
                    setIsListening(false);
                }
            );
            setIsListening(true);
        }
    };

    const currentDate = new Date().toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const isToday = (dateStr: string) => {
        const d = new Date(dateStr);
        const today = new Date();
        return d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();
    };

    const stats = {
        totalUpcoming: upcomingAppointments.length,
        todayCount: upcomingAppointments.filter(apt => isToday(apt.date)).length,
        totalMinutes: upcomingAppointments.reduce((acc, apt) => acc + (apt.duration_minutes || 0), 0)
    };


    return (
        <div className="dashboard-page">
            {/* Sidebar */}
            <aside className="dashboard-sidebar">
                <div className="sidebar-header">
                    <Logo />
                </div>

                <nav className="sidebar-nav">
                    <button
                        className={`nav-item ${activeMenu === 'dashboard' ? 'active' : ''}`}
                        onClick={() => setActiveMenu('dashboard')}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                            <polyline points="9 22 9 12 15 12 15 22" />
                        </svg>
                        <span>Tableau de bord</span>
                    </button>

                    <button
                        className={`nav-item ${activeMenu === 'calls' ? 'active' : ''}`}
                        onClick={() => setActiveMenu('calls')}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.27-2.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span>Appels</span>
                    </button>

                    <button
                        className={`nav-item ${activeMenu === 'relances' ? 'active' : ''}`}
                        onClick={() => setActiveMenu('relances')}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        <span>Relances</span>
                    </button>

                    <button
                        className={`nav-item ${activeMenu === 'patients' ? 'active' : ''}`}
                        onClick={() => setActiveMenu('patients')}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>Patients</span>
                    </button>

                    <button
                        className={`nav-item ${activeMenu === 'planning' ? 'active' : ''}`}
                        onClick={() => setActiveMenu('planning')}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span>Planning</span>
                    </button>

                    <button
                        className={`nav-item ${activeMenu === 'ai' ? 'active' : ''}`}
                        onClick={() => setActiveMenu('ai')}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                            <circle cx="9" cy="13" r="1" />
                            <circle cx="15" cy="13" r="1" />
                            <path d="M9 17h6" />
                        </svg>
                        <span>Assistant Expert</span>
                    </button>
                </nav>

                {/* Practitioner Card */}
                <div className="sidebar-practitioner">
                    <div className="practitioner-avatar">
                        {user?.photo && user.name !== 'Docteur' ? (
                            <img src={user.photo} alt={user.name} />
                        ) : (
                            <div className="avatar-placeholder">
                                {user?.name?.[0] || 'D'}
                            </div>
                        )}
                    </div>
                    <div className="practitioner-info">
                        <h4>{user?.name || 'Dr. Praticien'}</h4>
                        <p className="practitioner-rpps">RPPS: {user?.rpps || '00000000000'}</p>
                        <p className="practitioner-profession">{user?.profession || 'Praticien'}</p>
                        <p className="practitioner-specialty">{user?.specialty || 'Spécialité'}</p>
                    </div>
                    <button className="logout-btn" onClick={handleLogout} title="Déconnexion">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="dashboard-main">
                {/* Search Bar */}
                <div className="dashboard-search">
                    <div className="search-wrapper">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Nom du patient, Diagnostics, Synthèse, RDV, Suivi, Administratif, Commentaires..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                {/* Dashboard Content */}
                {activeMenu === 'patients' ? (
                    <Patients />
                ) : activeMenu === 'planning' ? (
                    <Planning />
                ) : activeMenu === 'calls' ? (
                    <Calls />
                ) : activeMenu === 'relances' ? (
                    <FollowUps />
                ) : activeMenu === 'ai' ? (
                    <div className="dashboard-content ai-view">
                        <div className="expert-assistant-header">
                            <div className="expert-title">
                                <span className="blue-gradient-text">ASSISTANT EXPERT</span>
                                <span className="medical-text"> CASPER</span>
                                <span className="flow-text"> DENTAL</span>
                            </div>
                            <p className="expert-subtitle">Posez vos questions, dictez vos notes, gérez vos tâches</p>
                        </div>

                        <div className="assistant-messages-wrapper">
                            <div className="ai-messages-container">
                                {convState.messages.map((msg) => (
                                    <div key={msg.id} className={`message-item message-${msg.role}`}>
                                        {msg.content}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* New Expert Input Design in Dashboard */}
                        <div className="dashboard-expert-input">
                            <div className="input-upper">
                                <form className="expert-input-wrapper" onSubmit={handleAISubmit}>
                                    <div className="expert-avatar-icon">
                                        <img src={assistantAvatar} alt="AI" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Décrivez vos besoins, prises de RDV, Suivis Patients,..."
                                        value={aiInput}
                                        onChange={(e) => setAiInput(e.target.value)}
                                        disabled={isListening}
                                    />
                                    <button type="submit" className="expert-send-btn" disabled={!aiInput.trim()}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M5 12h14M12 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </form>
                            </div>

                            <div className="input-lower">
                                <button className="expert-plus-btn">+</button>
                                <div className="specialty-selector">
                                    <span className="specialty-icon">🦷</span>
                                    <select defaultValue="orthodontisme">
                                        <option value="orthodontisme">Orthodontie</option>
                                        <option value="implantologie">Implantologie</option>
                                        <option value="chirurgie">Chirurgie</option>
                                    </select>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M7 10l5 5 5-5z" />
                                    </svg>
                                </div>
                                <button
                                    className={`expert-mic-btn ${isListening ? 'active' : ''}`}
                                    onClick={handleVoiceCommand}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                        <line x1="12" y1="19" x2="12" y2="23" />
                                        <line x1="8" y1="23" x2="16" y2="23" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="dashboard-content stats-view">
                        <div className="stats-header">
                            <h2>Bonjour Cabinet {user?.name || 'Casper Dental'}</h2>
                        </div>

                        <div className="dashboard-top-row">
                            <div className="welcome-banner-container">
                                <div className="welcome-banner" style={{ '--banner-bg': `url(${welcomeBannerImg})` } as React.CSSProperties}>
                                    <div className="banner-overlay"></div>
                                    <div className="banner-content">
                                        <div className="banner-text-side">
                                            <h1 className="banner-greeting">Bienvenue,</h1>
                                            <a href="https://casperdental.fr/" target="_blank" rel="noopener noreferrer" className="banner-logo-wrapper">
                                                <img src={casperLogoWelcome} alt="Casper Dental" className="banner-casper-logo" />
                                            </a>
                                            <div className="banner-subtext">
                                                <p>Ravi de vous revoir !</p>
                                                <p>Consultez votre Espace Praticien</p>
                                            </div>
                                            <div className="banner-date-section">
                                                <p className="date-caption">Date d'aujourd'hui</p>
                                                <p className="date-display">{currentDate}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {upcomingAppointments.length === 0 && !isLoading ? (
                                <div className="empty-state-card-wrapper">
                                    <EmptyState
                                        title="Bienvenue dans votre cabinet"
                                        message="Vous n'avez pas encore de données réelles. Commencez par créer votre premier patient pour activer toutes les fonctionnalités."
                                        actionLabel="Créer un patient"
                                        onAction={() => setActiveMenu('patients')}
                                    />
                                </div>
                            ) : (
                                <div className="stats-side-panel">
                                    <div className="forfait-card">
                                        <h4>Forfait en cours</h4>
                                        <p className="forfait-period">Suivi de consommation réel</p>
                                        <div className="forfait-metrics">
                                            <div className="metric">
                                                <span className="label">UTILISÉ</span>
                                                <span className="value used">{stats.totalMinutes} min</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {upcomingAppointments.length > 0 && (
                            <div className="stats-grid" style={{ marginTop: '24px' }}>
                                <div className="stats-main-card">
                                    <div className="card-top">
                                        <h3>Statistiques globales (30 jours)</h3>
                                        <div className="legend">
                                            <span className="dot hours-in"></span> Rendez-vous
                                        </div>
                                    </div>
                                    <div className="mock-chart">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '40px', width: '100%', padding: '20px' }}>
                                            <div className="stat-big-number">
                                                <span className="label">Aujourd'hui</span>
                                                <span className="value">{stats.todayCount}</span>
                                            </div>
                                            <div className="stat-big-number">
                                                <span className="label">À venir</span>
                                                <span className="value">{stats.totalUpcoming}</span>
                                            </div>
                                            <div className="stat-big-number">
                                                <span className="label">Temps prévu</span>
                                                <span className="value">{Math.round(stats.totalMinutes / 60)}h {stats.totalMinutes % 60}m</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {upcomingAppointments.length > 0 && (
                            <div className="dashboard-card appointments-card" style={{ marginTop: '24px' }}>
                                <div className="card-header">
                                    <h3>Mes prochains rendez-vous</h3>
                                </div>
                                <div className="appointments-list">
                                    {upcomingAppointments.map((apt) => (
                                        <div key={apt.id} className="appointment-item">
                                            <div className="appointment-time">
                                                {new Date(apt.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            <div className="appointment-details">
                                                <span className="patient-name">{apt.patient?.prenom} {apt.patient?.nom}</span>
                                                <span className="appointment-type">{apt.type}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default Dashboard;
