// Integration-test helper: renders the full <NotesPage> against a
// FakeNoteStore with the heavy editor/graph/palette components stubbed.
//
// Usage from a test file:
//
//   import { vi } from 'vitest';
//   import { renderApp, storeRegistry } from '@/utils/test/render-app';
//
//   vi.mock('@/lib/storage', async (orig) => {
//     const actual = await orig<typeof import('@/lib/storage')>();
//     const { storeRegistry } = await import('@/utils/test/render-app');
//     return { ...actual, getStore: () => storeRegistry.get() };
//   });
//   vi.mock('@/components/MilkdownEditor', async () => {
//     const { MilkdownStub } = await import('@/utils/test/render-app');
//     return { default: MilkdownStub };
//   });
//   // (same for GraphView / CommandPalette / FileExplorerPalette)
//
// `storeRegistry` is the bridge between vi.mock (hoisted, can't see closures)
// and the per-test FakeNoteStore. Each renderApp() call swaps the active
// store and the mocked getStore() returns whichever store the latest call
// registered.

import React from 'react';
import { act, fireEvent } from '@testing-library/react';
import { FakeNoteStore } from './fake-store';
import { renderWithIntl } from './intl';

// ---------- Polyfills (idempotent — safe to re-import)

let polyfillsInstalled = false;
function installPolyfills(): void {
  if (polyfillsInstalled) return;
  polyfillsInstalled = true;

  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;
  }

  if (typeof globalThis.IntersectionObserver === 'undefined') {
    class IntersectionObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds: ReadonlyArray<number> = [];
    }
    (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserverStub }).IntersectionObserver = IntersectionObserverStub;
  }

  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList);
  }

  if (typeof globalThis.BroadcastChannel === 'undefined') {
    type Listener = (ev: MessageEvent) => void;
    const channels = new Map<string, Set<BroadcastChannelStub>>();
    class BroadcastChannelStub {
      readonly name: string;
      private listeners = new Set<Listener>();
      onmessage: Listener | null = null;
      constructor(name: string) {
        this.name = name;
        if (!channels.has(name)) channels.set(name, new Set());
        channels.get(name)!.add(this);
      }
      postMessage(data: unknown): void {
        const peers = channels.get(this.name);
        if (!peers) return;
        for (const peer of Array.from(peers)) {
          if (peer === this) continue;
          const ev = { data } as MessageEvent;
          peer.onmessage?.(ev);
          for (const l of Array.from(peer.listeners)) l(ev);
        }
      }
      addEventListener(_type: 'message', listener: Listener): void {
        this.listeners.add(listener);
      }
      removeEventListener(_type: 'message', listener: Listener): void {
        this.listeners.delete(listener);
      }
      close(): void {
        channels.get(this.name)?.delete(this);
        this.listeners.clear();
      }
    }
    (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannelStub }).BroadcastChannel = BroadcastChannelStub;
  }

  if (typeof URL !== 'undefined') {
    if (typeof URL.createObjectURL !== 'function') {
      let counter = 0;
      URL.createObjectURL = () => `blob:fake:${++counter}`;
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = () => {};
    }
  }

  if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.randomUUID !== 'function') {
    let counter = 0;
    const existing = (globalThis.crypto ?? {}) as Crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...existing,
        randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
      },
      configurable: true,
    });
  }
}

// ---------- Active-store registry

class StoreRegistry {
  private active: FakeNoteStore | null = null;
  set(store: FakeNoteStore): void { this.active = store; }
  get(): FakeNoteStore {
    if (!this.active) {
      throw new Error('No active FakeNoteStore — call renderApp() first or seed via storeRegistry.set().');
    }
    return this.active;
  }
  clear(): void { this.active = null; }
}

export const storeRegistry = new StoreRegistry();

// ---------- Stub components used by vi.mock factories in test files

export type MilkdownStubProps = {
  defaultValue?: string;
  onReady?: (getMarkdown: () => string, editorApi: {
    replaceMarkdown: (md: string, opts?: { revealChange?: boolean }) => boolean;
  }) => void;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  noteKey?: string;
  locked?: boolean;
};

export const MilkdownStub: React.FC<MilkdownStubProps> = ({
  defaultValue = '',
  onReady,
  onChange,
  placeholder,
  noteKey,
  locked,
}) => {
  const [value, setValue] = React.useState(defaultValue);
  const valueRef = React.useRef(value);
  valueRef.current = value;
  React.useEffect(() => {
    setValue(defaultValue);
    valueRef.current = defaultValue;
  }, [defaultValue, noteKey]);
  React.useEffect(() => {
    if (!onReady) return;
    onReady(
      () => valueRef.current,
      {
        replaceMarkdown: (md) => {
          setValue(md);
          valueRef.current = md;
          return true;
        },
      },
    );
  }, [noteKey, onReady]);
  return (
    <textarea
      data-testid="milkdown-stub"
      value={value}
      placeholder={placeholder}
      readOnly={!!locked}
      onChange={(e) => {
        if (locked) return;
        const v = e.target.value;
        setValue(v);
        valueRef.current = v;
        onChange?.(v);
      }}
    />
  );
};

export const GraphStub: React.FC<{ onClose?: () => void }> = ({ onClose }) => (
  <div data-testid="graph-stub">
    <button onClick={onClose}>close-graph</button>
  </div>
);

export const CommandPaletteStub: React.FC<{ open?: boolean; onClose?: () => void }> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div data-testid="palette-stub" role="dialog">
      <button onClick={onClose}>close-palette</button>
    </div>
  );
};

export const FileExplorerStub: React.FC<{ open?: boolean; onClose?: () => void }> = ({ open, onClose }) => {
  if (!open) return null;
  return (
    <div data-testid="file-explorer-stub" role="dialog">
      <button onClick={onClose}>close-explorer</button>
    </div>
  );
};

// ---------- Public render helper

export type RenderAppOptions = {
  store?: FakeNoteStore;
  /** Forces an initial pathname before <NotesPage> mounts. Default '/'. */
  pathname?: string;
};

export type RenderAppResult = ReturnType<typeof renderWithIntl> & {
  store: FakeNoteStore;
  flushAsync: () => Promise<void>;
  /** Helper: change an input's value via fireEvent and wait a tick. */
  type: (el: HTMLElement, value: string) => Promise<void>;
};

export async function renderApp(opts: RenderAppOptions = {}): Promise<RenderAppResult> {
  installPolyfills();

  const store = opts.store ?? new FakeNoteStore();
  storeRegistry.set(store);

  // Importing the page lazily means any module-level side effects (or vi.mock
  // factories defined by the caller) are applied before the component runs.
  const mod = await import('@/app/[locale]/page');
  const NotesPage = mod.default;

  const rendered = renderWithIntl(<NotesPage />);
  const flushAsync = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };
  const type = async (el: HTMLElement, value: string) => {
    await act(async () => {
      fireEvent.change(el, { target: { value } });
    });
    await flushAsync();
  };
  // First await tick so the store-init effect has a chance to resolve before
  // the test's first assertion runs.
  await flushAsync();
  return { ...rendered, store, flushAsync, type };
}
