'use client';

// Left-hand notes sidebar. Composes five already-existing child panels
// (TagCloud / RecentList / SavedSearches / TemplateList / NoteTree) plus a
// header with the "+ New" menu and a footer with the folder label, reindex
// button, and theme toggle.
//
// This component owns only the "+ New" dropdown state + outside-click
// handling. Every other piece of state lives in page.tsx and is passed in.
// The fat prop interface is the tradeoff for letting the parent stay fully
// in charge of how clicks resolve into mutations.

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import TagCloud from '@/components/TagCloud';
import CalendarStrip from '@/components/CalendarStrip';
import RecentList from '@/components/RecentList';
import SavedSearches from '@/components/SavedSearches';
import TemplateList from '@/components/TemplateList';
import SkillList from '@/components/SkillList';
import NoteTree from '@/components/NoteTree';
import { SidebarToggle } from '@/components/HeaderToggles';
import PomodoroChip from '@/components/PomodoroChip';
import type { NoteMeta, SkillMeta } from '@/lib/storage';
import type { SavedSearch } from '@/lib/saved-searches';
import type { TagCount } from '@/lib/search/types';

export type NotesSidebarProps = {
  // Layout / lifecycle
  open: boolean;
  onToggleSidebar: () => void;
  loading: boolean;

  // "+ New" menu target + creation handlers
  targetFolder: string;
  setTargetFolder: (folder: string) => void;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onCreateTemplate: () => void;

  // Tag cloud
  indexTags: TagCount[];
  activeTagFilter: string | null;
  setActiveTagFilter: (tag: string | null) => void;
  hiddenTags: Set<string>;
  hideTag: (tag: string) => void;
  unhideTag: (tag: string) => void;

  // Calendar (date filter)
  activeDateFilter: string | null;
  setActiveDateFilter: (date: string | null) => void;

  // Recent list
  recentIds: string[];
  notesById: Map<string, NoteMeta>;
  activeId: string | null;
  editingTitle: string;
  selectNote: (id: string, opts?: { replace?: boolean }) => Promise<void>;

  // Saved searches
  savedSearches: SavedSearch[];
  activeSavedSearchId: string | null;
  setActiveSavedSearchId: (id: string | null) => void;
  onRenameSavedSearch: (id: string, name: string) => void;
  onDeleteSavedSearch: (id: string) => void;

  // Templates
  templates: { id: string; name: string }[];
  activeTemplate: string | null;
  openTemplate: (id: string) => Promise<boolean>;
  onRenameTemplate: (id: string, name: string) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;

  // Skills
  skills: SkillMeta[];
  activeSkill: string | null;
  onSelectSkill: (id: string) => void;
  onImportSkill: () => void;
  onRenameSkill: (id: string, name: string) => Promise<void>;
  onDeleteSkill: (id: string) => Promise<void>;
  onMoveSkill: (id: string, destDir: string) => Promise<string | null>;

  // Tree
  notes: NoteMeta[];
  visibleNotes: NoteMeta[];
  folders: string[];
  savedSearchResults: string[] | null;
  expanded: Set<string>;
  toggleFolder: (path: string) => void;
  onFolderClick: (path: string) => void;
  pinned: Set<string>;
  togglePin: (path: string) => void;
  deleteItem: (path: string) => Promise<void>;
  onMove: (srcId: string, destFolder: string) => Promise<void>;
  onRenameFolder: (oldPath: string, newName: string) => Promise<void>;

  // Footer (folder picker + settings trigger)
  bfsLabel: string;
  onPickFolder: () => void;

  /** Dense mode — hides note-row date subtitles and tightens tree rows. */
  dense: boolean;

  /** Sidebar section visibility — owned by page.tsx so the SettingsPopover
   *  shares the same source of truth. */
  showCalendar: boolean;
  showTags: boolean;
  showRecent: boolean;
  showTemplates: boolean;
  showSkills: boolean;

  /** Open the application-wide settings popover (gear button). */
  onOpenSettings: () => void;
};

