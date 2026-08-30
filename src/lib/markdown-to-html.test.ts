import { describe, expect, it } from 'vitest';
import { markdownToHtml } from './markdown-to-html';

describe('markdownToHtml footnotes', () => {
  it('renders footnote references and definitions', () => {
    const html = markdownToHtml('A claim[^1]\n\n[^1]: Supporting detail');

    expect(html).toContain('<sup class="footnote-ref">');
    expect(html).toContain('<section class="footnotes">');
    expect(html).toContain('Supporting detail');
    expect(html).not.toContain('[^1]:');
  });

  it('leaves unresolved references as escaped markdown text', () => {
    expect(markdownToHtml('A claim[^missing]')).toContain('A claim[^missing]');
  });
});

describe('markdownToHtml lists', () => {
  it('keeps ordered list numbering across blank lines between items', () => {
    const html = markdownToHtml('1. First\n\n1. Second\n\n1. Third');
    const root = document.createElement('div');
    root.innerHTML = html;

    expect(root.querySelectorAll(':scope > ol')).toHaveLength(1);
    expect(root.querySelectorAll('ol > li')).toHaveLength(3);
    expect(Array.from(root.querySelectorAll('ol > li')).map(li => li.textContent?.trim()))
      .toEqual(['First', 'Second', 'Third']);
  });

  it('keeps indented bullets inside an ordered item so parent numbering continues', () => {
    const html = markdownToHtml('1. Trade\n\n1. Results\n\n   - Duration\n   - Drawdown\n\n1. Psychology\n\n1. Charts');
    const root = document.createElement('div');
    root.innerHTML = html;

    const topItems = root.querySelectorAll(':scope > ol > li');
    expect(topItems).toHaveLength(4);
    expect(topItems[1].querySelectorAll('ul > li')).toHaveLength(2);
    expect(topItems[2].textContent?.trim()).toBe('Psychology');
    expect(topItems[3].textContent?.trim()).toBe('Charts');
  });
});
