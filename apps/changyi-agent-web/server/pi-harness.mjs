import { Agent } from "@mariozechner/pi-agent-core";
import { streamSimple, Type } from "@mariozechner/pi-ai";
import { asSchema } from "@ai-sdk/provider-utils";

const LENIENT_DOCUMENT_TOOLS = new Set(["create_pdf", "create_docx", "create_pptx", "create_xlsx"]);

function allowLayoutHints(value) {
  if (Array.isArray(value)) return value.map(allowLayoutHints);
  if (!value || typeof value !== "object") return value;
  const output = Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, allowLayoutHints(nested)]));
  if (output.type === "object" || output.properties) output.additionalProperties = true;
  return output;
}

function jsonText(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function resultContent(output) {
  const source = output?.content;
  if (Array.isArray(source)) {
    const parts = source.flatMap((item) => {
      if (item?.type === "text" && typeof item.text === "string") return [{ type: "text", text: item.text }];
      if (item?.type === "image" && typeof item.data === "string") return [{ type: "image", data: item.data, mimeType: item.mimeType || "image/png" }];
      if (item?.type === "resource_link") return [{ type: "text", text: jsonText(item) }];
      if (item?.type === "resource") return [{ type: "text", text: item.resource?.text || jsonText(item.resource) }];
      return [];
    });
    if (parts.length) return parts;
  }
  return [{ type: "text", text: typeof output === "string" ? output : jsonText(output) }];
}

async function adaptAiTool(name, aiTool) {
  const schema = asSchema(aiTool.inputSchema);
  const sourceSchema = await schema.jsonSchema;
  const jsonSchema = LENIENT_DOCUMENT_TOOLS.has(name) ? allowLayoutHints(sourceSchema) : sourceSchema;
  return {
    name,
    label: aiTool.title || name,
    description: aiTool.description || `执行 ${name}`,
    parameters: Type.Unsafe(jsonSchema),
    execute: async (toolCallId, params, signal) => {
      const output = await aiTool.execute(params, { toolCallId, messages: [], abortSignal: signal });
      return { content: resultContent(output), details: { output } };
    },
  };
}

export async function adaptAiTools(tools) {
  return Promise.all(Object.entries(tools).map(([name, value]) => adaptAiTool(name, value)));
}

export function createPiModel(modelId) {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: "dashscope",
    baseUrl: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8_192,
    compat: {
      thinkingFormat: "qwen",
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStrictMode: false,
      supportsUsageInStreaming: true,
    },
  };
}

