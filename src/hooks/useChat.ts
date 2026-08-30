'use client';

// Chat thread lifecycle hook. Owns the in-memory message list for the
// active thread, handles provider streaming, and writes back to the vault
// after each turn so the `.assets/chats/{id}.md` file stays the source of
// truth. The hook is per-thread; the parent decides which thread is active
// (either "most recent for this note" or "new one") and feeds its id here.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatTurn, ChatMeta, NoteStore, ChatEdit } from '@/lib/storage';
import { buildSystemPrompt, type PriorToolFailure } from '@/lib/ai/prompt';
import { chatStream } from '@/lib/ai/stream';
import { applyProposedEdit, type CreateNoteInput, type ManageTasksInput, type McpCallInput } from '@/lib/ai/tools';
import type { ReadOnlyToolExecutor } from '@/lib/ai/stream';
import { collectNoteImages } from '@/lib/ai/images';
import { preparePriceChartAiContext } from '@/lib/ai/price-chart-snapshots';
import { collectChatAttachments, type ResolvedAttachment } from '@/lib/ai/attachments';
import { extractPdfText } from '@/lib/ai/pdf-text';
import { resolveMentions, buildMentionsPromptSection } from '@/lib/ai/mentions';
import type { ProviderAttachment } from '@/lib/ai/stream';
import {
  getActiveSelection, getApiKey, hasConfiguredKey, ChatProviderError,
  type ActiveSelection,
} from '@/lib/ai';

export type SendStatus = 'idle' | 'streaming' | 'error';

export interface NoteContext {
  noteId?: string | null;
  title?: string | null;
  text?: string | null;
  selection?: string | null;
  /** Folder paths in the vault, for the model's create_note targeting. */
  folders?: string[] | null;
  /** User-defined skills surfaced to the model in the "Available skills" section. */
  skills?: { name: string; description: string }[] | null;
}

export interface UseChatOpts {
  store: NoteStore | null;
  chatId: string | null;
  /** Called at send-time so the system prompt reflects the latest editor state. */
  getContext: () => NoteContext;
  /**
   * Apply a proposed edit to the current note. Returns the new full note
   * text on success or throws with a user-facing message on failure.
   * Provided by the parent — the hook doesn't know how to write to the
   * note store itself since it doesn't know which note is "active".
   */
  onApplyEdit?: (newText: string) => Promise<void> | void;
  /**
   * Apply a proposed `create_note` by writing a new file to the vault.
   * Provided by the parent so it can also refresh the sidebar / select the
   * new note. Throws with a user-facing message on failure.
   */
  onCreateNote?: (input: CreateNoteInput) => Promise<void> | void;
  /**
   * Apply a proposed task mutation by routing it through the task store.
   */
  onManageTasks?: (input: ManageTasksInput) => Promise<void> | void;
  /**
   * Auto-execute a read-only tool (`search_vault`, `search_tasks`, plus any
   * MCP tool flagged `readOnlyHint`) and return the stringified result the
   * model will see in its next turn. When omitted the tool call is silently
   * dropped — useful for environments where the relevant index isn't ready
   * yet.
   */
  onReadOnlyTool?: ReadOnlyToolExecutor;
  /**
   * Execute a non-read-only MCP tool after the user clicks Apply on its
   * proposal card. Returns the textual result we surface back in the UI
   * (and feed to the model on the next turn). Throws with a user-facing
   * message on failure.
   */
  onMcpCall?: (input: McpCallInput) => Promise<string>;
}

const MAX_SELECTION_CHARS = 2_000;

export type PendingEdit = ChatEdit & {
  /** Preview of the resulting full note text, for the diff card. */
  preview?: string;
};

export interface UseChatResult {
  messages: ChatTurn[];
  meta: ChatMeta | null;
  status: SendStatus;
  error: string | null;
  /** Partial assistant reply being streamed (not yet persisted). */
  pending: string;
  /** Synthetic assistant message rendered while the stream is live. */
  streamingMessage: ChatTurn | null;
  /** Missing API key for the active provider. UI surfaces a settings nudge. */
  missingKey: boolean;
  /** Proposed edits from the assistant, in call order. */
  pendingEdits: PendingEdit[];
  send: (content: string, opts?: { attachments?: ResolvedAttachment[] }) => Promise<void>;
  stop: () => void;
  applyEdit: (toolCallId: string) => Promise<void>;
  rejectEdit: (toolCallId: string) => void;
  dismissEdit: (toolCallId: string) => void;
}

