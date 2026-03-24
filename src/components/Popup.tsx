import './Popup.css';
import popupImg from '../assets/popup.png';

const Popup = () => {
    return (
        <div className="coming-soon-popup">
            <div className="popup-overlay"></div>
            <div className="popup-content">
                <img src={popupImg} alt="Casper Dental - Bientôt disponible" className="popup-image" />
            </div>
        </div>
    );
};

export default Popup;
