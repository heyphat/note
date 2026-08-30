// Bridge between the model's raw tool-call output and the UI's typed
// proposal card. Each `is*Input` guard narrows the model's untyped JSON
// into the discriminated `ProposedEdit` union; calls that don't match a
// known shape are dropped (the model emitted garbage, no card shown).

import type { ManageTasksInput } from '../../tools';
import { getMcpManager, MCP_TOOL_PREFIX } from '../../mcp';
import type { ProposedEdit } from './types';

function isEditNoteInput(v: unknown): v is { find: string; replace: string } {
  return !!v && typeof v === 'object'
    && typeof (v as { find?: unknown }).find === 'string'
    && typeof (v as { replace?: unknown }).replace === 'string';
}

function isRewriteNoteInput(v: unknown): v is { new_content: string } {
  return !!v && typeof v === 'object'
    && typeof (v as { new_content?: unknown }).new_content === 'string';
}

function isCreateNoteInput(v: unknown): v is { title: string; content: string; folder?: string } {
  if (!v || typeof v !== 'object') return false;
  const obj = v as { title?: unknown; content?: unknown; folder?: unknown };
  if (typeof obj.title !== 'string') return false;
  if (typeof obj.content !== 'string') return false;
  if (obj.folder != null && typeof obj.folder !== 'string') return false;
  return true;
}

function isManageTasksInput(v: unknown): v is ManageTasksInput {
  if (!v || typeof v !== 'object') return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.kind !== 'string') return false;
  if (obj.kind === 'create_task') {
    if (typeof obj.title !== 'string') return false;
    return optionalString(obj.status)
      && optionalString(obj.priority)
      && optionalString(obj.due)
      && optionalString(obj.scheduled)
      && optionalStringArray(obj.tags)
      && optionalStringArray(obj.contexts)
      && optionalStringArray(obj.projects)
      && optionalString(obj.body);
  }
  if (obj.kind === 'complete_task') {
    return typeof obj.path === 'string' && optionalString(obj.completion_day);
  }
  if (obj.kind === 'uncomplete_task' || obj.kind === 'delete_task') {
    return typeof obj.path === 'string';
  }
  if (obj.kind === 'update_task') {
    return typeof obj.path === 'string' && !!obj.patch && typeof obj.patch === 'object' && !Array.isArray(obj.patch);
  }
  return false;
}

function optionalString(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

function optionalStringArray(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}

export function emitValidatedToolCall(
  toolCallId: string,
  toolName: string,
  input: unknown,
  onProposedEdit?: (edit: ProposedEdit) => void,
): void {
  if (!onProposedEdit) return;
  if (toolName === 'edit_note' && isEditNoteInput(input)) {
    onProposedEdit({ toolCallId, toolName: 'edit_note', input });
  } else if (toolName === 'rewrite_note' && isRewriteNoteInput(input)) {
    onProposedEdit({ toolCallId, toolName: 'rewrite_note', input });
  } else if (toolName === 'create_note' && isCreateNoteInput(input)) {
    onProposedEdit({ toolCallId, toolName: 'create_note', input });
  } else if (toolName === 'manage_tasks' && isManageTasksInput(input)) {
    onProposedEdit({ toolCallId, toolName: 'manage_tasks', input });
  } else if (toolName.startsWith(MCP_TOOL_PREFIX)) {
    const meta = getMcpManager().getToolMeta(toolName);
    if (!meta) return;
    onProposedEdit({
      toolCallId,
      toolName: 'mcp_call',
      input: {
        namespacedName: toolName,
        server: meta.serverShort,
        tool: meta.originalName,
        args: input,
        description: meta.description,
      },
    });
  }
}
