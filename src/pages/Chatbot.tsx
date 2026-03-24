import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Message, ConversationState } from '../types';
import { createMessage, createInitialState, getNextStep, extractPatientInfo } from '../services/conversation';
import { speechService } from '../services/speech';
import { createPatient, Patient as DBPatient } from '../services/patientService';
import { createAppointment } from '../services/appointmentService';
import assistantAvatar from '../assets/assistant-avatar.png';
import './Chatbot.css';

const Chatbot = () => {
    const navigate = useNavigate();
    const [state, setState] = useState<ConversationState>(createInitialState());
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [state.messages]);

    // Speak assistant messages
    useEffect(() => {
        if (voiceEnabled && state.messages.length > 0) {
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage.role === 'assistant' && !isTyping) {
                setIsSpeaking(true);
                speechService.speak(lastMessage.content, () => {
                    setIsSpeaking(false);
                });
            }
        }
    }, [state.messages, voiceEnabled, isTyping]);

    const handleSendMessage = (text: string) => {
        if (!text.trim()) return;

        // Add user message
        const userMessage = createMessage('user', text);
        const updatedMessages = [...state.messages, userMessage];

        // Extract patient info
        const patientInfo = extractPatientInfo(text);
        const updatedPatient = { ...state.patient, ...patientInfo };

        // Show typing indicator
        setIsTyping(true);
        setInputValue('');

        // Simulate delay for natural feel
        setTimeout(() => {
            // Get next step and response
            const { nextStep, response } = getNextStep(state.step, text, {
                ...state,
                patient: updatedPatient,
                messages: updatedMessages,
            });

            const assistantMessage = createMessage('assistant', response);

            setState(prev => ({
                ...prev,
                step: nextStep,
                patient: updatedPatient,
                messages: [...updatedMessages, assistantMessage],
            }));

            setIsTyping(false);

            // Save to database and navigate to summary if completed
            if (nextStep === 'summary' || nextStep === 'completed') {
                const performFinalSave = async () => {
                    let finalPatientId = '';

                    // 1. Create Patient
                    const patientToCreate: DBPatient = {
                        nom: updatedPatient.lastName || 'NC',
                        prenom: updatedPatient.firstName || 'Anonyme',
                        civilite: 'M/Mme',
                        sexe: 'NC',
                        date_naissance: new Date().toISOString().split('T')[0], // Placeholder
                        type_patient: 'Adulte',
                        praticien: 'Casper Dental AI',
                        portable: updatedPatient.phone,
                        suivi_exclusif: false
                    };

                    const { data: savedPatient } = await createPatient(patientToCreate);
                    if (savedPatient?.id) {
                        finalPatientId = savedPatient.id;
                    }

                    // 2. Create Appointment if we have a patient ID
                    if (finalPatientId) {
                        await createAppointment({
                            patient_id: finalPatientId,
                            date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
                            duration_minutes: 30,
                            type: 'Consultation Chatbot',
                            status: 'planifié',
                            notes: `Motif identifié : ${updatedMessages.filter(m => m.role === 'user').map(m => m.content).join(' ')}`
                        });
                    }

                    // 3. Navigate
                    navigate('/summary', {
                        state: {
                            patient: updatedPatient,
                            request: state.request,
                            messages: [...updatedMessages, assistantMessage],
                        }
                    });
                };

                performFinalSave();
            }
        }, 1000 + Math.random() * 500);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSendMessage(inputValue);
    };

    const handleVoiceInput = () => {
        if (isListening) {
            speechService.stopListening();
            setIsListening(false);
            return;
        }

        setError(null);
        setIsListening(true);

        speechService.startListening(
            (text) => {
                setIsListening(false);
                handleSendMessage(text);
            },
            (err) => {
                setIsListening(false);
                setError(err);
            }
        );
    };

    const toggleVoice = () => {
        if (isSpeaking) {
            speechService.stopSpeaking();
            setIsSpeaking(false);
        }
        setVoiceEnabled(!voiceEnabled);
    };

    const formatMessage = (content: string) => {
        // Simple markdown-like formatting
        return content
            .split('\n')
            .map((line, i) => {
                // Bold
                line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                // List items
                if (line.startsWith('•') || line.startsWith('-')) {
                    return `<li key=${i}>${line.substring(1).trim()}</li>`;
                }
                // Numbered items
                if (/^[1-9]/.test(line)) {
                    return `<div key=${i} class="list-item">${line}</div>`;
                }
                return line;
            })
            .join('<br/>');
    };

    return (
        <div className="chatbot-page">
            {/* Header with New Design Title */}
            <header className="chatbot-header">
                <Link to="/" className="back-link">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                </Link>
                <div className="expert-title">
                    <span className="blue-gradient-text">ASSISTANT EXPERT</span>
                    <span className="medical-text"> CASPER</span>
                    <span className="flow-text"> DENTAL</span>
                </div>
                <div className="header-actions">
                    <button
                        className={`voice-toggle ${voiceEnabled ? 'active' : ''}`}
                        onClick={toggleVoice}
                    >
                        {voiceEnabled ? '🔊' : '🔇'}
                    </button>
                    <button className="close-btn" onClick={() => navigate('/')}>✕</button>
                </div>
            </header>

            {/* Chat Container */}
            <div className="chat-wrapper">
                <div className="chat-container">
                    {/* Messages Area - Adjusted for new design */}
                    <div className="chat-messages">
                        {state.messages.map((message: Message) => (
                            <div
                                key={message.id}
                                className={`message message-${message.role}`}
                                dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                            />
                        ))}

                        {isTyping && (
                            <div className="message message-assistant typing">
                                <span className="typing-dot"></span>
                                <span className="typing-dot"></span>
                                <span className="typing-dot"></span>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="error-banner">
                            ⚠️ {error}
                            <button onClick={() => setError(null)}>✕</button>
                        </div>
                    )}

                    {/* New Expert Input Design */}
                    <div className="expert-input-container">
                        <div className="input-upper">
                            <form className="expert-input-wrapper" onSubmit={handleSubmit}>
                                <div className="expert-avatar-icon">
                                    <img src={assistantAvatar} alt="AI" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Décrivez vos besoins, prises de RDV, Suivis Patients,..."
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    disabled={isListening}
                                />
                                <button type="submit" className="expert-send-btn" disabled={!inputValue.trim() || isTyping}>
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
                                onClick={handleVoiceInput}
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
            </div>

            {/* Disclaimer */}
            <div className="disclaimer">
                <p>
                    ⚠️ Cet assistant ne remplace pas une consultation médicale.
                    En cas d'urgence, appelez le 15 ou rendez-vous aux urgences.
                </p>
            </div>
        </div>
    );
};

export default Chatbot;
