import { describe, it, expect, vi } from 'vitest';
import { renderCanvasMarkdown } from './markdown-render';

describe('renderCanvasMarkdown', () => {
  it('returns markdown-it HTML when no proxy is supplied', () => {
    const out = renderCanvasMarkdown('# Hello\n\nworld');
    expect(out).toContain('<h1>Hello</h1>');
    expect(out).toContain('<p>world</p>');
  });

  it('rewrites every <img> src through the proxy', () => {
    const proxy = vi.fn((url: string) => `/api/notes/_assets/${url.replace(/^\.assets\//, '')}`);
    const out = renderCanvasMarkdown('![alt](.assets/images/foo.png)', proxy);
    expect(proxy).toHaveBeenCalledWith('.assets/images/foo.png');
    expect(out).toContain('src="/api/notes/_assets/images/foo.png"');
    expect(out).not.toContain('src=".assets/images/foo.png"');
  });

  it('rewrites multiple images, each src individually', () => {
    const proxy = vi.fn((url: string) => `proxied:${url}`);
    const md = '![a](one.png)\n\n![b](two.jpg)';
    const out = renderCanvasMarkdown(md, proxy);
    expect(proxy).toHaveBeenCalledWith('one.png');
    expect(proxy).toHaveBeenCalledWith('two.jpg');
    expect(out).toContain('src="proxied:one.png"');
    expect(out).toContain('src="proxied:two.jpg"');
  });

  it('leaves absolute URLs alone if the proxy passes them through', () => {
    const proxy = (url: string) => (url.startsWith('http') ? url : `/_/${url}`);
    const out = renderCanvasMarkdown('![](https://cdn.test/foo.png)', proxy);
    expect(out).toContain('src="https://cdn.test/foo.png"');
  });

  it('preserves the alt attribute through the rewrite', () => {
    // Earlier bugs in this area corrupted other attributes when modifying
    // src — this test guards against regressions of that kind.
    const proxy = (url: string) => `proxied:${url}`;
    const out = renderCanvasMarkdown('![my alt text](foo.png)', proxy);
    expect(out).toContain('alt="my alt text"');
  });

  it('does nothing when there are no images', () => {
    const proxy = vi.fn((url: string) => url);
    const out = renderCanvasMarkdown('# Heading\n\njust text', proxy);
    expect(proxy).not.toHaveBeenCalled();
    expect(out).toContain('<h1>Heading</h1>');
  });

  it('returns plain markdown-it HTML if the proxy is the identity', () => {
    const identity = (s: string) => s;
    const out = renderCanvasMarkdown('![](foo.png)', identity);
    expect(out).toContain('src="foo.png"');
  });

  it('handles HTML-significant characters in image URLs without breaking', () => {
    // markdown-it already escapes attributes; the post-process must round-trip
    // through `<template>` without re-escaping them or splitting the tag.
    const proxy = (url: string) => url;
    const out = renderCanvasMarkdown('![](foo%20bar.png)', proxy);
    expect(out).toContain('src="foo%20bar.png"');
  });
});
