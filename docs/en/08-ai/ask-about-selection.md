---
id: 97701fa6-418d-436d-8010-14bce5af16db
title: Ask about a selection
createdAt: 2026-05-09T14:52:19.512Z
updatedAt: 2026-05-09T14:52:19.512Z
---
# Ask about a selection

You can pull text from a note straight into the chat drawer without retyping it.

## How

1. **Highlight a span of text** in the editor.
2. A small selection toolbar appears.
3. Click the **Ask AI** button on the toolbar.
4. The chat drawer opens (if it wasn't already), with your selection as the seed of a new message.

You can also hit the keyboard shortcut directly to ask about whatever's selected.

## What gets sent

The selection becomes part of your message — usually quoted, so the model can see it as context. You add your actual question above or below: "Rewrite this in plain English," "What's confusing about this paragraph?", "Suggest five alternative titles for this section."

## What the model has on top of the selection

The same default context every chat message gets:

- The full body of the active note (so the model knows what surrounds your selection).
- A list of vault folders (for `create_note` proposals).
- The conversation so far in the open thread.

The selection isn't *replacing* that context — it's adding to it.

## When this is useful

- **Targeted rewrites.** "Tighten this paragraph" → the model proposes an `edit_note` card with the rewritten text.
- **Translation.** "Translate this to Vietnamese."
- **Explanations.** "Explain what this code does, and what could go wrong."
- **Pulling out structure.** "Turn this into a checklist."

## When it isn't

For broad questions about the whole note, just open the chat drawer and ask — no selection needed. The model already has the full body in its system prompt.

## Selection in chat messages

The same Ask-AI affordance works *inside* the chat: highlight part of an assistant response and a small popover appears with copy / quote-back actions. See the chat selection popover in your conversation feed.
