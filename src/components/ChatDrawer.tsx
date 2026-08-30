'use client';

// Floating chat drawer. Defaults to the bottom-right slot above the ChatButton,
// but the user can drag it from the header to reposition and resize it from any
// edge/corner. The parent (page.tsx) owns `open` + thread-id state and the note
// store. This component is a dumb view over the `useChat` hook.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import ChatSelect, { type ChatSelectOption } from './ChatSelect';
import ChatMessage from './ChatMessage';
import ChatMessageSelectionPopover from './ChatMessageSelectionPopover';
import ProposedEditCard from './ProposedEditCard';
import ProviderIcon from './ProviderIcons';
import Tooltip from './Tooltip';
import { showToast } from './Toast';
import { useChat, type NoteContext } from '@/hooks/useChat';
import type { NoteStore, ChatMeta, NoteMeta } from '@/lib/storage';
import {
  PROVIDERS, getActiveSelection, setActiveSelection, type ActiveSelection,
} from '@/lib/ai';
import {
  classifyFile, buildAttachmentBlock, formatBytes,
  readFileAsBytes, readFileAsText,
  MAX_ATTACHMENTS_PER_TURN,
  type ChatAttachmentKind, type ResolvedAttachment,
} from '@/lib/ai/attachments';

type ChatDrawerSize = {
  width: number;
  height: number;
};

type ChatDrawerPosition = {
  x: number;
  y: number;
};

type ChatDrawerResizeEdge =
  | 'top' | 'right' | 'bottom' | 'left'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CHAT_DRAWER_SIZE_KEY = 'notes:chat-drawer-size';
const CHAT_DRAWER_POSITION_KEY = 'notes:chat-drawer-position';
const DEFAULT_DRAWER_WIDTH = 420;
const DEFAULT_DRAWER_HEIGHT = 640;
const MIN_DRAWER_WIDTH = 320;
const MIN_DRAWER_HEIGHT = 360;
const DRAWER_HORIZONTAL_GUTTER = 40; // Matches calc(100vw - 2.5rem).
const DRAWER_VERTICAL_GUTTER = 96; // Matches calc(100vh - 6rem).
const DRAWER_DEFAULT_RIGHT_PADDING = 20; // Matches the legacy `right-5` (1.25rem).
const DRAWER_DEFAULT_BOTTOM_PADDING = 80; // Matches the legacy `bottom-20` (5rem).
const DRAWER_VIEWPORT_MARGIN = 4; // Keep the drawer fully within the viewport.

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function drawerSizeBounds() {
  if (typeof window === 'undefined') {
    return {
      minWidth: MIN_DRAWER_WIDTH,
      maxWidth: DEFAULT_DRAWER_WIDTH,
      minHeight: MIN_DRAWER_HEIGHT,
      maxHeight: DEFAULT_DRAWER_HEIGHT,
    };
  }
  const maxWidth = Math.max(240, window.innerWidth - DRAWER_HORIZONTAL_GUTTER);
  const maxHeight = Math.max(320, window.innerHeight - DRAWER_VERTICAL_GUTTER);
  return {
    minWidth: Math.min(MIN_DRAWER_WIDTH, maxWidth),
    maxWidth,
    minHeight: Math.min(MIN_DRAWER_HEIGHT, maxHeight),
    maxHeight,
  };
}

function clampDrawerSize(size: ChatDrawerSize): ChatDrawerSize {
  const bounds = drawerSizeBounds();
  return {
    width: clamp(size.width, bounds.minWidth, bounds.maxWidth),
    height: clamp(size.height, bounds.minHeight, bounds.maxHeight),
  };
}

function defaultDrawerSize() {
  return clampDrawerSize({
    width: DEFAULT_DRAWER_WIDTH,
    height: DEFAULT_DRAWER_HEIGHT,
  });
}

function clampDrawerPosition(position: ChatDrawerPosition, size: ChatDrawerSize): ChatDrawerPosition {
  if (typeof window === 'undefined') return position;
  const maxX = Math.max(0, window.innerWidth - size.width - DRAWER_VIEWPORT_MARGIN);
  const maxY = Math.max(0, window.innerHeight - size.height - DRAWER_VIEWPORT_MARGIN);
  return {
    x: clamp(position.x, DRAWER_VIEWPORT_MARGIN, maxX),
    y: clamp(position.y, DRAWER_VIEWPORT_MARGIN, maxY),
  };
}

function defaultDrawerPosition(size: ChatDrawerSize): ChatDrawerPosition {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  return clampDrawerPosition({
    x: window.innerWidth - size.width - DRAWER_DEFAULT_RIGHT_PADDING,
    y: window.innerHeight - size.height - DRAWER_DEFAULT_BOTTOM_PADDING,
  }, size);
}

function loadSavedDrawerSize(): ChatDrawerSize | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CHAT_DRAWER_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatDrawerSize>;
    if (Number.isFinite(parsed.width) && Number.isFinite(parsed.height)) {
      return clampDrawerSize({
        width: Number(parsed.width),
        height: Number(parsed.height),
      });
    }
  } catch {
    // Ignore invalid or unavailable localStorage.
  }
  return null;
}

function loadSavedDrawerPosition(): ChatDrawerPosition | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CHAT_DRAWER_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatDrawerPosition>;
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return { x: Number(parsed.x), y: Number(parsed.y) };
    }
  } catch {
    // Ignore invalid or unavailable localStorage.
  }
  return null;
}

function buildMessageWithMentionedSelection(question: string, selection?: string | null) {
  const selected = selection?.trim();
  const trimmedQuestion = question.trim();
  if (!selected) return trimmedQuestion;
  const quotedSelection = selected
    .split(/\r?\n/)
    .map(line => `> ${line}`)
    .join('\n');
  return `${quotedSelection}\n\n${trimmedQuestion}`;
}

