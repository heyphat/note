// Serialize / parse a chat thread's body as markdown. The file format is:
//
//   ## user
//
//   hi
//
//   ## assistant
//
//   hello
//
// A turn starts on a line that is exactly `## user`, `## assistant`, or
// `## system` — nothing else on the line. Anything before the first such
// header is ignored on parse. Content within a turn is preserved verbatim,
// including headings at other levels (the turn marker is fixed at H2 with
// one of three labels, so an `## user` inside a code fence won't collide
// in practice — but we also strip trailing blank lines on round-trip to
// keep the file stable).

import type { ChatRole, ChatTurn } from './types';

const ROLES: ChatRole[] = ['user', 'assistant', 'system'];
const TURN_RE = /^## (user|assistant|system)\s*$/;

export function serializeChatBody(messages: ChatTurn[]): string {
  if (messages.length === 0) return '';
  const parts: string[] = [];
  for (const m of messages) {
    parts.push(`## ${m.role}\n\n${m.content.trimEnd()}`);
  }
  return parts.join('\n\n') + '\n';
}

export function parseChatBody(body: string): ChatTurn[] {
  const lines = body.split('\n');
  const out: ChatTurn[] = [];
  let currentRole: ChatRole | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (currentRole === null) return;
    // Drop leading + trailing blank lines so `## user\n\nhi\n\n## assistant`
    // round-trips to `hi` without extra whitespace.
    let start = 0;
    let end = buf.length;
    while (start < end && buf[start].trim() === '') start++;
    while (end > start && buf[end - 1].trim() === '') end--;
    const content = buf.slice(start, end).join('\n');
    out.push({ role: currentRole, content });
  };

  for (const line of lines) {
    const match = TURN_RE.exec(line);
    if (match && ROLES.includes(match[1] as ChatRole)) {
      flush();
      currentRole = match[1] as ChatRole;
      buf = [];
      continue;
    }
    if (currentRole !== null) buf.push(line);
  }
  flush();
  return out;
}
