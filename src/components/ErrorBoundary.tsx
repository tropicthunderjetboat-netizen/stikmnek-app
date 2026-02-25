import React, { Component, ErrorInfo } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    // Try to log to error logger (non-blocking)
    try {
      import('@/lib/errorLogger').then(({ errorLogger }) => {
        errorLogger.captureComponentError(error, errorInfo.componentStack || undefined);
      }).catch(() => {});
    } catch {}
  }

  handleForceRefresh = async () => {
    try {
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      // Clear all caches
      if ('caches' in window) {
        const names = await caches.keys();
        for (const name of names) {
          await caches.delete(name);
        }
      }
    } catch (e) {
      console.error('Cleanup error:', e);
    }
    // Hard reload
    window.location.href = window.location.origin + '/?t=' + Date.now();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '100vh',
          background: '#f9fafb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          <div style={{ maxWidth: '28rem', width: '100%' }}>
            <div style={{
              background: 'white',
              borderRadius: '1rem',
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                background: 'linear-gradient(135deg, #ef4444, #f97316)',
                padding: '1.5rem',
                textAlign: 'center',
              }}>
                <div style={{
                  width: '3.5rem',
                  height: '3.5rem',
                  margin: '0 auto 1rem',
                  borderRadius: '0.75rem',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                    <path d="M12 9v4"/>
                    <path d="M12 17h.01"/>
                  </svg>
                </div>
                <h1 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  Something Went Wrong
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  The app encountered an error. This is usually fixed by refreshing.
                </p>
              </div>

              {/* Body */}
              <div style={{ padding: '1.5rem' }}>
                {/* Error message */}
                {this.state.error && (
                  <div style={{
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    marginBottom: '1rem',
                  }}>
                    <p style={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      color: '#991b1b',
                      margin: 0,
                      wordBreak: 'break-all',
                    }}>
                      {this.state.error.message}
                    </p>
                  </div>
                )}

                {/* Primary action: Force Refresh */}
                <button
                  onClick={this.handleForceRefresh}
                  style={{
                    width: '100%',
                    padding: '0.875rem',
                    borderRadius: '0.75rem',
                    background: 'linear-gradient(135deg, #0d9488, #059669)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '1rem',
                    border: 'none',
                    cursor: 'pointer',
                    marginBottom: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                    <path d="M16 16h5v5"/>
                  </svg>
                  Force Refresh App
                </button>

                {/* Secondary: Try Again */}
                <button
                  onClick={this.handleReset}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    background: 'white',
                    color: '#374151',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    border: '1px solid #e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  Try Again Without Refreshing
                </button>

                <p style={{
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  color: '#9ca3af',
                  marginTop: '1rem',
                  margin: '1rem 0 0',
                }}>
                  StikmNek v3.0 | If this keeps happening, delete the app from your homescreen and re-add it.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
