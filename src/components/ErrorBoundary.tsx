'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

function ErrorFallback({ error, onReload, onDismiss }: { error: Error; onReload: () => void; onDismiss: () => void }) {
  const t = useTranslations('errorBoundary');
  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
      <div className="max-w-md w-full mx-4 p-6 bg-[var(--panel)] border border-[var(--border)] rounded-lg">
        <h1 className="text-lg font-semibold text-text mb-2">{t('heading')}</h1>
        <p className="text-sm text-muted mb-3">{t('body')}</p>
        <pre className="text-xs font-mono bg-[var(--panel-2)] border border-[var(--border)]
          rounded p-2 mb-4 max-h-40 overflow-auto whitespace-pre-wrap text-bad">
          {error.message || String(error)}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReload}
            className="px-3 py-1.5 text-xs font-medium bg-accent text-[var(--on-accent)] rounded-md hover:opacity-90 transition-opacity"
          >
            {t('reload')}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs text-muted hover:text-text transition-colors"
          >
            {t('dismiss')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[error-boundary] render crash', error, info);
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorFallback error={error} onReload={this.handleReload} onDismiss={this.handleDismiss} />;
  }
}
