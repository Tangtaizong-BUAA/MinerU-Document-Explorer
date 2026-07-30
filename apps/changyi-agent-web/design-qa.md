# Design QA — 长翼久安线上 Agent

References: `Prototype.png`, `codex-clipboard-55f8f096-3c15-44ee-b7d9-4e1b74de0e22.png`, `IMG_2267.jpg`, `IMG_2268.jpg`

## Target experience

- Empty state keeps “在长翼久安知识库中做些什么？” on one centered line above one liquid-glass composer.
- Pure black or pure white system surface; no decorative navigation or dashboard chrome.
- User turns retain a rounded bubble; Agent output is unboxed and reads directly on the page.
- Internal command counts are replaced with human-readable knowledge-work status.
- Output streams progressively and generated resources appear as downloadable file cards.
- Upload, Auto/Fable 5/qwen3.8max/qwen3.7-flash selection, stop, and follow-up remain available without adding permanent chrome.

## Browser verification

- Desktop dark empty state, centering, single-line heading, and glass composer: passed in the running app.
- Mobile 390 × 844 empty state and in-viewport action/model menu: passed in the running app.
- Menu selection updates the active model and closes the menu: passed.
- File chooser, upload progress, and removable attachment chip: passed with a synthetic Markdown file in demo mode.
- Stop transitions the active turn to “已终止本次工作”: passed.
- Follow-up returns focus to the composer in the same session: passed.
- DOM accessibility: labelled task textbox, labelled send/stop/menu controls, live status region, semantic article and download link: passed.
- Light/dark theme, reduced motion, long Markdown, tables, code, and safe-area composer styles are present.

## Functional verification

- Production build: passed.
- Node API and Sites packaging tests: passed.
- Web unit/integration suite: 18/18 passed.
- Focused project runtime and HTTP MCP suite: 25/25 passed.
- Production web build and root TypeScript build: passed.
- Alibaba loopback health endpoint reports live 0.5.2; public unauthenticated access remains protected by Basic Auth.
- Live upload persistence passed with `artifact:cyj:857b92831b6c2f2a795a1e64`.
- Live “技术细节是什么” query returned 城脉 CT、空地协同、32 线激光雷达、IMU+GNSS、SLAM、五拼镜头与毫米级三维重建 rather than knowledge-system architecture.
- Fable 5 completed a live knowledge answer through the production `qwen3.7-max` compatibility route. The requested `qwen3.8-max-preview` requires a Token Plan endpoint/key that is not currently configured.

## Known boundary

- Version 0.5.2 accepts up to 8 MB per uploaded file. Larger source documents require the subsequent resumable/chunked transfer path; the UI and server fail closed instead of pretending they were persisted.

final result: passed, with the documented Token Plan model and 8 MB upload boundaries