export function useChat(opts: UseChatOpts): UseChatResult {
  const { store, chatId, getContext, onApplyEdit, onCreateNote, onManageTasks, onReadOnlyTool, onMcpCall } = opts;
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [meta, setMeta] = useState<ChatMeta | null>(null);
  const [status, setStatus] = useState<SendStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState('');
  const [streamingMessage, setStreamingMessage] = useState<ChatTurn | null>(null);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [active, setActive] = useState<ActiveSelection>(() => getActiveSelection());
  const abortRef = useRef<AbortController | null>(null);
  const getContextRef = useRef(getContext);
  const onApplyEditRef = useRef(onApplyEdit);
  const onCreateNoteRef = useRef(onCreateNote);
  const onManageTasksRef = useRef(onManageTasks);
  const onReadOnlyToolRef = useRef(onReadOnlyTool);
  const onMcpCallRef = useRef(onMcpCall);
  const mountedRef = useRef(true);
  const currentStoreRef = useRef(store);
  const currentChatIdRef = useRef(chatId);
  const messagesRef = useRef(messages);
  const activeRef = useRef(active);
  const pendingEditsRef = useRef(pendingEdits);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  currentStoreRef.current = store;
  currentChatIdRef.current = chatId;
  messagesRef.current = messages;
  activeRef.current = active;
  pendingEditsRef.current = pendingEdits;
  useEffect(() => { getContextRef.current = getContext; }, [getContext]);
  useEffect(() => { onApplyEditRef.current = onApplyEdit; }, [onApplyEdit]);
  useEffect(() => { onCreateNoteRef.current = onCreateNote; }, [onCreateNote]);
  useEffect(() => { onManageTasksRef.current = onManageTasks; }, [onManageTasks]);
  useEffect(() => { onReadOnlyToolRef.current = onReadOnlyTool; }, [onReadOnlyTool]);
  useEffect(() => { onMcpCallRef.current = onMcpCall; }, [onMcpCall]);

  const syncPendingEdits = useCallback((
    nextOrUpdater: PendingEdit[] | ((prev: PendingEdit[]) => PendingEdit[]),
  ): PendingEdit[] => {
    const next = typeof nextOrUpdater === 'function'
      ? nextOrUpdater(pendingEditsRef.current)
      : nextOrUpdater;
    pendingEditsRef.current = next;
    setPendingEdits(next);
    return next;
  }, []);

  const queueSave = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const next = saveQueueRef.current.then(task, task);
    saveQueueRef.current = next.then(() => undefined, () => undefined);
    return next;
  }, []);

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
    // React 18 StrictMode mounts, cleans up, then mounts again in dev.
    // Reset the flag on every mount so live stream chunks are not dropped
    // for the rest of the component lifetime after the first probe cleanup.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // Load thread from disk whenever the chatId or store changes. A null id
  // resets state to empty (common right after the parent decides to create
  // a new thread but hasn't landed the id yet).
  useEffect(() => {
    let cancelled = false;
    // Switching threads/store invalidates any in-flight stream. The old
    // request may still persist to disk, but it must stop mutating the
    // newly selected thread's UI state.
    abortRef.current?.abort();
    abortRef.current = null;
    if (!store || !chatId) {
      setMessages([]);
      setMeta(null);
      setPending('');
      setStreamingMessage(null);
      syncPendingEdits([]);
      setError(null);
      setStatus('idle');
      return;
    }
    (async () => {
      const full = await store.getChat(chatId);
      if (cancelled) return;
      if (full) {
        setMessages(full.messages);
        setMeta({ ...full });
        syncPendingEdits((full.edits ?? []).map(toPendingEdit));
      } else {
        setMessages([]);
        setMeta(null);
        syncPendingEdits([]);
      }
      setPending('');
      setStreamingMessage(null);
      setError(null);
      setStatus('idle');
    })();
    return () => { cancelled = true; };
  }, [store, chatId, syncPendingEdits]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const send = useCallback(async (content: string, sendOpts?: { attachments?: ResolvedAttachment[] }) => {
    if (!store || !chatId) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    if (!hasConfiguredKey(active.providerId)) {
      setError('No API key configured for the active provider. Open settings to add one.');
      setStatus('error');
      return;
    }

    const apiKey = getApiKey(active.providerId);
    const nextMessages: ChatTurn[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setPending('');
    setStreamingMessage({ role: 'assistant', content: '' });
    setError(null);
    setStatus('streaming');
    // Capture errored edits BEFORE the sweep so we can feed the failures
    // back to the model on this turn. Without this hand-off the AI re-emits
    // the same broken `find` string instead of self-correcting.
    const recentFailures: PriorToolFailure[] = pendingEditsRef.current
      .filter(e => e.status === 'error' && e.toolName !== 'mcp_call')
      .map(toPriorToolFailure);
    // Sweep stale edit cards (applied/rejected/errored) on every new send
    // so yesterday's failed proposal doesn't clutter today's conversation.
    // Still-pending proposals survive — the user may want to Apply one
    // while asking a follow-up question.
    syncPendingEdits(prev => prev.filter(e => e.status === 'pending'));

    const controller = new AbortController();
    abortRef.current = controller;
    const isCurrentRequest = () => (
      mountedRef.current
      && currentStoreRef.current === store
      && currentChatIdRef.current === chatId
      // Successful requests clear abortRef before the final persist path
      // runs. Treat that "finished cleanly" state as current too so the
      // completed assistant turn syncs into React instead of only landing
      // on disk and appearing after a manual refresh.
      && (abortRef.current === controller || (abortRef.current === null && !controller.signal.aborted))
    );

    const ctx = getContextRef.current();
    const requestMessages = attachSelectionToLatestUserMessage(nextMessages, ctx.selection);
    // Edit/rewrite tools need an active note to mutate; create_note doesn't.
    // Either handler being present is enough to advertise the tool registry —
    // the tool descriptions themselves steer the model toward the right one.
    const withEditTools = (!!onApplyEditRef.current && !!ctx.noteId) || !!onCreateNoteRef.current || !!onManageTasksRef.current;
    let full = '';
    let sawToolCall = false;
    try {
      // Convert huge price-chart CSV blocks to compact prompt summaries and
      // generated chart images before the provider request is assembled.
      const [priceChartContext, noteImages, mentions] = await Promise.all([
        preparePriceChartAiContext(ctx.text),
        collectNoteImages(store, ctx.noteId, ctx.text),
        // Resolve `[[noteId]]` mentions in the latest user turn so the model
        // has the referenced bodies in scope, not just the link text. Skip
        // the active note since its content is already in the system prompt.
        resolveMentions(store, trimmed, ctx.noteId ?? null),
      ]);
      const sys = buildSystemPrompt({
        noteId: ctx.noteId,
        title: ctx.title,
        text: priceChartContext.text,
        selection: ctx.selection,
        folders: ctx.folders,
        skills: ctx.skills,
      }, { withEditTools, recentFailures });
      const images = [...noteImages, ...priceChartContext.images];
      const mentionsAddendum = buildMentionsPromptSection(mentions);

      // Collect chat attachments (images + PDFs) for the latest user turn.
      // Prefer the in-memory bytes the drawer just uploaded; fall back to
      // re-reading from disk so reloaded threads keep working when the user
      // asks a follow-up that re-references prior files.
      const dropped = sendOpts?.attachments ?? [];
      const collected: ResolvedAttachment[] = dropped.length > 0
        ? dropped
        : await collectChatAttachments(store, chatId, trimmed);

      // OpenAI doesn't accept PDF binary parts via chat-completions in
      // browser. Extract text client-side and append it to the system
      // prompt so the model still has the content. Drop those PDFs from
      // the wire payload.
      let systemAddendum = '';
      let attachmentsForWire: ResolvedAttachment[] = collected;
      if (active.providerId === 'openai') {
        const pdfs = collected.filter(a => a.kind === 'pdf');
        if (pdfs.length > 0) {
          const blocks: string[] = [];
          for (const pdf of pdfs) {
            try {
              const text = await extractPdfText(pdf.bytes);
              if (text.trim()) {
                blocks.push(`### Extracted from \`${pdf.filename}\`\n\n${text}`);
              }
            } catch {
              blocks.push(`### Could not extract \`${pdf.filename}\`\n\nThe PDF could not be read client-side.`);
            }
          }
          if (blocks.length > 0) {
            systemAddendum = `\n\n## Attached PDFs (extracted text)\n\n${blocks.join('\n\n')}`;
          }
          attachmentsForWire = collected.filter(a => a.kind !== 'pdf');
        }
      }

      // Text attachments are already inlined in the message body, so they
      // never go on the wire as binary parts. Only images and PDFs do.
      const providerAttachments: ProviderAttachment[] = attachmentsForWire
        .filter(att => att.kind === 'image' || att.kind === 'pdf')
        .map(att => ({
          kind: att.kind as 'image' | 'pdf',
          bytes: att.bytes,
          mimeType: att.mimeType,
          filename: att.filename,
        }));

      const result = await chatStream({
        providerId: active.providerId,
        model: active.model,
        apiKey,
        system: `${sys}${mentionsAddendum}${systemAddendum}`,
        messages: requestMessages,
        signal: controller.signal,
        withEditTools,
        images,
        attachments: providerAttachments,
        // search_vault is auto-executed; the agentic loop in chatStream
        // re-streams a follow-up turn with the result so the model can
        // ground its answer in real notes. Mutating proposals still come
        // back through onProposedEdit for human approval.
        executeReadOnlyTool: onReadOnlyToolRef.current
          ? (toolName: string, input: unknown) => onReadOnlyToolRef.current!(toolName, input)
          : undefined,
        onDelta: (chunk) => {
          full += chunk;
          if (!isCurrentRequest()) return;
          setPending(prev => prev + chunk);
          setStreamingMessage(prev => ({
            role: 'assistant',
            content: `${prev?.content ?? ''}${chunk}`,
          }));
        },
        onProposedEdit: (edit) => {
          sawToolCall = true;
          if (!isCurrentRequest()) return;
          // For edit_note / rewrite_note, resolve the preview against the
          // live note text so the UI can render a diff without re-reading
          // the store. create_note has no in-place preview — its card
          // renders the title + folder + content directly from the input.
          let preview: string | undefined;
          let errMsg: string | undefined;
          if (edit.toolName === 'edit_note' || edit.toolName === 'rewrite_note') {
            const originalText = getContextRef.current().text || '';
            try { preview = applyProposedEdit(originalText, edit); }
            catch (err) { errMsg = err instanceof Error ? err.message : String(err); }
          }
          syncPendingEdits(prev => [...prev, {
            ...edit,
            status: errMsg ? 'error' : 'pending',
            error: errMsg,
            preview,
          }]);
        },
      });
      full = result.fullText;
    } catch (err) {
      if (controller.signal.aborted) {
        // User hit stop — persist whatever did arrive so the partial reply
        // isn't lost.
        if (full.trim()) {
          const withAssistant: ChatTurn[] = [...nextMessages, { role: 'assistant', content: full }];
          await persist(
            store,
            chatId,
            withAssistant,
            toStoredEdits(pendingEditsRef.current),
            ctx,
            activeRef.current,
            queueSave,
            setMessages,
            setMeta,
            isCurrentRequest,
          );
        } else {
          await persist(
            store,
            chatId,
            nextMessages,
            toStoredEdits(pendingEditsRef.current),
            ctx,
            activeRef.current,
            queueSave,
            setMessages,
            setMeta,
            isCurrentRequest,
          );
        }
        if (isCurrentRequest()) {
          setPending('');
          setStreamingMessage(null);
          setStatus('idle');
        }
        return;
      }
      const msg = err instanceof ChatProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown error';
      if (isCurrentRequest()) {
        setError(msg);
        setStatus('error');
      }
      // Still save the user's turn so they don't re-type it.
      await persist(
        store,
        chatId,
        nextMessages,
        toStoredEdits(pendingEditsRef.current),
        ctx,
        activeRef.current,
        queueSave,
        setMessages,
        setMeta,
        isCurrentRequest,
      );
      if (isCurrentRequest()) {
        setPending('');
        setStreamingMessage(null);
      }
      return;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }

    // If the model only emitted tool calls with no text, save a
    // placeholder so the thread has a visible assistant turn on reload.
    const assistantText = full.trim().length === 0 && sawToolCall
      ? '_(proposed an edit to the note)_'
      : full;
    const withAssistant: ChatTurn[] = [...nextMessages, { role: 'assistant', content: assistantText }];
    await persist(
      store,
      chatId,
      withAssistant,
      toStoredEdits(pendingEditsRef.current),
      ctx,
      activeRef.current,
      queueSave,
      setMessages,
      setMeta,
      isCurrentRequest,
    );
    if (isCurrentRequest()) {
      setPending('');
      setStreamingMessage(null);
      setStatus('idle');
    }
  }, [store, chatId, messages, active.model, active.providerId, queueSave, syncPendingEdits]);

  const applyEdit = useCallback(async (toolCallId: string) => {
    const edit = pendingEditsRef.current.find(e => e.toolCallId === toolCallId);
    if (!edit || edit.status !== 'pending') return;

    // create_note has its own apply path — it writes a brand-new file via
    // the parent-supplied handler instead of patching the active note.
    if (edit.toolName === 'create_note') {
      const createHandler = onCreateNoteRef.current;
      if (!createHandler) {
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'error', error: 'No create handler configured.' }
          : e));
        void persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
        );
        return;
      }
      try {
        await createHandler(edit.input);
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'applied' }
          : e));
        await persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
          () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
        );
      } catch (err) {
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'error', error: err instanceof Error ? err.message : String(err) }
          : e));
        await persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
          () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
        );
      }
      return;
    }

    if (edit.toolName === 'mcp_call') {
      const mcpHandler = onMcpCallRef.current;
      if (!mcpHandler) {
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'error', error: 'No MCP handler configured.' }
          : e));
        void persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
        );
        return;
      }
      try {
        await mcpHandler(edit.input);
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'applied' }
          : e));
        await persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
          () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
        );
      } catch (err) {
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'error', error: err instanceof Error ? err.message : String(err) }
          : e));
        await persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
          () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
        );
      }
      return;
    }

    if (edit.toolName === 'manage_tasks') {
      const taskHandler = onManageTasksRef.current;
      if (!taskHandler) {
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'error', error: 'No task handler configured.' }
          : e));
        void persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
        );
        return;
      }
      try {
        await taskHandler(edit.input);
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'applied' }
          : e));
        await persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
          () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
        );
      } catch (err) {
        const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
          ? { ...e, status: 'error', error: err instanceof Error ? err.message : String(err) }
          : e));
        await persistEditState(
          store, chatId, messagesRef.current, toStoredEdits(nextEdits),
          getContextRef.current(), activeRef.current, queueSave, setMeta,
          () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
        );
      }
      return;
    }

    const handler = onApplyEditRef.current;
    if (!handler) {
      const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
        ? { ...e, status: 'error', error: 'No edit handler configured.' }
        : e));
      void persistEditState(
        store,
        chatId,
        messagesRef.current,
        toStoredEdits(nextEdits),
        getContextRef.current(),
        activeRef.current,
        queueSave,
        setMeta,
      );
      return;
    }
    // Re-resolve against the live note in case the user typed between
    // the proposal and the click. If it no longer applies cleanly,
    // surface the error instead of silently corrupting the note.
    const originalText = getContextRef.current().text || '';
    let newText: string;
    try { newText = applyProposedEdit(originalText, edit); }
    catch (err) {
      const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
        ? { ...e, status: 'error', error: err instanceof Error ? err.message : String(err) }
        : e));
      void persistEditState(
        store,
        chatId,
        messagesRef.current,
        toStoredEdits(nextEdits),
        getContextRef.current(),
        activeRef.current,
        queueSave,
        setMeta,
      );
      return;
    }
    try {
      await handler(newText);
      const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
        ? { ...e, status: 'applied' }
        : e));
      await persistEditState(
        store,
        chatId,
        messagesRef.current,
        toStoredEdits(nextEdits),
        getContextRef.current(),
        activeRef.current,
        queueSave,
        setMeta,
        () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
      );
    } catch (err) {
      const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
        ? { ...e, status: 'error', error: err instanceof Error ? err.message : String(err) }
        : e));
      await persistEditState(
        store,
        chatId,
        messagesRef.current,
        toStoredEdits(nextEdits),
        getContextRef.current(),
        activeRef.current,
        queueSave,
        setMeta,
        () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
      );
    }
  }, [chatId, queueSave, store, syncPendingEdits]);

  const rejectEdit = useCallback((toolCallId: string) => {
    const nextEdits = syncPendingEdits(prev => prev.map(e => e.toolCallId === toolCallId
      ? { ...e, status: 'rejected' }
      : e));
    void persistEditState(
      store,
      chatId,
      messagesRef.current,
      toStoredEdits(nextEdits),
      getContextRef.current(),
      activeRef.current,
      queueSave,
      setMeta,
      () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
    );
  }, [chatId, queueSave, store, syncPendingEdits]);

  const dismissEdit = useCallback((toolCallId: string) => {
    const nextEdits = syncPendingEdits(prev => prev.filter(e => e.toolCallId !== toolCallId));
    void persistEditState(
      store,
      chatId,
      messagesRef.current,
      toStoredEdits(nextEdits),
      getContextRef.current(),
      activeRef.current,
      queueSave,
      setMeta,
      () => mountedRef.current && currentStoreRef.current === store && currentChatIdRef.current === chatId,
    );
  }, [chatId, queueSave, store, syncPendingEdits]);

  return {
    messages,
    meta,
    status,
    error,
    pending,
    streamingMessage,
    missingKey: !hasConfiguredKey(active.providerId),
    pendingEdits,
    send,
    stop,
    applyEdit,
    rejectEdit,
    dismissEdit,
  };
}

