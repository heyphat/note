'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  templates: { name: string }[];
  onPick: (name: string) => void;
  onDismiss: () => void;
}

export default function TemplatePicker({ templates, onPick, onDismiss }: Props) {
  const t = useTranslations('templates');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // We hide the native Crepe placeholder and render our own version that
  // includes a clickable "use templates" link. The text container uses
  // height:0 + overflow:visible (same trick as Crepe's ::before) so it
  // occupies no layout space — the ProseMirror cursor stays on the same line.
  return (
    <>
      <style>{`.milkdown .crepe-placeholder::before { display: none !important; }`}</style>
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-10"
        style={{ padding: '12px 40px 0' }}
      >
        <div style={{
          marginTop: '0.75em', paddingTop: 2,
          fontSize: 24, fontWeight: 700, lineHeight: 1.3,
          letterSpacing: '-0.005em',
          height: 0, overflow: 'visible',
          color: 'color-mix(in srgb, var(--crepe-color-on-background, var(--text)), transparent 60%)',
        }}>
          {t('placeholderNote')} {t('orUseTemplates')}{' '}
          <span className="relative inline pointer-events-auto" ref={ref}>
            <button
              onClick={() => setOpen(v => !v)}
              className="text-accent hover:underline cursor-pointer"
              style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
            >
              {t('useTemplates')}
            </button>
            {open && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-[var(--panel)] border border-[var(--border)] rounded-md shadow-lg z-20 py-1 text-left font-normal" style={{ fontSize: 13 }}>
                {templates.length > 0 ? templates.map(t => (
                  <button
                    key={t.name}
                    onClick={() => { onPick(t.name); setOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-text hover:bg-[var(--panel-2)] truncate"
                  >
                    {t.name}
                  </button>
                )) : (
                  <span className="block px-3 py-1.5 text-muted">{t('noTemplatesYet')}</span>
                )}
              </div>
            )}
          </span>
          <button onClick={onDismiss} className="pointer-events-auto ml-2 cursor-pointer align-middle"
            style={{ fontSize: 16, color: 'color-mix(in srgb, var(--crepe-color-on-background, var(--text)), transparent 75%)' }}>
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
