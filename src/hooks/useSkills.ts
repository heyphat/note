'use client';

// Skill list + editor lifecycle. Skills live under `.assets/skills/` and are
// hidden from the regular note tree, but they open into the main editor just
// like templates: click a row in the sidebar → body loads in Milkdown, title
// input renames the frontmatter `name`, autosave dispatches to
// `store.saveSkill` (see the skill branches in useNoteAutosave).
//
// The hook is structured like useTemplates: it threads a fat ref bag from
// useNoteAutosave (lastSavedRef, getMarkdownRef, etc.) so the editor's live
// body can be flushed before a skill switch. The shared refs are the
// integration contract — the editor itself doesn't know which mode
// (note / template / skill) is active.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  NoteStore, SkillMeta, SkillFull, NoteMeta, NoteRevision,
} from '@/lib/storage';
import type { SaveStatus } from './useNoteAutosave';
import type { TocHeading } from '@/components/TableOfContents';

export interface UseSkillsParams {
  store: NoteStore;
  storeReady: boolean;
  // --- Active selection (page-owned because useNoteAutosave reads it too) ---
  activeSkill: string | null;
  setActiveSkill: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveSkillDescription: React.Dispatch<React.SetStateAction<string>>;
  /** Source of truth for every frontmatter key on the active skill. The
   *  properties panel reads + writes this map; persistence happens in
   *  `saveSkillFrontmatter`. */
  setActiveSkillFrontmatter: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  /** Frontmatter UUID for the active skill — drives `/skills/<uuid>` URL.
   *  Generated lazily on first open by `ensureSkillUuid` in the store. */
  setActiveSkillUuid: React.Dispatch<React.SetStateAction<string | null>>;
  /** Page-owned hint ref for the URL-mirror effect. User-action paths
   *  (sidebar click) flip to 'push' here so the address-bar entry lands in
   *  history; boot restore + popstate pass `{ replace: true }` to keep
   *  'replace'. */
  nextUrlOpRef: React.MutableRefObject<'push' | 'replace'>;
  // --- Editor refs from useNoteAutosave ---
  getMarkdownRef: React.MutableRefObject<(() => string) | null>;
  lastSavedRef: React.MutableRefObject<string>;
  lastSavedTitleRef: React.MutableRefObject<string>;
  activeRevisionRef: React.MutableRefObject<NoteRevision | null>;
  editorReadyRef: React.MutableRefObject<boolean>;
  titleSaveTimerRef: React.MutableRefObject<number | null>;
  // --- Callbacks from useNoteAutosave ---
  flushSave: (opts?: { force?: boolean }) => Promise<void>;
  flushTitleSave: () => Promise<void>;
  showSaved: () => void;
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>;
  // --- Page state setters ---
  setNotes: React.Dispatch<React.SetStateAction<NoteMeta[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveUuid: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTemplate: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveText: React.Dispatch<React.SetStateAction<string>>;
  setEditingTitle: React.Dispatch<React.SetStateAction<string>>;
  setEditorVersion: React.Dispatch<React.SetStateAction<number>>;
  setTocHeadings: React.Dispatch<React.SetStateAction<TocHeading[]>>;
  // --- Shared ref written by us, read by useNoteAutosave (skill rename
  //     branch on the title-autosave path). Same cycle-breaking trick as
  //     `renameTemplateRef`. */
  renameSkillRef: React.MutableRefObject<(skillId: string, newName: string) => Promise<void>>;
}

export interface UseSkillsResult {
  skills: SkillMeta[];
  setSkills: React.Dispatch<React.SetStateAction<SkillMeta[]>>;
  refreshSkills: () => Promise<void>;
  openSkill: (skillId: string, opts?: { replace?: boolean }) => Promise<boolean>;
  /** Open a skill by its frontmatter UUID — used by URL routing
   *  (`/skills/<uuid>` boot restore + popstate). */
  openSkillByUuid: (uuid: string, opts?: { replace?: boolean }) => Promise<boolean>;
  handleDeleteSkill: (skillId: string) => Promise<void>;
  handleRenameSkill: (skillId: string, newName: string) => Promise<void>;
  /** Patch the skill's description (frontmatter field). Autosave isn't worth
   *  the complexity here — the description input debounces itself in the
   *  toolbar and calls this directly. */
  saveSkillDescription: (skillId: string, description: string) => Promise<void>;
  /** Replace the entire frontmatter map for a skill. Used by the generic
   *  properties panel when the user edits any non-`name` field. `name`
   *  changes still route through `handleRenameSkill` so the collision check
   *  stays in one place. */
  saveSkillFrontmatter: (skillId: string, frontmatter: Record<string, string>) => Promise<void>;
  /** Move a skill (file or folder) into a different parent directory under
   *  `.assets/skills/`. `destDir` is the new parent path; empty string means
   *  the top level. When the moved skill (or one of its descendants) is the
   *  currently-active skill, the active id is remapped so the editor keeps
   *  pointing at the same file. Returns the moved skill's new path-shaped
   *  id; null on failure (caller can surface the message). */
  moveSkillTo: (skillId: string, destDir: string) => Promise<string | null>;
}

export function useSkills(params: UseSkillsParams): UseSkillsResult {
  const {
    store, storeReady,
    activeSkill, setActiveSkill, setActiveSkillDescription, setActiveSkillFrontmatter,
    setActiveSkillUuid,
    nextUrlOpRef,
    getMarkdownRef, lastSavedRef, lastSavedTitleRef, activeRevisionRef,
    editorReadyRef, titleSaveTimerRef,
    flushSave, flushTitleSave, showSaved, setSaveStatus,
    setNotes: _setNotes, setActiveId, setActiveUuid, setActiveTemplate,
    setActiveText, setEditingTitle, setEditorVersion, setTocHeadings,
    renameSkillRef,
  } = params;
  void _setNotes; // unused for now; reserved for future "promote to note"

  const [skills, setSkills] = useState<SkillMeta[]>([]);

  // Mirror activeSkill in a ref so async callbacks (save handlers awaiting a
  // disk write) check the LATEST value instead of their closure's frozen
  // copy. Without this, an A-save that resolves after the user switched to
  // B would overwrite B's visible description / frontmatter with A's data.
  const activeSkillRef = useRef(activeSkill);
  useEffect(() => { activeSkillRef.current = activeSkill; }, [activeSkill]);

  const refreshSkills = useCallback(async () => {
    try { setSkills(await store.listSkills()); }
    catch { /* no skills dir yet */ }
  }, [store]);

  useEffect(() => {
    if (storeReady) void refreshSkills();
  }, [storeReady, refreshSkills]);

  /** Apply a fetched skill's full state into the editor + page-level refs.
   *  Shared between `openSkill` (sidebar click) and `openSkillByUuid` (URL
   *  routing) so both entry points land in the same final state. */
  const applyOpenedSkill = useCallback(async (skill: SkillFull): Promise<void> => {
    setActiveId(null);
    setActiveUuid(null);
    setActiveTemplate(null);
    setActiveSkill(skill.id);
    setActiveText(skill.content);
    setEditingTitle(skill.name);
    setActiveSkillDescription(skill.description);
    setActiveSkillFrontmatter(skill.frontmatter);
    lastSavedRef.current = skill.content;
    lastSavedTitleRef.current = skill.name;
    activeRevisionRef.current = null;
    setSaveStatus('idle');
    editorReadyRef.current = false;
    getMarkdownRef.current = null;
    setTocHeadings([]);
    // Stamp a UUID into the SKILL.md if one isn't there yet, then mirror it
    // into the page-level state that drives the URL. Doing this AFTER the
    // editor seed keeps typing latency-free; the URL flips a beat later
    // once the write completes.
    let uuid = skill.uuid ?? null;
    if (!uuid) {
      try { uuid = await store.ensureSkillUuid(skill.id); }
      catch (err) {
        console.warn('[skills] ensureSkillUuid failed (URL will fall back)', err);
      }
    }
    setActiveSkillUuid(uuid);
  }, [
    store, setActiveId, setActiveUuid, setActiveTemplate, setActiveSkill,
    setActiveText, setEditingTitle, setActiveSkillDescription, setActiveSkillFrontmatter,
    setActiveSkillUuid,
    lastSavedRef, lastSavedTitleRef, activeRevisionRef, setSaveStatus,
    editorReadyRef, getMarkdownRef, setTocHeadings,
  ]);

  const openSkill = useCallback(async (skillId: string, opts?: { replace?: boolean }) => {
    nextUrlOpRef.current = opts?.replace ? 'replace' : 'push';
    await flushSave();
    await flushTitleSave();
    const skill = await store.getSkill(skillId);
    if (skill == null) return false;
    await applyOpenedSkill(skill);
    return true;
  }, [store, flushSave, flushTitleSave, applyOpenedSkill, nextUrlOpRef]);

  const openSkillByUuid = useCallback(async (uuid: string, opts?: { replace?: boolean }) => {
    nextUrlOpRef.current = opts?.replace ? 'replace' : 'push';
    await flushSave();
    await flushTitleSave();
    const skill = await store.getSkillByUuid(uuid);
    if (skill == null) return false;
    await applyOpenedSkill(skill);
    return true;
  }, [store, flushSave, flushTitleSave, applyOpenedSkill, nextUrlOpRef]);

  const handleRenameSkill = useCallback(async (skillId: string, newName: string) => {
    const isActive = activeSkill === skillId;
    const trimmed = newName.trim();
    const currentName = skills.find(s => s.id === skillId)?.name
      || (isActive ? lastSavedTitleRef.current : '');
    if (!trimmed || trimmed === currentName) return;
    if (titleSaveTimerRef.current) {
      window.clearTimeout(titleSaveTimerRef.current);
      titleSaveTimerRef.current = null;
    }
    // Capture the editor's live body so a rename mid-edit doesn't drop the
    // in-flight characters when we reseed the active skill.
    const currentMarkdown = isActive
      ? (getMarkdownRef.current ? getMarkdownRef.current() : null)
      : null;
    if (isActive) await flushSave();
    setSaveStatus('saving');
    try {
      const renamed = await store.renameSkill(skillId, trimmed);
      if (isActive) {
        setEditingTitle(renamed.name);
        lastSavedTitleRef.current = renamed.name;
      }
    } catch (err) {
      console.error('[skills] rename failed', err);
      setSaveStatus('error');
      return;
    }
    if (isActive && currentMarkdown != null) {
      setActiveText(currentMarkdown);
      lastSavedRef.current = currentMarkdown;
    }
    await refreshSkills();
    showSaved();
  }, [
    activeSkill, skills, store, flushSave, refreshSkills, showSaved,
    lastSavedTitleRef, lastSavedRef, getMarkdownRef, setSaveStatus,
    setEditingTitle, setActiveText, titleSaveTimerRef,
  ]);

  // Wire the rename callback into the shared ref so useNoteAutosave (which
  // holds the same instance) always invokes the latest closure.
  useEffect(() => {
    renameSkillRef.current = handleRenameSkill;
  }, [handleRenameSkill, renameSkillRef]);

  const handleDeleteSkill = useCallback(async (skillId: string) => {
    await store.deleteSkill(skillId);
    if (activeSkill === skillId) {
      setActiveSkill(null);
      setActiveText('');
      setEditingTitle('');
      setActiveSkillDescription('');
      setActiveSkillFrontmatter({});
      setActiveSkillUuid(null);
    }
    await refreshSkills();
  }, [
    store, activeSkill, refreshSkills,
    setActiveSkill, setActiveText, setEditingTitle, setActiveSkillDescription, setActiveSkillFrontmatter,
    setActiveSkillUuid,
  ]);

  const saveSkillDescription = useCallback(async (skillId: string, description: string) => {
    try {
      await store.updateSkillDescription(skillId, description);
      // Use the ref — by the time this resolves the user may have switched
      // skills, in which case touching the visible description / frontmatter
      // state would overwrite the now-active skill's data.
      if (activeSkillRef.current === skillId) {
        setActiveSkillDescription(description);
        setActiveSkillFrontmatter(prev => ({ ...prev, description }));
      }
      await refreshSkills();
    } catch (err) {
      console.error('[skills] update description failed', err);
    }
  }, [store, refreshSkills, setActiveSkillDescription, setActiveSkillFrontmatter]);

  const saveSkillFrontmatter = useCallback(async (skillId: string, frontmatter: Record<string, string>) => {
    try {
      const updated = await store.updateSkillFrontmatter(skillId, frontmatter);
      if (activeSkillRef.current === skillId) {
        setActiveSkillDescription(updated.description);
        setActiveSkillFrontmatter({ ...frontmatter, name: updated.name });
      }
      await refreshSkills();
    } catch (err) {
      console.error('[skills] update frontmatter failed', err);
    }
  }, [store, refreshSkills, setActiveSkillDescription, setActiveSkillFrontmatter]);

  const moveSkillTo = useCallback(async (skillId: string, destDir: string): Promise<string | null> => {
    // Before moving, flush any pending body autosave so it lands at the OLD
    // path. The body autosave timer in useNoteAutosave captures the active
    // skill's id at edit time — if we move first, that pending save fires
    // with the now-stale id and loses the edit. Flushing forces the save to
    // complete (against the old path) before we touch the file's location.
    const active = activeSkillRef.current;
    if (active && (active === skillId || active.startsWith(`${skillId}/`))) {
      try { await flushSave(); } catch { /* flush is best-effort here */ }
    }
    try {
      const moved = await store.moveSkill(skillId, destDir);
      // If the moved skill (or one of its descendants) is the currently-
      // active editor target, remap the active id so the editor keeps
      // pointing at the same file. Moving a folder physically takes its
      // children along, so descendant ids get the same prefix swap.
      if (active) {
        if (active === skillId) {
          setActiveSkill(moved.id);
        } else if (active.startsWith(`${skillId}/`)) {
          const suffix = active.slice(skillId.length); // includes leading `/`
          setActiveSkill(`${moved.id}${suffix}`);
        }
      }
      await refreshSkills();
      return moved.id;
    } catch (err) {
      console.error('[skills] move failed', err);
      return null;
    }
  }, [store, setActiveSkill, refreshSkills, flushSave]);

  void setEditorVersion; // reserved for future "reload after external edit"

  return {
    skills,
    setSkills,
    refreshSkills,
    openSkill,
    openSkillByUuid,
    handleDeleteSkill,
    handleRenameSkill,
    saveSkillDescription,
    saveSkillFrontmatter,
    moveSkillTo,
  };
}
