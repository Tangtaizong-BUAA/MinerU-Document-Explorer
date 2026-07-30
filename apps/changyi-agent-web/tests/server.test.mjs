import assert from "node:assert/strict";
import test from "node:test";

process.env.CYJ_AGENT_DEMO_MODE = "1";
const { createAppServer, deepFindArtifacts, redactInternalNames, selectedModel, toolArtifactId, uploadMimeType } = await import("../server/index.mjs");

async function withServer(run) {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("health endpoint is scoped to the agent base path", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/cyj/agent/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: "changyi-jiuan-agent-web",
      version: "0.5.3",
      mode: "demo",
    });
  });
});

test("model selections use the requested routing policy", () => {
  assert.equal(selectedModel("auto").modelId, "qwen3.7-flash");
  assert.equal(selectedModel("fable-5").modelId, "qwen3.8-max-preview");
  assert.equal(selectedModel("qwen3.8-max").modelId, "qwen3.8-max-preview");
  assert.equal(selectedModel("qwen3.7-flash").modelId, "qwen3.7-flash");
});

test("demo upload accepts and registers a supported file", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/cyj/agent/api/uploads`, { method: "POST", headers: { "content-type": "image/png", "x-file-name": encodeURIComponent("参考图.png"), "x-session-id": "test-session" }, body: Buffer.from("synthetic-image") });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.attachment.name, "参考图.png");
    assert.equal(payload.attachment.mimeType, "image/png");
  });
});

test("upload infers a safe MIME type when the browser only sends octet-stream", () => {
  assert.equal(uploadMimeType("答辩版.pptx", "application/octet-stream"), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.equal(uploadMimeType("现场照片.JPG", ""), "image/jpeg");
  assert.equal(uploadMimeType("unknown.bin", "application/octet-stream"), "application/octet-stream");
});

test("internal tool and framework names are removed from visible answers", () => {
  const visible = redactInternalNames("已调用 `kb_brief` 和 create_docx，再交给 ToolLoopAgent 与 MS-Agent。");
  assert.doesNotMatch(visible, /kb_brief|create_docx|ToolLoopAgent|MS-Agent/);
  assert.match(visible, /知识库流程/);
});

test("published artifact card keeps the requested title and filename", () => {
  const [artifact] = deepFindArtifacts(
    { structuredContent: { artifact_id: "artifact:cyj:test" } },
    { resource: { title: "线上 Agent 部署验收摘要", filename: "线上Agent部署验收摘要.md", content_type: "text/markdown" } },
  );
  assert.equal(artifact.title, "线上 Agent 部署验收摘要");
  assert.equal(artifact.filename, "线上Agent部署验收摘要.md");
});

test("upload accepts structured and text-only MCP publish responses", () => {
  assert.equal(toolArtifactId({ structuredContent: { artifact_id: "artifact:cyj:structured" } }), "artifact:cyj:structured");
  assert.equal(toolArtifactId({ output: { structured_content: { artifactId: "artifact:cyj:wrapped" } } }), "artifact:cyj:wrapped");
  assert.equal(toolArtifactId({ content: [{ type: "text", text: "Published artifact:cyj:text-only; searchable=false." }] }), "artifact:cyj:text-only");
});

test("chat endpoint emits knowledge-work statuses and streamed text", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/cyj/agent/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "test-session", message: "梳理项目情况" }),
    });
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split("\n").map(JSON.parse);
    assert.equal(events[0].label, "正在思考");
    assert.ok(events.some((event) => event.label === "正在检索项目证据"));
    assert.ok(events.some((event) => event.type === "delta"));
    assert.ok(events.some((event) => event.type === "artifact" && event.artifact.filename.endsWith(".md")));
    assert.equal(events.at(-1).type, "done");
  });
});

test("demo artifact is downloadable", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/cyj/agent/api/demo-artifact`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-disposition"), /attachment/);
    assert.match(await response.text(), /项目知识整理示例/);
  });
});

test("chat endpoint rejects oversized input before streaming", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/cyj/agent/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "test-session", message: "x".repeat(12_001) }),
    });
    assert.equal(response.status, 413);
  });
});