async function persist(
  store: NoteStore,
  chatId: string,
  messages: ChatTurn[],
  edits: ChatEdit[],
  ctx: NoteContext,
  active: ActiveSelection,
  queueSave: <T>(task: () => Promise<T>) => Promise<T>,
  setMessages: (m: ChatTurn[]) => void,
  setMeta: (m: ChatMeta | null) => void,
  shouldSyncState?: () => boolean,
) {
  const title = deriveTitle(messages, ctx.title);
  const saved = await queueSave(() => store.saveChatMessages(chatId, messages, {
    title,
    provider: active.providerId,
    model: active.model,
    edits,
  }));
  if (shouldSyncState && !shouldSyncState()) return;
  setMessages(messages);
  setMeta(saved);
}

async function persistEditState(
  store: NoteStore | null,
  chatId: string | null,
  messages: ChatTurn[],
  edits: ChatEdit[],
  ctx: NoteContext,
  active: ActiveSelection,
  queueSave: <T>(task: () => Promise<T>) => Promise<T>,
  setMeta: (m: ChatMeta | null) => void,
  shouldSyncState?: () => boolean,
) {
  if (!store || !chatId) return;
  const title = deriveTitle(messages, ctx.title);
  const saved = await queueSave(() => store.saveChatMessages(chatId, messages, {
    title,
    provider: active.providerId,
    model: active.model,
    edits,
  }));
  if (shouldSyncState && !shouldSyncState()) return;
  setMeta(saved);
}

