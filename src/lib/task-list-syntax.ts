import { InputRule } from '@milkdown/kit/prose/inputrules';
import { $inputRule } from '@milkdown/kit/utils';

const TASK_LIST_PREFIX_RE = '\\s*(?:>\\s*)*(?:[-+*]|\\d+\\.)\\s';
const COMPACT_UNCHECKED_TASK_RE = new RegExp(`^(${TASK_LIST_PREFIX_RE})\\[\\](?=(?:\\s|$))`);
const GFM_UNCHECKED_TASK_RE = new RegExp(`^(${TASK_LIST_PREFIX_RE})\\[ \\](?=(?:\\s|$))`);
const FENCE_RE = /^([`~]{3,})/;

export function normalizeTaskListMarkdownForEditor(markdown: string): string {
  return rewriteUncheckedTaskListSyntax(markdown, COMPACT_UNCHECKED_TASK_RE, '$1[ ]');
}

export function serializeTaskListMarkdownForStorage(markdown: string): string {
  return rewriteUncheckedTaskListSyntax(markdown, GFM_UNCHECKED_TASK_RE, '$1[]');
}

// Milkdown's markdown serializer escapes `[` / `]` (and thus `[[...]]`) as
// `\[\[...\]\]` because bracket characters are markdown-special. That's
// correct for standard markdown but breaks Obsidian-style wikilinks, which
// every other tool in the ecosystem writes as literal `[[...]]`. This pass
// removes the escape pair specifically for double-bracket sequences so the
// on-disk form stays portable. Single-bracket escapes like `\[literal\]`
// (which users write intentionally to display brackets without a link) are
// left alone — the pattern requires both brackets to be doubled.
export function unescapeWikilinkBracketsForStorage(markdown: string): string {
  return markdown
    .replace(/\\\[\\\[/g, '[[')
    .replace(/\\\]\\\]/g, ']]');
}

// Support typing `- [] ` as a task-list shortcut. Milkdown's built-in GFM rule
// only recognizes `[ ] ` and `[x] ` once the list item already exists.
export const wrapInCompactTaskListInputRule = $inputRule(() => {
  return new InputRule(/^\[\]\s$/, (state, _match, start, end) => {
    const pos = state.doc.resolve(start);
    let depth = pos.depth;

    while (depth > 0 && pos.node(depth).type.name !== 'list_item') depth -= 1;

    if (depth === 0 || pos.node(depth).type.name !== 'list_item') return null;

    const node = pos.node(depth);
    if (node.attrs.checked != null) return null;

    return state.tr
      .deleteRange(start, end)
      .setNodeMarkup(pos.before(depth), undefined, { ...node.attrs, checked: false });
  });
});

function rewriteUncheckedTaskListSyntax(
  markdown: string,
  pattern: RegExp,
  replacement: string,
): string {
  const lines = markdown.split('\n');
  let activeFenceMarker: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const withoutBlockquotes = line.trimStart().replace(/^(?:>\s*)+/, '');
    const fenceMatch = withoutBlockquotes.match(FENCE_RE);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!activeFenceMarker) activeFenceMarker = marker;
      else if (activeFenceMarker === marker) activeFenceMarker = null;
      continue;
    }

    if (!activeFenceMarker) lines[index] = line.replace(pattern, replacement);
  }

  return lines.join('\n');
}
