import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createArtifactTools, generateDocx, generatePptx, generateXlsx } from "../server/artifact-factory.mjs";

const common = {
  work_id: "work_item:cyj:test",
  title: "长翼久安测试产物",
  author: "测试 Agent",
  confidentiality: "internal",
  source_refs: ["artifact:cyj:evidence"],
};

test("DOCX generator returns a non-empty OOXML package", async () => {
  const buffer = await generateDocx({
    ...common,
    filename: "验收报告.docx",
    subtitle: "轻量文档工厂",
    sections: [{
      heading: "验收范围",
      level: 1,
      paragraphs: ["支持中文正式文档。"],
      bullets: ["持久化", "可下载"],
      tables: [{ headers: ["能力", "状态"], rows: [["DOCX", "通过"]] }],
    }],
  });
  assert.ok(buffer.length > 3000);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
});

test("PPTX generator returns a non-empty OOXML package", async () => {
  const buffer = await generatePptx({
    ...common,
    filename: "验收演示.pptx",
    subtitle: "轻量文档工厂",
    slides: [{ title: "核心能力", body: "生成可编辑演示文稿。", bullets: ["结构化输入", "直接下载"] }],
  });
  assert.ok(buffer.length > 5000);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
});

test("XLSX generator creates readable sheets and rows", async () => {
  const buffer = await generateXlsx({
    ...common,
    filename: "验收计划.xlsx",
    sheets: [{
      name: "计划",
      columns: [{ header: "任务", key: "task", width: 24 }, { header: "状态", key: "status", width: 14 }],
      rows: [{ task: "生成 Excel", status: "完成" }],
    }],
  });
  assert.ok(buffer.length > 3000);
  const workbook = await JSZip.loadAsync(buffer);
  const workbookXml = await workbook.file("xl/workbook.xml").async("string");
  const sheetXml = await workbook.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(workbookXml, /name="计划"/);
  assert.match(sheetXml, /生成 Excel/);
  assert.match(sheetXml, /完成/);
});

test("artifact tools upload binary internally and return only compact metadata", async () => {
  let captured;
  const mockClient = {
    callTool: async (request) => {
      captured = request;
      return { structuredContent: { artifact_id: "artifact:cyj:generated", resource_uri: "kb://artifact/generated/document", raw_resource_uri: "kb://artifact/generated/raw", size_bytes: 4096, status: "parsed" } };
    },
  };
  const tools = createArtifactTools(mockClient);
  const result = await tools.create_docx.execute({
    ...common,
    filename: "正式报告",
    sections: [{ heading: "正文", level: 1, paragraphs: ["内容"], bullets: [], tables: [] }],
  });
  assert.equal(captured.name, "kb_publish_resource");
  assert.equal(captured.arguments.resource.filename, "正式报告.docx");
  assert.equal(captured.arguments.resource.encoding, "base64");
  assert.ok(captured.arguments.resource.content.length > 1000);
  assert.equal(result.filename, "正式报告.docx");
  assert.equal(result.resource_uri, "kb://artifact/generated/raw");
  assert.equal(result.mime_type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal("content" in result, false);
});
