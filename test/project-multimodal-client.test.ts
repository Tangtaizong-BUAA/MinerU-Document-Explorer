import { describe, expect, test, vi } from "vitest";
import { AlibabaMultimodalEmbeddingClient, buildMultimodalEmbeddingRequest } from "../src/project/multimodal/alibaba-client.js";

describe("Alibaba full-modal retrieval adapter", () => {
  test("preserves video as video input rather than keyframes", () => {
    expect(buildMultimodalEmbeddingRequest([{ type: "video", video: "https://signed.invalid/video.mp4", fps: 2 }])).toMatchObject({
      model: "qwen3-vl-embedding", input: { contents: [{ video: "https://signed.invalid/video.mp4", fps: 2 }] }, parameters: { dimension: 1024 },
    });
  });

  test("validates returned dimensions and keeps the API key out of request bodies", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).not.toContain("test-key");
      return new Response(JSON.stringify({ output: { embeddings: [{ index: 0, embedding: [0.1, 0.2] }] }, request_id: "req" }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = new AlibabaMultimodalEmbeddingClient({ apiKey: "test-key", dimension: 2, fetchImpl: fetchImpl as typeof fetch });
    await expect(client.embed([{ type: "text", text: "长城" }])).resolves.toEqual({ vectors: [[0.1, 0.2]], request_id: "req", usage: undefined });
  });
});
