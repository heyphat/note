---
id: 9bddf2fb-8a86-4010-bf1f-fff6d7ec7302
title: Code blocks
createdAt: 2026-05-09T14:41:33.846Z
updatedAt: 2026-05-09T14:41:33.846Z
---
# Code blocks

Code blocks are fenced with triple backticks (`​````) and an optional language tag.

## How to insert one

- Type `/code` and pick a language, or
- Type the fence directly:

````markdown
```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```
````

A language tag turns on syntax highlighting. Leaving it off gives you a plain monospaced block.

## Language tags

Common tags work as you'd expect: `python`, `javascript`, `typescript`, `tsx`, `bash`, `sh`, `json`, `yaml`, `markdown`, `html`, `css`, `sql`, `go`, `rust`, `java`, `c`, `cpp`, `ruby`, `php`, `swift`, `kotlin`, `lua`, `r`, `scala`, `haskell`, `elixir`, `clojure`, `dockerfile`, `nginx`, `toml`, `xml`, `diff`, etc.

The editor's language picker (in the top-right of the block) covers the most common ones; you can also type a tag the picker doesn't list and the highlighter will try to render it.

## Inline code

Wrap text in single backticks: `` `like this` ``. Inline code uses the same monospace font as code blocks, but doesn't get a syntax highlight pass.

## Special-purpose blocks

A few language tags are reserved for rendered blocks rather than highlighted text:

- `​```mermaid` — Mermaid diagram. See [Mermaid](../05-diagrams/mermaid.md).
- `​```excalidraw` — Excalidraw drawing. See [Excalidraw](../05-diagrams/excalidraw.md).

These render as the visual artifact at view time; the source stays in the markdown.

## Long code blocks

Long blocks scroll inside the editor frame rather than pushing the page wide. If you want word wrap, the highlighter respects `pre`'s wrapping, so you can adjust via [appearance settings](../14-customization/appearance.md) if your monitor's narrow.

## Copying

Hover over a block and a small **copy** button appears in the corner. Click to copy the contents to the clipboard.

## In AI chats

Code blocks render the same way in the AI chat drawer. When the model emits a fenced block, you can copy it from the chat without losing language tags.

## References

- [[Mermaid]]
- [[Excalidraw]]
- [[Appearance]]
