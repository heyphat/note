// Reproduction harness for the "wikilink rendered as raw text" regression.
//
// Mounts the real MilkdownEditor (not the stub) against markdown that
// contains a bracketed reference inside a heading — including the
// strikethrough variant that triggered the user's report. After the editor
// hydrates, the document should expose a `.wikilink` decoration.
//
// Crepe (Milkdown's editor) doesn't hydrate cleanly in jsdom — the schema
// timer race surfaces as "Timer 'SchemaReady' not found" during plugin
// registration. Until we either fix that or move the regression coverage
// to Playwright, the assertions are gated on `RUN_FULL_EDITOR=1`. The
// pure-parser path is covered exhaustively in
// `src/lib/links/link-parser.test.ts`.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import MilkdownEditor from '@/components/MilkdownEditor';

const FULL_EDITOR = process.env.RUN_FULL_EDITOR === '1';
const itEditor = FULL_EDITOR ? it : it.skip;

afterEach(() => cleanup());

async function flushAsync() {
  await act(async () => {
    await new Promise(r => setTimeout(r, 50));
  });
}

describe.skipIf(!FULL_EDITOR)('Wikilink rendering regression (real editor)', () => {
  itEditor('decorates [[X]] inside a normal paragraph', async () => {
    const onReady = vi.fn();
    const { container, unmount } = render(
      <MilkdownEditor
        defaultValue={'see [[Search & Discovery]] please'}
        noteKey="probe-1"
        onReady={onReady}
        isKnownLinkTarget={() => false}
        getWikilinkCandidates={() => []}
      />,
    );
    for (let i = 0; i < 20; i++) {
      await flushAsync();
      if (container.querySelector('.wikilink')) break;
    }
    const decoration = container.querySelector('.wikilink');
    expect(decoration?.textContent).toContain('Search & Discovery');
    unmount();
  });

  itEditor('decorates [[X]] inside a heading wrapped in GFM strikethrough', async () => {
    const onReady = vi.fn();
    const { container, unmount } = render(
      <MilkdownEditor
        defaultValue={'## ~~1. [[Search & Discovery]] (P0)~~\n\nbody'}
        noteKey="probe-2"
        onReady={onReady}
        isKnownLinkTarget={() => false}
        getWikilinkCandidates={() => []}
      />,
    );
    for (let i = 0; i < 20; i++) {
      await flushAsync();
      if (container.querySelector('.wikilink')) break;
    }
    const decoration = container.querySelector('.wikilink');
    expect(decoration?.textContent).toContain('Search & Discovery');
    unmount();
  });
});
