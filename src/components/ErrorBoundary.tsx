import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          background: '#0f172a',
          color: '#f8fafc',
          minHeight: '100vh',
          fontFamily: 'sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#ff3b6b', marginBottom: '10px' }}>⚠️ Une erreur est survenue</h1>
          <p style={{ color: '#94a3b8', marginBottom: '20px', maxWidth: '600px' }}>
            L'application a rencontré une erreur d'exécution. Veuillez partager ce message d'erreur avec votre assistant :
          </p>
          <pre style={{
            background: '#020617',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'left',
            maxWidth: '90%',
            overflowX: 'auto',
            color: '#00f2fe',
            border: '1px solid #38bdf8',
            fontSize: '0.9rem',
            lineHeight: '1.4'
          }}>
            {this.state.error?.toString()}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button 
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#00f2fe',
              color: '#060913',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Réinitialiser l'application
          </button>
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;
