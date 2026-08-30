import type { ChatEdit } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isChatEditStatus(value: unknown): value is ChatEdit['status'] {
  return value === 'pending'
    || value === 'applied'
    || value === 'rejected'
    || value === 'error';
}

function isOptionalString(value: unknown): boolean {
  return value == null || typeof value === 'string';
}

function isOptionalStringArray(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.every(item => typeof item === 'string'));
}

function isManageTasksChatInput(value: unknown): boolean {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'create_task') {
    if (typeof value.title !== 'string') return false;
    return isOptionalString(value.status)
      && isOptionalString(value.priority)
      && isOptionalString(value.due)
      && isOptionalString(value.scheduled)
      && isOptionalStringArray(value.tags)
      && isOptionalStringArray(value.contexts)
      && isOptionalStringArray(value.projects)
      && isOptionalString(value.body);
  }
  if (value.kind === 'complete_task') {
    return typeof value.path === 'string' && isOptionalString(value.completion_day);
  }
  if (value.kind === 'uncomplete_task' || value.kind === 'delete_task') {
    return typeof value.path === 'string';
  }
  if (value.kind === 'update_task') {
    return typeof value.path === 'string' && isRecord(value.patch);
  }
  return false;
}

export function isChatEdit(value: unknown): value is ChatEdit {
  if (!isRecord(value)) return false;
  if (typeof value.toolCallId !== 'string' || !isChatEditStatus(value.status)) return false;
  if (value.error != null && typeof value.error !== 'string') return false;
  if (value.toolName === 'edit_note') {
    return isRecord(value.input)
      && typeof value.input.find === 'string'
      && typeof value.input.replace === 'string';
  }
  if (value.toolName === 'rewrite_note') {
    return isRecord(value.input)
      && typeof value.input.new_content === 'string';
  }
  if (value.toolName === 'create_note') {
    if (!isRecord(value.input)) return false;
    if (typeof value.input.title !== 'string') return false;
    if (typeof value.input.content !== 'string') return false;
    if (value.input.folder != null && typeof value.input.folder !== 'string') return false;
    return true;
  }
  if (value.toolName === 'manage_tasks') {
    return isManageTasksChatInput(value.input);
  }
  return false;
}

export function encodeChatEdits(edits: ChatEdit[]): string | null {
  if (edits.length === 0) return null;
  return encodeURIComponent(JSON.stringify(edits));
}

export function decodeChatEdits(raw: string | undefined): ChatEdit[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatEdit);
  } catch {
    return [];
  }
}
