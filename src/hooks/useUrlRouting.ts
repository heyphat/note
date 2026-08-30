'use client';

// Two-way binding between the URL path and the app's active note/template.
//
// Responsibilities:
//   - Boot restore: on first paint, read the URL and either open the note /
//     template it points to, fall back to the last-viewed note, or raise a
//     "not found" banner.
//   - `/new` handling: the URL action `/new?message=...` is queued through
//     `pendingUrlAction` so the folder-picker flow can pick it up once the
//     vault is ready.
//   - URL mirror: whenever `activeId` / `activeTemplate` changes, push (or
//     replace) the URL so bookmarking / sharing works and the browser's
//     back button walks through the notes you've visited.
//   - Popstate: browser back/forward moves the URL — mirror that back into
//     the active note state without pushing another history entry.
//
// Design: every URL write is gated on `nextUrlOpRef` so user-action paths
// (selectNote, openTemplate, wikilink click, palette pick, graph click)
// can opt into `push` right before they set state; every other path
// defaults to `replace` and won't spam the history stack.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { NoteMeta } from '@/lib/storage';
import {
  TEMPLATE_ROUTE_SEGMENT, TASKS_ROUTE_SEGMENT, SKILLS_ROUTE_SEGMENT,
  urlFromId, templateUrlFromId, taskUrlFromUuid, skillUrlFromUuid, routeFromPath, notesBasePath,
} from '@/lib/routing';
import { DEFAULT_NEW_NOTE_FOLDER } from '@/lib/title';

type PendingUrlAction = 'create-note' | null;

export type UseUrlRoutingParams = {
  storeReady: boolean;
  loading: boolean;
  needsDirPick: boolean;
  restoredLastOpened: boolean;
  setRestoredLastOpened: (v: boolean) => void;
  notes: NoteMeta[];
  activeId: string | null;
  activeTemplate: string | null;
  /** UUID of the currently-active skill, sourced from the SKILL.md `id:`
   *  field. Drives the `/skills/<uuid>` URL mirror. Null when no skill is
   *  active. Always paired with `openSkillByUuid` below — when one is set
   *  the other should be too. */
  activeSkillUuid: string | null;
  savedLastId: string | null;
  setActiveId: (id: string | null) => void;
  setActiveTemplate: (id: string | null) => void;
  /** Clear the active skill (used when popstate lands on the base route). */
  setActiveSkill: (id: string | null) => void;
  selectNote: (id: string, opts?: { replace?: boolean }) => Promise<void>;
  openTemplate: (id: string, opts?: { replace?: boolean }) => Promise<boolean>;
  /** Resolve a skill by its frontmatter UUID and open it. Returns false
   *  when no skill with that UUID exists. Optional — when omitted, skill
   *  URLs flip to not-found instead. */
  openSkillByUuid?: (uuid: string, opts?: { replace?: boolean }) => Promise<boolean>;
  createNoteInFolder: (
    folder: string | undefined,
    opts: { replaceUrl?: boolean; seedMessage?: string },
  ) => Promise<unknown>;
  /**
   * Shared hint ref for the URL-mirror effect. User-action paths flip to
   * 'push' right before they call setActiveId/setActiveTemplate; every
   * other path (boot restore, folder rename, tab-sync echo) gets 'replace'.
   *
   * The ref is owned by the caller (not the hook) because `selectNote` /
   * `openTemplate` are defined BEFORE the hook is called and need to write
   * to it — stable ref objects side-step that declaration-order constraint.
   */
  nextUrlOpRef: React.MutableRefObject<'push' | 'replace'>;
  /**
   * Resolve a task UUID for a given active note path. Returns `null` when
   * the path isn't a task or the task isn't in the index. Used by the URL
   * mirror to write `/tasks/<uuid>` instead of the raw `.assets/tasks/<base>`.
   * Optional — when omitted, task URLs are not produced.
   */
  taskUuidByPath?: (id: string) => string | null;
  /**
   * Resolve the task at the given UUID and open it (boot restore + popstate).
   * Returns `true` when opened, `false` when no task with that UUID exists
   * (so the caller can flip to "not found"). Optional — when omitted, the
   * task route falls through to "not found".
   */
  openTaskByUuid?: (uuid: string, opts?: { replace?: boolean }) => Promise<boolean>;
};

export type UseUrlRouting = {
  notFoundSlug: string | null;
  dismissNotFound: () => void;
  pendingUrlAction: PendingUrlAction;
  queuePendingCreate: () => void;
};

