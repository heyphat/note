// Pure path / filename helpers. No I/O.

export const HISTORY_DIR = '.history';
export const HISTORY_MAX = 50;
export const GLOBAL_ASSETS_DIR = '.assets';
export const IMAGES_SUBDIR = 'images';
export const TEMPLATES_DIR = 'templates';
export const SKILLS_DIR = 'skills';
export const CHATS_DIR = 'chats';
export const CHAT_FILES_DIR = 'chat-files';
export const TASKS_DIR = 'tasks';
export const TASK_ARCHIVE_DIR = '.archive';

export function splitPath(path: string): { dirParts: string[]; filename: string } {
  const parts = path.split('/').filter(Boolean);
  const filename = parts.pop()!;
  return { dirParts: parts, filename };
}

export function basename(path: string): string {
  return path.split('/').pop()!.replace(/\.md$/, '');
}

export function historyPathForUuid(uuid: string): string[] {
  return [HISTORY_DIR, uuid];
}

export function legacyHistoryPathFor(id: string): string[] {
  const parts = id.split('/').filter(Boolean);
  const filename = parts.pop()!;
  const base = filename.replace(/\.md$/i, '');
  return [HISTORY_DIR, ...parts, base];
}
