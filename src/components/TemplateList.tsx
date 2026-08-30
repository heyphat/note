'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  templates: { id: string; name: string }[];
  activeTemplate: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

export default function TemplateList({ templates, activeTemplate, onSelect, onRename, onDelete }: Props) {
  const tr = useTranslations('templates');
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);
  const deleteTimer = useRef<number | null>(null);

  useEffect(() => {
    if (renamingName) renameRef.current?.focus();
  }, [renamingName]);

  useEffect(() => () => { if (deleteTimer.current) clearTimeout(deleteTimer.current); }, []);

  const requestDelete = (name: string) => {
    if (confirmDelete === name) {
      onDelete(name);
      setConfirmDelete(null);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      return;
    }
    setConfirmDelete(name);
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = window.setTimeout(() => setConfirmDelete(null), 3000);
  };

  const commitRename = () => {
    if (!renamingName) return;
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== renamingName) onRename(renamingName, trimmed);
    setRenamingName(null);
  };

  if (!templates.length) return null;
  const visible = expanded ? templates : [];

  const slotBase = 'overflow-hidden transition-all duration-150 shrink-0';
  const hiddenSlot = `${slotBase} max-w-0 opacity-0 ml-0 group-hover:max-w-[28px] group-hover:opacity-100 group-hover:ml-1.5`;
  const visibleSlot = `${slotBase} max-w-[28px] opacity-100 ml-1.5`;

  return (
    <div className="px-2 pt-2">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted px-1 py-1 hover:text-text transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${expanded ? 'rotate-90' : ''}`} fill="currentColor">
          <path d="M3 1l4 4-4 4z" />
        </svg>
        {tr('heading')}
        <span className="ml-auto text-muted/70">{templates.length}</span>
      </button>
      {visible.map(t => {
        const isActive = t.id === activeTemplate;
        const isConfirming = confirmDelete === t.id;

        if (renamingName === t.id) {
          return (
            <input
              key={t.id}
              ref={renameRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingName(null); }}
              className="w-full px-2 py-1 text-xs bg-[var(--panel-2)] text-text rounded outline-none border border-accent"
            />
          );
        }

        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`group w-full text-left px-2 py-1 text-xs rounded transition-colors flex items-center
              ${isActive
                ? 'bg-[var(--panel-2)] text-text'
                : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
            title={t.name}
          >
            <span className="truncate flex-1">{t.name}</span>
            <div className="flex items-center shrink-0">
              <div className={hiddenSlot}>
                <button
                  onClick={e => { e.stopPropagation(); setRenamingName(t.id); setRenameValue(t.name); }}
                  title={tr('renameTemplate')}
                  className="p-1 rounded text-muted hover:text-text hover:bg-black/10 dark:hover:bg-white/10 transition">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L7 17l-4 1 1-4z" />
                  </svg>
                </button>
              </div>
              <div className={isConfirming ? visibleSlot : hiddenSlot}>
                <button
                  onClick={e => { e.stopPropagation(); requestDelete(t.id); }}
                  title={isConfirming ? tr('confirmDelete') : tr('delete')}
                  className={`p-1 rounded transition
                    ${isConfirming
                      ? 'bg-red-500 text-white ring-2 ring-red-500/40 animate-pulse'
                      : 'text-muted hover:text-red-500 hover:bg-red-500/10'}`}>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h12M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 6l1 10a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-10" />
                  </svg>
                </button>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
