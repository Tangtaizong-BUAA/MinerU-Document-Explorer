import assert from "node:assert/strict";
import test from "node:test";
import { fauxAssistantMessage, registerFauxProvider } from "@mariozechner/pi-ai";
import { createArtifactTools } from "../server/artifact-factory.mjs";
import { adaptAiTools, createPiModel, createSessionAttachmentTools, runPiAgent } from "../server/pi-harness.mjs";

test("DashScope compatibility keeps the system prompt in the supported system role", () => {
  assert.equal(createPiModel("qwen3.7-flash").compat.supportsDeveloperRole, false);
});

test("document tools tolerate harmless extra layout hints from the model", async () => {
  const adapted = await adaptAiTools(createArtifactTools({ callTool: async () => ({}) }));
  const pdf = adapted.find((tool) => tool.name === "create_pdf");
  assert.equal(pdf.parameters.additionalProperties, true);
  assert.equal(pdf.parameters.properties.sections.items.additionalProperties, true);
});

test("Pi harness streams answer deltas and retains session messages", async () => {
  const faux = registerFauxProvider({ api: "cyj-faux", provider: "cyj-test", tokensPerSecond: 10000 });
  faux.setResponses([fauxAssistantMessage("Pi harness 已响应")]);
  const deltas = [];
  try {
    const result = await runPiAgent({
      model: faux.getModel(),
      systemPrompt: "测试系统提示",
      tools: [],
      messages: [],
      prompt: "测试问题",
      apiKey: "test-key",
      sessionId: "test-pi-session",
      onEvent: (event) => {
        if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") deltas.push(event.assistantMessageEvent.delta);
      },
    });
    assert.equal(result.error, undefined);
    assert.equal(deltas.join(""), "Pi harness 已响应");
    assert.equal(result.messages[0].role, "user");
    assert.equal(result.messages.at(-1).role, "assistant");
  } finally {
    faux.unregister();
  }
});

test("large attachment promotion uses ordered chunk upload and commits once", async () => {
  const bytes = Buffer.alloc(7 * 1024 * 1024 + 13, 0x61);
  const calls = [];
  const tools = createSessionAttachmentTools({
    store: {
      bytes: async () => ({
        attachment: { name: "项目原件.pdf", mimeType: "application/pdf", sha256: "a".repeat(64) },
        bytes,
      }),
    },
    sessionId: "session-large",
    mcpClient: {},
    projectId: "project:test",
    callMcp: async (_client, name, args) => {
      calls.push({ name, args });
      if (name === "kb_begin_resource_upload") return { structuredContent: { upload_id: "upload:test", chunk_bytes: 4 * 1024 * 1024 } };
      if (name === "kb_commit_resource_upload") return { structuredContent: { artifact_id: "artifact:test" }, content: [{ type: "text", text: "Published artifact:test" }] };
      return { structuredContent: { received_size: args.offset + Buffer.from(args.content_base64, "base64").length } };
    },
  });
  const promote = tools.find((tool) => tool.name === "promote_session_attachment");
  const result = await promote.execute("call-1", { attachment_id: "att-large", work_id: "work_item:test", reason: "这是项目权威原始文件，后续会持续复用" });
  assert.deepEqual(calls.map((call) => call.name), [
    "kb_begin_resource_upload",
    "kb_append_resource_chunk",
    "kb_append_resource_chunk",
    "kb_commit_resource_upload",
  ]);
  assert.equal(calls[1].args.offset, 0);
  assert.equal(calls[2].args.offset, 4 * 1024 * 1024);
  assert.equal(result.details.promoted, true);
});
