import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html-escape';

describe('escapeHtml', () => {
  it('is a no-op for safe strings', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
    expect(escapeHtml('')).toBe('');
  });

  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('escapes ampersand BEFORE angle brackets to avoid double-encoding', () => {
    // If we escaped < before &, the resulting `&lt;` would be re-escaped
    // to `&amp;lt;`. The regex handles all chars in a single pass so the
    // order is correct by construction — this test guards the invariant.
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapes script-tag attempts', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('escapes attribute-breaking characters inline', () => {
    expect(escapeHtml(`onmouseover="alert('x')"`))
      .toBe('onmouseover=&quot;alert(&#39;x&#39;)&quot;');
  });

  it('handles repeated characters', () => {
    expect(escapeHtml('<<<')).toBe('&lt;&lt;&lt;');
    expect(escapeHtml('&&&')).toBe('&amp;&amp;&amp;');
  });

  it('preserves non-Latin characters', () => {
    expect(escapeHtml('日本語 <tag>')).toBe('日本語 &lt;tag&gt;');
  });
});
