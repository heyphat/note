// localStorage-backed registry of MCP server configurations. Mirrors the
// per-provider AI credential pattern in `index.ts`: configs and headers stay
// in the browser, never persisted server-side, and writes emit a custom
// event so the MCP manager can react.

export type McpTransport = 'http' | 'sse';

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  transport: McpTransport;
  /** Static headers sent on every request to the server (e.g. `Authorization: Bearer …`). Treated as credentials. */
  headers?: Record<string, string>;
  enabled: boolean;
}

const STORAGE_KEY = 'notes:mcp:servers';

export const MCP_SERVERS_CHANGED_EVENT = 'mcp:servers-changed';

export function listMcpServers(): McpServerConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidServer);
  } catch {
    return [];
  }
}

export function saveMcpServers(servers: McpServerConfig[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  window.dispatchEvent(new CustomEvent(MCP_SERVERS_CHANGED_EVENT));
}

export function addMcpServer(config: McpServerConfig): void {
  const next = listMcpServers().filter(s => s.id !== config.id);
  next.push(config);
  saveMcpServers(next);
}

export function updateMcpServer(config: McpServerConfig): void {
  const next = listMcpServers().map(s => s.id === config.id ? config : s);
  saveMcpServers(next);
}

export function deleteMcpServer(id: string): void {
  const next = listMcpServers().filter(s => s.id !== id);
  saveMcpServers(next);
}

function isValidServer(value: unknown): value is McpServerConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !v.id) return false;
  if (typeof v.name !== 'string') return false;
  if (typeof v.url !== 'string' || !v.url) return false;
  if (v.transport !== 'http' && v.transport !== 'sse') return false;
  if (typeof v.enabled !== 'boolean') return false;
  if (v.headers !== undefined) {
    if (typeof v.headers !== 'object' || Array.isArray(v.headers) || v.headers === null) return false;
    for (const key of Object.keys(v.headers as Record<string, unknown>)) {
      const hv = (v.headers as Record<string, unknown>)[key];
      if (typeof hv !== 'string') return false;
    }
  }
  return true;
}

/**
 * Parse a free-form JSON payload describing one or more MCP servers and
 * return a list of importable configs. Accepts three shapes so users can
 * paste straight from a Claude Desktop / Claude Code config, from a flat
 * single-server object, or from an array:
 *
 *   1. Claude Code format:
 *      `{ "mcpServers": { "<name>": { "url": "...", "type": "http"|"sse",
 *         "headers": {...} } } }`
 *      The key becomes the server name; `type` (Claude-Code spelling) or
 *      `transport` (our internal spelling) selects HTTP vs SSE.
 *
 *   2. Single server:
 *      `{ "name": "...", "url": "...", "transport": "...", "headers": {...} }`
 *
 *   3. Array of single-server objects.
 *
 * Throws with a user-facing message when no servers can be parsed.
 */
export function parseMcpServersJson(raw: string): McpServerConfig[] {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Paste a JSON payload first.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON must be an object or array.');
  }

  const out: McpServerConfig[] = [];

  // Claude-Code shape: { mcpServers: { <name>: { ... } } }
  const obj = parsed as Record<string, unknown>;
  const mcpServers = obj.mcpServers;
  if (mcpServers && typeof mcpServers === 'object' && !Array.isArray(mcpServers)) {
    for (const [name, entry] of Object.entries(mcpServers as Record<string, unknown>)) {
      const cfg = serverFromObject(entry, name);
      if (cfg) out.push(cfg);
    }
    if (out.length === 0) throw new Error('No servers found under `mcpServers`.');
    return out;
  }

  // Array of single-server objects.
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const cfg = serverFromObject(item);
      if (cfg) out.push(cfg);
    }
    if (out.length === 0) throw new Error('No servers found in the array.');
    return out;
  }

  // Single-server object.
  const cfg = serverFromObject(parsed);
  if (cfg) return [cfg];
  throw new Error('Could not parse a server config — expected at least `url` and a name.');
}

function serverFromObject(raw: unknown, nameFromKey?: string): McpServerConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;

  const url = pickString(v.url) ?? pickString(v.httpUrl) ?? pickString(v.endpoint);
  if (!url) return null;

  const name = pickString(v.name) ?? nameFromKey ?? deriveNameFromUrl(url);

  // Accept both Claude-Code (`type`) and our internal (`transport`) keys.
  const transportRaw = (pickString(v.transport) ?? pickString(v.type) ?? 'http').toLowerCase();
  const transport: McpTransport = transportRaw === 'sse' ? 'sse' : 'http';

  const headers: Record<string, string> = {};
  const headersRaw = v.headers;
  if (headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)) {
    for (const [k, hv] of Object.entries(headersRaw as Record<string, unknown>)) {
      if (typeof hv === 'string' && hv.length > 0) headers[k] = hv;
    }
  }

  const enabled = typeof v.enabled === 'boolean' ? v.enabled : true;

  return {
    id: pickString(v.id) ?? `mcp-${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim() || deriveNameFromUrl(url),
    url: url.trim(),
    transport,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    enabled,
  };
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

function deriveNameFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'MCP server';
  }
}

/**
 * Derive a stable short identifier suitable for namespacing MCP tool names
 * (`mcp__<short>__<toolName>`). Keeps the namespaced name predictable as
 * users add/remove servers — same input → same output, even across reloads.
 */
export function shortServerId(server: McpServerConfig): string {
  const slug = server.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  return slug || server.id.replace(/[^a-z0-9]+/gi, '_').slice(0, 12);
}
