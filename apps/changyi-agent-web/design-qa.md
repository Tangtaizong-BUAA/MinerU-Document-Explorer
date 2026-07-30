# Design QA — 长翼久安线上 Agent

References: `Prototype.png`, `codex-clipboard-55f8f096-3c15-44ee-b7d9-4e1b74de0e22.png`, `IMG_2267.jpg`, `IMG_2268.jpg`

## Target experience

- Empty state keeps “在长翼久安知识库中做些什么？” on one centered line above one liquid-glass composer.
- Pure black or pure white system surface; no decorative navigation or dashboard chrome.
- User turns retain a rounded bubble; Agent output is unboxed and reads directly on the page.
- Internal command counts are replaced with human-readable knowledge-work status.
- Output streams progressively and generated resources appear as downloadable file cards.
- Upload, Auto/Fable 5/qwen3.8max/qwen3.7-flash selection, and stop remain available without adding permanent chrome.
- Each submitted question glides to the top of the reading stage; streaming status changes do not move it or disappear behind the fixed composer.

## Browser verification

- Desktop dark empty state, centering, single-line heading, and glass composer: passed in the running app.
- Mobile 390 × 844 empty state and in-viewport action/model menu: passed in the running app.
- Menu selection updates the active model and closes with a measured fade-and-scale animation: passed.
- Model rows are one line: Auto has no suffix; Fable 5, qwen3.8 max, and qwen3.7-flash use right-aligned 深度推理、更强推理、高速响应 labels: passed.
- File chooser, upload progress, and removable attachment chip: passed with a synthetic Markdown file in demo mode.
- Added files are labelled as conversation-only attachments rather than persisted knowledge; drag/drop and clipboard-paste handlers share the same staging path.
- Stop transitions the active turn to “已终止本次工作”: passed.
- Follow-up UI and its permanent chrome are absent: passed.
- First question at 390 × 844 remained at y=27 px across streaming status updates; a later question remained at y=50.8 px while its status stayed below it and above the dock: passed.
- DOM accessibility: labelled task textbox, labelled send/stop/menu controls, live status region, semantic article and download link: passed.
- Light/dark theme, reduced motion, long Markdown, tables, code, and safe-area composer styles are present.

## Functional verification

- Production build: passed.
- Node API and Sites packaging tests: passed.
- Web unit/integration suite: 23/23 passed.
- Focused project profile and HTTP MCP suite: 9/9 passed, including ordered chunk append, size/hash verification and commit.
- Production web build and root TypeScript build: passed.
- Local browser implementation for 0.6.0 passed layout inspection; production drag/drop/paste verification is completed after release against the new backend.
- Live upload persistence passed with `artifact:cyj:857b92831b6c2f2a795a1e64`.
- Live “技术细节是什么” query returned 城脉 CT、空地协同、32 线激光雷达、IMU+GNSS、SLAM、五拼镜头与毫米级三维重建 rather than knowledge-system architecture.
- Fable 5 carries the explicit public model identity `fable 5`; its menu no longer exposes an underlying qwen route.

## Visual comparison

- Combined reference/implementation comparison: `/tmp/cyj-0.5.3-menu-comparison.png`.
- The 0.5.3 implementation intentionally tightens the menu and composer relative to the supplied screenshot, removes the Thinking/model-routing subcopy, and preserves the same dark glass hierarchy.

## File-chain verification

- A 2.26MB, 40-page project PDF produced 27,758 extracted characters and a first-page visual input.
- The 44,486,482-byte answer-deck PDF passed the 80MB session boundary and rendered its first page as visual context without entering the knowledge base.
- DOCX extraction, session isolation, deletion, expiration semantics and non-artifact staging passed automated tests.
- Durable large-file promotion uses 4MB chunks and server-side SHA-256 verification before an Artifact is created.
- Direct PDF output re-opened as one A4 page, preserved extractable Chinese text, and passed rendered PNG inspection for title hierarchy, line wrapping, bullets, table borders, footer, page numbering, clipping and blank-page absence.

final result: passed
