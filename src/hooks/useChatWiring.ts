'use client';

// AI chat drawer state + plumbing: drawer open/close, mentioned-selection
// (the ">" quoted text the user can stash before opening chat), the
// "clearing chats" loading state + nonce that resets the drawer's
// conversation list, the live note context the system prompt reads at
// send-time, the apply-AI-edit path that swaps Milkdown's doc in place,
// and the two navigation hooks (open-as-note + navigate-to-note) the
// drawer fires from chat-thread rows. Pulled out of page.tsx as Step 11.
//
// The hook owns the mentioned-selection ref AND state — the ref is what
// `getChatNoteContext` reads at send-time (the system prompt needs to
// reflect the literal selection the user grabbed, not what's queued in
// React state), while the state drives the drawer's "Quoted: …" badge.
// `setChatMentionedSelection` writes both atomically.
//
// Two effects clear the mentioned selection:
//   1. when `chatOpen` flips back to false (closing the drawer should
//      not leave a dangling quote in the next open).
//   2. when `activeId` changes (switching notes invalidates the selection
//      since it pointed into the previous note's body).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteContext } from './useChat';
import type { MilkdownEditorApi } from '@/components/MilkdownEditor';
import type { NoteStore } from '@/lib/storage';
import { showToast } from '@/components/Toast';

export type UseChatWiringParams = {
  store: NoteStore;
  activeId: string | null;
  editingTitle: string;
  activeText: string;
  /** Folder list — getChatNoteContext threads it into the system prompt
   *  so the model can suggest folder paths that actually exist. */
  folders: string[];
  /** User-defined skills; surfaced in the system prompt so the model can
   *  call `load_skill` when a description matches the user's request. Empty
   *  array (or omit) when the vault has none. */
  skills?: { name: string; description: string }[];

  // --- Editor refs (read by getChatNoteContext + applyAiEdit) ---
  getMarkdownRef: React.MutableRefObject<(() => string) | null>;
  editorApiRef: React.MutableRefObject<MilkdownEditorApi | null>;
  editorReadyRef: React.MutableRefObject<boolean>;
  lastSavedRef: React.MutableRefObject<string>;

  // --- Lifecycle callbacks ---
  doSave: (id: string, body: string, opts?: { force?: boolean }) => Promise<void>;
  clearDirty: () => void;
  loadNotes: () => Promise<void>;
  selectNote: (id: string, opts?: { replace?: boolean }) => Promise<void>;

  // --- Page state setters ---
  setActiveText: React.Dispatch<React.SetStateAction<string>>;
  setEditorVersion: React.Dispatch<React.SetStateAction<number>>;

  // --- i18n ---
  tToast: (key: string, vars?: Record<string, string | number | Date>) => string;
};

export type UseChatWiringResult = {
  // --- State ---
  chatOpen: boolean;
  /** Exposed because usePaletteActions wires the toggle-chat row through
   *  setChatOpen and reads chatOpen for its label flip. */
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  chatClearing: boolean;
  chatResetNonce: number;
  chatMentionedSelection: string | null;
  // --- Mentioned-selection setters ---
  setChatMentionedSelection: (selection: string | null) => void;
  clearChatMentionedSelection: () => void;
  // --- Open/close + select wrappers ---
  toggleChat: () => void;
  closeChat: () => void;
  openChatWithSelection: (selection: string) => void;
  // --- Live note context for the chat system prompt ---
  getChatNoteContext: () => NoteContext;
  // --- Drawer-fired actions ---
  clearAllChats: () => Promise<void>;
  applyAiEdit: (newText: string) => Promise<void>;
  openChatAsNote: (noteId: string) => Promise<void>;
  navigateToChatNote: (noteId: string) => Promise<void>;
};

