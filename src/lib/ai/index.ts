// Provider registry for AI chat. Each provider adapter from the Vercel AI
// SDK exposes the same LanguageModelV2 contract, so the app talks to a
// single `ChatProvider` shape and adding a new vendor is a one-row change
// in the PROVIDERS map below.
//
// Credentials live in localStorage per provider so the user can keep all
// of them configured and flip the active one without re-pasting. For
// Anthropic / OpenAI / Google Gemini the browser calls the provider's
// public API directly. AWS Bedrock and Google Vertex AI don't allow
// browser-direct calls (no CORS), so requests for those two route through
// the app's own /api/ai/* proxy. The credential still ships from
// localStorage with each request and is never persisted server-side.

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

export type Role = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: Role;
  content: string;
}

export type ProviderId = 'anthropic' | 'openai' | 'google' | 'bedrock' | 'vertex';

/** How the user enters the credential. `string` = single-line input, `json` = multiline JSON paste. */
export type KeyKind = 'string' | 'json';

export interface ProviderModel {
  id: string;
  label: string;
}

export interface ChatProvider {
  id: ProviderId;
  label: string;
  keyLabel: string;
  docsUrl: string;
  models: ProviderModel[];
  defaultModel: string;
  /** Browser-direct provider factory. Server-proxied providers leave this undefined. */
  factory?: (apiKey: string) => (modelId: string) => LanguageModel;
  /** UI hint: render an input vs a textarea. Defaults to 'string'. */
  keyKind?: KeyKind;
  /** When true, requests route through `/api/ai/<id>` instead of the provider's API. */
  serverProxy?: boolean;
}

/** Default region used for AWS Bedrock proxy calls when the user hasn't picked one. */
export const BEDROCK_REGION = 'us-east-1';
/**
 * Default location for Google Vertex AI proxy calls. `global` is now the
 * recommended Vertex endpoint: it has no pricing premium, supports the
 * newest Gemini 3.x and Claude 4.5+ models (which are global-only), and
 * still works for older Gemini 2.5 models. We default to it so a single
 * value covers every model in our registry.
 */
export const VERTEX_LOCATION = 'global';

/**
 * AWS regions where Bedrock is available, paired with the cross-region
 * inference-profile prefix that the runtime expects for Claude / Llama /
 * Mistral models in that region. Bedrock won't accept a bare Claude 4.x
 * model ID — the call must go through a regional inference profile, e.g.
 * `us.anthropic.claude-sonnet-4-6` from us-east-1 or
 * `jp.anthropic.claude-sonnet-4-5-20250929-v1:0` from ap-northeast-1.
 */
export interface BedrockRegion {
  id: string;
  label: string;
  /** Inference-profile prefix to prepend to model IDs in this region. */
  prefix: string;
}

export const BEDROCK_REGIONS: BedrockRegion[] = [
  { id: 'us-east-1',      label: 'US East (N. Virginia)',     prefix: 'us.' },
  { id: 'us-east-2',      label: 'US East (Ohio)',            prefix: 'us.' },
  { id: 'us-west-2',      label: 'US West (Oregon)',          prefix: 'us.' },
  { id: 'eu-west-1',      label: 'Europe (Ireland)',          prefix: 'eu.' },
  { id: 'eu-central-1',   label: 'Europe (Frankfurt)',        prefix: 'eu.' },
  { id: 'eu-west-3',      label: 'Europe (Paris)',            prefix: 'eu.' },
  { id: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)',      prefix: 'apac.' },
  { id: 'ap-northeast-2', label: 'Asia Pacific (Seoul)',      prefix: 'apac.' },
  { id: 'ap-northeast-3', label: 'Asia Pacific (Osaka)',      prefix: 'apac.' },
  { id: 'ap-southeast-1', label: 'Asia Pacific (Singapore)',  prefix: 'apac.' },
  { id: 'ap-southeast-2', label: 'Asia Pacific (Sydney)',     prefix: 'apac.' },
  { id: 'ap-south-1',     label: 'Asia Pacific (Mumbai)',     prefix: 'apac.' },
];

