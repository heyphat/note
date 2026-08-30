---
id: bf5e0d7b-25bf-4735-9760-e9906c19f3d2
title: Providers and keys
createdAt: 2026-05-09T14:52:32.219Z
updatedAt: 2026-05-09T14:52:32.219Z
---
# Providers and keys

Note can talk to three model providers. Each is independent — keys are stored separately, and you can switch between them at any time.

## Supported providers

| Provider | Models | Get an API key |
| --- | --- | --- |
| **Anthropic** | Claude family (Opus, Sonnet, Haiku) | console.anthropic.com |
| **OpenAI** | GPT family (GPT-4 family, etc.) | platform.openai.com |
| **Google Vertex / Gemini** | Gemini family | console.cloud.google.com (Vertex) or aistudio.google.com (AI Studio key) |
| **AWS Bedrock** | Anthropic Claude via Bedrock | AWS console; needs region selection |

The exact model names you can pick from change as providers ship new models. The app picks up whatever's currently available on the API endpoint your key authenticates to.

## How to enter a key

1. Open the **sidebar settings** (gear icon in the sidebar header).
2. Scroll to the **AI** section.
3. Pick the provider you're configuring.
4. Paste the API key into the input field.
5. (Optional) Click **Test connection** — the app makes a minimal probe call to confirm the key works.

For Bedrock, also pick the **region** the provider is deployed to (e.g. `us-east-1`).

## Where keys are stored

Provider keys live in **`localStorage`**. That means:

- They're per-browser. A different browser, or the same browser on a different machine, won't have your keys until you re-enter them.
- They're not in the vault. If you sync the vault folder, the keys don't go with it.
- Clearing browser storage clears them. Re-enter from the provider console.

## Switching providers

You can keep all four providers configured at once. The chat drawer has a model picker that flips between them mid-conversation if you want — useful for comparing answers, or for routing cheap calls to a fast model and expensive ones to a slow model.

## What the host sees

When you set up a provider, the request from the chat drawer goes:

```
your tab → api.anthropic.com  /  api.openai.com  /  generativelanguage.googleapis.com  /  bedrock-runtime.<region>.amazonaws.com
```

The hosting machine (where you loaded the app from) is not in that path. It can't read your key, your prompt, or the response. See [Privacy](./privacy.md).

## Cost model

You pay your provider directly, pay-as-you-go. There's no Note subscription. Charges depend on the provider's pricing and the size of your prompts / responses. The chat drawer doesn't artificially limit context — long conversations can run up tokens fast on premium models.

## References

- [[AI privacy]]