export function useChatWiring(params: UseChatWiringParams): UseChatWiringResult {
  const {
    store, activeId, editingTitle, activeText, folders, skills = [],
    getMarkdownRef, editorApiRef, editorReadyRef, lastSavedRef,
    doSave, clearDirty, loadNotes, selectNote,
    setActiveText, setEditorVersion,
    tToast,
  } = params;

  const [chatOpen, setChatOpen] = useState(false);
  const [chatClearing, setChatClearing] = useState(false);
  const [chatResetNonce, setChatResetNonce] = useState(0);
  const [chatMentionedSelection, setChatMentionedSelectionState] = useState<string | null>(null);
  const chatMentionedSelectionRef = useRef<string | null>(null);

  const setChatMentionedSelection = useCallback((selection: string | null) => {
    const next = selection?.trim() || null;
    chatMentionedSelectionRef.current = next;
    setChatMentionedSelectionState(next);
  }, []);

  const clearChatMentionedSelection = useCallback(() => {
    setChatMentionedSelection(null);
  }, [setChatMentionedSelection]);

  const toggleChat = useCallback(() => {
    setChatMentionedSelection(null);
    setChatOpen(v => !v);
  }, [setChatMentionedSelection]);

  const closeChat = useCallback(() => {
    setChatMentionedSelection(null);
    setChatOpen(false);
  }, [setChatMentionedSelection]);

  const openChatWithSelection = useCallback((selection: string) => {
    setChatMentionedSelection(selection);
    setChatOpen(true);
  }, [setChatMentionedSelection]);

  // Closing the drawer should not leave a dangling quote in the next open.
  useEffect(() => {
    if (!chatOpen) setChatMentionedSelection(null);
  }, [chatOpen, setChatMentionedSelection]);

  // Switching notes invalidates the selection — it pointed into the
  // previous note's body.
  useEffect(() => {
    setChatMentionedSelection(null);
  }, [activeId, setChatMentionedSelection]);

  // Resolved at send-time via a ref so the system prompt reflects live
  // editor state (typing between auto-saves hasn't updated activeText yet).
  const getChatNoteContext = useCallback((): NoteContext => {
    const liveText = (() => {
      try { return getMarkdownRef.current ? getMarkdownRef.current() : activeText; }
      catch { return activeText; }
    })();
    return {
      noteId: activeId,
      title: editingTitle || null,
      text: liveText || null,
      selection: chatMentionedSelectionRef.current,
      folders,
      skills,
    };
  }, [activeId, editingTitle, activeText, folders, skills, getMarkdownRef]);

  const clearAllChats = useCallback(async () => {
    setChatClearing(true);
    try {
      await store.clearAllChats();
      setChatResetNonce(v => v + 1);
    } finally {
      setChatClearing(false);
    }
  }, [store]);

  // Apply an AI-proposed edit without remounting the editor. Milkdown owns
  // the in-place doc replacement so it can scroll to and flash the changed
  // block instead of making the whole editor feel like it reloaded.
  const applyAiEdit = useCallback(async (newText: string) => {
    if (!activeId) throw new Error('No active note to edit.');
    await doSave(activeId, newText, { force: true });
    const replacedInEditor = editorApiRef.current?.replaceMarkdown(newText, { revealChange: true }) ?? false;
    lastSavedRef.current = replacedInEditor
      ? (getMarkdownRef.current?.() ?? newText)
      : newText;
    clearDirty();
    setActiveText(newText);
    if (!replacedInEditor) {
      editorReadyRef.current = false;
      getMarkdownRef.current = null;
      editorApiRef.current = null;
      setEditorVersion(v => v + 1);
    }
    showToast(tToast('editApplied'));
  }, [
    activeId, doSave, clearDirty, tToast,
    editorApiRef, editorReadyRef, getMarkdownRef, lastSavedRef,
    setActiveText, setEditorVersion,
  ]);

  const openChatAsNote = useCallback(async (noteId: string) => {
    // Refresh the note list so the newly promoted chat shows up immediately.
    await loadNotes();
    await selectNote(noteId);
    setChatOpen(false);
  }, [loadNotes, selectNote]);

  // Navigate to a thread's anchored note without closing the drawer — the
  // user opened a chat, so surface its subject automatically.
  const navigateToChatNote = useCallback(async (noteId: string) => {
    if (noteId === activeId) return;
    await selectNote(noteId);
  }, [activeId, selectNote]);

  return {
    chatOpen, setChatOpen,
    chatClearing, chatResetNonce,
    chatMentionedSelection,
    setChatMentionedSelection, clearChatMentionedSelection,
    toggleChat, closeChat, openChatWithSelection,
    getChatNoteContext,
    clearAllChats, applyAiEdit,
    openChatAsNote, navigateToChatNote,
  };
}
