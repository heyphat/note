/**
 * Milkdown plugin for playable YouTube embeds.
 *
 * Source stays as portable markdown:
 * ```youtube
 * https://www.youtube.com/watch?v=...
 * ```
 *
 * The plugin leaves the code block editable and paints a read-only widget
 * underneath it, so no custom markdown schema or serializer is needed.
 */

import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';

const YOUTUBE_LANGUAGES = new Set(['youtube', 'yt']);
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const key = new PluginKey('NOTES_YOUTUBE_EMBED');

export interface YouTubeEmbed {
  videoId: string;
  startSeconds: number;
}

interface YouTubeBlock {
  insertAt: number;
  code: string;
  blockKey: string;
}

function firstNonEmptyLine(source: string): string {
  return source
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean) ?? '';
}

function normalizeHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^(www|m|music)\./, '');
}

function parseTimestamp(value: string | null): number {
  if (!value) return 0;
  const raw = value.trim().toLowerCase();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(raw);
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return (hours * 3600) + (minutes * 60) + seconds;
}

function parseHashTimestamp(hash: string): number {
  if (!hash) return 0;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return parseTimestamp(params.get('t') ?? params.get('start'));
}

function extractVideoId(url: URL): string {
  const host = normalizeHost(url.hostname);
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') return parts[0] ?? '';
  if (host === 'youtube-nocookie.com' && parts[0] === 'embed') return parts[1] ?? '';
  if (host !== 'youtube.com') return '';

  if (url.pathname === '/watch') return url.searchParams.get('v') ?? '';
  if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) return parts[1] ?? '';
  return '';
}

export function parseYouTubeEmbed(source: string): YouTubeEmbed | null {
  const candidate = firstNonEmptyLine(source);
  if (!candidate) return null;

  if (VIDEO_ID_RE.test(candidate)) {
    return { videoId: candidate, startSeconds: 0 };
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  const videoId = extractVideoId(url);
  if (!VIDEO_ID_RE.test(videoId)) return null;

  const startSeconds = parseTimestamp(url.searchParams.get('start'))
    || parseTimestamp(url.searchParams.get('t'))
    || parseHashTimestamp(url.hash);

  return { videoId, startSeconds };
}

function youtubeEmbedUrl(embed: YouTubeEmbed): string {
  const url = new URL(`https://www.youtube-nocookie.com/embed/${embed.videoId}`);
  url.searchParams.set('rel', '0');
  if (embed.startSeconds > 0) url.searchParams.set('start', String(embed.startSeconds));
  return url.toString();
}

function collectYoutubeBlocks(doc: ProseNode): YouTubeBlock[] {
  const out: YouTubeBlock[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true;
    const language = String(node.attrs.language ?? '').trim().toLowerCase();
    if (!YOUTUBE_LANGUAGES.has(language)) return false;

    out.push({
      insertAt: pos + node.nodeSize,
      code: node.textContent,
      blockKey: `youtube:${pos}`,
    });
    return false;
  });
  return out;
}

function renderEmpty(root: HTMLElement): void {
  const empty = document.createElement('div');
  empty.className = 'youtube-empty';
  empty.textContent = 'Paste a YouTube URL into this block.';
  root.replaceChildren(empty);
}

function renderError(root: HTMLElement): void {
  const error = document.createElement('div');
  error.className = 'youtube-error';
  error.textContent = 'Enter a valid YouTube URL, e.g. https://youtu.be/dQw4w9WgXcQ';
  root.replaceChildren(error);
}

function renderFrame(root: HTMLElement, embed: YouTubeEmbed): void {
  const frame = document.createElement('div');
  frame.className = 'youtube-frame';

  const iframe = document.createElement('iframe');
  iframe.src = youtubeEmbedUrl(embed);
  iframe.title = `YouTube video ${embed.videoId}`;
  iframe.loading = 'lazy';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';

  frame.appendChild(iframe);
  root.replaceChildren(frame);
}

function createYoutubeWidget(code: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'youtube-preview';
  root.contentEditable = 'false';

  const trimmed = code.trim();
  if (!trimmed) {
    renderEmpty(root);
    return root;
  }

  const embed = parseYouTubeEmbed(code);
  if (!embed) {
    renderError(root);
    return root;
  }

  renderFrame(root, embed);
  return root;
}

export function createYoutubeEmbedPlugin(): Plugin {
  function buildDecorations(state: EditorState): DecorationSet {
    const blocks = collectYoutubeBlocks(state.doc);
    const decos = blocks.map(block => Decoration.widget(
      block.insertAt,
      () => createYoutubeWidget(block.code),
      {
        side: 1,
        key: `${block.blockKey}:${block.code}`,
      },
    ));
    return DecorationSet.create(state.doc, decos);
  }

  return new Plugin({
    key,
    state: {
      init(_cfg, state) {
        return { deco: buildDecorations(state) };
      },
      apply(tr, value, _oldState, newState) {
        if (tr.docChanged) return { deco: buildDecorations(newState) };
        return { deco: value.deco.map(tr.mapping, tr.doc) };
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)?.deco ?? null;
      },
    },
  });
}

export function createYoutubeEmbedEditorPlugin() {
  return $prose(() => createYoutubeEmbedPlugin());
}
