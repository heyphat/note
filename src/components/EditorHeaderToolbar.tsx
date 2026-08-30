'use client';

import { useTranslations } from 'next-intl';
import Tooltip from './Tooltip';
import { SidebarToggle, BacklinksToggle, GraphToggle, HistoryPanelToggle } from './HeaderToggles';
import EditorSettingsPanel, { type Settings } from './EditorSettings';
import FrontmatterPanel, { type FrontmatterField } from './FrontmatterPanel';
import PomodoroChip from './PomodoroChip';

export type EditorHeaderToolbarProps = {
  // --- State ---
  activeId: string | null;
  activeTemplate: string | null;
  activeSkill: string | null;
  editingTitle: string;
  isLocked: boolean;
  confirmDelete: boolean;
  sidebarOpen: boolean;
  backlinksOpen: boolean;
  historyOpen: boolean;
  narrowEditor: boolean;
  paletteId: string;
  editorSettings: Settings;
  noteStats: { words: number; chars: number; readingMinutes: number };
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  /** When the active note's save failed because the on-disk file is
   *  missing, the toolbar shows a "Recover" affordance next to the save
   *  status. Optional — undefined means no recovery affordance. */
  saveErrorKind?: 'not-found' | 'conflict' | 'other';
  /** Open the recovery dialog when the user clicks Recover. */
  onOpenRecovery?: () => void;
  backlinksCount: number;
  // --- Callbacks ---
  onTitleChange: (next: string) => void;
  onToggleSidebar: () => void;
  onToggleLock: () => void;
  onToggleBacklinks: () => void;
  onToggleGraph: () => void;
  onToggleHistory: () => void;
  onToggleNarrow: () => void;
  onPaletteChange: (id: string) => void;
  onEditorSettingsChange: (settings: Settings) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: () => void;
  onJumpToNote: (id: string) => void;
  /** Suppress the local sidebar toggle when an outer header (e.g. the docs
   *  banner) already renders one. Avoids stacking two duplicate toggles. */
  suppressSidebarToggle?: boolean;
  /** Frontmatter fields to surface behind the properties button. Empty / omitted
   *  hides the button entirely — pass a non-empty array per content type
   *  (notes, templates, skills, tasks). */
  frontmatterFields?: FrontmatterField[];
};