interface PendingAttachment {
  id: string;
  file: File;
  kind: ChatAttachmentKind;
}

interface MentionTrigger {
  /** Index of the `@` character in the textarea value. */
  from: number;
  /** Cursor position when the trigger was detected (end of query). */
  to: number;
  /** Characters after `@` and before the cursor. */
  query: string;
}

const MENTION_TRIGGER_RE = /(^|\s)@([\w./\- ]{0,60})$/;

// Detect a live `@<query>` trigger in `value` ending at `caret`. Mirrors the
// editor's wikilink autocomplete rule: must start at line/whitespace, must
// not span a newline, and the query is bounded so we don't open the picker
// when the user is already typing a long sentence containing an @.
function detectMentionTrigger(value: string, caret: number): MentionTrigger | null {
  const before = value.slice(0, caret);
  const lastNewline = before.lastIndexOf('\n');
  const lineStart = lastNewline + 1;
  const lineSegment = before.slice(lineStart);
  const match = MENTION_TRIGGER_RE.exec(lineSegment);
  if (!match) return null;
  const queryStart = lineSegment.length - match[0].length + match[1].length;
  return {
    from: lineStart + queryStart,
    to: caret,
    query: match[2],
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  store: NoteStore | null;
  storeReady: boolean;
  clearingChats: boolean;
  chatResetNonce: number;
  activeNoteId: string | null;
  /** Stable frontmatter UUID of the active note. Preferred chat anchor. */
  activeNoteUuid: string | null;
  noteTitle: string | null;
  /** Called at send-time so the system prompt reflects the live editor state. */
  getNoteContext: () => NoteContext;
  /** Parent opens the sidebar settings popover so the user can paste a key. */
  onOpenSettings?: () => void;
  /** Parent opens a promoted chat as a note (closes the drawer). */
  onOpenNote?: (noteId: string) => void;
  /** Navigate to a thread's anchored note while keeping the drawer open. */
  onNavigateToNote?: (noteId: string) => Promise<void> | void;
  /** Apply an AI-proposed edit by writing the new text to the active note. */
  onApplyEdit?: (newText: string) => Promise<void> | void;
  /** Apply an AI-proposed `create_note` by writing a new file to the vault. */
  onCreateNote?: (input: import('@/lib/ai/tools').CreateNoteInput) => Promise<void> | void;
  /** Apply an AI-proposed task mutation by writing through the task store. */
  onManageTasks?: (input: import('@/lib/ai/tools').ManageTasksInput) => Promise<void> | void;
  /** Auto-execute the AI's read-only tool calls (`search_vault`,
   *  `search_tasks`, plus any MCP tool with `readOnlyHint`). Returns the
   *  stringified result the model will see in the follow-up turn. Omit to
   *  disable agentic execution for this drawer. */
  onReadOnlyTool?: import('@/lib/ai/stream').ReadOnlyToolExecutor;
  /** Execute a non-read-only MCP tool after user approval. Returns the
   *  textual result for the chat UI. */
  onMcpCall?: (input: import('@/lib/ai/tools').McpCallInput) => Promise<string>;
  /** Highlighted editor text attached through the selection toolbar. */
  mentionedSelection?: string | null;
  onClearMentionedSelection?: () => void;
  /** Quote highlighted text from an assistant message into the next turn. */
  onAddMentionedSelection?: (selection: string) => void;
  /** Vault note metadata (already title-resolved by the parent's idle index). */
  notes?: NoteMeta[];
}

export default function ChatDrawer({
  open, onClose, store, storeReady, clearingChats, chatResetNonce, activeNoteId, activeNoteUuid, noteTitle, notes, getNoteContext,
  onOpenSettings, onOpenNote, onNavigateToNote, onApplyEdit, onCreateNote, onManageTasks, onReadOnlyTool, onMcpCall, mentionedSelection, onClearMentionedSelection,
  onAddMentionedSelection,
}: Props) {
  const t = useTranslations('chat');
  const tToast = useTranslations('toast');
  const [chatId, setChatId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatMeta[]>([]);
  const [active, setActive] = useState<ActiveSelection>(() => getActiveSelection());
  // Human-readable label for the currently active model — falls back to the
  // raw model ID if it isn't in the registry (e.g. a custom paste, or an ID
  // we haven't surfaced in the dropdown yet).
  const activeModelLabel = (
    PROVIDERS[active.providerId].models.find(m => m.id === active.model)?.label
    ?? active.model
  );
  const [input, setInput] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [drawerSize, setDrawerSize] = useState<ChatDrawerSize | null>(null);
  const [drawerPosition, setDrawerPosition] = useState<ChatDrawerPosition | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null);
  const [mentionResults, setMentionResults] = useState<NoteMeta[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const lastMentionQueryRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const confirmDeleteTimerRef = useRef<number | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const moveCleanupRef = useRef<(() => void) | null>(null);

  const {
    messages, status, error, streamingMessage, missingKey, pendingEdits,
    send, stop, applyEdit, rejectEdit, dismissEdit,
  } = useChat({
    store, chatId, getContext: getNoteContext, onApplyEdit, onCreateNote, onManageTasks,
    onReadOnlyTool, onMcpCall,
  });

  useEffect(() => {
    const onChange = () => setActive(getActiveSelection());
    window.addEventListener('ai:active-changed', onChange);
    window.addEventListener('ai:key-changed', onChange);
    return () => {
      window.removeEventListener('ai:active-changed', onChange);
      window.removeEventListener('ai:key-changed', onChange);
    };
  }, []);

  useEffect(() => {
    if (!open) setConfirmDeleteId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDrawerSize(current => clampDrawerSize(current ?? loadSavedDrawerSize() ?? defaultDrawerSize()));
  }, [open]);

  // Re-clamp position whenever the size becomes known/changes; lazily seed
  // from localStorage or fall back to the legacy bottom-right slot.
  useEffect(() => {
    if (!drawerSize) return;
    setDrawerPosition(current => clampDrawerPosition(
      current ?? loadSavedDrawerPosition() ?? defaultDrawerPosition(drawerSize),
      drawerSize,
    ));
  }, [drawerSize]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      setDrawerSize(current => clampDrawerSize(current ?? loadSavedDrawerSize() ?? defaultDrawerSize()));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  useEffect(() => {
    if (!drawerSize) return;
    try {
      window.localStorage.setItem(CHAT_DRAWER_SIZE_KEY, JSON.stringify(drawerSize));
    } catch {
      // Ignore private-mode or quota errors; resizing should still work.
    }
  }, [drawerSize]);

  useEffect(() => {
    if (!drawerPosition) return;
    try {
      window.localStorage.setItem(CHAT_DRAWER_POSITION_KEY, JSON.stringify(drawerPosition));
    } catch {
      // Ignore private-mode or quota errors; dragging should still work.
    }
  }, [drawerPosition]);

  useEffect(() => () => {
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;
    moveCleanupRef.current?.();
    moveCleanupRef.current = null;
  }, []);

  useEffect(() => {
    if (!clearingChats) return;
    stop();
    if (confirmDeleteTimerRef.current) {
      window.clearTimeout(confirmDeleteTimerRef.current);
      confirmDeleteTimerRef.current = null;
    }
    setThreads([]);
    setChatId(null);
    setInput('');
    setConfirmDeleteId(null);
  }, [clearingChats, stop]);

  const startDrawerResize = useCallback((edge: ChatDrawerResizeEdge, e: React.PointerEvent<HTMLDivElement>) => {
    if (typeof e.button === 'number' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeCleanupRef.current?.();
    moveCleanupRef.current?.();

    const startSize = drawerSize ?? loadSavedDrawerSize() ?? defaultDrawerSize();
    const startPos = drawerPosition ?? defaultDrawerPosition(startSize);
    const startX = e.clientX;
    const startY = e.clientY;

    const affectsLeft = edge.includes('left');
    const affectsTop = edge.includes('top');
    const affectsRight = edge.includes('right');
    const affectsBottom = edge.includes('bottom');

    const cursor =
      edge === 'top' || edge === 'bottom' ? 'ns-resize'
      : edge === 'left' || edge === 'right' ? 'ew-resize'
      : edge === 'top-left' || edge === 'bottom-right' ? 'nwse-resize'
      : 'nesw-resize';
    const previousBodyCursor = document.body.style.cursor;
    const previousHtmlCursor = document.documentElement.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = cursor;
    document.documentElement.style.cursor = cursor;
    document.body.style.userSelect = 'none';

    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      let nextWidth = startSize.width;
      let nextHeight = startSize.height;
      if (affectsRight) nextWidth = startSize.width + dx;
      if (affectsLeft) nextWidth = startSize.width - dx;
      if (affectsBottom) nextHeight = startSize.height + dy;
      if (affectsTop) nextHeight = startSize.height - dy;

      const clampedSize = clampDrawerSize({ width: nextWidth, height: nextHeight });

      // Anchor the opposite edge: when the size hits the min/max, the unmoved
      // edge should stay put rather than drift along with the cursor.
      let nextX = startPos.x;
      let nextY = startPos.y;
      if (affectsLeft) nextX = startPos.x + (startSize.width - clampedSize.width);
      if (affectsTop) nextY = startPos.y + (startSize.height - clampedSize.height);

      setDrawerSize(clampedSize);
      setDrawerPosition(clampDrawerPosition({ x: nextX, y: nextY }, clampedSize));
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.cursor = previousHtmlCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanupRef.current = null;
    };

    const onEnd = () => cleanup();

    resizeCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }, [drawerSize, drawerPosition]);

  // Header drag-to-move. Clicks on interactive header controls (buttons, the
  // ChatSelect combobox) pass through unchanged so the user can still operate
  // the controls.
  const startDrawerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (typeof e.button === 'number' && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, textarea, [role="combobox"], [role="listbox"], [role="option"]')) return;
    e.preventDefault();
    resizeCleanupRef.current?.();
    moveCleanupRef.current?.();

    const startSize = drawerSize ?? loadSavedDrawerSize() ?? defaultDrawerSize();
    const startPos = drawerPosition ?? defaultDrawerPosition(startSize);
    const startX = e.clientX;
    const startY = e.clientY;

    const previousBodyCursor = document.body.style.cursor;
    const previousHtmlCursor = document.documentElement.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'grabbing';
    document.documentElement.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const onMove = (event: PointerEvent) => {
      event.preventDefault();
      setDrawerPosition(clampDrawerPosition({
        x: startPos.x + event.clientX - startX,
        y: startPos.y + event.clientY - startY,
      }, startSize));
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      document.body.style.cursor = previousBodyCursor;
      document.documentElement.style.cursor = previousHtmlCursor;
      document.body.style.userSelect = previousUserSelect;
      moveCleanupRef.current = null;
    };
    const onEnd = () => cleanup();

    moveCleanupRef.current = cleanup;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }, [drawerSize, drawerPosition]);

  // Refresh thread list + pick/create a thread when the drawer opens
  // against a note. A thread is anchored to the current note; if one
  // exists we open the most recent, otherwise we create a blank one.
  // Refresh the thread list whenever the drawer opens or the active note
  // changes. Preserve the current selection if it's still in the filtered
  // list — otherwise the thread picker would jump around every time the
  // user navigates between notes.
  const chatIdRef = useRef<string | null>(null);
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);
  useEffect(() => {
    if (!open || !store || !storeReady || clearingChats) return;
    let cancelled = false;
    (async () => {
      const list = await store.listChats({
        noteId: activeNoteId ?? undefined,
        noteUuid: activeNoteUuid ?? undefined,
      });
      if (cancelled) return;
      setThreads(list);
      if (chatIdRef.current && list.some(t => t.id === chatIdRef.current)) return;
      if (list.length > 0) {
        setChatId(list[0].id);
      } else {
        const created = await store.createChat({
          noteId: activeNoteId ?? undefined,
          noteUuid: activeNoteUuid ?? undefined,
          title: noteTitle ? t('chatPrefix', { title: noteTitle }) : t('newChatTitle'),
          provider: active.providerId,
          model: active.model,
        });
        if (cancelled) return;
        setThreads([created]);
        setChatId(created.id);
      }
    })();
    return () => { cancelled = true; };
  }, [open, store, storeReady, clearingChats, chatResetNonce, activeNoteId, activeNoteUuid, active.providerId, active.model, noteTitle]);

  // Auto-scroll to the newest message while streaming.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streamingMessage?.content, pendingEdits, open]);

  // Focus the input when the drawer opens.
  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }, 30);
    return () => window.clearTimeout(focusTimer);
  }, [open, mentionedSelection]);

  useEffect(() => () => {
    if (confirmDeleteTimerRef.current) window.clearTimeout(confirmDeleteTimerRef.current);
  }, []);

  // Auto-grow the textarea up to ~6 rows. Resetting height to `auto` first
  // lets scrollHeight report the natural content height even while shrinking.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, 168); // ~6 rows at 13px/1.5
    el.style.height = `${next}px`;
  }, [input, open]);

  // Pending attachments are scoped to a single message — switching threads
  // or clearing all chats discards the local-only file refs.
  useEffect(() => {
    setPendingAttachments([]);
  }, [chatId, clearingChats]);

  // Close the picker when the drawer closes.
  useEffect(() => {
    if (!open) setMentionTrigger(null);
  }, [open]);

  const refreshMentionResults = useCallback((trigger: MentionTrigger | null) => {
    if (!trigger) {
      setMentionResults([]);
      setMentionIndex(0);
      lastMentionQueryRef.current = null;
      return;
    }
    const list = notes ?? [];
    const q = trigger.query.trim().toLowerCase();
    // Score: prefer title-prefix > title-substring > id-substring. Cap at 8
    // so the popover doesn't dominate the drawer when the query is empty.
    const scored = list.map(n => {
      const titleLc = n.title.toLowerCase();
      const idLc = n.id.toLowerCase();
      let score = -1;
      if (!q) score = 0;
      else if (titleLc.startsWith(q)) score = 3;
      else if (titleLc.includes(q)) score = 2;
      else if (idLc.includes(q)) score = 1;
      return { note: n, score };
    });
    const filtered = scored
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title))
      .slice(0, 8)
      .map(x => x.note);
    setMentionResults(filtered);
    // Only snap selection back to the top when the query changes. Otherwise
    // input-state polls (onKeyUp, onClick) triggered by ↑/↓ would immediately
    // undo the keyboard navigation we just did in onKeyDown.
    if (lastMentionQueryRef.current !== q) {
      setMentionIndex(0);
      lastMentionQueryRef.current = q;
    } else {
      setMentionIndex(i => Math.min(i, Math.max(0, filtered.length - 1)));
    }
  }, [notes]);

  const onTextareaInputState = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const trigger = detectMentionTrigger(el.value, el.selectionStart ?? el.value.length);
    setMentionTrigger(trigger);
    refreshMentionResults(trigger);
  }, [refreshMentionResults]);

  // Re-rank as the parent's note list updates (titles often arrive after the
  // initial render via the idle indexing pass).
  useEffect(() => {
    if (mentionTrigger) refreshMentionResults(mentionTrigger);
  }, [notes, mentionTrigger, refreshMentionResults]);

  const closeMentionPicker = useCallback(() => {
    setMentionTrigger(null);
    setMentionResults([]);
    setMentionIndex(0);
    lastMentionQueryRef.current = null;
  }, []);

  const insertMention = useCallback((note: NoteMeta) => {
    const el = inputRef.current;
    const trigger = mentionTrigger;
    if (!el || !trigger) return;
    // Stored format: `[[<noteId>]]`. Path-based so renames-by-title don't
    // dangle the reference. Trailing space puts the caret at a natural
    // continuation point so the user can keep typing.
    const insertText = `[[${note.id}]] `;
    const next = el.value.slice(0, trigger.from) + insertText + el.value.slice(trigger.to);
    setInput(next);
    closeMentionPicker();
    // Restore caret right after the inserted text on the next tick.
    requestAnimationFrame(() => {
      const updated = inputRef.current;
      if (!updated) return;
      const caret = trigger.from + insertText.length;
      updated.focus();
      updated.setSelectionRange(caret, caret);
    });
  }, [mentionTrigger, closeMentionPicker]);

  const acceptFiles = useCallback((files: FileList | File[]) => {
    const items = Array.from(files);
    if (items.length === 0) return;
    setPendingAttachments(prev => {
      const next = [...prev];
      for (const file of items) {
        if (next.length >= MAX_ATTACHMENTS_PER_TURN) {
          showToast(tToast('attachmentLimitReached', { max: MAX_ATTACHMENTS_PER_TURN }));
          break;
        }
        const result = classifyFile(file);
        if (!result.ok) {
          const reason = result.reason === 'too_large'
            ? tToast('attachmentReasonTooLarge')
            : result.reason === 'text_too_large'
              ? tToast('attachmentReasonTextTooLarge')
              : tToast('attachmentReasonUnsupported');
          showToast(tToast('attachmentRejected', { filename: file.name, reason }));
          continue;
        }
        next.push({ id: crypto.randomUUID(), file, kind: result.kind });
      }
      return next;
    });
  }, [tToast]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments(prev => prev.filter(p => p.id !== id));
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    acceptFiles(e.dataTransfer.files);
  }, [acceptFiles]);

  const onPickFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) acceptFiles(files);
    // Reset so the same file can be picked twice in a row.
    e.target.value = '';
  }, [acceptFiles]);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'streaming' || uploading) return;
    if (!input.trim() && pendingAttachments.length === 0) return;
    if (!activeNoteId) return;
    if (!store || !chatId) return;
    if (missingKey) {
      showToast(tToast('addProviderKeyFirst', { provider: PROVIDERS[active.providerId].label }));
      onOpenSettings?.();
      return;
    }

    let attachmentBlock = '';
    const resolved: ResolvedAttachment[] = [];
    if (pendingAttachments.length > 0) {
      setUploading(true);
      try {
        const refs: Array<{ filename: string; url: string; kind: ChatAttachmentKind; textContent?: string }> = [];
        for (const pending of pendingAttachments) {
          if (pending.kind === 'text') {
            const text = await readFileAsText(pending.file);
            refs.push({ filename: pending.file.name, url: '', kind: 'text', textContent: text });
            resolved.push({
              filename: pending.file.name,
              mimeType: pending.file.type || 'text/plain',
              size: pending.file.size,
              kind: 'text',
              bytes: new TextEncoder().encode(text),
              textContent: text,
            });
            continue;
          }
          try {
            const upload = await store.uploadChatAsset(chatId, pending.file);
            const bytes = await readFileAsBytes(pending.file);
            refs.push({ filename: pending.file.name, url: upload.url, kind: pending.kind });
            resolved.push({
              filename: pending.file.name,
              mimeType: upload.mimeType,
              size: upload.size,
              kind: pending.kind,
              bytes,
            });
          } catch (err) {
            void err;
            showToast(tToast('attachmentUploadFailed', { filename: pending.file.name }));
          }
        }
        attachmentBlock = buildAttachmentBlock(refs);
      } finally {
        setUploading(false);
      }
    }

    const userText = buildMessageWithMentionedSelection(input, mentionedSelection);
    const fullBody = `${attachmentBlock}${userText}`.trim();
    if (!fullBody) return;

    setInput('');
    setPendingAttachments([]);
    onClearMentionedSelection?.();
    if (resolved.length > 0) {
      void send(fullBody, { attachments: resolved });
    } else {
      void send(fullBody);
    }
  }, [
    status, uploading, input, pendingAttachments, activeNoteId, store, chatId,
    missingKey, active.providerId, mentionedSelection,
    onClearMentionedSelection, onOpenSettings, send, tToast,
  ]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // While the mention picker is open, capture nav keys before they reach
    // the textarea (so ArrowUp doesn't move the caret).
    if (mentionTrigger && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const picked = mentionResults[mentionIndex];
        if (picked) {
          e.preventDefault();
          insertMention(picked);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMentionPicker();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSubmit(e as unknown as React.FormEvent);
    }
  }, [onSubmit, mentionTrigger, mentionResults, mentionIndex, insertMention, closeMentionPicker]);

  const newThread = async () => {
    if (!store) return;
    const created = await store.createChat({
      noteId: activeNoteId ?? undefined,
      noteUuid: activeNoteUuid ?? undefined,
      title: noteTitle ? t('chatPrefix', { title: noteTitle }) : t('newChatTitle'),
      provider: active.providerId,
      model: active.model,
    });
    const list = await store.listChats({
      noteId: activeNoteId ?? undefined,
      noteUuid: activeNoteUuid ?? undefined,
    });
    setThreads(list);
    setChatId(created.id);
  };

  const snapToDefaultPosition = useCallback(() => {
    const size = drawerSize ?? defaultDrawerSize();
    setDrawerPosition(defaultDrawerPosition(size));
  }, [drawerSize]);

  const promoteToNote = async () => {
    if (!store || !chatId) return;
    try {
      const created = await store.promoteChatToNote(chatId);
      showToast(tToast('chatSavedAsNote'));
      onOpenNote?.(created.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : tToast('failedPromote'));
    }
  };

  const selectThread = (id: string) => {
    setChatId(id);
    setConfirmDeleteId(null);
    const thread = threads.find(t => t.id === id);
    if (!thread) return;
    // Resolve uuid → current path so the navigation works after a rename.
    // Fall back to the legacy path-based noteId when no uuid is recorded.
    if (thread.noteUuid && thread.noteUuid !== activeNoteUuid && store) {
      void store.findNoteByUuid(thread.noteUuid).then(found => {
        if (found?.id && found.id !== activeNoteId) void onNavigateToNote?.(found.id);
      });
      return;
    }
    if (thread.noteId && thread.noteId !== activeNoteId) {
      void onNavigateToNote?.(thread.noteId);
    }
  };

  // Two-click delete — first click arms the row (shown in red), second
  // click within 2.5s commits the delete. Mirrors NoteTree's pattern so
  // the interaction feels consistent across the app.
  const DELETE_CONFIRM_MS = 2500;
  const requestDeleteThread = async (id: string) => {
    if (!store) return;
    if (confirmDeleteId === id) {
      if (confirmDeleteTimerRef.current) {
        window.clearTimeout(confirmDeleteTimerRef.current);
        confirmDeleteTimerRef.current = null;
      }
      setConfirmDeleteId(null);
      try {
        await store.deleteChat(id);
      } catch (err) {
        showToast(err instanceof Error ? err.message : tToast('failedDelete'));
        return;
      }
      const list = await store.listChats({
        noteId: activeNoteId ?? undefined,
        noteUuid: activeNoteUuid ?? undefined,
      });
      setThreads(list);
      // If we deleted the currently-open thread, roll to the next one or
      // spin up a fresh blank thread so the drawer never sits empty.
      if (id === chatId) {
        if (list.length > 0) {
          setChatId(list[0].id);
        } else {
          const created = await store.createChat({
            noteId: activeNoteId ?? undefined,
            noteUuid: activeNoteUuid ?? undefined,
            title: noteTitle ? t('chatPrefix', { title: noteTitle }) : t('newChatTitle'),
            provider: active.providerId,
            model: active.model,
          });
          setThreads([created]);
          setChatId(created.id);
        }
      }
      if (list.length === 0) setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(id);
    if (confirmDeleteTimerRef.current) window.clearTimeout(confirmDeleteTimerRef.current);
    confirmDeleteTimerRef.current = window.setTimeout(() => {
      setConfirmDeleteId(null);
      confirmDeleteTimerRef.current = null;
    }, DELETE_CONFIRM_MS);
  };

  if (!open) return null;

  const threadOptions: ChatSelectOption[] = threads.map(thread => ({
    id: thread.id,
    label: thread.title,
  }));
  const chatReady = !!chatId;
  const sendButtonClass = active.providerId === 'anthropic'
    ? 'border-amber-600/50 bg-amber-500 text-white hover:bg-amber-400 shadow-sm shadow-amber-500/30 hover:shadow-amber-500/40'
    : active.providerId === 'openai'
      ? 'border-emerald-600/50 bg-emerald-500 text-white hover:bg-emerald-400 shadow-sm shadow-emerald-500/30 hover:shadow-emerald-500/40'
      : 'border-sky-600/50 bg-sky-500 text-white hover:bg-sky-400 shadow-sm shadow-sky-500/30 hover:shadow-sky-500/40';
  const mentionedSelectionText = mentionedSelection?.trim() ?? '';

  const positioned = drawerPosition !== null;
  const edgeHandleHover = 'hover:bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] active:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)]';

  return (
    <div
      data-testid="chat-drawer"
      className={`fixed z-40 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--panel)] ${
        positioned ? '' : 'bottom-20 right-5 w-[min(420px,calc(100vw-2.5rem))] h-[min(640px,calc(100vh-6rem))]'
      }`}
      style={{
        ...(positioned ? { top: `${drawerPosition.y}px`, left: `${drawerPosition.x}px` } : {}),
        width: drawerSize ? `${drawerSize.width}px` : undefined,
        height: drawerSize ? `${drawerSize.height}px` : undefined,
        maxWidth: 'calc(100vw - 2.5rem)',
        maxHeight: 'calc(100vh - 6rem)',
        boxShadow: '0 24px 48px -16px rgba(0,0,0,0.35), 0 1px 0 color-mix(in srgb, var(--border-strong) 50%, transparent) inset',
      }}
      role="dialog"
      aria-label={t('ariaLabel')}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 rounded-xl
            border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--accent)_12%,var(--panel))]
            text-center pointer-events-none"
        >
          <div className="text-sm font-medium text-text">{t('dropZoneTitle')}</div>
          <div className="text-[11px] text-muted">{t('dropZoneBody')}</div>
        </div>
      ) : null}
      <div
        aria-hidden="true"
        data-testid="chat-drawer-resize-left"
        onPointerDown={e => startDrawerResize('left', e)}
        className={`absolute -left-1 top-3 bottom-3 z-10 w-2 cursor-ew-resize touch-none rounded-full ${edgeHandleHover}`}
      />
      <div
        aria-hidden="true"
        data-testid="chat-drawer-resize-right"
        onPointerDown={e => startDrawerResize('right', e)}
        className={`absolute -right-1 top-3 bottom-3 z-10 w-2 cursor-ew-resize touch-none rounded-full ${edgeHandleHover}`}
      />
      <div
        aria-hidden="true"
        data-testid="chat-drawer-resize-top"
        onPointerDown={e => startDrawerResize('top', e)}
        className={`absolute -top-1 left-3 right-3 z-10 h-2 cursor-ns-resize touch-none rounded-full ${edgeHandleHover}`}
      />
      <div
        aria-hidden="true"
        data-testid="chat-drawer-resize-bottom"
        onPointerDown={e => startDrawerResize('bottom', e)}
        className={`absolute -bottom-1 left-3 right-3 z-10 h-2 cursor-ns-resize touch-none rounded-full ${edgeHandleHover}`}
      />
      <div
        aria-hidden="true"
        data-testid="chat-drawer-resize-corner"
        onPointerDown={e => startDrawerResize('top-left', e)}
        className={`absolute -left-1 -top-1 z-20 h-5 w-5 cursor-nwse-resize touch-none rounded-tl-xl ${edgeHandleHover}`}
      />
      <div
        aria-hidden="true"
        data-testid="chat-drawer-resize-top-right"
        onPointerDown={e => startDrawerResize('top-right', e)}
        className={`absolute -right-1 -top-1 z-20 h-5 w-5 cursor-nesw-resize touch-none rounded-tr-xl ${edgeHandleHover}`}
      />
      <div
        aria-hidden="true"
        data-testid="chat-drawer-resize-bottom-left"
        onPointerDown={e => startDrawerResize('bottom-left', e)}
        className={`absolute -left-1 -bottom-1 z-20 h-5 w-5 cursor-nesw-resize touch-none rounded-bl-xl ${edgeHandleHover}`}
      />
      <div
        aria-hidden="true"
        data-testid="chat-drawer-resize-bottom-right"
        onPointerDown={e => startDrawerResize('bottom-right', e)}
        className={`absolute -right-1 -bottom-1 z-20 h-5 w-5 cursor-nwse-resize touch-none rounded-br-xl ${edgeHandleHover}`}
      />
      <header
        onPointerDown={startDrawerMove}
        className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-text font-medium">
          {activeNoteId ? (
            <span className="text-muted truncate">{noteTitle || activeNoteId}</span>
          ) : null}
        </div>
        {(chatId || threadOptions.length > 0) && (
          <ChatSelect
            value={chatId ?? ''}
            options={threadOptions}
            onChange={selectThread}
            title={t('historyTitle')}
            align="right"
            placeholder={t('historyPlaceholder')}
            className="w-[min(180px,38vw)] shrink-0"
            buttonClassName="h-8 px-2.5 text-[10px] bg-[var(--panel)]"
            onClose={() => setConfirmDeleteId(null)}
            renderOption={(opt, ctx) => {
              const isConfirming = confirmDeleteId === opt.id;
              return (
                <div
                  role="option"
                  aria-selected={ctx.active}
                  onClick={ctx.select}
                  className={`group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-[11px]
                    ${isConfirming ? 'bg-red-500/10' : 'hover:bg-[var(--panel-2)]'}`}
                >
                  <span className={`shrink-0 w-3 text-center ${ctx.active ? 'text-accent' : 'text-transparent'}`} aria-hidden="true">✓</span>
                  <span className={`flex-1 min-w-0 truncate
                    ${isConfirming ? 'text-red-500' : ctx.active ? 'text-text' : 'text-muted group-hover:text-text'}`}>
                    {isConfirming ? t('confirmDeleteRow') : opt.label}
                  </span>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); void requestDeleteThread(opt.id); }}
                    aria-label={isConfirming ? t('confirmDeleteAria') : t('deleteThreadAria')}
                    title={isConfirming ? t('confirmDeleteTitle') : t('deleteThreadTitle')}
                    className={`shrink-0 p-1 rounded transition-opacity
                      ${isConfirming
                        ? 'opacity-100 text-red-500 bg-red-500/10'
                        : 'opacity-0 group-hover:opacity-100 text-muted hover:text-red-500 hover:bg-black/10 dark:hover:bg-white/10'}`}
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="none"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 6h12M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M6 6l1 10a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-10" />
                    </svg>
                  </button>
                </div>
              );
            }}
          />
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={newThread}
            aria-label={t('newThreadAria')}
            className="relative group w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-[var(--panel-2)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <Tooltip label={t('newThreadTooltip')} side="top" align="end" />
          </button>
          <button
            type="button"
            onClick={promoteToNote}
            disabled={!chatId || messages.length === 0}
            aria-label={t('saveAsNoteAria')}
            className="relative group w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-[var(--panel-2)] disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <Tooltip label={t('saveAsNoteTooltip')} side="top" align="end" />
          </button>
          <button
            type="button"
            onClick={snapToDefaultPosition}
            aria-label={t('resetPositionAria')}
            className="relative group w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-[var(--panel-2)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="13" y="13" width="8" height="8" rx="1.5" />
              <path d="M3 3h6M3 3v6M21 8V5a2 2 0 0 0-2-2h-3" />
            </svg>
            <Tooltip label={t('resetPositionTooltip')} side="top" align="end" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeTooltip')}
            className="relative group w-7 h-7 inline-flex items-center justify-center rounded-md text-muted hover:text-text hover:bg-[var(--panel-2)]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            <Tooltip label={t('closeTooltip')} side="top" align="end" />
          </button>
        </div>
      </header>

      {onAddMentionedSelection ? (
        <ChatMessageSelectionPopover
          containerRef={listRef}
          onAddToFollowUp={(selection) => {
            onAddMentionedSelection(selection);
            // Focus the composer so the user can immediately type their follow-up.
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        />
      ) : null}

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !streamingMessage ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted text-xs gap-2 px-4">
            {!activeNoteId ? (
              <>
                <div className="text-sm text-text">{t('emptyNoNote')}</div>
                <div>{t('emptyNoNoteBody')}</div>
              </>
            ) : (
              <>
                <div className="text-sm text-text">{t('emptyAskHeader')}</div>
                <div>{t('emptyAskBody')}</div>
              </>
            )}
            {missingKey && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="mt-2 text-[11px] text-accent hover:underline"
              >
                {t('configureKey')}
              </button>
            )}
          </div>
        ) : null}
        {messages.map((m, i) => (
          <ChatMessage key={i} role={m.role} content={m.content} />
        ))}
        {streamingMessage ? (
          <ChatMessage
            role={streamingMessage.role}
            content={streamingMessage.content}
            streaming
          />
        ) : null}
        {pendingEdits.map(edit => (
          <ProposedEditCard
            key={edit.toolCallId}
            edit={edit}
            onApply={applyEdit}
            onReject={rejectEdit}
            onDismiss={dismissEdit}
          />
        ))}
        {error ? (
          <div className="text-[11px] text-red-500 border border-red-500/30 bg-red-500/5 rounded-md px-2 py-1.5">
            {error}
          </div>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="shrink-0 p-3">
        {mentionedSelectionText ? (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-2">
            <span
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent"
              aria-hidden="true"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3.5l1.35 3.15L16.5 8l-3.15 1.35L12 12.5l-1.35-3.15L7.5 8l3.15-1.35L12 3.5Z" />
                <path d="M18 12l.9 2.1L21 15l-2.1.9L18 18l-.9-2.1L15 15l2.1-.9L18 12Z" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
                {t('mentionedSelectionLabel')}
              </div>
              <div className="max-h-10 overflow-hidden whitespace-pre-wrap break-words text-[11px] leading-5 text-text">
                {mentionedSelectionText}
              </div>
            </div>
            <button
              type="button"
              onClick={onClearMentionedSelection}
              aria-label={t('clearMentionedSelection')}
              title={t('clearMentionedSelection')}
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted hover:bg-[var(--panel)] hover:text-text"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}
        {pendingAttachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="group flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel-2)]
                  px-2 py-1 text-[11px] text-text"
                title={`${att.file.name} · ${formatBytes(att.file.size)}`}
              >
                <span className="text-muted" aria-hidden="true">
                  {att.kind === 'image' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                  ) : att.kind === 'pdf' ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                      <path d="M9 13h6M9 17h6" />
                    </svg>
                  )}
                </span>
                <span className="max-w-[160px] truncate">{att.file.name}</span>
                <span className="text-[10px] text-muted">{formatBytes(att.file.size)}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={t('removeAttachmentAria')}
                  className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded
                    text-muted hover:bg-[var(--panel)] hover:text-text"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onPickFiles}
          aria-hidden="true"
          tabIndex={-1}
        />
        {/* Composer: textarea + action button live inside one rounded pill so
            the field reads as a single unified surface — modern chat apps
            (ChatGPT, Claude.ai, Linear Copilot) all use this pattern. */}
        <div
          className={`relative group flex items-end gap-1 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)]
            px-2 py-1.5 transition-all
            ${activeNoteId
              ? 'focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_15%,transparent)]'
              : 'opacity-60'}`}
        >
          {mentionTrigger && mentionResults.length > 0 ? (
            <div
              role="listbox"
              aria-label={t('mentionPickerAria')}
              onMouseDown={e => e.preventDefault()}
              className="absolute left-0 right-0 bottom-full mb-1 z-20 max-h-60 overflow-auto rounded-lg
                border border-[var(--border)] bg-[var(--panel)] shadow-lg"
              style={{ boxShadow: '0 12px 32px -12px rgba(0,0,0,0.35)' }}
            >
              {mentionResults.map((note, idx) => {
                const selected = idx === mentionIndex;
                return (
                  <div
                    key={note.id}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => insertMention(note)}
                    className={`flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-[12px]
                      ${selected ? 'bg-[var(--panel-2)]' : 'hover:bg-[var(--panel-2)]'}`}
                  >
                    <span className="text-muted shrink-0" aria-hidden="true">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
                        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 2h6l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" />
                        <path d="M10 2v3h3" />
                      </svg>
                    </span>
                    <span className="flex-1 min-w-0 truncate text-text">{note.title}</span>
                    <span className="shrink-0 max-w-[55%] truncate text-[10px] text-muted">{note.id}</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 px-2.5 py-1 text-[10px] text-muted border-t border-[var(--border)]">
                <span><kbd className="font-sans">↑↓</kbd> {t('mentionHintNavigate')}</span>
                <span><kbd className="font-sans">↵</kbd> {t('mentionHintSelect')}</span>
                <span><kbd className="font-sans">esc</kbd> {t('mentionHintClose')}</span>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeNoteId || pendingAttachments.length >= MAX_ATTACHMENTS_PER_TURN}
            aria-label={t('attachAria')}
            title={t('attachTooltip')}
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full
              text-muted hover:text-text hover:bg-[var(--panel)] active:scale-95 transition-all
              disabled:opacity-30 disabled:cursor-default disabled:active:scale-100 disabled:hover:bg-transparent"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); onTextareaInputState(); }}
            onKeyUp={onTextareaInputState}
            onClick={onTextareaInputState}
            onBlur={() => {
              // Delay so a click inside the popup can pick before blur tears it down.
              window.setTimeout(closeMentionPicker, 120);
            }}
            onKeyDown={onKeyDown}
            disabled={!activeNoteId || !chatReady}
            placeholder={!activeNoteId
              ? t('placeholderNoNote')
              : missingKey
                ? t('placeholderMissingKey')
                : t('placeholderAsk')}
            rows={1}
            className="flex-1 min-w-0 resize-none bg-transparent border-0 px-2 py-1.5
              text-[13px] leading-[1.5] text-text placeholder:text-muted outline-none
              max-h-[168px] overflow-y-auto disabled:cursor-not-allowed"
            style={{ height: '32px' }}
          />
          {status === 'streaming' ? (
            <button
              type="button"
              onClick={stop}
              aria-label={t('stopAria')}
              title={t('stopTitle')}
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full
                bg-[var(--panel)] border border-[var(--border)] text-text
                hover:bg-[var(--bg)] active:scale-95 transition-all"
            >
              <span className="w-2.5 h-2.5 rounded-[2px] bg-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={(!input.trim() && pendingAttachments.length === 0) || missingKey || !activeNoteId || !chatReady || uploading}
              aria-label={t('sendAria', { provider: PROVIDERS[active.providerId].label })}
              title={t('sendTitle', { provider: PROVIDERS[active.providerId].label })}
              className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full border transition-all active:scale-95
                disabled:opacity-30 disabled:cursor-default disabled:active:scale-100 disabled:hover:opacity-30 ${sendButtonClass}`}
            >
              <ProviderIcon providerId={active.providerId} className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-1.5 pt-1.5">
          <span className="text-[10px] text-muted shrink-0">
            <kbd className="font-sans">{t('hintEnter')}</kbd> {t('hintEnterDesc')} · <kbd className="font-sans">{t('hintShiftEnter')}</kbd> {t('hintShiftEnterDesc')}
          </span>
          {uploading ? (
            <span className="text-[10px] text-muted inline-flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              {t('uploading')}
            </span>
          ) : (
            <ChatSelect
              className="min-w-0 max-w-[60%]"
              buttonClassName="px-1.5 gap-1.5 hover:bg-[var(--panel-2)]"
              title={`${PROVIDERS[active.providerId].label} · ${activeModelLabel}`}
              ariaLabel={t('modelPickerAria')}
              align="right"
              direction="up"
              variant="ghost"
              triggerPrefix={
                <ProviderIcon providerId={active.providerId} className="w-3 h-3 shrink-0" aria-hidden="true" />
              }
              value={active.model}
              placeholder={activeModelLabel}
              options={PROVIDERS[active.providerId].models.map(m => ({ id: m.id, label: m.label }))}
              onChange={(modelId) => setActiveSelection({ providerId: active.providerId, model: modelId })}
            />
          )}
        </div>
      </form>
    </div>
  );
}
