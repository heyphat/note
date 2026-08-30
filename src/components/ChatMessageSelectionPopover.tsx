'use client';

// Floating action bar that appears above a text selection inside an assistant
// chat bubble. Lets the user copy the highlighted text or quote it back into
// the chat composer (reusing the existing mentionedSelection plumbing).
//
// Selection is owned by the browser. We read it on mouseup/keyup and render a
// popover above it. We do NOT clear, repaint, or otherwise interfere with the
// native selection — earlier attempts to do so caused the highlight to jump
// from the top of the message to the cursor.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { showToast } from './Toast';

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onAddToFollowUp: (selection: string) => void;
}

interface PopoverState {
  text: string;
  top: number;
  left: number;
}

const POPOVER_OFFSET = 8;
const POPOVER_HEIGHT = 30;

function findAssistantMessageRoot(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement;
      if (el.dataset?.chatMessageRole === 'assistant') return el;
    }
    current = current.parentNode;
  }
  return null;
}

function readSelectionInside(container: HTMLElement | null): PopoverState | null {
  if (!container) return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const startBubble = findAssistantMessageRoot(range.startContainer);
  const endBubble = findAssistantMessageRoot(range.endContainer);
  if (!startBubble || startBubble !== endBubble || !container.contains(startBubble)) return null;

  const text = sel.toString().trim();
  if (!text) return null;

  // First non-empty client rect = first line of the selection. We want the
  // popover to sit above the first line, not the bounding box (which spans
  // every line for multi-line selections).
  const firstRect = Array.from(range.getClientRects()).find(r => r.width > 0 && r.height > 0)
    ?? range.getBoundingClientRect();
  if (!firstRect || (firstRect.width === 0 && firstRect.height === 0)) return null;

  const top = firstRect.top - POPOVER_HEIGHT - POPOVER_OFFSET >= 0
    ? firstRect.top - POPOVER_HEIGHT - POPOVER_OFFSET
    : firstRect.top + firstRect.height + POPOVER_OFFSET;
  const left = firstRect.left + firstRect.width / 2;
  return { text, top, left };
}

export default function ChatMessageSelectionPopover({ containerRef, onAddToFollowUp }: Props) {
  const t = useTranslations('chat');
  const tToast = useTranslations('toast');
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const hide = useCallback(() => setPopover(null), []);

  // Show on mouseup (mouse drag finished) or keyup (Shift+arrows). Reading
  // happens after a frame so getClientRects sees the settled layout.
  useEffect(() => {
    const showFromSelection = () => {
      const next = readSelectionInside(containerRef.current);
      if (next) setPopover(next);
    };

    const onMouseUp = (e: MouseEvent) => {
      const popoverEl = popoverRef.current;
      if (popoverEl && e.target instanceof Node && popoverEl.contains(e.target)) return;
      requestAnimationFrame(showFromSelection);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.shiftKey) return;
      if (!e.key.startsWith('Arrow') && e.key !== 'Home' && e.key !== 'End') return;
      requestAnimationFrame(showFromSelection);
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [containerRef]);

  // Hide-only on selectionchange — never reposition mid-drag, that re-renders
  // the portal and disturbs the browser's highlight rendering.
  useEffect(() => {
    if (!popover) return;
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        hide();
        return;
      }
      const range = sel.getRangeAt(0);
      const startBubble = findAssistantMessageRoot(range.startContainer);
      const endBubble = findAssistantMessageRoot(range.endContainer);
      if (!startBubble || startBubble !== endBubble || !containerRef.current?.contains(startBubble)) {
        hide();
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [popover, containerRef, hide]);

  // Hide on Escape, on scroll inside the chat, on window resize. The cached
  // top/left go stale immediately when layout shifts.
  useEffect(() => {
    if (!popover) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    const onLayoutChange = () => hide();
    window.addEventListener('resize', onLayoutChange);
    document.addEventListener('keydown', onKeyDown);
    const container = containerRef.current;
    container?.addEventListener('scroll', onLayoutChange, { passive: true });
    return () => {
      window.removeEventListener('resize', onLayoutChange);
      document.removeEventListener('keydown', onKeyDown);
      container?.removeEventListener('scroll', onLayoutChange);
    };
  }, [popover, containerRef, hide]);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!popover) return;
    try {
      await navigator.clipboard.writeText(popover.text);
      showToast(tToast('copiedToClipboard'));
    } catch {
      showToast(tToast('copyFailed'));
    }
    hide();
  }, [popover, tToast, hide]);

  const handleAddToFollowUp = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!popover) return;
    onAddToFollowUp(popover.text);
    hide();
  }, [popover, onAddToFollowUp, hide]);

  if (!popover || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="toolbar"
      aria-label={t('selectionToolbarAria')}
      // preventDefault on mousedown is essential — without it, clicking the
      // toolbar steals focus and the browser clears the selection before the
      // click handler can read popover.text.
      onMouseDown={e => e.preventDefault()}
      style={{
        position: 'fixed',
        top: `${popover.top}px`,
        left: `${popover.left}px`,
        transform: 'translateX(-50%)',
        zIndex: 50,
      }}
      className="flex items-center gap-0.5 rounded-lg bg-[var(--panel)] px-1 py-1
        shadow-[0_0_18px_-2px_color-mix(in_srgb,var(--accent)_55%,transparent),0_8px_24px_-8px_rgba(0,0,0,0.5)]"
    >
      <button
        type="button"
        onClick={handleAddToFollowUp}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text
          hover:bg-[var(--panel-2)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {t('addToFollowUp')}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text
          hover:bg-[var(--panel-2)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {t('copy')}
      </button>
    </div>,
    document.body,
  );
}