// Editor pane's top toolbar. Owns the title input, save-status indicator,
// word-count badge, pomodoro chip, settings panel, and the lock /
// backlinks / graph / history / duplicate / export / delete action buttons.
//
// All icon-button JSX is inline here intentionally — it's tightly coupled
// to layout (h-7 w-7, ring/animate-pulse on confirm-state, tooltip
// positioning) and not reused anywhere else. Lifting them into named
// components would force prop-drilling that doesn't earn its keep.
export default function EditorHeaderToolbar({
  activeId,
  activeTemplate,
  activeSkill,
  editingTitle,
  isLocked,
  confirmDelete,
  sidebarOpen,
  backlinksOpen,
  historyOpen,
  narrowEditor,
  paletteId,
  editorSettings,
  noteStats,
  saveStatus,
  saveErrorKind,
  onOpenRecovery,
  backlinksCount,
  onTitleChange,
  onToggleSidebar,
  onToggleLock,
  onToggleBacklinks,
  onToggleGraph,
  onToggleHistory,
  onToggleNarrow,
  onPaletteChange,
  onEditorSettingsChange,
  onDuplicate,
  onExport,
  onDelete,
  onJumpToNote,
  suppressSidebarToggle,
  frontmatterFields,
}: EditorHeaderToolbarProps) {
  const tPage = useTranslations('page');
  const tCommon = useTranslations('common');
  const tRecovery = useTranslations('recovery');
  const lockLabel = isLocked ? tPage('unlockEditor') : tPage('lockEditor');
  const deleteLabel = confirmDelete ? tCommon('confirmDeleteAgain') : tPage('deleteNote');
  const titleInputReadonly = !activeTemplate && !activeSkill && isLocked;
  const titlePlaceholder = activeTemplate ? 'Template title' : activeSkill ? 'Skill name' : 'Note title';
  const titleTooltip = activeTemplate
    ? 'Template title'
    : activeSkill
      ? 'Skill name (also the identifier the AI uses)'
      : isLocked ? 'Note is locked — unlock to rename' : undefined;

  return (
    <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-3 text-xs zen-hide">
      {!sidebarOpen && !suppressSidebarToggle && <SidebarToggle open={sidebarOpen} onClick={onToggleSidebar} />}
      {activeTemplate && <span className="shrink-0 text-muted" aria-hidden="true">📄</span>}
      {activeSkill && <span className="shrink-0 text-muted" aria-hidden="true">🛠</span>}
      <input
        type="text"
        value={editingTitle}
        onChange={e => onTitleChange(e.target.value)}
        readOnly={titleInputReadonly}
        title={titleTooltip}
        className={`flex-1 min-w-0 bg-transparent text-sm font-medium text-text
          border-b border-transparent outline-none
          placeholder:text-muted transition-colors py-0.5
          ${titleInputReadonly ? 'cursor-default' : 'focus:border-accent'}`}
        placeholder={titlePlaceholder}
      />
      <span className="text-muted tabular-nums shrink-0 flex items-center gap-2">
        {editorSettings.showWordCount && noteStats.words > 0 && (
          <span className="hidden sm:inline text-muted" title={tPage('wordCountTitle', { chars: noteStats.chars })}>
            {tPage('wordCountMin', { words: noteStats.words, min: noteStats.readingMinutes })}
          </span>
        )}
        {saveStatus === 'saving' && <span className="text-muted italic">Saving...</span>}
        {saveStatus === 'saved' && <span className="text-good">{tPage('saveStatusSaved')}</span>}
        {saveStatus === 'error' && (
          <span
            className="text-bad"
            title={saveErrorKind === 'not-found' ? tPage('saveStatusErrorMissingTitle') : tPage('saveStatusErrorTitle')}
          >
            {tPage('saveStatusError')}
          </span>
        )}
        {saveStatus === 'error' && saveErrorKind === 'not-found' && onOpenRecovery && (
          <button
            type="button"
            onClick={onOpenRecovery}
            aria-label={tRecovery('buttonAria')}
            className="ml-1 px-2 py-0.5 text-[11px] rounded border border-bad text-bad hover:bg-bad hover:text-white transition-colors"
          >
            {tRecovery('buttonLabel')}
          </button>
        )}
      </span>
      <PomodoroChip
        variant="editor"
        activeId={activeId}
        activeTitle={editingTitle || null}
        onJumpToNote={onJumpToNote}
      />

      {frontmatterFields && frontmatterFields.length > 0 && (
        <FrontmatterPanel fields={frontmatterFields} />
      )}
      <EditorSettingsPanel
        settings={editorSettings}
        onChange={onEditorSettingsChange}
        narrowEditor={narrowEditor}
        onToggleNarrow={onToggleNarrow}
        paletteId={paletteId}
        onPaletteChange={onPaletteChange}
      />
      {!activeTemplate && !activeSkill && (
        <>
          <button
            onClick={onToggleLock}
            aria-label={lockLabel}
            aria-keyshortcuts="Shift+Meta+L"
            aria-pressed={isLocked}
            className={`relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
              ${isLocked
                ? 'text-accent bg-[var(--panel-2)]'
                : 'text-muted hover:text-text hover:bg-[var(--panel-2)]'}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              {isLocked
                ? <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                : <path d="M8 11V7a4 4 0 0 1 8 0" />}
            </svg>
            <Tooltip label={lockLabel} shortcut="⇧⌘L" align="end" />
          </button>
          <BacklinksToggle
            open={backlinksOpen}
            count={backlinksCount}
            onClick={onToggleBacklinks}
          />
          <GraphToggle onClick={onToggleGraph} />
          <HistoryPanelToggle open={historyOpen} onClick={onToggleHistory} />
          <button
            onClick={() => activeId && onDuplicate(activeId)}
            aria-label={tPage('duplicateNote')}
            className="relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
              text-muted hover:text-text hover:bg-[var(--panel-2)]"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="6" width="10" height="10" rx="1.5" />
              <path d="M14 6V4.5A1.5 1.5 0 0 0 12.5 3H4.5A1.5 1.5 0 0 0 3 4.5v8A1.5 1.5 0 0 0 4.5 14H6" />
            </svg>
            <Tooltip label={tPage('duplicateNote')} align="end" />
          </button>
          <button
            onClick={() => activeId && onExport(activeId)}
            aria-label={tPage('exportPdf')}
            className="relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
              text-muted hover:text-text hover:bg-[var(--panel-2)]"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
              <path d="M10 3v10M7 10l3 3 3-3" />
            </svg>
            <Tooltip label={tPage('exportPdf')} align="end" />
          </button>
          <button
            onClick={onDelete}
            aria-label={deleteLabel}
            className={`relative group shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors
              ${confirmDelete
                ? 'bg-red-500 text-white ring-2 ring-red-500/40 animate-pulse'
                : 'text-bad hover:bg-red-500/10'
              }`}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h12M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 6l1 10a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-10" />
            </svg>
            <Tooltip label={deleteLabel} align="end" />
          </button>
        </>
      )}
    </div>
  );
}
