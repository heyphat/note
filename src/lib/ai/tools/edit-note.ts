// `edit_note` — targeted find/replace on the active note's body. Surfaces
// as a proposal card; the user clicks Apply and the chat hook calls
// `applyProposedEdit` (in `./index`) which performs the substring swap
// (with whitespace-tolerant fallback). No executor — the SDK doesn't
// auto-run mutations.

import { tool, jsonSchema } from 'ai';

export const EDIT_NOTE_DESCRIPTION = 'Replace a specific substring of the current note. Use for targeted edits. The `find` string must appear exactly once in the note — pick enough surrounding context to make it unique. Do not call this tool if you only want to suggest a change without applying it.';

export const EDIT_NOTE_JSON_SCHEMA = {
  type: 'object',
  required: ['find', 'replace'],
  additionalProperties: false,
  properties: {
    find: {
      type: 'string',
      description: 'The exact text to find in the note (must be unique, include enough context if the phrase repeats).',
    },
    replace: {
      type: 'string',
      description: 'The text to replace it with.',
    },
  },
} as const;

export interface EditNoteInput {
  /** Exact substring of the current note. Must appear once. */
  find: string;
  /** Text to replace it with. */
  replace: string;
}

export const editNoteTool = tool({
  description: EDIT_NOTE_DESCRIPTION,
  inputSchema: jsonSchema<EditNoteInput>(EDIT_NOTE_JSON_SCHEMA),
});
