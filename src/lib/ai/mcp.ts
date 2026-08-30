// Session-scoped MCP client manager. Owns persistent connections to each
// enabled remote MCP server, exposes the discovered tools in the shapes the
// rest of the AI stack already speaks (Vercel AI SDK `tool()` registry +
// hand-rolled Anthropic `{name, description, input_schema}`), and routes
// `executeTool` calls to the right client.
//
// Browser-only path. Stdio MCP servers are out of scope for v1 — the manager
// uses StreamableHTTP (preferred) and SSE (legacy) transports, both of which
// work in the browser as long as the target server returns permissive CORS.
// Connection failures don't block chat: an erroring server's tools simply
// don't appear in the next agentic round.

import { tool as makeTool, jsonSchema, type Tool } from 'ai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  listMcpServers,
  MCP_SERVERS_CHANGED_EVENT,
  shortServerId,
  type McpServerConfig,
} from './mcp-storage';

/** Prefix every MCP tool name carries so we can route by it. Matches Claude
 *  Code's convention; built-in tool names never collide because they don't
 *  start with `mcp__`. */
export const MCP_TOOL_PREFIX = 'mcp__';

export const MCP_STATUS_CHANGED_EVENT = 'mcp:status-changed';

export type McpServerState = 'connecting' | 'connected' | 'error' | 'disabled';

export interface McpServerStatus {
  state: McpServerState;
  toolCount: number;
  error?: string;
}

/** Anthropic-flavored tool definition shape used by the hand-rolled
 *  `anthropicChatRound` in stream.ts. JSON Schema goes in `input_schema`. */
export interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface McpToolMeta {
  serverId: string;
  serverShort: string;
  originalName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}

interface McpConnection {
  config: McpServerConfig;
  client: Client | null;
  transport: Transport | null;
  status: McpServerStatus;
  /** Tools currently advertised by this server, namespaced. */
  tools: McpToolMeta[];
}

class McpManager {
  private connections: Map<string, McpConnection> = new Map();
  /** Reverse lookup: namespaced name → meta + connection. Rebuilt on connect. */
  private toolIndex: Map<string, McpToolMeta> = new Map();
  private wired = false;
  private syncQueued = false;

  ensureWired() {
    if (this.wired || typeof window === 'undefined') return;
    this.wired = true;
    window.addEventListener(MCP_SERVERS_CHANGED_EVENT, () => this.syncFromStorage());
    // Kick off an initial sync next tick so consumers that constructed the
    // manager during render don't trigger a re-render-during-render.
    queueMicrotask(() => this.syncFromStorage());
  }

