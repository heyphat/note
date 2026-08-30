'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CanvasNode } from '@/lib/canvas/types';

// Dependencies threaded down to custom node components. Set by CanvasEditor
// from the props passed through MilkdownEditor — the same handlers used by
// the wikilink transclusion plugin so behaviour stays consistent.
export interface CanvasNoteCandidate {
  title: string;
  id: string;
}

export interface CanvasDeps {
  resolveLinkId?: (target: string) => string | null;
  readNoteBody?: (id: string) => Promise<string>;
  isKnownLinkTarget?: (target: string) => boolean;
  onNavigateLink?: (target: string) => void;
  // Filtered list of existing notes for the FileNode autocomplete popup.
  // Empty query should return the most relevant defaults (recent/all).
  getNoteCandidates?: (query: string) => CanvasNoteCandidate[];
  // Returns the canonical URL for a note target (e.g.
  // `/en/Skills%20Audit%20Report`) so the FileNode can render a real
  // `<a target="_blank">` open-in-new-tab affordance — that lets
  // middle-click / cmd-click / right-click → open-in-new-tab all work
  // without per-affordance JS. Returns `null` when the target can't be
  // resolved (broken link); the icon is hidden in that case.
  getNoteHref?: (target: string) => string | null;
  // Translates a storage-relative asset path (e.g. `.assets/foo.png`,
  // `./{noteKey}.assets/bar.jpg`) to a fetchable URL. Same function the
  // editor uses to render markdown images, so a canvas file node pointed
  // at an attachment behaves identically to a markdown `![]()` reference.
  proxyAssetUrl?: (path: string) => string;
  // Open the canvas in a fullscreen lightbox. Only the inline mount supplies
  // this — when CanvasEditor is itself mounted inside a lightbox, this is
  // undefined so the toolbar hides the expand button.
  onExpand?: () => void;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  deleteNode: (id: string) => void;
}

const CanvasDepsContext = createContext<CanvasDeps | null>(null);

export function CanvasDepsProvider({
  deps,
  children,
}: {
  deps: CanvasDeps;
  children: ReactNode;
}) {
  return (
    <CanvasDepsContext.Provider value={deps}>
      {children}
    </CanvasDepsContext.Provider>
  );
}

export function useCanvasDeps(): CanvasDeps {
  const ctx = useContext(CanvasDepsContext);
  if (!ctx) {
    throw new Error('useCanvasDeps must be used inside CanvasDepsProvider');
  }
  return ctx;
}