export function useUrlRouting(params: UseUrlRoutingParams): UseUrlRouting {
  const {
    storeReady, loading, needsDirPick,
    restoredLastOpened, setRestoredLastOpened,
    notes, activeId, activeTemplate, activeSkillUuid, savedLastId,
    setActiveId, setActiveTemplate, setActiveSkill,
    selectNote, openTemplate, createNoteInFolder,
    nextUrlOpRef,
    taskUuidByPath, openTaskByUuid,
    openSkillByUuid,
  } = params;

  const locale = useLocale();
  const tToast = useTranslations('toast');
  const [notFoundSlug, setNotFoundSlug] = useState<string | null>(null);
  const [pendingUrlAction, setPendingUrlAction] = useState<PendingUrlAction>(null);

  // Guards one-shot URL actions like `/new` so React dev effect replays
  // cannot create the same logical note twice.
  const pendingUrlActionRunRef = useRef<string | null>(null);
  // Carries the `?message=...` payload from `/new?message=...` through the
  // vault-ready gate so the pending-action effect can seed the new note.
  const pendingCreateMessageRef = useRef<string | null>(null);

  // Boot restore: open the note/template the URL points to (preferred) or
  // fall back to the last-viewed note id. A URL slug matching nothing flips
  // the not-found state instead of silently redirecting.
  useEffect(() => {
    if (!storeReady) return;
    if (loading || restoredLastOpened) return;
    if (needsDirPick) return;
    const requestedRoute = routeFromPath(window.location.pathname);
    if (requestedRoute.kind === 'new-note') {
      const rawMessage = new URLSearchParams(window.location.search).get('message');
      const message = rawMessage?.trim();
      pendingCreateMessageRef.current = message ? message : null;
      setPendingUrlAction('create-note');
      setNotFoundSlug(null);
      setRestoredLastOpened(true);
      return;
    }
    if (requestedRoute.kind === 'template') {
      let cancelled = false;
      void (async () => {
        // Boot restore: URL already matches the target state, so don't push
        // a redundant history entry.
        const opened = await openTemplate(requestedRoute.templateId, { replace: true });
        if (cancelled) return;
        if (!opened) setNotFoundSlug(`${TEMPLATE_ROUTE_SEGMENT}/${requestedRoute.templateId}`);
        setRestoredLastOpened(true);
      })();
      return () => { cancelled = true; };
    }
    if (requestedRoute.kind === 'task') {
      let cancelled = false;
      void (async () => {
        const opened = openTaskByUuid
          ? await openTaskByUuid(requestedRoute.taskUuid, { replace: true })
          : false;
        if (cancelled) return;
        if (!opened) setNotFoundSlug(`${TASKS_ROUTE_SEGMENT}/${requestedRoute.taskUuid}`);
        setRestoredLastOpened(true);
      })();
      return () => { cancelled = true; };
    }
    if (requestedRoute.kind === 'skill') {
      let cancelled = false;
      void (async () => {
        const opened = openSkillByUuid
          ? await openSkillByUuid(requestedRoute.skillUuid, { replace: true })
          : false;
        if (cancelled) return;
        if (!opened) setNotFoundSlug(`${SKILLS_ROUTE_SEGMENT}/${requestedRoute.skillUuid}`);
        setRestoredLastOpened(true);
      })();
      return () => { cancelled = true; };
    }
    let candidate: string | null = null;
    let slugMissed = false;
    if (requestedRoute.kind === 'note') {
      const match = notes.find(n => n.id === requestedRoute.slug)
        || notes.find(n => n.id === `${requestedRoute.slug}.md`);
      if (match) candidate = match.id;
      else slugMissed = true;
    }
    if (!candidate && !slugMissed && savedLastId && notes.some(n => n.id === savedLastId)) {
      candidate = savedLastId;
    }
    if (candidate) selectNote(candidate, { replace: true });
    if (slugMissed && requestedRoute.kind === 'note') setNotFoundSlug(requestedRoute.slug);
    setRestoredLastOpened(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, needsDirPick, notes, restoredLastOpened, savedLastId, storeReady]);

  // URL mirror. Only runs after boot restore so we never race with it. When
  // the URL was a not-found slug, leave it alone so the user sees what they
  // typed in the address bar.
  useEffect(() => {
    if (!restoredLastOpened) return;
    if (pendingUrlAction && !activeId && !activeTemplate && !activeSkillUuid) return;
    if (notFoundSlug && !activeId && !activeTemplate && !activeSkillUuid) return;
    // Task files get a UUID-keyed `/tasks/<uuid>` URL when the index can
    // resolve them, so the address bar doesn't expose `.assets/tasks/...`
    // and the URL survives renames. Falls back to the path-based form
    // when no UUID is found (e.g., index hasn't caught up yet).
    const taskUuid = activeId && taskUuidByPath ? taskUuidByPath(activeId) : null;
    const target = activeSkillUuid
      ? skillUrlFromUuid(activeSkillUuid, locale)
      : activeTemplate
        ? templateUrlFromId(activeTemplate, locale)
        : activeId
          ? (taskUuid ? taskUrlFromUuid(taskUuid, locale) : urlFromId(activeId, locale))
          : notesBasePath(locale);
    if (window.location.pathname !== target) {
      const op = nextUrlOpRef.current;
      nextUrlOpRef.current = 'replace'; // consume + reset to safe default
      if (op === 'push') window.history.pushState(null, '', target);
      else window.history.replaceState(null, '', target);
    }
  }, [activeId, activeTemplate, activeSkillUuid, restoredLastOpened, notFoundSlug, pendingUrlAction, nextUrlOpRef, locale, taskUuidByPath]);

  // Selecting any note/template/skill clears the not-found state.
  useEffect(() => {
    if (activeId || activeTemplate || activeSkillUuid) setNotFoundSlug(null);
  }, [activeId, activeTemplate, activeSkillUuid]);

  // Browser back/forward support. The mirror effect pushes a history entry
  // every time the user opens a note/template/base route; popstate is how
  // we catch the user walking through that stack. Both branches pass
  // `{ replace: true }` so the select calls don't push yet another entry.
  useEffect(() => {
    if (!restoredLastOpened) return;
    const onPop = () => {
      const route = routeFromPath(window.location.pathname);
      if (route.kind === 'template') {
        if (route.templateId !== activeTemplate) {
          void openTemplate(route.templateId, { replace: true });
        }
        return;
      }
      if (route.kind === 'task') {
        // Compare against whatever uuid the current activeId resolves to —
        // skip the open if it's already the same task so we don't double-load.
        const currentUuid = activeId && taskUuidByPath ? taskUuidByPath(activeId) : null;
        if (route.taskUuid !== currentUuid && openTaskByUuid) {
          void openTaskByUuid(route.taskUuid, { replace: true });
        }
        return;
      }
      if (route.kind === 'skill') {
        if (route.skillUuid !== activeSkillUuid && openSkillByUuid) {
          void openSkillByUuid(route.skillUuid, { replace: true });
        }
        return;
      }
      if (route.kind === 'note') {
        const hit = notes.find(n => n.id === route.slug)
          || notes.find(n => n.id === `${route.slug}.md`);
        if (hit && hit.id !== activeId) {
          void selectNote(hit.id, { replace: true });
        }
        return;
      }
      if (route.kind === 'base') {
        // Landed on the base URL — clear any active selection. The URL
        // mirror will see pathname === target and skip any write.
        if (activeId || activeTemplate || activeSkillUuid) {
          setActiveId(null);
          setActiveTemplate(null);
          setActiveSkill(null);
        }
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [notes, activeId, activeTemplate, activeSkillUuid, selectNote, openTemplate, restoredLastOpened, setActiveId, setActiveTemplate, setActiveSkill, taskUuidByPath, openTaskByUuid, openSkillByUuid]);

  // Deferred `/new` creation. Runs once the vault is ready — we picked the
  // folder, loaded the list, no picker screen in the way. The ref guard
  // ensures React's dev-mode double-effect doesn't create two notes.
  useEffect(() => {
    if (!storeReady) return;
    if (pendingUrlAction !== 'create-note') return;
    if (loading || needsDirPick) return;
    const runKey = `${pendingUrlAction}:${window.location.pathname}`;
    if (pendingUrlActionRunRef.current === runKey) return;
    pendingUrlActionRunRef.current = runKey;
    setPendingUrlAction(null);
    const seedMessage = pendingCreateMessageRef.current ?? undefined;
    pendingCreateMessageRef.current = null;
    let cancelled = false;
    (async () => {
      try {
        await createNoteInFolder(DEFAULT_NEW_NOTE_FOLDER, { replaceUrl: true, seedMessage });
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          window.alert(tToast('couldNotCreateNote', { error: msg }));
        }
      } finally {
        pendingUrlActionRunRef.current = null;
      }
    })();
    return () => { cancelled = true; };
  }, [createNoteInFolder, loading, needsDirPick, pendingUrlAction, storeReady, tToast]);

  const dismissNotFound = useCallback(() => {
    setNotFoundSlug(null);
    window.history.replaceState(null, '', notesBasePath(locale));
  }, [locale]);

  const queuePendingCreate = useCallback(() => {
    setPendingUrlAction('create-note');
  }, []);

  return { notFoundSlug, dismissNotFound, pendingUrlAction, queuePendingCreate };
}
