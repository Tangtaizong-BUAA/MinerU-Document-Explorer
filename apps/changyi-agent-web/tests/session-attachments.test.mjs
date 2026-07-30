import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import JSZip from "jszip";
import { SessionAttachmentStore } from "../server/session-attachments.mjs";

async function withStore(run) {
  const root = await mkdtemp(join(tmpdir(), "cyj-attachments-test-"));
  try { await run(new SessionAttachmentStore({ root, ttlMs: 60_000 })); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("staged text stays session-scoped and is readable without a knowledge artifact", async () => {
  await withStore(async (store) => {
    const staged = await store.stage({ sessionId: "session-a", filename: "本轮说明.md", mimeType: "text/markdown", bytes: Buffer.from("# 仅本轮\n不会自动入库") });
    assert.match(staged.attachmentId, /^att-/);
    assert.equal("artifactId" in staged, false);
    const result = await store.read("session-a", staged.attachmentId);
    assert.match(result.content[0].text, /不会自动入库/);
    await assert.rejects(() => store.get("session-b", staged.attachmentId));
  });
});

test("docx text is extracted inside the temporary attachment boundary", async () => {
  await withStore(async (store) => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>长翼久安附件内容</w:t></w:r></w:p></w:body></w:document>");
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    const staged = await store.stage({ sessionId: "session-docx", filename: "资料.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes });
    const result = await store.read("session-docx", staged.attachmentId);
    assert.match(result.content[0].text, /长翼久安附件内容/);
  });
});

test("removing a staged attachment makes it unavailable", async () => {
  await withStore(async (store) => {
    const staged = await store.stage({ sessionId: "session-delete", filename: "删除.txt", mimeType: "text/plain", bytes: Buffer.from("delete me") });
    await store.remove("session-delete", staged.attachmentId);
    await assert.rejects(() => store.get("session-delete", staged.attachmentId));
  });
});
