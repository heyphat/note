'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type VarKey = 'varDate' | 'varTime' | 'varDatetime' | 'varYear' | 'varMonth' | 'varDay' | 'varWeekday';

const VARIABLES: { token: string; descKey?: VarKey; desc?: string }[] = [
  { token: '{{date}}', desc: 'YYYY-MM-DD' },
  { token: '{{time}}', desc: 'HH:mm' },
  { token: '{{datetime}}', desc: 'YYYY-MM-DD HH:mm' },
  { token: '{{YYYY}}', descKey: 'varYear' },
  { token: '{{MM}}', descKey: 'varMonth' },
  { token: '{{DD}}', descKey: 'varDay' },
  { token: '{{EEEE}}', descKey: 'varWeekday' },
];

interface Props {
  onInsert: (token: string) => void;
}

export default function TemplateVariableHint({ onInsert }: Props) {
  const t = useTranslations('templates');
  const [showVars, setShowVars] = useState(false);

  return (
    <>
      <style>{`.milkdown .crepe-placeholder::before { display: none !important; }`}</style>
      <div className="absolute top-0 left-0 right-0 pointer-events-none z-10" style={{ padding: '12px 40px 0' }}>
        <div style={{
          marginTop: '0.75em', paddingTop: 2,
          fontSize: 24, fontWeight: 700, lineHeight: 1.3,
          letterSpacing: '-0.005em',
          height: 0, overflow: 'visible',
          color: 'color-mix(in srgb, var(--crepe-color-on-background, var(--text)), transparent 60%)',
        }}>
          {t('placeholderTemplate')} {t('insert')}{' '}
          <span className="relative inline pointer-events-auto">
            <button
              onClick={() => setShowVars(v => !v)}
              className="text-accent hover:underline cursor-pointer"
              style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
            >
              {t('variables')}
            </button>
            {showVars && (
              <div className="absolute left-0 top-full mt-1 w-56 bg-[var(--panel)] border border-[var(--border)] rounded-md shadow-lg z-20 py-1 text-left font-normal" style={{ fontSize: 13 }}>
                {VARIABLES.map(v => (
                  <button
                    key={v.token}
                    onClick={() => { onInsert(v.token); setShowVars(false); }}
                    className="w-full text-left px-3 py-1.5 text-text hover:bg-[var(--panel-2)] flex items-center justify-between"
                  >
                    <code className="text-accent">{v.token}</code>
                    <span className="text-muted text-[11px]">{v.descKey ? t(v.descKey) : v.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        </div>
      </div>
    </>
  );
}