const BEDROCK_REGION_KEY = 'notes:ai:bedrock:region';

export function getBedrockRegion(): string {
  if (typeof window === 'undefined') return BEDROCK_REGION;
  const stored = window.localStorage.getItem(BEDROCK_REGION_KEY);
  if (stored && BEDROCK_REGIONS.some(r => r.id === stored)) return stored;
  return BEDROCK_REGION;
}

export function setBedrockRegion(region: string): void {
  if (typeof window === 'undefined') return;
  if (BEDROCK_REGIONS.some(r => r.id === region)) {
    window.localStorage.setItem(BEDROCK_REGION_KEY, region);
    window.dispatchEvent(new CustomEvent('ai:bedrock-region-changed'));
  }
}

export const PROVIDERS: Record<ProviderId, ChatProvider> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    keyLabel: 'Anthropic API key (sk-ant-…)',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    ],
    defaultModel: 'claude-sonnet-4-6',
    factory: (apiKey) => createAnthropic({
      apiKey,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    }),
  },
  openai: {
    id: 'openai',
    label: 'OpenAI ChatGPT',
    keyLabel: 'OpenAI API key (sk-…)',
    docsUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5' },
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano' },
    ],
    defaultModel: 'gpt-5.5',
    factory: (apiKey) => createOpenAI({ apiKey }),
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    keyLabel: 'Google Generative AI key',
    docsUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
    ],
    defaultModel: 'gemini-3-flash-preview',
    factory: (apiKey) => createGoogleGenerativeAI({ apiKey }),
  },
  bedrock: {
    id: 'bedrock',
    label: 'AWS Bedrock',
    keyLabel: 'Bedrock API key (bedrock-api-key-…)',
    docsUrl: 'https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html',
    // Modern Claude 4.x and Nova 2 use `global.*` inference profiles that
    // route from any AWS region — no region-specific dance needed. Older
    // Nova v1 / Llama / Mistral don't have global profiles, so they're
    // stored bare and the proxy route prepends the region's prefix
    // (us./eu./jp./apac./au.) at request time.
    models: [
      { id: 'global.anthropic.claude-opus-4-7', label: 'Claude Opus 4.7' },
      { id: 'global.anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
      { id: 'global.anthropic.claude-opus-4-6-v1', label: 'Claude Opus 4.6' },
      { id: 'global.anthropic.claude-opus-4-5-20251101-v1:0', label: 'Claude Opus 4.5' },
      { id: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0', label: 'Claude Sonnet 4.5' },
      { id: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5' },
      { id: 'global.amazon.nova-2-lite-v1:0', label: 'Amazon Nova 2 Lite' },
      { id: 'amazon.nova-pro-v1:0', label: 'Amazon Nova Pro' },
      { id: 'amazon.nova-lite-v1:0', label: 'Amazon Nova Lite' },
      { id: 'amazon.nova-micro-v1:0', label: 'Amazon Nova Micro' },
      // Llama 4 and Mistral Large were dropped from the default list:
      // their Bedrock inference profiles are gated per AWS account and
      // commonly missing in APAC/EU regions, which surfaced as confusing
      // "model identifier invalid" 400s. Power users can paste a custom
      // model ID via the chat picker once we expose that.
    ],
    defaultModel: 'global.anthropic.claude-sonnet-4-6',
    serverProxy: true,
  },
  vertex: {
    id: 'vertex',
    label: 'Google Vertex AI',
    keyLabel: 'Paste service-account JSON',
    docsUrl: 'https://cloud.google.com/iam/docs/keys-create-delete',
    // Model IDs sourced from the official Google + Anthropic docs:
    //   docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-pro
    //   docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro
    //   docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash
    //   platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai
    //
    // Default is gemini-2.5-flash because it works in every project shape
    // (including AI Studio Express). Gemini 3.x and Claude on Vertex
    // require Model Garden access on a billing-enabled GCP project — they
    // 404 in Express projects. The route surfaces Google's verbatim
    // "Publisher Model … was not found" error so users see exactly which
    // model their project lacks.
    models: [
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)' },
      { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro (preview)' },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (Vertex)' },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Vertex)' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Vertex)' },
      { id: 'claude-opus-4-5@20251101', label: 'Claude Opus 4.5 (Vertex)' },
      { id: 'claude-sonnet-4-5@20250929', label: 'Claude Sonnet 4.5 (Vertex)' },
      { id: 'claude-haiku-4-5@20251001', label: 'Claude Haiku 4.5 (Vertex)' },
    ],
    defaultModel: 'gemini-2.5-flash',
    keyKind: 'json',
    serverProxy: true,
  },
};

