// `rewrite_note` — replace the entire active note body. Surfaces as a
// proposal card; the apply path in `./index`'s `applyProposedEdit`
// returns `new_content` verbatim.

import { tool, jsonSchema } from 'ai';

export const REWRITE_NOTE_DESCRIPTION = 'Replace the entire note content with new markdown. Use only for major rewrites where a targeted edit would be larger than the original. Prefer `edit_note` for local changes.';

export const REWRITE_NOTE_JSON_SCHEMA = {
  type: 'object',
  required: ['new_content'],
  additionalProperties: false,
  properties: {
    new_content: {
      type: 'string',
      description: 'The full new markdown content for the note. Do not include YAML frontmatter — the app preserves it.',
    },
  },
} as const;

export interface RewriteNoteInput {
  /** The full new markdown content for the note. */
  new_content: string;
}

export const rewriteNoteTool = tool({
  description: REWRITE_NOTE_DESCRIPTION,
  inputSchema: jsonSchema<RewriteNoteInput>(REWRITE_NOTE_JSON_SCHEMA),
});
