import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import Logo from '../components/Logo';
import './Landing.css';

const Landing = () => {
    useEffect(() => {
        // Load Calendly script dynamically
        const script = document.createElement('script');
        script.src = "https://assets.calendly.com/assets/external/widget.js";
        script.async = true;
        document.body.appendChild(script);

        return () => {
            // Cleanup script on unmount
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, []);

    return (
        <div className="landing">
            {/* Header */}
            <header className="landing-header">
                <div className="container">
                    <div className="header-content">
                        <Logo variant="new" size="medium" />
                        <nav className="nav">
                            <a href="#presentation">PRÉSENTATION</a>
                            <a href="#advantages">AVANTAGES</a>
                            <a href="#demo">TARIFS / DÉMO</a>
                        </nav>
                        <div className="header-ctas">
                            <Link to="/login" className="btn btn-outline">
                                ESPACE PATIENT
                            </Link>
                            <Link to="/login" className="btn btn-primary">
                                ESPACE PRATICIEN
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section id="presentation" className="hero">
                <div className="hero-overlay"></div>
                <div className="container">
                    <div className="hero-content">
                        <h1>
                            Casper Dental : l'innovation au service de votre cabinet
                        </h1>
                        <p className="hero-subtitle">
                            Gagnez en sérénité et optimisez votre pratique avec notre assistant expert
                            conçu exclusivement pour les professionnels de santé dentaire.
                        </p>
                        <div className="hero-cta">
                            <Link to="/login" className="btn btn-primary btn-lg">
                                DÉCOUVRIR NOS SERVICES
                            </Link>
                            <a href="#advantages" className="btn btn-outline btn-lg" style={{ borderColor: 'white', color: 'white' }}>
                                EN SAVOIR PLUS
                            </a>
                        </div>
                    </div>
                </div>
            </section>

            {/* Advantages Section */}
            <section id="advantages" className="section-advantages">
                <div className="container">
                    <div className="section-header">
                        <h2>NOS AVANTAGES</h2>
                        <div className="divider"></div>
                    </div>

                    <div className="advantages-grid">
                        <div className="advantage-card">
                            <div className="advantage-icon">🏆</div>
                            <h3>Expertise</h3>
                            <p>
                                Une solution développée en étroite collaboration avec des chirurgiens-dentistes
                                pour répondre précisément aux exigences de votre métier.
                            </p>
                        </div>
                        <div className="advantage-card">
                            <div className="advantage-icon">💡</div>
                            <h3>Innovation</h3>
                            <p>
                                Une solution de pointe qui apprend et s'adapte à votre flux
                                de travail pour une assistance personnalisée au quotidien.
                            </p>
                        </div>
                        <div className="advantage-card">
                            <div className="advantage-icon">🌿</div>
                            <h3>Eco-responsabilité</h3>
                            <p>
                                Optimisez vos ressources et réduisez votre empreinte papier grâce à une
                                gestion 100% numérique et efficace de votre cabinet.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Demo / Calendly Section */}
            <section id="demo" className="calendly-section">
                <div className="container">
                    <div className="section-header">
                        <h2>PRENEZ RENDEZ-VOUS</h2>
                        <p>Planifiez une démonstration personnalisée de Casper Dental</p>
                        <div className="divider"></div>
                    </div>
                    <div className="calendly-wrapper">
                        <div
                            className="calendly-inline-widget"
                            data-url="https://calendly.com/robin-masini/30min"
                            style={{ minWidth: '320px', height: '700px' }}
                        ></div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer id="contact" className="footer">
                <div className="container">
                    <div className="footer-content">
                        <div className="footer-brand">
                            <Logo variant="white" size="medium" />
                            <p>
                                Casper Dental redéfinit la gestion de cabinet dentaire
                                par l'innovation technologique et l'excellence du service.
                            </p>
                        </div>
                        <div>
                            <h4>PRODUIT</h4>
                            <div className="footer-links">
                                <a href="#presentation">Présentation</a>
                                <a href="#advantages">Avantages</a>
                                <a href="#demo">Tarifs</a>
                            </div>
                        </div>
                        <div>
                            <h4>LÉGAL</h4>
                            <div className="footer-links">
                                <a href="#">Mentions légales</a>
                                <a href="#">RGPD</a>
                                <a href="#">CGV</a>
                            </div>
                        </div>
                        <div>
                            <h4>CONTACT</h4>
                            <div className="footer-links">
                                <a href="mailto:contact@casperdental.fr">contact@casperdental.fr</a>
                                <a href="https://casperdental.fr">casperdental.fr</a>
                            </div>
                        </div>
                    </div>
                    <div className="footer-bottom">
                        <p>© 2024 Casper Dental - Tous droits réservés</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
