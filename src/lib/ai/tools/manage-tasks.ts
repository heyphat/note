// `manage_tasks` — small family of mutations against TaskNotes-conformant
// `.md` files under `.assets/tasks/`. The `kind` discriminator lets one
// tool surface express create / complete / update / etc. Schema is
// intentionally flat: Anthropic rejects top-level oneOf / anyOf / allOf
// in tool input schemas. Apply path is the chat hook's task store
// handler — `applyProposedEdit` in `./index` rejects this tool name.

import { tool, jsonSchema } from 'ai';

export type ManageTasksInput =
  | { kind: 'create_task'; title: string; status?: string; priority?: string; due?: string; scheduled?: string; tags?: string[]; contexts?: string[]; projects?: string[]; body?: string }
  | { kind: 'complete_task'; path: string; completion_day?: string }
  | { kind: 'uncomplete_task'; path: string }
  | { kind: 'update_task'; path: string; patch: Record<string, unknown> }
  | { kind: 'delete_task'; path: string };

export const MANAGE_TASKS_DESCRIPTION = 'Mutate task files (`.assets/tasks/*.md`) following the TaskNotes specification. Use `kind` to pick the operation: `create_task` for a brand-new task; `complete_task` / `uncomplete_task` to flip status; `update_task` for a patch (partial frontmatter update); `delete_task` to remove. The `path` argument refers to the filename inside `.assets/tasks/` (e.g. `2026-05-04-draft-proposal.md`) — get it from the user-visible task list, not from a guess. Project references are wikilinks like `[[Q2 Launch]]`. Dates are YYYY-MM-DD.';

export const MANAGE_TASKS_JSON_SCHEMA = {
  type: 'object',
  required: ['kind'],
  additionalProperties: false,
  properties: {
    kind: {
      type: 'string',
      enum: ['create_task', 'complete_task', 'uncomplete_task', 'update_task', 'delete_task'],
      description: 'Operation to perform. create_task requires title. complete_task, uncomplete_task, update_task, and delete_task require path. update_task also requires patch.',
    },
    title: { type: 'string', description: 'Short human-readable title. Required for create_task.' },
    status: { type: 'string', description: 'Default: "open".' },
    priority: { type: 'string', enum: ['highest', 'high', 'normal', 'low', 'lowest'] },
    due: { type: 'string', description: 'YYYY-MM-DD (optional).' },
    scheduled: { type: 'string', description: 'YYYY-MM-DD (optional).' },
    tags: { type: 'array', items: { type: 'string' } },
    contexts: { type: 'array', items: { type: 'string' }, description: 'GTD contexts; conventionally `@` prefixed.' },
    projects: { type: 'array', items: { type: 'string' }, description: 'Wikilinks like `[[Q2 Launch]]`.' },
    body: { type: 'string', description: 'Optional notes/details body.' },
    path: { type: 'string', description: 'Task file path inside `.assets/tasks/`. Required except for create_task.' },
    completion_day: { type: 'string', description: 'YYYY-MM-DD; defaults to today. Only used by complete_task.' },
    patch: { type: 'object', description: 'Partial frontmatter; only the supplied keys change. Required for update_task.' },
  },
} as const;

export const manageTasksTool = tool({
  description: MANAGE_TASKS_DESCRIPTION,
  inputSchema: jsonSchema<ManageTasksInput>(MANAGE_TASKS_JSON_SCHEMA),
});
