'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FrontmatterField } from '@/components/FrontmatterPanel';

export interface UseSkillFrontmatterAutosaveParams {
  activeSkill: string | null;
  activeSkillFrontmatter: Record<string, string>;
  editingTitle: string;
  handleTitleChange: (newTitle: string) => void;
  setActiveSkillDescription: React.Dispatch<React.SetStateAction<string>>;
  setActiveSkillFrontmatter: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saveSkillFrontmatter: (skillId: string, frontmatter: Record<string, string>) => Promise<void>;
  flushTitleSave: () => Promise<void>;
  moveSkillTo: (skillId: string, destDir: string) => Promise<string | null>;
}

export interface UseSkillFrontmatterAutosaveResult {
  skillFrontmatterFields: FrontmatterField[];
  handleMoveSkill: (skillId: string, destDir: string) => Promise<string | null>;
}

/**
 * Owns the properties-panel save queue for the active skill.
 *
 * Body and title saves still live in useNoteAutosave/useSkills; this hook is
 * only for arbitrary SKILL.md frontmatter keys edited through FrontmatterPanel.
 */
export function useSkillFrontmatterAutosave({
  activeSkill,
  activeSkillFrontmatter,
  editingTitle,
  handleTitleChange,
  setActiveSkillDescription,
  setActiveSkillFrontmatter,
  saveSkillFrontmatter,
  flushTitleSave,
  moveSkillTo,
}: UseSkillFrontmatterAutosaveParams): UseSkillFrontmatterAutosaveResult {
  const timersRef = useRef<Map<string, number>>(new Map());
  const pendingRef = useRef<Map<string, Record<string, string>>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const saveSkillFrontmatterRef = useRef(saveSkillFrontmatter);

  useEffect(() => {
    saveSkillFrontmatterRef.current = saveSkillFrontmatter;
  }, [saveSkillFrontmatter]);

  const beginFrontmatterSave = useCallback((skillId: string, data: Record<string, string>): Promise<void> => {
    const inFlight = inFlightRef.current;
    const savePromise: Promise<void> = saveSkillFrontmatterRef.current(skillId, data).finally(() => {
      if (inFlight.get(skillId) === savePromise) inFlight.delete(skillId);
    });
    inFlight.set(skillId, savePromise);
    return savePromise;
  }, []);

  const flushPendingFrontmatter = useCallback(async (skillId?: string): Promise<void> => {
    const timers = timersRef.current;
    const pending = pendingRef.current;
    const inFlight = inFlightRef.current;
    const ids = skillId
      ? [skillId]
      : Array.from(new Set([
          ...Array.from(timers.keys()),
          ...Array.from(pending.keys()),
          ...Array.from(inFlight.keys()),
        ]));

    for (const id of ids) {
      const timer = timers.get(id);
      if (timer) {
        window.clearTimeout(timer);
        timers.delete(id);
      }
      const data = pending.get(id);
      if (data) {
        pending.delete(id);
        beginFrontmatterSave(id, data);
      }
    }

    const promises = skillId
      ? (inFlight.has(skillId) ? [inFlight.get(skillId)!] : [])
      : Array.from(inFlight.values());
    await Promise.allSettled(promises);
  }, [beginFrontmatterSave]);

  const handleSkillFrontmatterChange = useCallback((key: string, value: string) => {
    if (!activeSkill) return;
    const skillId = activeSkill;
    setActiveSkillFrontmatter(prev => {
      const next = { ...prev, [key]: value };
      pendingRef.current.set(skillId, next);
      return next;
    });
    if (key === 'description') setActiveSkillDescription(value);

    const existing = timersRef.current.get(skillId);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      timersRef.current.delete(skillId);
      const data = pendingRef.current.get(skillId);
      if (!data) return;
      pendingRef.current.delete(skillId);
      beginFrontmatterSave(skillId, data);
    }, 600);
    timersRef.current.set(skillId, timer);
  }, [activeSkill, beginFrontmatterSave, setActiveSkillDescription, setActiveSkillFrontmatter]);

  const previousActiveSkillRef = useRef<string | null>(activeSkill);
  useEffect(() => {
    const previous = previousActiveSkillRef.current;
    previousActiveSkillRef.current = activeSkill;
    if (previous && previous !== activeSkill) void flushPendingFrontmatter(previous);
  }, [activeSkill, flushPendingFrontmatter]);

  useEffect(() => () => {
    void flushPendingFrontmatter();
  }, [flushPendingFrontmatter]);

  const handleMoveSkill = useCallback(async (skillId: string, destDir: string): Promise<string | null> => {
    try { await flushPendingFrontmatter(); } catch { /* best-effort */ }
    try { await flushTitleSave(); } catch { /* best-effort */ }
    return moveSkillTo(skillId, destDir);
  }, [moveSkillTo, flushPendingFrontmatter, flushTitleSave]);

  const skillFrontmatterFields = useMemo<FrontmatterField[]>(() => {
    if (!activeSkill) return [];
    const keys = Object.keys(activeSkillFrontmatter);
    const ordered = [
      'name',
      'description',
      ...keys.filter(k => k !== 'name' && k !== 'description'),
    ].filter(k => k === 'name' || k === 'description' || keys.includes(k));

    return ordered.map(key => {
      const value = activeSkillFrontmatter[key] ?? '';
      if (key === 'name') {
        return {
          key,
          label: 'name',
          type: 'text',
          value: editingTitle,
          onChange: handleTitleChange,
          help: 'Identifier the AI uses to invoke this skill - must be unique in the vault.',
          required: true,
        };
      }
      if (key === 'description') {
        return {
          key,
          label: 'description',
          type: 'textarea',
          value,
          onChange: (next: string) => handleSkillFrontmatterChange('description', next),
          placeholder: 'One-sentence trigger the model reads - e.g. "Use when the user asks for a weekly recap."',
          help: 'The assistant scans skill descriptions to decide which skill applies; keep it specific and verb-first.',
          minRows: 3,
          required: true,
        };
      }
      return {
        key,
        label: key,
        type: 'text',
        value,
        onChange: (next: string) => handleSkillFrontmatterChange(key, next),
      };
    });
  }, [activeSkill, activeSkillFrontmatter, editingTitle, handleTitleChange, handleSkillFrontmatterChange]);

  return {
    skillFrontmatterFields,
    handleMoveSkill,
  };
}
