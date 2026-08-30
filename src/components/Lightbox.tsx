'use client';

import { useEffect, useRef } from 'react';

export default function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Steal focus from the editor so Escape isn't swallowed by ProseMirror
    overlayRef.current?.focus();
  }, []);
  return (
    <div ref={overlayRef} tabIndex={-1}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center cursor-zoom-out outline-none"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <button onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none p-2"
        aria-label="Close">
        &times;
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onClick={e => e.stopPropagation()}
        className="max-w-[95vw] max-h-[95vh] object-contain cursor-default rounded shadow-2xl" />
    </div>
  );
}