function attachSelectionToLatestUserMessage(messages: ChatTurn[], selection?: string | null): ChatTurn[] {
  const selected = selection?.trim();
  if (!selected) return messages;

  const lastUserIndex = [...messages].reverse().findIndex(message => message.role === 'user');
  if (lastUserIndex < 0) return messages;
  const index = messages.length - 1 - lastUserIndex;
  const target = messages[index];
  if (!target || target.role !== 'user') return messages;
  if (contentIncludesSelection(target.content, selected)) return messages;

  const clipped = selected.length > MAX_SELECTION_CHARS
    ? `${selected.slice(0, MAX_SELECTION_CHARS)}\n\n[… truncated: original is ${selected.length.toLocaleString()} characters]`
    : selected;
  const content = [
    'The user clicked "Ask AI" on this highlighted selection. Treat it as the primary context for their question unless they say otherwise.',
    '',
    '## Highlighted selection',
    '```markdown',
    clipped,
    '```',
    '',
    '## User question',
    target.content,
  ].join('\n');

  return messages.map((message, i) => (
    i === index ? { ...message, content } : message
  ));
}

function toPendingEdit(edit: ChatEdit): PendingEdit {
  return { ...edit };
}

function toStoredEdits(edits: PendingEdit[]): ChatEdit[] {
  return edits.map((edit) => {
    const { preview, ...stored } = edit;
    void preview;
    return stored;
  });
}

