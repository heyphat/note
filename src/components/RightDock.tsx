'use client';

import BacklinksPanel from './BacklinksPanel';
import HistoryPanel from './HistoryPanel';
import ProjectTasksPanel from './ProjectTasksPanel';
import type { LinkIndex } from '@/lib/links/link-index';
import type { NoteMeta, NoteStore } from '@/lib/storage';
import type { TaskIndex } from '@/lib/tasks';

export type RightDockProps = {
  // --- Visibility ---
  backlinksOpen: boolean;
  historyOpen: boolean;
  tasksOpen: boolean;
  /** Path-based id of the note currently open. The dock is hidden entirely
   *  when there's no active note, since the panels are note-scoped. */
  activeId: string | null;
  // --- Backlinks ---
  linkIndex: LinkIndex | null;
  linksVersion: number;
  notesById: Map<string, NoteMeta>;
  activeBody: string;
  onSelectNote: (id: string) => void;
  onLinkMention: (title: string) => void;
  onCloseBacklinks: () => void;
  // --- History ---
  store: NoteStore;
  historyReloadToken: number;
  onRestoreFromHistory: (content: string) => Promise<void>;
  onCloseHistory: () => void;
  // --- Tasks ---
  taskIndex: TaskIndex | null;
  tasksVersion: number;
  onOpenTask: (taskPath: string) => void;
  onToggleTaskComplete: (taskPath: string, currentlyDone: boolean) => void;
  onCloseTasks: () => void;
};

// Right-side dock: the wrapper for the Backlinks and History panels.
// Owns the column-shaped fixed/relative layout, the mobile backdrop that
// closes both panels on tap, and the conditional render for each panel.
//
// The two panels stack vertically inside the same column — either or both
// can be visible at a time. When neither is open (or there's no active
// note), the dock renders nothing.
export default function RightDock({
  backlinksOpen,
  historyOpen,
  tasksOpen,
  activeId,
  linkIndex,
  linksVersion,
  notesById,
  activeBody,
  onSelectNote,
  onLinkMention,
  onCloseBacklinks,
  store,
  historyReloadToken,
  onRestoreFromHistory,
  onCloseHistory,
  taskIndex,
  tasksVersion,
  onOpenTask,
  onToggleTaskComplete,
  onCloseTasks,
}: RightDockProps) {
  if (!activeId) return null;
  if (!backlinksOpen && !historyOpen && !tasksOpen) return null;

  // Mobile backdrop tap closes every panel at once. We dispatch each panel's
  // own close so the host's persisted-UI state stays accurate, instead of
  // trying to thread a single "close-all" callback.
  const closeAll = () => {
    if (backlinksOpen) onCloseBacklinks();
    if (historyOpen) onCloseHistory();
    if (tasksOpen) onCloseTasks();
  };

  return (
    <>
      {/* Mobile backdrop — tap to close both panels. Desktop ignores it. */}
      <div
        className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        onClick={closeAll}
        aria-hidden="true"
        data-testid="right-dock-backdrop"
      />
      <div
        className="zen-hide fixed md:relative inset-y-0 right-0 z-40 w-72 md:w-72 md:shrink-0
          border-l border-[var(--border)] bg-[var(--panel)] flex flex-col shadow-xl md:shadow-none"
      >
        {backlinksOpen && (
          <BacklinksPanel
            linkIndex={linkIndex}
            linksVersion={linksVersion}
            activeNote={notesById.get(activeId) ?? null}
            notesById={notesById}
            activeBody={activeBody}
            onSelect={onSelectNote}
            onLinkMention={onLinkMention}
            onClose={onCloseBacklinks}
          />
        )}
        {historyOpen && (
          <HistoryPanel
            store={store}
            noteId={activeId}
            reloadToken={historyReloadToken}
            onRestore={onRestoreFromHistory}
            onClose={onCloseHistory}
          />
        )}
        {tasksOpen && (
          <ProjectTasksPanel
            index={taskIndex}
            version={tasksVersion}
            activeNote={notesById.get(activeId) ?? null}
            onOpenTask={onOpenTask}
            onToggleComplete={onToggleTaskComplete}
            onClose={onCloseTasks}
          />
        )}
      </div>
    </>
  );
}
