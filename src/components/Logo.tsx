import logoCasper from '../assets/casper-logo.png';
import logoCross from '../assets/logo-cross.svg';
import './Logo.css';

interface LogoProps {
    className?: string;
    size?: 'small' | 'medium' | 'large';
    variant?: 'default' | 'white' | 'cross' | 'new';
}

const Logo = ({ className = '', size = 'medium', variant = 'default' }: LogoProps) => {
    const sizeClass = `logo-${size}`;
    let logoSrc = logoCasper; // Default to Casper logo
    if (variant === 'cross') logoSrc = logoCross;

    return (
        <div className={`logo ${sizeClass} ${className}`}>
            <img src={logoSrc} alt="Casper Dental" className="logo-image" />
        </div>
    );
};

export default Logo;
