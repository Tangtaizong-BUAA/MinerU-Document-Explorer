import { z } from "zod";

export const DEFAULT_MULTIMODAL_EMBEDDING_MODEL = "qwen3-vl-embedding";
export const DEFAULT_MULTIMODAL_RERANK_MODEL = "qwen3-vl-rerank";

export type MultimodalInput =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | { type: "video"; video: string; fps?: number };

const embeddingResponseSchema = z.object({
  output: z.object({ embeddings: z.array(z.object({ embedding: z.array(z.number()), index: z.number().optional() })) }),
  usage: z.record(z.string(), z.unknown()).optional(),
  request_id: z.string().optional(),
});

export type AlibabaMultimodalOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  dimension?: number;
  fetchImpl?: typeof fetch;
};

export function buildMultimodalEmbeddingRequest(inputs: MultimodalInput[], model = DEFAULT_MULTIMODAL_EMBEDDING_MODEL, dimension = 1024): Record<string, unknown> {
  if (inputs.length === 0 || inputs.length > 64) throw new Error("Multimodal embedding accepts 1-64 inputs");
  return {
    model,
    input: { contents: inputs.map(input => {
      if (input.type === "text") return { text: input.text };
      if (input.type === "image") return { image: input.image };
      return { video: input.video, ...(input.fps ? { fps: input.fps } : {}) };
    }) },
    parameters: { dimension },
  };
}

export class AlibabaMultimodalEmbeddingClient {
  readonly options: Required<Pick<AlibabaMultimodalOptions, "baseUrl" | "model" | "dimension" | "fetchImpl">> & Pick<AlibabaMultimodalOptions, "apiKey">;

  constructor(options: AlibabaMultimodalOptions = {}) {
    this.options = {
      apiKey: options.apiKey ?? process.env.DASHSCOPE_API_KEY,
      baseUrl: options.baseUrl ?? process.env.DASHSCOPE_MULTIMODAL_EMBEDDING_URL ?? "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding",
      model: options.model ?? DEFAULT_MULTIMODAL_EMBEDDING_MODEL,
      dimension: options.dimension ?? 1024,
      fetchImpl: options.fetchImpl ?? fetch,
    };
  }

  async embed(inputs: MultimodalInput[]): Promise<{ vectors: number[][]; request_id?: string; usage?: Record<string, unknown> }> {
    if (!this.options.apiKey) throw new Error("DASHSCOPE_API_KEY is required only for the final live embedding gate");
    const response = await this.options.fetchImpl(this.options.baseUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${this.options.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(buildMultimodalEmbeddingRequest(inputs, this.options.model, this.options.dimension)),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Alibaba multimodal embedding failed: HTTP ${response.status} ${(await response.text()).slice(0, 1000)}`);
    const parsed = embeddingResponseSchema.parse(await response.json());
    const vectors = [...parsed.output.embeddings].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(item => item.embedding);
    if (vectors.some(vector => vector.length !== this.options.dimension)) throw new Error("Alibaba embedding dimension mismatch");
    return { vectors, request_id: parsed.request_id, usage: parsed.usage };
  }
}
