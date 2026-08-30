'use client';

// Lightweight toast module. Anything in the app can call `showToast(msg)`;
// the single `<Toaster />` mounted at the layout root listens for a window
// CustomEvent and renders the stack. Event-based so callers don't need a
// React context — matches the `themechange` event pattern used elsewhere.

import { useEffect, useState } from 'react';

const EVENT = 'app-toast';
const DEFAULT_DURATION = 1800;

type Detail = { message: string; duration: number };

export function showToast(message: string, durationMs: number = DEFAULT_DURATION) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail: { message, duration: durationMs } }));
}

type Item = { id: number; message: string };

export default function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let counter = 0;
    const timers: number[] = [];
    const handler = (e: Event) => {
      const { message, duration } = (e as CustomEvent<Detail>).detail;
      const id = ++counter;
      setItems(prev => [...prev, { id, message }]);
      const t = window.setTimeout(() => {
        setItems(prev => prev.filter(x => x.id !== id));
      }, duration);
      timers.push(t);
    };
    window.addEventListener(EVENT, handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2"
    >
      {items.map(t => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto rounded-md border border-[var(--accent)]/50 bg-[var(--panel-2)] px-3.5 py-2 text-xs font-medium text-text shadow-lg ring-1 ring-black/20"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