export const PROVIDER_IDS: ProviderId[] = ['anthropic', 'openai', 'google', 'bedrock', 'vertex'];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && (PROVIDER_IDS as string[]).includes(v);
}

// --- localStorage keys ---

const ACTIVE_KEY = 'notes:ai:active';
const apiKeyKey = (p: ProviderId) => `notes:ai:key:${p}`;

export interface ActiveSelection {
  providerId: ProviderId;
  model: string;
}

const DEFAULT_ACTIVE: ActiveSelection = {
  providerId: 'anthropic',
  model: PROVIDERS.anthropic.defaultModel,
};

export function getActiveSelection(): ActiveSelection {
  if (typeof window === 'undefined') return DEFAULT_ACTIVE;
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    if (!raw) return DEFAULT_ACTIVE;
    const parsed = JSON.parse(raw) as Partial<ActiveSelection>;
    if (!isProviderId(parsed.providerId)) {
      window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(DEFAULT_ACTIVE));
      return DEFAULT_ACTIVE;
    }
    const provider = PROVIDERS[parsed.providerId];
    const modelValid = typeof parsed.model === 'string'
      && provider.models.some(m => m.id === parsed.model);
    const selection: ActiveSelection = {
      providerId: parsed.providerId,
      model: modelValid ? (parsed.model as string) : provider.defaultModel,
    };
    if (!modelValid) {
      window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(selection));
    }
    return selection;
  } catch {
    return DEFAULT_ACTIVE;
  }
}

export function setActiveSelection(next: ActiveSelection): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('ai:active-changed'));
}

export function getApiKey(providerId: ProviderId): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(apiKeyKey(providerId)) || '';
}

export function setApiKey(providerId: ProviderId, key: string): void {
  if (typeof window === 'undefined') return;
  if (key) {
    window.localStorage.setItem(apiKeyKey(providerId), key);
  } else {
    window.localStorage.removeItem(apiKeyKey(providerId));
  }
  window.dispatchEvent(new CustomEvent('ai:key-changed', { detail: { providerId } }));
}

export function hasConfiguredKey(providerId: ProviderId): boolean {
  return getApiKey(providerId).trim().length > 0;
}

/**
 * Wipe every AI provider credential from localStorage. Used by the
 * "Clear all credentials" button in settings — useful for shared machines,
 * incident response, or when the user wants to revoke this app's access
 * to their AI accounts. Also clears the active-selection record so the
 * UI re-prompts on next use. Bedrock region is preserved (it's a
 * preference, not a secret).
 */
export function clearAllApiKeys(): void {
  if (typeof window === 'undefined') return;
  for (const pid of PROVIDER_IDS) {
    window.localStorage.removeItem(apiKeyKey(pid));
    window.dispatchEvent(new CustomEvent('ai:key-changed', { detail: { providerId: pid } }));
  }
  window.localStorage.removeItem(ACTIVE_KEY);
  window.dispatchEvent(new CustomEvent('ai:active-changed'));
}

// --- Error shape ---

export class ChatProviderError extends Error {
  readonly provider: ProviderId;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(opts: { provider: ProviderId; status?: number; message: string; retryable?: boolean }) {
    super(opts.message);
    this.name = 'ChatProviderError';
    this.provider = opts.provider;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
  }
}
