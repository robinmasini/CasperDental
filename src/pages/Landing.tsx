import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import './Landing.css';

const Landing = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated, loading } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showAccessInfo, setShowAccessInfo] = useState(false);

    // Redirect if already logged in
    useEffect(() => {
        if (!loading && isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, loading, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const result = await login(email, password);
            if (result.success) {
                navigate('/dashboard');
            } else {
                setError(result.error || 'Identifiants incorrects. Veuillez réessayer.');
            }
        } catch (err) {
            setError('Une erreur réseau est survenue. Veuillez réessayer.');
        } finally {
            setIsLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="login-screen-container">
                <div className="liquid-bg">
                    <div className="blob blob-1"></div>
                    <div className="blob blob-2"></div>
                    <div className="blob blob-3"></div>
                </div>
                <div className="premium-loader-container">
                    <div className="premium-loader-ring"></div>
                    <div className="premium-loader-logo">
                        <Logo size="medium" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-screen-container">
            {/* Liquid Background Effect */}
            <div className="liquid-bg">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            {/* Login Card */}
            <div className="login-glass-card glass-card-glow">
                <div className="login-header-section">
                    <div className="login-logo-wrapper">
                        <Logo size="large" />
                    </div>
                    <h1>Casper Dental</h1>
                    <p>Portail d'analyse orthodontique expert</p>
                </div>

                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error-alert">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="login-form-group">
                        <label htmlFor="email">Email professionnel</label>
                        <div className="login-input-icon-wrapper">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <input
                                className="glass-input"
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="dr.ortho@cabinet.fr"
                                required
                                autoComplete="email"
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <div className="login-form-group">
                        <label htmlFor="password">Mot de passe</label>
                        <div className="login-input-icon-wrapper">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <input
                                className="glass-input"
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                autoComplete="current-password"
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="glass-btn glass-btn-primary login-submit-btn"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="spinner"></span>
                        ) : (
                            <>
                                Accéder au Cabinet
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                            </>
                        )}
                    </button>
                    
                    <div style={{ textAlign: 'center' }}>
                        <a href="#" className="forgot-pwd-link" onClick={(e) => { e.preventDefault(); alert("Veuillez contacter l'administrateur de Casper Dental."); }}>
                            Mot de passe oublié ?
                        </a>
                    </div>
                </form>

                <div className="login-card-divider">
                    <span>OU</span>
                </div>

                <button
                    className="request-access-button"
                    onClick={() => setShowAccessInfo(!showAccessInfo)}
                    disabled={isLoading}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                    Demander un accès praticien
                </button>

                {showAccessInfo && (
                    <div className="request-access-info">
                        <p>Pour équiper votre cabinet d'analyse dentaire :</p>
                        <a href="mailto:contact@casperdental.fr">contact@casperdental.fr</a>
                    </div>
                )}

                {/* Security Tag */}
                <div className="login-security-tag">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>Données médicales hébergées HDS (RGPD)</span>
                </div>
            </div>
        </div>
    );
};

export default Landing;
