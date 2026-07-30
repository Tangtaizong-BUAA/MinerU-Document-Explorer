# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable product decisions

- This is a dedicated online Agent for the 长翼久安 knowledge base, not a generic chatbot.
- The empty state contains only “我们要在长翼久安知识库中做些什么？” and one liquid-glass composer.
- Use pure white/pure black surfaces, system typography, restrained borders, and no decorative gradients.
- Keep user turns as rounded bubbles; render Agent answers directly on the page without an answer bubble.
- During work, show plain-language knowledge-work status such as “正在检索项目证据”, never command counts or internal tool names.
- Generated resources appear as compact rounded file cards with a working download action.
- The interaction must stream, support light/dark system themes, and remain fully usable on mobile.
- The public base path is `/cyj/agent/`; all browser API requests are same-origin and scoped below that path.
- A user-added file is a temporary, session-scoped Agent attachment first; it must never be persisted to the knowledge base merely because it was selected, dropped, or pasted.
- The Agent may promote an attachment to a durable Artifact only after reading it and identifying direct, reusable, long-term value for the 长翼久安 project; structural knowledge maintenance remains a separate closeout step.
- File intake must support picker selection, page-level drag and drop, and clipboard file paste with the same status and error behavior.
- User-requested PDF deliverables are generated directly by the deterministic PDF factory with its bundled Chinese font; never fall back to Markdown or ask the user to convert DOCX manually.
