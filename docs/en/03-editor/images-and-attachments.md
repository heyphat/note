---
id: a2c82c4e-1aad-4577-a7bc-40b1c89d982a
title: Images and attachments
createdAt: 2026-05-09T14:41:25.892Z
updatedAt: 2026-05-09T14:41:25.892Z
---
# Images and attachments

You can put images into a note three ways:

1. **Paste** — copy an image to your clipboard, focus the editor, paste.
2. **Drag and drop** — drag a file from your file manager into the editor.
3. **Insert action** — the slash menu and the toolbar both expose an image-insert option.

All three end up in the same place.

## What happens on disk

When you add an image, the app:

1. Generates a UUID filename (e.g. `8b1c4d12-…`).
2. Writes the bytes to `.assets/<uuid>.<ext>` in your vault.
3. Inserts a relative-path image link into the note: `![](.assets/8b1c4d12-….png)`.

That last bit matters — the link is **relative**, so the image survives moving the vault, syncing it through Dropbox / iCloud / Syncthing, or opening it from another markdown tool.

## Supported types

PNG, JPEG, GIF, WebP, and SVG are the standard cases. Other types may work but aren't actively tested. The editor renders whatever the browser knows how to display.

## Naming and re-use

Each insert produces a new file with a new UUID, even if you paste the same image twice. If you want one image referenced from many notes, keep the file's path stable (just don't move or rename it) and reuse the markdown link.

## Alt text and captions

Click an image to bring up its sizing handles and a small toolbar where you can edit alt text. The alt text is the text inside the brackets in the markdown: `![alt text here](.assets/...)`.

For a caption visible in the rendered view, write it as a paragraph immediately below the image — there's no first-class caption syntax in markdown.

## Excalidraw scenes

Excalidraw drawings inserted via `/excalidraw` (see [Excalidraw](../05-diagrams/excalidraw.md)) save their scene file under `.assets/` too. The note holds a fenced `​```excalidraw` block whose contents reference the file by name.

## Other attachments

Note doesn't ship a built-in "attach any file" workflow today — it's an image / drawing tool primarily. If you want a non-image file to live alongside a note, drop it in the vault yourself and reference it with a regular markdown link: `[manual](manual.pdf)`. The link will work in any markdown viewer that handles relative paths.

## Cleanup

If you delete a note, its referenced images stay on disk — there's no garbage collector for `.assets/`. Periodically you can search the vault for `.assets/` references vs. files on disk and remove orphans manually. (A future version of the app may automate this; today it doesn't.)

## References

- [[Excalidraw]]
