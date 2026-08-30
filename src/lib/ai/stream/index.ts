// Public surface of the streaming pipeline. Consumers (hooks, components,
// API routes) import from `@/lib/ai/stream` — they never reach into the
// per-provider files under `direct/`, `proxy/`, or `shared/`.

export { chatStream, testConnection, MAX_AGENTIC_ITERATIONS } from './shared/agentic-loop';
export type {
  StreamOpts, ProposedEdit, ProviderAttachment, ProviderAttachmentKind,
  ReadOnlyToolExecutor, ReadOnlyToolEventListener, SerializedAgenticRound,
} from './shared/types';
export type { EditToolName } from '../tools';
