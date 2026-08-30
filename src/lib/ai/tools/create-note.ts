// `create_note` — spin off a new markdown file under the vault root or a
// chosen folder. Distinct from `edit_note` / `rewrite_note` which mutate
// the active note. Apply path bypasses `applyProposedEdit` — the chat
// hook routes it through a parent-supplied `onCreateNote` handler that
// writes a brand-new file.

import { tool, jsonSchema } from 'ai';

export const CREATE_NOTE_DESCRIPTION = 'Create a brand-new note in the vault, distinct from the active note. Use when the user asks to spin off a new note from the discussion (e.g. "save this as a new note in Projects", "create a meeting note for tomorrow"). Pick a clear short `title` (becomes the filename) and place it in an existing folder when one obviously fits the topic — see the vault folder list in the system prompt. Omit `folder` for the vault root. Do not call this tool to tweak the active note — use `edit_note` or `rewrite_note` instead.';

export const CREATE_NOTE_JSON_SCHEMA = {
  type: 'object',
  required: ['title', 'content'],
  additionalProperties: false,
  properties: {
    title: {
      type: 'string',
      description: 'Concise title for the new note. Becomes the on-disk filename.',
    },
    content: {
      type: 'string',
      description: 'Initial markdown content. Do not include YAML frontmatter — the app writes it.',
    },
    folder: {
      type: 'string',
      description: 'Optional folder path relative to vault root (e.g. "Projects/2025"). Pick from the vault folder list when one fits; omit or pass an empty string for the root.',
    },
  },
} as const;

export interface CreateNoteInput {
  /** Title of the new note. Becomes the on-disk filename and first heading reference. */
  title: string;
  /** Initial markdown content. No YAML frontmatter — the app writes it. */
  content: string;
  /** Folder path relative to vault root, e.g. `"Projects/2025"`. Empty/omitted = root. */
  folder?: string;
}

export const createNoteTool = tool({
  description: CREATE_NOTE_DESCRIPTION,
  inputSchema: jsonSchema<CreateNoteInput>(CREATE_NOTE_JSON_SCHEMA),
});
