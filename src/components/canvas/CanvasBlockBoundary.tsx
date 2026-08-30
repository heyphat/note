'use client';

// Per-block React error boundary for the inline canvas editor. A render
// crash inside React Flow (malformed node positions, missing schema fields,
// etc.) must not propagate up to the ProseMirror editor — without this the
// whole document goes blank. We show an inline error notice instead and
// keep the rest of the note interactive.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  // Optional in the type so consumers using `createElement(Boundary, props, child)`
  // (children-as-third-arg, the vanilla pattern outside JSX) typecheck cleanly.
  // React still populates `props.children` at runtime either way.
  children?: ReactNode;
  /** Reason shown above the error message, e.g. "canvas block" or "canvas lightbox". */
  label?: string;
}

interface State {
  error: Error | null;
}

export class CanvasBlockBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[canvas] block render crashed:', error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const label = this.props.label ?? 'canvas block';
    return (
      <div className="canvas-error" role="alert">
        <strong>Could not render {label}:</strong> {error.message || String(error)}
      </div>
    );
  }
}