export function createSessionAttachmentTools({ store, sessionId, mcpClient, projectId, callMcp }) {
  return [
    {
      name: "read_session_attachment",
      label: "阅读本轮附件",
      description: "读取用户在当前会话中附加的临时文件。默认先用 text 提取文字；扫描 PDF、图片或需要观察版式时用 visual，并指定最多 4 个页码。附件尚未进入知识库。",
      parameters: Type.Object({
        attachment_id: Type.String({ description: "当前会话的附件标识" }),
        mode: Type.Optional(Type.Union([Type.Literal("text"), Type.Literal("visual")])),
        pages: Type.Optional(Type.Array(Type.Integer({ minimum: 1 }), { maxItems: 4 })),
      }),
      execute: async (_toolCallId, input) => {
        const result = await store.read(sessionId, input.attachment_id, { mode: input.mode || "text", pages: input.pages || [1, 2, 3] });
        return { content: result.content, details: { attachmentId: result.attachment.attachmentId, filename: result.attachment.name, ...result.details } };
      },
    },
    {
      name: "promote_session_attachment",
      label: "保存有价值的项目资料",
      description: "仅当临时附件与长翼久安直接相关、具有长期复用或证据价值时，将原件晋升为知识库 Artifact。不得为了读取附件而调用；先阅读、判断，再晋升。必须提供已建立的知识工作标识和具体长期价值理由。",
      parameters: Type.Object({
        attachment_id: Type.String(),
        work_id: Type.String(),
        reason: Type.String({ minLength: 12, maxLength: 500 }),
      }),
      execute: async (_toolCallId, input) => {
        const { attachment, bytes } = await store.bytes(sessionId, input.attachment_id);
        const resource = {
          title: attachment.name, filename: attachment.name, content_type: attachment.mimeType,
          kind: attachment.mimeType.startsWith("image/") ? "image" : "document",
          source_refs: [`session-attachment:${attachment.sha256}`, `promotion-reason:${input.reason}`], confidentiality: "internal",
        };
        let published;
        if (bytes.length <= 7 * 1024 * 1024) {
          published = await callMcp(mcpClient, "kb_publish_resource", { work_id: input.work_id, resource: { ...resource, encoding: "base64", content: bytes.toString("base64") } });
        } else {
          const begun = await callMcp(mcpClient, "kb_begin_resource_upload", { work_id: input.work_id, ...resource, expected_size: bytes.length, expected_sha256: attachment.sha256 });
          const uploadId = begun.structuredContent?.upload_id;
          const chunkBytes = Number(begun.structuredContent?.chunk_bytes || 4 * 1024 * 1024);
          if (!uploadId) throw new Error("知识库未建立大文件分块会话");
          for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
            const chunk = bytes.subarray(offset, Math.min(offset + chunkBytes, bytes.length));
            await callMcp(mcpClient, "kb_append_resource_chunk", { upload_id: uploadId, offset, content_base64: chunk.toString("base64") });
          }
          published = await callMcp(mcpClient, "kb_commit_resource_upload", { upload_id: uploadId });
        }
        return { content: resultContent(published), details: { output: published, promoted: true, filename: attachment.name, projectId } };
      },
      executionMode: "sequential",
    },
  ];
}

export function createWebSearchTool({ apiKey, modelId }) {
  return {
    name: "web_search",
    label: "联网检索",
    description: "检索公开互联网，用于时效信息、政策、公开资料、外部研究和知识库没有覆盖的背景。项目内部事实仍须以知识库证据为准。",
    parameters: Type.Object({ query: Type.String({ minLength: 2, maxLength: 500 }) }),
    execute: async (_toolCallId, input, signal) => {
      const response = await fetch(`${process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"}/chat/completions`, {
        method: "POST",
        signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: `请联网检索并以简洁中文整理可核验结果。查询：${input.query}` }],
          enable_search: true,
          search_options: { forced_search: true, enable_source: true, enable_citation: true, search_strategy: "max" },
          enable_thinking: true,
          stream: false,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `联网检索失败 (${response.status})`);
      const text = payload?.choices?.[0]?.message?.content;
      if (!text) throw new Error("联网检索没有返回可用结果");
      return { content: [{ type: "text", text }], details: { query: input.query } };
    },
  };
}

export async function runPiAgent({ model, systemPrompt, tools, messages, prompt, apiKey, sessionId, abortSignal, onEvent }) {
  let toolCalls = 0;
  const agent = new Agent({
    initialState: { systemPrompt, model, thinkingLevel: "high", tools, messages },
    sessionId,
    streamFn: (activeModel, context, options = {}) => streamSimple(activeModel, context, {
      ...options,
      apiKey,
      reasoning: "high",
      maxTokens: 5_000,
      temperature: 0.25,
      timeoutMs: 180_000,
      maxRetries: 2,
      onPayload: async (payload) => ({ ...payload, enable_thinking: true }),
    }),
    beforeToolCall: async () => {
      toolCalls += 1;
      if (toolCalls > 24) return { block: true, reason: "本轮工具调用已达到安全上限，请基于已有结果完成回答。" };
      return undefined;
    },
    toolExecution: "parallel",
  });
  const unsubscribe = agent.subscribe((event) => onEvent?.(event));
  const abort = () => agent.abort();
  if (abortSignal) {
    if (abortSignal.aborted) abort();
    else abortSignal.addEventListener("abort", abort, { once: true });
  }
  try {
    await agent.prompt(prompt);
    return { messages: agent.state.messages, error: agent.state.errorMessage };
  } finally {
    unsubscribe();
    abortSignal?.removeEventListener("abort", abort);
  }
}