  private setStatus(serverId: string, patch: Partial<McpServerStatus>) {
    const conn = this.connections.get(serverId);
    if (!conn) return;
    conn.status = { ...conn.status, ...patch };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MCP_STATUS_CHANGED_EVENT, { detail: { serverId } }));
    }
  }

  getStatus(serverId: string): McpServerStatus {
    return this.connections.get(serverId)?.status ?? { state: 'disabled', toolCount: 0 };
  }

  /** Snapshot of every configured server's current state, used by the system
   *  prompt builder so the model can see "that server is configured but
   *  disconnected" instead of inferring (often wrongly) from an empty tool
   *  list that no MCP was ever set up. */
  listServerSnapshots(): Array<{
    name: string;
    state: McpServerState;
    toolCount: number;
    error?: string;
  }> {
    return Array.from(this.connections.values()).map(conn => ({
      name: conn.config.name,
      state: conn.status.state,
      toolCount: conn.status.toolCount,
      error: conn.status.error,
    }));
  }

  /** Reconcile in-memory connections against the persisted server list. */
  private syncFromStorage() {
    if (this.syncQueued) return;
    this.syncQueued = true;
    queueMicrotask(async () => {
      this.syncQueued = false;
      const servers = listMcpServers();
      const wantIds = new Set(servers.map(s => s.id));

      // Tear down removed/disabled servers.
      for (const [id, conn] of Array.from(this.connections.entries())) {
        const next = servers.find(s => s.id === id);
        if (!next || !next.enabled || hasConnectionChanged(conn.config, next)) {
          await this.tearDown(id);
        }
      }

      // Bring up new/enabled servers.
      for (const s of servers) {
        if (!s.enabled) {
          if (!this.connections.has(s.id)) {
            this.connections.set(s.id, {
              config: s, client: null, transport: null,
              status: { state: 'disabled', toolCount: 0 },
              tools: [],
            });
          } else {
            this.setStatus(s.id, { state: 'disabled', toolCount: 0, error: undefined });
          }
          continue;
        }
        // Bring up if there's no entry yet, OR if the existing entry is a
        // disabled-state placeholder (the user just flipped the toggle on).
        // Without the placeholder check, the second branch never fires for a
        // re-enabled server and the pill stays stuck on "DISABLED".
        const existing = this.connections.get(s.id);
        const isDisabledPlaceholder = !!existing && !existing.client && existing.status.state === 'disabled';
        if (wantIds.has(s.id) && (!existing || isDisabledPlaceholder)) {
          this.bringUp(s);
        }
      }

      this.rebuildToolIndex();
    });
  }

  private async tearDown(serverId: string) {
    const conn = this.connections.get(serverId);
    if (!conn) return;
    try {
      await conn.client?.close();
    } catch {
      // Connections may already be broken — closing is best-effort.
    }
    this.connections.delete(serverId);
    this.rebuildToolIndex();
  }

  private async bringUp(config: McpServerConfig) {
    this.connections.set(config.id, {
      config,
      client: null,
      transport: null,
      status: { state: 'connecting', toolCount: 0 },
      tools: [],
    });

    try {
      const { client, tools } = await this.connectAndList(config);
      const conn = this.connections.get(config.id);
      // The user may have flipped enabled→disabled while we were connecting.
      // Drop the new client on the floor instead of leaving a zombie open.
      if (!conn || !conn.config.enabled || conn.config !== config) {
        try { await client.close(); } catch { /* ignore */ }
        return;
      }
      conn.client = client;
      conn.tools = tools;
      conn.status = { state: 'connected', toolCount: tools.length, error: undefined };
      this.setStatus(config.id, conn.status);
      this.rebuildToolIndex();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus(config.id, { state: 'error', toolCount: 0, error: message });
    }
  }

  /** Open a transient client just long enough to fetch its tool list — used
   *  by the settings UI's "Test connection" button. Never registers tools
   *  with the running session. */
  async probeServer(config: McpServerConfig): Promise<McpToolMeta[]> {
    const { client, tools } = await this.connectAndList(config);
    try { await client.close(); } catch { /* ignore */ }
    return tools;
  }

  private async connectAndList(config: McpServerConfig): Promise<{ client: Client; tools: McpToolMeta[] }> {
    const transport = makeTransport(config);
    const client = new Client(
      { name: 'notes-app', version: '0.1.0' },
      { capabilities: {} },
    );
    await client.connect(transport);
    const result = await client.listTools();
    const short = shortServerId(config);
    const tools: McpToolMeta[] = (result.tools ?? []).map((t) => ({
      serverId: config.id,
      serverShort: short,
      originalName: t.name,
      description: t.description ?? '',
      inputSchema: normalizeMcpInputSchema(t.inputSchema as Record<string, unknown> | undefined),
      // Default to auto-execute. The MCP spec says unannotated tools should
      // be treated as mutations, but in practice almost no public servers
      // annotate, and a per-call approval card breaks the agentic loop —
      // the result has nowhere to go, so the model never produces a text
      // answer. We trust the server because the user explicitly added it
      // and only block tools that flag themselves `destructiveHint: true`.
      readOnly: (t.annotations as { destructiveHint?: boolean } | undefined)?.destructiveHint !== true,
    }));
    return { client, tools };
  }

  private rebuildToolIndex() {
    const next = new Map<string, McpToolMeta>();
    Array.from(this.connections.values()).forEach((conn) => {
      if (conn.status.state !== 'connected') return;
      for (const t of conn.tools) {
        next.set(namespacedName(t.serverShort, t.originalName), t);
      }
    });
    this.toolIndex = next;
  }

  /** Whether this namespaced tool name belongs to MCP (vs. a built-in). */
  static isMcpToolName(name: string): boolean {
    return name.startsWith(MCP_TOOL_PREFIX);
  }

  /** Auto-execute check used by the agent loop. Returns true for any tool
   *  not explicitly flagged `destructiveHint: true`, so the agentic loop
   *  can feed the result back without a per-call approval card. The name
   *  is historical — semantically this is "safe to auto-execute". */
  isReadOnly(namespacedName: string): boolean {
    return this.toolIndex.get(namespacedName)?.readOnly ?? false;
  }

  /** Description lookup for the approval card UI. */
  getToolMeta(namespacedName: string): McpToolMeta | undefined {
    return this.toolIndex.get(namespacedName);
  }

  /** Vercel AI SDK tool registry — merge target for `streamText`. */
  getActiveTools(): Record<string, Tool> {
    const out: Record<string, Tool> = {};
    Array.from(this.toolIndex.entries()).forEach(([name, meta]) => {
      out[name] = makeTool({
        description: meta.description,
        inputSchema: jsonSchema(meta.inputSchema as Parameters<typeof jsonSchema>[0]),
      });
    });
    return out;
  }

  /** Anthropic native shape — `tools: [{ name, description, input_schema }]`. */
  getAnthropicToolDefinitions(): AnthropicToolDefinition[] {
    const out: AnthropicToolDefinition[] = [];
    Array.from(this.toolIndex.entries()).forEach(([name, meta]) => {
      out.push({
        name,
        description: meta.description,
        input_schema: meta.inputSchema,
      });
    });
    return out;
  }

  /** Execute a namespaced MCP tool call and return the stringified result the
   *  model should see in its tool_result block. Errors are surfaced as a
   *  structured JSON string so the model can self-correct on the next turn. */
  async executeTool(namespacedName: string, input: unknown): Promise<string> {
    const meta = this.toolIndex.get(namespacedName);
    if (!meta) {
      return JSON.stringify({ error: `Unknown MCP tool: ${namespacedName}` });
    }
    const conn = this.connections.get(meta.serverId);
    if (!conn?.client || conn.status.state !== 'connected') {
      return JSON.stringify({ error: `MCP server "${conn?.config.name ?? meta.serverId}" is not connected.` });
    }
    let result;
    try {
      result = await conn.client.callTool({
        name: meta.originalName,
        arguments: (input && typeof input === 'object') ? (input as Record<string, unknown>) : {},
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return JSON.stringify({ error: message });
    }

    // Flatten the MCP content blocks into a plain string. Models cope better
    // with a single text payload than with nested JSON over a tool_result
    // boundary; image/audio blocks are summarized (browser MCP servers
    // returning binary content is unusual in v1, and we'd need provider-
    // specific encoding to surface them to the model anyway).
    if ('content' in result && Array.isArray(result.content)) {
      const parts: string[] = [];
      for (const block of result.content) {
        if (block.type === 'text') parts.push(block.text);
        else if (block.type === 'image') parts.push(`[image ${block.mimeType}, ${block.data.length} base64 chars]`);
        else if (block.type === 'audio') parts.push(`[audio ${block.mimeType}]`);
        else if (block.type === 'resource') {
          const r = block.resource;
          if ('text' in r) parts.push(`[resource ${r.uri}]\n${r.text}`);
          else parts.push(`[resource ${r.uri} (binary)]`);
        } else if (block.type === 'resource_link') {
          parts.push(`[resource_link ${block.uri}${block.name ? ` (${block.name})` : ''}]`);
        }
      }
      const text = parts.join('\n\n');
      if (result.isError) {
        return JSON.stringify({ error: text || 'Tool returned isError: true.' });
      }
      return text;
    }
    if ('toolResult' in result) {
      return typeof result.toolResult === 'string'
        ? result.toolResult
        : JSON.stringify(result.toolResult);
    }
    return JSON.stringify(result);
  }
}

/** OpenAI's tool-schema validator (and the AI SDK's strict-mode pass-through)
 *  rejects any `type: 'object'` schema that omits `properties`. MCP servers
 *  in the wild often ship the bare `{ "type": "object" }` form for tools
 *  that take no arguments — the gitmcp servers are a notable example. Walk
 *  the schema recursively and inject `properties: {}` wherever it's missing
 *  so every downstream provider accepts the tool declaration. Pass-through
 *  any other JSON Schema shape (string, array, etc.) untouched. */
function normalizeMcpInputSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }
  return normalizeObjectNode(schema) as Record<string, unknown>;
}

function normalizeObjectNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeObjectNode);
  if (!node || typeof node !== 'object') return node;
  const obj = { ...(node as Record<string, unknown>) };
  if (obj.type === 'object' && !('properties' in obj)) {
    obj.properties = {};
  }
  for (const key of ['properties', 'patternProperties', 'definitions', '$defs'] as const) {
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      const inner = obj[key] as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inner)) next[k] = normalizeObjectNode(v);
      obj[key] = next;
    }
  }
  for (const key of ['items', 'additionalProperties', 'contains', 'not', 'if', 'then', 'else'] as const) {
    if (obj[key] !== undefined) obj[key] = normalizeObjectNode(obj[key]);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(obj[key])) obj[key] = (obj[key] as unknown[]).map(normalizeObjectNode);
  }
  return obj;
}

function makeTransport(config: McpServerConfig): Transport {
  const url = new URL(config.url);
  const requestInit: RequestInit = config.headers && Object.keys(config.headers).length > 0
    ? { headers: config.headers }
    : {};
  if (config.transport === 'sse') {
    return new SSEClientTransport(url, { requestInit });
  }
  return new StreamableHTTPClientTransport(url, { requestInit });
}

function namespacedName(serverShort: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${serverShort}__${toolName}`;
}

/** A change that requires reconnecting the transport vs. just toggling state. */
function hasConnectionChanged(a: McpServerConfig, b: McpServerConfig): boolean {
  if (a.url !== b.url) return true;
  if (a.transport !== b.transport) return true;
  const aHeaders = JSON.stringify(a.headers ?? {});
  const bHeaders = JSON.stringify(b.headers ?? {});
  return aHeaders !== bHeaders;
}

// --- Singleton ---------------------------------------------------------------

let singleton: McpManager | null = null;

export function getMcpManager(): McpManager {
  if (!singleton) {
    singleton = new McpManager();
    singleton.ensureWired();
  }
  return singleton;
}

export { McpManager };
