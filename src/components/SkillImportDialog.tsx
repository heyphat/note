'use client';

// Modal for importing a skill. Four entry points converge on the same
// `createSkill` call after validation:
//
//   1. Paste markdown — for users who have a SKILL.md string in their clipboard
//   2. Fetch URL — for raw.githubusercontent.com or similar
//   3. Local file picker — supports both single .md and folder-with-SKILL.md
//   4. GitHub repo — public repos only, fetched via the GitHub Contents API
//
// We use a single modal with a tab strip rather than four separate modals so
// the user can switch sources mid-flow without losing context.

import { useEffect, useRef, useState } from 'react';
import {
  importFromMarkdown, importFromUrl, importFromFiles, importFromGithub,
  isCancelledImport,
  toCreateSpec, type ImportResult,
} from '@/lib/skills/import';
import { showToast } from '@/components/Toast';
import type { NoteStore } from '@/lib/storage';

type Tab = 'paste' | 'url' | 'files' | 'github';

interface Props {
  store: NoteStore;
  onClose: () => void;
  onCreated: () => void;
}

const TEMPLATE_BODY = `---
name: example-skill
description: Triggered when the user asks about X. Replace this with a one-sentence summary the model can match on.
---

# Example skill

Replace this body with the instructions, examples, or references your assistant should follow when this skill applies.
`;

