# Security Policy

## Supported versions

Note is a browser application with no backend and no release branches. Security
fixes land on `main` and are picked up by anyone who redeploys or pulls. Only
the current `main` is supported.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** A public report
discloses the flaw to everyone before a fix exists.

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, the impact, and the steps to reproduce it.

Reports stay private between you and the maintainers until an advisory is
published. Expect an initial response within about a week.

## Scope

Note's threat model follows from its architecture: there is no server, no
account system, and no vault data ever leaves the browser. That shapes what
counts as a vulnerability.

**In scope:**

- Cross-site scripting through note content — rendered markdown, embedded HTML,
  Mermaid or Excalidraw source, wikilink and transclusion targets, or frontmatter.
  Note renders untrusted vault content, so an XSS reachable from a malicious
  `.md` file is a real finding.
- Anything that causes an API key to leave the browser, be written into the
  vault, or be sent to a host other than the provider the user selected.
- Path traversal or any vault write that escapes the directory handle the user
  granted.
- Prompt-injected content in a note that causes the AI tools (`edit_note`,
  `rewrite_note`) to write outside the note the user bound the chat to.
- Vulnerabilities in the optional server-side AI proxy routes under
  `src/app/api/ai/` (Bedrock and Vertex), which are the only server code in the
  project.
- Dependency vulnerabilities that are actually reachable from application code.

**Out of scope:**

- Anything requiring a compromised machine, a malicious browser extension, or
  physical access — the vault is plain files on disk and the OS is the boundary.
- Attacks that require the user to paste an attacker-supplied API key.
- Missing hardening headers on a deployment you control. Note ships no
  deployment; how you serve the static build is up to you.
- Reports from automated scanners with no demonstrated exploit path.
- Notes being readable by other software on the same machine. That is the
  design — your notes are ordinary files in a folder you chose.

## A note on the AI features

When AI is enabled, requests go from the browser directly to the provider you
picked, using a key you pasted. The hosting machine is not in that path and
never sees the key or the note content. If you find a way to break that
property, treat it as in scope and report it.
