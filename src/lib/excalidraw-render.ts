// Render Excalidraw scene JSON as a live SVG preview inside Milkdown code
// blocks. This mirrors the Mermaid preview flow: detect candidate code
// blocks, parse the source, lazy-load the renderer, and append a preview div
// inside the code-block NodeView.

import { extractCodeFromBlock, getBlockLanguage } from './codeblock-dom';
import { escapeHtml } from './html-escape';

type ExcalidrawSceneData = {
  type?: string;
  source?: string;
  elements?: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

type SceneValidationSummary = {
  errors: string[];
  notes: string[];
};

type ExcalidrawLib = {
  exportToSvg: (opts: {
    elements: readonly unknown[];
    appState?: Record<string, unknown>;
    files: Record<string, unknown> | null;
    exportPadding?: number;
  }) => Promise<SVGSVGElement>;
  getNonDeletedElements: (elements: readonly unknown[]) => readonly unknown[];
  newTextElement: (opts: {
    x: number;
    y: number;
    text: string;
    originalText?: string;
    fontSize?: number;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'middle' | 'bottom';
    strokeColor?: string;
    backgroundColor?: string;
  }) => unknown;
  restoreElements: (elements: unknown, localElements?: readonly unknown[] | null) => readonly unknown[];
  restoreAppState: (
    appState: unknown,
    localAppState?: Record<string, unknown> | null,
  ) => Record<string, unknown>;
};

type ExcalidrawBlockState =
  | { kind: 'skip' }
  | { kind: 'empty'; cacheKey: string }
  | { kind: 'error'; cacheKey: string; message: string }
  | { kind: 'scene'; cacheKey: string; scene: ExcalidrawSceneData };

const JSON_LANGUAGES = new Set(['json']);

let excalidrawPromise: Promise<ExcalidrawLib> | null = null;

function loadExcalidraw(): Promise<ExcalidrawLib> {
  if (!excalidrawPromise) {
    excalidrawPromise = import('@excalidraw/excalidraw').then(mod => {
      const api = mod as unknown as Record<string, unknown>;
      return {
        exportToSvg: api['exportToSvg'] as ExcalidrawLib['exportToSvg'],
        getNonDeletedElements: api['getNonDeletedElements'] as ExcalidrawLib['getNonDeletedElements'],
        newTextElement: api['newTextElement'] as ExcalidrawLib['newTextElement'],
        restoreElements: api['restoreElements'] as ExcalidrawLib['restoreElements'],
        restoreAppState: api['restoreAppState'] as ExcalidrawLib['restoreAppState'],
      };
    });
  }
  return excalidrawPromise;
}

function resolveExcalidrawBlockState(block: HTMLElement): ExcalidrawBlockState {
  const language = getBlockLanguage(block);
  if (language !== 'excalidraw' && !JSON_LANGUAGES.has(language)) return { kind: 'skip' };

  const code = extractCodeFromBlock(block);
  const cacheKey = `${language}:${code}`;
  if (!code.trim()) {
    return language === 'excalidraw' ? { kind: 'empty', cacheKey } : { kind: 'skip' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return language === 'excalidraw'
      ? { kind: 'error', cacheKey, message: `Invalid Excalidraw JSON: ${message}` }
      : { kind: 'skip' };
  }

  if (!isExcalidrawSceneData(parsed, language)) {
    return language === 'excalidraw'
      ? { kind: 'error', cacheKey, message: 'JSON does not look like an Excalidraw scene' }
      : { kind: 'skip' };
  }

  const validationMessage = buildSceneValidationMessage(parsed);
  if (validationMessage) {
    return language === 'excalidraw'
      ? { kind: 'error', cacheKey, message: validationMessage }
      : { kind: 'skip' };
  }

  return { kind: 'scene', cacheKey, scene: parsed };
}

function isExcalidrawSceneData(value: unknown, language: string): value is ExcalidrawSceneData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const scene = value as Record<string, unknown>;
  if (!Array.isArray(scene.elements)) return false;
  if (language === 'excalidraw') return true;
  return scene.type === 'excalidraw'
    || (typeof scene.source === 'string' && scene.source.toLowerCase().includes('excalidraw'));
}

function validateScene(scene: ExcalidrawSceneData): SceneValidationSummary {
  const summary: SceneValidationSummary = { errors: [], notes: [] };

  const elements = scene.elements ?? [];
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index];
    const elementNumber = index + 1;
    const name = `Element ${elementNumber}`;

    if (!element || typeof element !== 'object' || Array.isArray(element)) {
      summary.errors.push(`${name} must be an object.`);
      continue;
    }

    const record = element as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    const typedName = type ? `${name} (${type})` : name;

    if (!type) {
      summary.errors.push(`${name} is missing "type".`);
      continue;
    }

    if (typeof record.id !== 'string' || record.id.trim() === '') {
      summary.notes.push(`${typedName} is missing "id"; Excalidraw will generate one.`);
    }
  }

  return summary;
}