function toPriorToolFailure(edit: PendingEdit): PriorToolFailure {
  const error = edit.error ?? 'Unknown error.';
  if (edit.toolName === 'edit_note') {
    return { toolName: 'edit_note', error, input: edit.input };
  }
  if (edit.toolName === 'rewrite_note') {
    return { toolName: 'rewrite_note', error, input: edit.input };
  }
  if (edit.toolName === 'create_note') {
    return { toolName: 'create_note', error, input: edit.input };
  }
  if (edit.toolName === 'manage_tasks') {
    return { toolName: 'manage_tasks', error, input: edit.input };
  }
  // `mcp_call` failures are filtered out by the caller — they don't fit the
  // PriorToolFailure shape and the system prompt's failure section is
  // tailored to built-in tools. Fall through to a safe default.
  return { toolName: 'manage_tasks', error, input: edit.input };
}

// Auto-title a thread from its turns. Greetings like "hey" / "hi" don't
// describe the conversation, so we look for the first *substantive* user
// message (long enough to be a real question or prompt). If none exists
// yet, we fall back to a note + date label so the thread list stays
// scannable. The title is re-derived on every persist, so a thread that
// started with "hey" upgrades itself to a real title once the user asks
// their actual question.
export function deriveTitle(messages: ChatTurn[], noteTitle?: string | null): string | undefined {
  const substantive = messages.find(m => m.role === 'user' && isSubstantive(titleSourceFromMessage(m.content)));
  if (substantive) {
    return shortenForTitle(titleSourceFromMessage(substantive.content));
  }
  const today = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (noteTitle) return `${noteTitle} · ${today}`;
  return `Chat · ${today}`;
}

