// URL <-> note-id mapping. The URL path mirrors the on-disk folder path: a
// note at `learning/2024/foo.md` lives at `/<locale>/learning/2024/foo`.
// Each path segment is URI-encoded and the trailing `.md` is stripped for
// readability. A leading `/<locale>` segment (see `LOCALES`) is handled
// transparently by `routeFromPath`; URL builders take an optional `locale`
// to prefix the returned path.
//
// Pure, no React / DOM dependencies — exercised both by the page route
// effects and by unit tests.

export const NOTES_BASE_PATH = '/';
export const NEW_NOTE_SLUG = 'new';
export const TEMPLATE_ROUTE_SEGMENT = 'templates';
export const TASKS_ROUTE_SEGMENT = 'tasks';
export const SKILLS_ROUTE_SEGMENT = 'skills';

export const LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof LOCALES)[number];

export type RequestedRoute =
  | { kind: 'base' }
  | { kind: 'new-note' }
  | { kind: 'note'; slug: string }
  | { kind: 'template'; templateId: string }
  | { kind: 'task'; taskUuid: string }
  | { kind: 'skill'; skillUuid: string };

/** Remove a leading `/<locale>` segment if present. Returns `/` for empty. */
export function stripLocalePrefix(pathname: string | null | undefined): string {
  const p = pathname || '';
  for (const loc of LOCALES) {
    if (p === `/${loc}`) return '/';
    if (p.startsWith(`/${loc}/`)) return p.slice(loc.length + 1);
  }
  return p || '/';
}

function withLocale(path: string, locale?: string | null): string {
  if (!locale) return path;
  if (path === '/' || path === '') return `/${locale}`;
  return `/${locale}${path}`;
}

/** Extract the raw slug from a URL pathname. `null` for the root/empty path. */
export function slugFromPath(path: string | null | undefined): string | null {
  const stripped = stripLocalePrefix(path);
  const raw = stripped.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw) return null;
  try {
    return raw.split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

/** URL for a note id (strips `.md`, encodes each path segment). */
export function urlFromId(id: string, locale?: string | null): string {
  const noExt = id.replace(/\.md$/, '');
  const encoded = noExt.split('/').map(encodeURIComponent).join('/');
  return withLocale(`/${encoded}`, locale);
}

/** URL for a template id. */
export function templateUrlFromId(id: string, locale?: string | null): string {
  return withLocale(`/${TEMPLATE_ROUTE_SEGMENT}/${encodeURIComponent(id)}`, locale);
}

/**
 * URL for a task by its stable frontmatter UUID. Uuid-keyed (not basename-
 * keyed) so the URL survives task renames or moves of the tasks dir on disk.
 */
export function taskUrlFromUuid(uuid: string, locale?: string | null): string {
  return withLocale(`/${TASKS_ROUTE_SEGMENT}/${encodeURIComponent(uuid)}`, locale);
}

/**
 * URL for a skill by its stable frontmatter UUID. Skill identifiers on disk
 * are path-shaped (`coding/python`) and change when the user moves the
 * skill into a different folder — anchoring the URL to the SKILL.md `id:`
 * UUID keeps the address bar stable across those moves. Generated lazily
 * on first open by `ensureSkillUuid`.
 */
export function skillUrlFromUuid(uuid: string, locale?: string | null): string {
  return withLocale(`/${SKILLS_ROUTE_SEGMENT}/${encodeURIComponent(uuid)}`, locale);
}

/** Base path, optionally scoped to a locale. */
export function notesBasePath(locale?: string | null): string {
  return withLocale(NOTES_BASE_PATH, locale);
}

/**
 * Classify a URL pathname into a {@link RequestedRoute}. A leading
 * `/<locale>` segment is stripped before classification. The base path,
 * `/new`, `/templates/<id>`, and `/path/to/note` are each recognised.
 */
export function routeFromPath(path: string | null | undefined): RequestedRoute {
  const p = stripLocalePrefix(path || '');
  if (NOTES_BASE_PATH !== '/' && (p === NOTES_BASE_PATH || p === `${NOTES_BASE_PATH}/`)) {
    return { kind: 'base' };
  }
  const raw = p.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw) return { kind: 'base' };
  let segments: string[];
  try {
    segments = raw.split('/').map(decodeURIComponent);
  } catch {
    segments = raw.split('/');
  }
  if (segments[0] === TEMPLATE_ROUTE_SEGMENT && segments[1]) {
    return { kind: 'template', templateId: segments.slice(1).join('/') };
  }
  if (segments[0] === TASKS_ROUTE_SEGMENT && segments[1]) {
    // Tasks live at /tasks/<uuid>; reject any deeper path so we don't
    // misinterpret a future feature.
    return { kind: 'task', taskUuid: segments[1] };
  }
  if (segments[0] === SKILLS_ROUTE_SEGMENT && segments[1]) {
    // Skills live at /skills/<uuid>; same uuid-anchored shape as tasks.
    return { kind: 'skill', skillUuid: segments[1] };
  }
  const slug = segments.join('/');
  if (slug === NEW_NOTE_SLUG) return { kind: 'new-note' };
  return { kind: 'note', slug };
}