function buildSceneValidationMessage(scene: ExcalidrawSceneData, fallback?: string): string | null {
  const summary = validateScene(scene);
  if (summary.errors.length === 0) return fallback ?? null;

  const details = summary.errors.slice(0, 3).join(' ');
  const suffix = fallback ? ` Renderer detail: ${fallback}` : '';
  return `This block is not valid Excalidraw scene JSON. ${details} Use JSON exported by Excalidraw itself.${suffix}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readLabelText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? text : null;
  }

  const label = asRecord(value);
  if (!label) return null;
  const text = label.text;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

function normalizeLinearPoints(element: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(element.points)) return element;

  const width = asNumber(element.width) ?? 0;
  const height = asNumber(element.height) ?? 0;
  return {
    ...element,
    points: [
      [0, 0],
      [width, height],
    ],
  };
}

function createLabelElement(
  excalidraw: ExcalidrawLib,
  element: Record<string, unknown>,
): unknown | null {
  const text = readLabelText(element.label);
  if (!text) return null;

  const x = asNumber(element.x);
  const y = asNumber(element.y);
  const width = asNumber(element.width);
  const height = asNumber(element.height);
  if (x === null || y === null || width === null || height === null) return null;

  return excalidraw.newTextElement({
    x: x + width / 2,
    y: y + height / 2,
    text,
    originalText: text,
    textAlign: 'center',
    verticalAlign: 'middle',
    strokeColor: typeof element.strokeColor === 'string' ? element.strokeColor : '#1e1e1e',
    backgroundColor: 'transparent',
  });
}

function normalizeScene(scene: ExcalidrawSceneData, excalidraw: ExcalidrawLib): ExcalidrawSceneData {
  const normalizedElements: unknown[] = [];

  for (const element of scene.elements ?? []) {
    const record = asRecord(element);
    if (!record) {
      normalizedElements.push(element);
      continue;
    }

    const type = typeof record.type === 'string' ? record.type : '';
    const normalized = type === 'arrow' || type === 'line' || type === 'freedraw'
      ? normalizeLinearPoints(record)
      : record;

    normalizedElements.push(normalized);

    const labelElement = createLabelElement(excalidraw, normalized);
    if (labelElement) normalizedElements.push(labelElement);
  }

  return {
    ...scene,
    elements: normalizedElements,
  };
}

function ensureExcalidrawPreview(block: HTMLElement): HTMLElement {
  let preview = block.querySelector<HTMLElement>(':scope > .excalidraw-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'excalidraw-preview';
    preview.setAttribute('contenteditable', 'false');
    block.appendChild(preview);
  }
  return preview;
}

function cleanupStalePreviews(root: HTMLElement, activeBlocks: ReadonlySet<HTMLElement>): void {
  root.querySelectorAll<HTMLElement>('.excalidraw-preview').forEach(preview => {
    const block = preview.closest<HTMLElement>('.milkdown-code-block');
    if (!block || !activeBlocks.has(block)) preview.remove();
  });
}

function filesOrNull(files: unknown): Record<string, unknown> | null {
  return files && typeof files === 'object' && !Array.isArray(files)
    ? (files as Record<string, unknown>)
    : null;
}

/**
 * Render Excalidraw scene JSON code blocks as SVG previews. Supports
 * `excalidraw` fenced blocks directly, plus `json` blocks when the
 * parsed JSON explicitly identifies itself as Excalidraw scene data.
 */
export async function renderExcalidrawBlocks(root: HTMLElement): Promise<void> {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('.milkdown-code-block'))
    .map(block => ({ block, state: resolveExcalidrawBlockState(block) }))
    .filter(
      (entry): entry is { block: HTMLElement; state: ExcalidrawBlockState & { kind: Exclude<ExcalidrawBlockState['kind'], 'skip'> } } =>
        entry.state.kind !== 'skip',
    );

  const activeBlocks = new Set(candidates.map(entry => entry.block));
  cleanupStalePreviews(root, activeBlocks);
  if (candidates.length === 0) return;

  const excalidraw = candidates.some(entry => entry.state.kind === 'scene')
    ? await loadExcalidraw()
    : null;

  for (const { block, state } of candidates) {
    const preview = ensureExcalidrawPreview(block);
    if (preview.dataset.source === state.cacheKey) continue;
    preview.dataset.source = state.cacheKey;

    if (state.kind === 'empty') {
      preview.innerHTML = '<div class="excalidraw-empty">Empty drawing</div>';
      continue;
    }

    if (state.kind === 'error') {
      preview.innerHTML = `<div class="excalidraw-error">${escapeHtml(state.message)}</div>`;
      continue;
    }

    if (!excalidraw) continue;

    try {
      const normalizedScene = normalizeScene(state.scene, excalidraw);
      const restoredElements = excalidraw.restoreElements(normalizedScene.elements ?? [], null);
      const restoredAppState = excalidraw.restoreAppState(state.scene.appState ?? {}, null);
      const svg = await excalidraw.exportToSvg({
        elements: excalidraw.getNonDeletedElements(restoredElements),
        appState: {
          ...restoredAppState,
          exportBackground: true,
        },
        files: filesOrNull(state.scene.files),
        exportPadding: 12,
      });
      if (preview.dataset.source !== state.cacheKey) continue;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
      preview.replaceChildren(svg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const validationMessage = buildSceneValidationMessage(state.scene, msg);
      preview.innerHTML = `<div class="excalidraw-error">${escapeHtml(validationMessage ?? msg)}</div>`;
    }
  }
}
