# Design QA — 长翼久安线上 Agent

Reference: `codex-clipboard-516467c1-96ae-44f5-a90e-d068e1ca3b88.png`

## Target experience

- Empty state shows only the requested question and one liquid-glass composer.
- Pure black or pure white system surface; no decorative navigation or dashboard chrome.
- User turns retain a rounded bubble; Agent output is unboxed and reads directly on the page.
- Internal command counts are replaced with human-readable knowledge-work status.
- Output streams progressively and generated resources appear as downloadable file cards.

## Browser verification

- Desktop empty state: passed (`qa-initial.png`).
- Desktop conversation state: passed (`qa-result.png`).
- Reference and implementation side-by-side: passed (`qa-comparison.png`).
- Mobile 390 × 844 empty state: passed (`qa-mobile.png`).
- Mobile file-card state: passed (`qa-file-card-mobile.png`).
- Keyboard submit, status transition, streamed response, and file download event: passed.
- DOM accessibility: one labelled task textbox, one labelled send button, live status region, semantic article and download link: passed.
- Light/dark theme, reduced motion, long Markdown, tables, code, and safe-area composer styles are present.

## Functional verification

- Production build: passed.
- Node API and Sites packaging tests: passed.
- Authenticated Alibaba health endpoint and streamed Agent/MCP smoke query: passed.
- Unauthenticated Alibaba request returns `401`: passed.

final result: passed