export default function SkillImportDialog({ store, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<Tab>('paste');
  const [pasteText, setPasteText] = useState(TEMPLATE_BODY);
  const [urlValue, setUrlValue] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AbortController used to cancel in-flight imports (URL fetch, GitHub bulk
  // walk). The ref pattern lets a Cancel click — or a dialog unmount —
  // signal the importer to stop without racing the awaited promise.
  const controllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight import when the dialog unmounts. Clicking outside,
  // pressing Escape, or any parent-driven close all funnel through here.
  useEffect(() => () => { controllerRef.current?.abort(); }, []);

  const cancelInFlight = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  };

  const handleCancel = () => {
    cancelInFlight();
    onClose();
  };

  const submit = async (result: ImportResult) => {
    if (!result.ok) {
      // User-aborted imports surface as the special cancelled sentinel — the
      // dialog has already been told to close, so don't flash an error.
      if (isCancelledImport(result)) return;
      setError(result.reason);
      return;
    }
    // Bulk imports (multi-skill) can have per-skill failures (name collisions,
    // permission errors). We collect them rather than aborting, then surface a
    // summary so the user knows what happened.
    //
    // Nested skills carry a `parentRef` instead of a pre-computed targetDir.
    // Once the parent is created we record its actual returned `meta.id` —
    // which includes any collision suffix the storage layer added — and rebuild
    // each child's targetDir off that, so the children land inside the real
    // parent folder instead of a stray category folder.
    const failures: { name: string; reason: string }[] = [];
    const idByToken = new Map<string, string>();
    let created = 0;
    for (const entry of result.skills) {
      let effectiveTargetDir = entry.targetDir;
      if (entry.parentRef) {
        const parentId = idByToken.get(entry.parentRef.parentToken);
        if (!parentId) {
          // Parent failed to create — skip the child rather than dropping it
          // into the wrong place. Surfaces in the failures summary below.
          failures.push({
            name: entry.skill.name,
            reason: 'Parent skill was not created; nested skill skipped.',
          });
          continue;
        }
        effectiveTargetDir = entry.parentRef.relPath
          ? `${parentId}/${entry.parentRef.relPath}`
          : parentId;
      }
      try {
        const meta = await store.createSkill(
          toCreateSpec({ ...entry, targetDir: effectiveTargetDir }),
        );
        idByToken.set(entry.token, meta.id);
        created += 1;
      } catch (err) {
        failures.push({
          name: entry.skill.name,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (created > 0) onCreated();
    if (failures.length > 0) {
      const lines = failures.slice(0, 5).map(f => `• ${f.name}: ${f.reason}`).join('\n');
      const overflow = failures.length > 5 ? `\n…and ${failures.length - 5} more` : '';
      setError(
        created > 0
          ? `Imported ${created} skill${created === 1 ? '' : 's'}, ${failures.length} failed:\n${lines}${overflow}`
          : `All ${failures.length} skill${failures.length === 1 ? '' : 's'} failed:\n${lines}${overflow}`
      );
      return;
    }
    if (created > 1) {
      showToast(`Imported ${created} skills`);
    }
    onClose();
  };

  const handlePaste = async () => {
    setBusy(true); setError(null);
    try { await submit(importFromMarkdown(pasteText)); }
    finally { setBusy(false); }
  };

  const handleUrl = async () => {
    if (!urlValue.trim()) { setError('Paste a URL.'); return; }
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    setBusy(true); setError(null);
    try { await submit(await importFromUrl(urlValue.trim(), { signal: ctrl.signal })); }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true); setError(null);
    // Local file imports never hit the network — no signal needed; this path
    // resolves before the user has time to click Cancel anyway.
    try { await submit(await importFromFiles(files)); }
    finally { setBusy(false); }
  };

  const handleGithub = async () => {
    if (!githubUrl.trim()) { setError('Paste a GitHub URL.'); return; }
    const ctrl = new AbortController();
    controllerRef.current = ctrl;
    setBusy(true); setError(null);
    try { await submit(await importFromGithub(githubUrl.trim(), { signal: ctrl.signal })); }
    finally { if (!ctrl.signal.aborted) setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        className="w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col bg-[var(--panel)] border border-[var(--border)] rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-text">Import skill</h3>
          <button onClick={handleCancel} className="text-muted hover:text-text" aria-label="Close">×</button>
        </div>
        <div className="flex border-b border-[var(--border)] text-xs">
          {(['paste', 'url', 'files', 'github'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); }}
              className={`px-4 py-2 transition-colors border-b-2 ${tab === t
                ? 'border-[var(--accent)] text-text'
                : 'border-transparent text-muted hover:text-text'}`}
            >
              {t === 'paste' && 'Paste markdown'}
              {t === 'url' && 'Fetch URL'}
              {t === 'files' && 'Local files'}
              {t === 'github' && 'GitHub repo'}
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {tab === 'paste' && (
            <>
              <p className="text-xs text-muted">
                Paste a SKILL.md body (with YAML frontmatter <code>type: skill</code>, <code>name</code>, <code>description</code>) and click Import.
              </p>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                spellCheck={false}
                className="w-full h-72 px-3 py-2 text-xs font-mono bg-[var(--panel-2)] text-text rounded outline-none border border-[var(--border)] focus:border-[var(--accent)] resize-none"
              />
            </>
          )}
          {tab === 'url' && (
            <>
              <p className="text-xs text-muted">
                Fetch a SKILL.md from a URL. Most hosts block cross-origin requests — prefer <code>raw.githubusercontent.com</code> or similar.
              </p>
              <input
                value={urlValue}
                onChange={e => setUrlValue(e.target.value)}
                placeholder="https://raw.githubusercontent.com/.../SKILL.md"
                className="w-full px-3 py-2 text-xs bg-[var(--panel-2)] text-text rounded outline-none border border-[var(--border)] focus:border-[var(--accent)]"
              />
            </>
          )}
          {tab === 'files' && (
            <>
              <p className="text-xs text-muted">
                Pick a single <code>SKILL.md</code> file, or pick a folder containing <code>SKILL.md</code> plus aux files (the folder picker keeps the directory structure).
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center px-3 py-1.5 text-xs text-text bg-[var(--panel-2)] hover:bg-[var(--panel-3)] rounded border border-[var(--border)] cursor-pointer transition-colors">
                  Pick file(s)
                  <input
                    type="file"
                    accept=".md,text/markdown"
                    multiple
                    onChange={e => void handleFiles(e.target.files)}
                    className="hidden"
                  />
                </label>
                <label className="inline-flex items-center px-3 py-1.5 text-xs text-text bg-[var(--panel-2)] hover:bg-[var(--panel-3)] rounded border border-[var(--border)] cursor-pointer transition-colors">
                  Pick folder
                  <input
                    type="file"
                    // @ts-expect-error — webkitdirectory is non-standard but widely supported.
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={e => void handleFiles(e.target.files)}
                    className="hidden"
                  />
                </label>
              </div>
            </>
          )}
          {tab === 'github' && (
            <>
              <p className="text-xs text-muted">
                Paste a public GitHub URL pointing at a folder that contains <code>SKILL.md</code>. Example:
                <br />
                <code className="text-[10px]">https://github.com/anthropics/skills/tree/main/finance/skills/excel-create</code>
                <br />
                Unauthenticated requests are rate-limited (60/hour).
              </p>
              <input
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                placeholder="https://github.com/owner/repo/tree/branch/path"
                className="w-full px-3 py-2 text-xs bg-[var(--panel-2)] text-text rounded outline-none border border-[var(--border)] focus:border-[var(--accent)]"
              />
            </>
          )}
          {error && (
            <div className="px-3 py-2 text-xs text-red-500 bg-red-500/10 rounded border border-red-500/30">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs text-muted hover:text-text rounded transition-colors"
          >
            {busy ? 'Cancel import' : 'Cancel'}
          </button>
          {tab === 'paste' && (
            <button onClick={handlePaste} disabled={busy} className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-[var(--on-accent)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {busy ? 'Importing…' : 'Import'}
            </button>
          )}
          {tab === 'url' && (
            <button onClick={handleUrl} disabled={busy} className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-[var(--on-accent)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {busy ? 'Fetching…' : 'Fetch & import'}
            </button>
          )}
          {tab === 'github' && (
            <button onClick={handleGithub} disabled={busy} className="px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-[var(--on-accent)] rounded hover:bg-[var(--accent-hover)] disabled:opacity-50">
              {busy ? 'Fetching…' : 'Fetch & import'}
            </button>
          )}
          {tab === 'files' && busy && (
            <span className="px-3 py-1.5 text-xs text-muted">Importing…</span>
          )}
        </div>
      </div>
    </div>
  );
}
