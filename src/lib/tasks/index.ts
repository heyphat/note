// Public surface of the tasks module. App code (UI, AI tools, hooks) should
// import from `@/lib/tasks` rather than reaching into the file structure
// directly — that keeps internal refactors safe.
//
// Internal-only modules (`yaml-frontmatter.ts`, `in-memory-task-store.ts`,
// `conformance-adapter.ts`) are deliberately not re-exported here.

export type {
  AbsoluteReminder,
  BlockedByEntry,
  DependencyReltype,
  IsoDuration,
  RecurrenceAnchor,
  RelativeReminder,
  Reminder,
  SemanticRole,
  SpecDate,
  SpecDateOrDateTime,
  SpecDateTime,
  Task,
  TaskRef,
  TimeEntry,
} from './spec-types';

export {
  DEFAULT_MAPPING,
  READ_ALIASES,
  knownKeys,
  readField,
  type FieldMapping,
  type FieldReadIssue,
  type FieldReadResult,
} from './field-mapping';

export { parseTask, type ParseTaskOptions, type ParseTaskResult } from './parse-task';
export { serializeTask, type SerializeTaskOptions } from './serialize-task';

export {
  blocksWrite,
  isCanonicalDate,
  isCanonicalDateTime,
  validateTask,
  type IssueSeverity,
  type ValidateOptions,
  type ValidationCode,
  type ValidationIssue,
  type ValidationMode,
  type ValidationResult,
} from './validate';

export {
  completeTask,
  createTask,
  deleteTask,
  uncompleteTask,
  updateTask,
  type CollectionConfig,
  type CompleteTaskInput,
  type CreateTaskInput,
  type OperationErr,
  type OperationOk,
  type OperationResult,
  type TaskPatch,
  type TaskRecord,
} from './operations';

export {
  defaultTaskBasename,
  type TaskFile,
  type TaskFileWithBody,
  type TaskStore,
} from './task-store';

export { TaskIndex, type IndexedTask, type TaskIndexListener } from './task-index';

export { BrowserFsTaskStore, type NoteStoreTaskFs } from './browser-fs-task-store';

export { localDayFromDate, localDayFromIso, todayLocalDay } from './local-day';

export { collectAllTasks, loadAllTasks, refreshTask, type LoadAllOptions, type LoadAllResult } from './task-loader';

// --- Phase 2: recurrence + extended profile ---

export {
  canonicalizeDtstart,
  effectiveInstanceState,
  MissingRecurrenceSeedError,
  nextOccurrence,
  parseRecurrenceString,
  RecurrenceParseError,
  resolveSeed,
  rewriteDtstart,
  type NextOccurrenceInput,
  type ParsedRecurrence,
  type SeedInput,
} from './recurrence';

export {
  completeInstance,
  skipInstance,
  uncompleteInstance,
  unskipInstance,
  type InstanceOpInput,
  type RecurringConfig,
  type RecurringOpResult,
} from './recurring-ops';

export {
  addDependency,
  removeDependency,
  replaceDependencies,
  type DependenciesConfig,
  type DependencyInput,
  type DependencyOpResult,
} from './dependencies';

export {
  addReminder,
  computeTriggers,
  removeReminder,
  updateReminder,
  type ComputedTrigger,
  type ReminderConfig,
  type ReminderInput,
  type ReminderOpResult,
} from './reminders';

export {
  activeEntry,
  removeEntry,
  replaceEntries,
  startTimer,
  stopTimer,
  totalMs,
  type TimerOpResult,
  type TimeTrackingConfig,
} from './time-tracking';

export {
  applyRenamesToTask,
  rewriteWikilink,
  rewriteWikilinkReferences,
  type RenameReference,
  type RenameReferencesResult,
  type RewriteReferencesOptions,
} from './rename-references';

export {
  mutateTask,
  type Mutator,
  type MutatorOutput,
  type MutateConfig,
  type MutateErr,
  type MutateOk,
  type MutateResult,
} from './mutate-task';

export { formatTasksToday, type TasksTodayOptions } from './template-formatter';

export { runQuery, type Filter, type FilterField, type FilterOperator, type GroupAxis, type QueryResult, type RankedTask, type Sort, type SortField, type TaskQuery } from './query';