export default function NotesSidebar(props: NotesSidebarProps) {
  const {
    open, onToggleSidebar, loading,
    targetFolder, setTargetFolder, onCreateNote, onCreateFolder, onCreateTemplate,
    indexTags, activeTagFilter, setActiveTagFilter, hiddenTags, hideTag, unhideTag,
    activeDateFilter, setActiveDateFilter,
    recentIds, notesById, activeId, editingTitle, selectNote,
    savedSearches, activeSavedSearchId, setActiveSavedSearchId, onRenameSavedSearch, onDeleteSavedSearch,
    templates, activeTemplate, openTemplate, onRenameTemplate, onDeleteTemplate,
    skills, activeSkill, onSelectSkill, onImportSkill, onRenameSkill, onDeleteSkill, onMoveSkill,
    notes, visibleNotes, folders, savedSearchResults,
    expanded, toggleFolder, onFolderClick, pinned, togglePin, deleteItem, onMove, onRenameFolder,
    bfsLabel, onPickFolder,
    dense,
    showCalendar, showTags, showRecent, showTemplates, showSkills,
    onOpenSettings,
  } = props;

  const t = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  // Close "+ New" dropdown on outside click / Escape.
  useEffect(() => {
    if (!newMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setNewMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNewMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [newMenuOpen]);

  if (!open) return null;

  return (
    <>
      {/* Mobile backdrop — tap to close. md:hidden keeps desktop layout intact. */}
      <div
        className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        onClick={onToggleSidebar}
        aria-hidden="true"
      />
      <div className="fixed md:relative inset-y-0 left-0 z-40 w-72 md:w-64 md:shrink-0
        border-r border-[var(--border)] bg-[var(--panel)] flex flex-col shadow-xl md:shadow-none zen-hide">
        <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2">
          <button onClick={() => setTargetFolder('')} className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-text tracking-tight">{t('notesHeading')}</h2>
          </button>
          {/* Fallback pomodoro chip — visible only when a session is live AND no
              editor header is mounted (i.e. we're on the empty-state page). The
              chip component handles that gate internally via the `sidebar`
              variant, so both instances can be mounted safely — only one is
              ever visible at a time. */}
          {!activeId && !activeTemplate && (
            <PomodoroChip
              variant="sidebar"
              activeId={null}
              activeTitle={null}
              onJumpToNote={(id) => { void selectNote(id); }}
            />
          )}
          <div ref={newMenuRef} className="relative flex items-center gap-1.5">
            <button onClick={() => setNewMenuOpen(v => !v)}
              title={t('newItemIn', { folder: targetFolder || '/' })}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[var(--accent)] text-[var(--on-accent)] rounded-md hover:bg-[var(--accent-hover)] transition-all duration-150 active:scale-[0.97]"
              style={{
                boxShadow:
                  '0 4px 14px -6px color-mix(in srgb, var(--accent) 55%, transparent), 0 1px 0 rgba(255,255,255,0.08) inset',
              }}>
              <span className="text-sm leading-none translate-y-[-1px]">+</span>
              <span>{t('newButton')}</span>
            </button>
            <SidebarToggle open={open} onClick={onToggleSidebar} />
            {newMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-[200px] bg-[var(--panel)] border border-[var(--border)] rounded-lg z-20 py-1 overflow-hidden"
                style={{
                  boxShadow:
                    '0 1px 0 color-mix(in srgb, var(--border-strong) 50%, transparent) inset, 0 12px 28px -10px rgba(0,0,0,0.35)',
                }}
              >
                <div className="px-3 pt-1.5 pb-1.5 text-[10px] uppercase tracking-wide text-muted truncate"
                  title={targetFolder || '/'}>
                  {t('menuInLabel')} <span className="text-text">{targetFolder || '/'}</span>
                </div>
                <button
                  onClick={() => { setNewMenuOpen(false); onCreateNote(); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-[var(--panel-2)] transition-colors">
                  {t('newNote')}
                </button>
                <button
                  onClick={() => { setNewMenuOpen(false); onCreateFolder(); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-[var(--panel-2)] transition-colors">
                  {t('newFolder')}
                </button>
                <button
                  onClick={() => { setNewMenuOpen(false); onCreateTemplate(); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-[var(--panel-2)] transition-colors">
                  {t('newTemplate')}
                </button>
              </div>
            )}
          </div>
        </div>
        {/*
          Split the sidebar into two vertical panes so NoteTree gets a
          bounded height and can own its scroll + virtualization. The
          top pane is capped at 40vh to keep a huge TagCloud / Recent /
          SavedSearches from squeezing the tree out of view.
        */}
        <div className="flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="text-xs text-muted p-4">{tCommon('loading')}</div>
          ) : (
            <>
              <div className="shrink-0 overflow-y-auto" style={{ maxHeight: '40vh' }}>
                {showCalendar && (
                  <CalendarStrip
                    notes={notes}
                    activeDate={activeDateFilter}
                    onSelectDate={setActiveDateFilter}
                  />
                )}
                {showTags && (
                  <TagCloud
                    tags={indexTags}
                    activeTag={activeTagFilter}
                    onSelectTag={setActiveTagFilter}
                    hiddenTags={hiddenTags}
                    onHideTag={hideTag}
                    onUnhideTag={unhideTag}
                    hideWhenEmpty={false}
                  />
                )}
                {showRecent && (
                  <RecentList
                    recent={recentIds}
                    notesById={notesById}
                    activeId={activeId}
                    activeTitle={activeId ? editingTitle : null}
                    onSelect={selectNote}
                  />
                )}
                <SavedSearches
                  items={savedSearches}
                  activeId={activeSavedSearchId}
                  onSelect={setActiveSavedSearchId}
                  onRename={onRenameSavedSearch}
                  onDelete={onDeleteSavedSearch}
                />
                {showTemplates && (
                  <TemplateList
                    templates={templates}
                    activeTemplate={activeTemplate}
                    onSelect={openTemplate}
                    onRename={onRenameTemplate}
                    onDelete={onDeleteTemplate}
                  />
                )}
                {showSkills && (
                  <SkillList
                    skills={skills}
                    activeSkill={activeSkill}
                    onSelect={onSelectSkill}
                    onImport={onImportSkill}
                    onRename={onRenameSkill}
                    onDelete={onDeleteSkill}
                    onMove={onMoveSkill}
                  />
                )}
              </div>
              <div className="flex-1 min-h-0 border-t border-[var(--border)]">
                {activeSavedSearchId && savedSearchResults !== null ? (
                  <NoteTree
                    notes={notes}
                    folders={folders}
                    activeId={activeId}
                    activeTitle={activeId ? editingTitle : null}
                    onSelect={selectNote}
                    expanded={expanded}
                    onToggleFolder={toggleFolder}
                    targetFolder={targetFolder}
                    onFolderClick={onFolderClick}
                    pinned={pinned}
                    onTogglePin={togglePin}
                    onDelete={deleteItem}
                    variant="flat"
                    flatNoteIds={savedSearchResults}
                    dense={dense}
                  />
                ) : (
                  <NoteTree
                    notes={visibleNotes}
                    folders={folders}
                    activeId={activeId}
                    activeTitle={activeId ? editingTitle : null}
                    onSelect={selectNote}
                    onMove={onMove}
                    expanded={expanded}
                    onToggleFolder={toggleFolder}
                    targetFolder={targetFolder}
                    onFolderClick={onFolderClick}
                    pinned={pinned}
                    onTogglePin={togglePin}
                    onDelete={deleteItem}
                    onRenameFolder={onRenameFolder}
                    dense={dense}
                  />
                )}
              </div>
            </>
          )}
        </div>
        {/* Directory config + reindex + theme toggle */}
        <div className="shrink-0 px-2 py-2 border-t border-[var(--border)] flex items-center gap-1.5">
          <button
            onClick={onPickFolder}
            className="group flex-1 min-w-0 inline-flex items-center gap-1.5 text-left text-[11px] text-muted hover:text-text transition-colors"
            title={t('currentFolder', { label: bfsLabel || '—' })}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
              className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
              aria-hidden="true"
            >
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            </svg>
            <span className="truncate">{bfsLabel || t('pickFolder')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={t('openSettings')}
            title={t('openSettings')}
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md text-muted hover:text-text hover:bg-[var(--panel-2)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