function titleSourceFromMessage(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith('>')) return content;
  const separatorIndex = trimmed.indexOf('\n\n');
  if (separatorIndex < 0) return content;
  const quoteBlock = trimmed.slice(0, separatorIndex);
  if (quoteBlock.split('\n').some(line => !/^>\s?/.test(line))) return content;
  const question = trimmed.slice(separatorIndex + 2).trim();
  return question || content;
}

function contentIncludesSelection(content: string, selection: string): boolean {
  if (content.includes(selection)) return true;
  const quotedSelection = selection
    .trim()
    .split(/\r?\n/)
    .map(line => `> ${line}`)
    .join('\n');
  return content.includes(quotedSelection);
}

const GREETING_ONLY = /^(hey|hi+|hello|sup|yo+|hola|hiya|howdy|thanks?|ty|ok(ay)?|cool|nice|great|works?|done|got it|sure)[\s.!?]*$/i;

// A message is "substantive" if it's long enough and isn't a pure filler.
// Thresholds are tuned so "what does this note mean?" counts but "hey" and
// "ok thanks" do not.
function isSubstantive(content: string): boolean {
  const text = content.trim();
  if (text.length < 12) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  if (GREETING_ONLY.test(text)) return false;
  return true;
}

function shortenForTitle(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  // Prefer cutting at a natural boundary (end of first sentence) when it's
  // shorter than the hard cap — makes titles read as complete thoughts.
  const sentenceEnd = oneLine.search(/[.!?](\s|$)/);
  const MAX = 60;
  if (sentenceEnd > 0 && sentenceEnd + 1 <= MAX) {
    return oneLine.slice(0, sentenceEnd + 1);
  }
  if (oneLine.length <= MAX) return oneLine;
  return `${oneLine.slice(0, MAX)}…`;
}
