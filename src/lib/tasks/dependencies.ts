// Dependency operations per spec §10.2.
//
// Storage shape: `task.blocked_by[]` of `{uid, reltype, gap?}`.
// API:
//   - addDependency       (idempotent on duplicate uid, configurable policy)
//   - removeDependency    (idempotent)
//   - replaceDependencies (explicit "reset everything" mode, §10.2.9)
//
// `uid` matching is done on the *normalized* form. We treat the wikilink
// `[[task-x]]` and the bare `task-x` as different uids by default, on the
// theory that round-tripping through TaskNotes vaults preserves whichever
// form the user wrote. Implementations that want stricter normalization can
// pre-process before calling these ops.

import type { BlockedByEntry, DependencyReltype, IsoDuration, Task } from './spec-types';
import { mutateTask, type MutateConfig, type MutateResult } from './mutate-task';
import type { TaskStore } from './task-store';

const DEFAULT_RELTYPE: DependencyReltype = 'FINISHTOSTART';

export interface DependencyInput {
  uid: string;
  reltype?: DependencyReltype;
  gap?: IsoDuration;
}

export interface DependenciesConfig extends MutateConfig {
  /** Default true (§10.2.3 default). */
  enforceUniqueUid?: boolean;
}

export type DependencyOpResult = MutateResult<{ added?: boolean; removed?: boolean }>;

export async function addDependency(
  store: TaskStore,
  path: string,
  input: DependencyInput,
  config: DependenciesConfig = {},
): Promise<DependencyOpResult> {
  if (!input.uid || typeof input.uid !== 'string') {
    return invalidInput('dependency uid is required');
  }
  const enforceUnique = config.enforceUniqueUid ?? true;

  return mutateTask(store, path, async (task) => {
    const existing = task.blocked_by ?? [];

    // Self-dependency check matches the validator's literal-match rule.
    if (selfDependency(task, input.uid)) {
      return { reject: { reason: 'mutator_rejected', message: 'task cannot depend on itself', code: 'self_dependency' } };
    }

    const dupIdx = existing.findIndex(e => e.uid === input.uid);
    if (dupIdx >= 0) {
      if (enforceUnique) {
        // Strict: refuse the add. Return a reject so callers see the code.
        return { reject: {
          reason: 'mutator_rejected',
          message: 'duplicate dependency uid',
          code: 'duplicate_dependency_uid',
        } };
      }
      // Permissive: leave the existing entry alone (idempotent).
      return null;
    }

    const newEntry: BlockedByEntry = {
      uid: input.uid,
      reltype: input.reltype ?? DEFAULT_RELTYPE,
    };
    if (input.gap) newEntry.gap = input.gap;

    return {
      task: { ...task, blocked_by: [...existing, newEntry] },
      extra: { added: true },
    };
  }, config);
}

export async function removeDependency(
  store: TaskStore,
  path: string,
  uid: string,
  config: DependenciesConfig = {},
): Promise<DependencyOpResult> {
  if (!uid) return invalidInput('uid is required');
  return mutateTask(store, path, async (task) => {
    const existing = task.blocked_by ?? [];
    const filtered = existing.filter(e => e.uid !== uid);
    if (filtered.length === existing.length) return null; // idempotent
    return {
      task: { ...task, blocked_by: filtered.length > 0 ? filtered : undefined },
      extra: { removed: true },
    };
  }, config);
}

/**
 * Replace the entire blocked_by list. Per §10.2.9 this is an explicit
 * operation mode — patch update should NOT trigger this.
 */
export async function replaceDependencies(
  store: TaskStore,
  path: string,
  entries: DependencyInput[],
  config: DependenciesConfig = {},
): Promise<DependencyOpResult> {
  const enforceUnique = config.enforceUniqueUid ?? true;
  const seen = new Map<string, DependencyInput>();
  for (const e of entries) {
    if (!e.uid) return invalidInput('every entry must have a uid');
    if (enforceUnique && seen.has(e.uid)) {
      return invalidInput(`duplicate uid in replacement: ${e.uid}`);
    }
    seen.set(e.uid, e);
  }
  return mutateTask(store, path, async (task) => {
    if (entries.some(e => selfDependency(task, e.uid))) {
      return { reject: { reason: 'mutator_rejected', message: 'task cannot depend on itself', code: 'self_dependency' } };
    }
    const next = entries.map<BlockedByEntry>(e => {
      const out: BlockedByEntry = { uid: e.uid, reltype: e.reltype ?? DEFAULT_RELTYPE };
      if (e.gap) out.gap = e.gap;
      return out;
    });
    return {
      task: { ...task, blocked_by: next.length > 0 ? next : undefined },
    };
  }, config);
}

// --- Helpers ----------------------------------------------------------------

function selfDependency(task: Task, uid: string): boolean {
  if (!task.id) return false;
  return uid === task.id || uid === `[[${task.id}]]`;
}

function invalidInput(message: string): DependencyOpResult {
  return { ok: false, reason: 'invalid_input', issues: [], message };
}
