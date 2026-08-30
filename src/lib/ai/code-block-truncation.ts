// Per-fenced-code-block truncation. The note body is wrapped in a fence
// when handed to the model, so a single huge code block (CSV, JSON dump,
// log paste) can starve the rest of the note. Shrink each block on its
// own before the overall note cap kicks in.
//
// Modular by design: add a rule with a language matcher, a per-block
// budget, and a strategy. First matching rule wins; the trailing rule
// (`match: () => true`) is the catch-all default.

export type TruncationStrategy = (body: string, max: number) => string;

export interface CodeBlockRule {
  /** Matches against the lowercased language tag (e.g. 'csv', 'json', ''). */
  match: (lang: string) => boolean;
  /** Per-block character budget. Blocks at or under this size are passed through. */
  maxChars: number;
  /** How to shrink an over-budget block. */
  strategy: TruncationStrategy;
}

/**
 * Head-only: keep the first `max` chars, drop the rest. Good for code and
 * logs where the opening lines carry the most signal.
 */
export const headStrategy: TruncationStrategy = (body, max) => {
  if (body.length <= max) return body;
  const head = sliceAtLineBoundary(body, max);
  const skipped = body.length - head.length;
  return `${head}\n[… ${skipped.toLocaleString()} characters truncated …]`;
};

/**
 * Head + tail: keep the opening lines (schema / header) and the closing
 * lines (most recent rows). Good for tabular data where the model needs
 * to see both the structure and the latest values.
 */
export const headTailStrategy: TruncationStrategy = (body, max) => {
  if (body.length <= max) return body;
  const headBudget = Math.floor(max * 0.6);
  const tailBudget = max - headBudget;
  const head = sliceAtLineBoundary(body, headBudget);
  const tail = sliceAtLineBoundaryFromEnd(body, tailBudget);
  const skipped = body.length - head.length - tail.length;
  if (skipped <= 0) return body;
  return `${head}\n[… ${skipped.toLocaleString()} characters truncated from middle …]\n${tail}`;
};

const DEFAULT_BLOCK_BUDGET = 4_000;

/**
 * Rule registry. Order matters — first match wins. Add new rules above
 * the catch-all to give a language its own treatment.
 */
export const DEFAULT_RULES: CodeBlockRule[] = [
  {
    match: lang => lang === 'csv' || lang === 'tsv',
    maxChars: 4_000,
    strategy: headTailStrategy,
  },
  {
    match: () => true,
    maxChars: DEFAULT_BLOCK_BUDGET,
    strategy: headStrategy,
  },
];

// Standard markdown fenced block: ```lang\n...\n```
// Non-greedy body so we stop at the nearest closing fence. Doesn't try
// to handle 4+ backtick fences or indented code blocks — those are rare
// in practice and the worst case is they get truncated by the outer cap.
const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

export function truncateCodeBlocks(
  text: string,
  rules: CodeBlockRule[] = DEFAULT_RULES,
): string {
  return text.replace(FENCE_RE, (full, langRaw: string, body: string) => {
    const lang = langRaw.trim().toLowerCase();
    const rule = rules.find(r => r.match(lang));
    if (!rule || body.length <= rule.maxChars) return full;
    const shrunk = rule.strategy(body, rule.maxChars);
    return `\`\`\`${langRaw}\n${shrunk}\n\`\`\``;
  });
}

function sliceAtLineBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const raw = s.slice(0, max);
  const lastNl = raw.lastIndexOf('\n');
  // Fall back to the raw cut if there's no newline in the budget — better
  // than emitting an empty head.
  return lastNl > 0 ? raw.slice(0, lastNl) : raw;
}

function sliceAtLineBoundaryFromEnd(s: string, max: number): string {
  if (s.length <= max) return s;
  const raw = s.slice(s.length - max);
  const firstNl = raw.indexOf('\n');
  return firstNl >= 0 && firstNl < raw.length - 1 ? raw.slice(firstNl + 1) : raw;
}
