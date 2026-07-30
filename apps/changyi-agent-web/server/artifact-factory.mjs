import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import JSZip from "jszip";
import pptxgen from "pptxgenjs";
import { tool } from "ai";
import { z } from "zod";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_BINARY_BYTES = 640 * 1024;

const filenameSchema = z.string().min(1).max(120);
const workIdSchema = z.string().min(1).max(160);
const sourceRefsSchema = z.array(z.string().max(220)).max(30).optional();
const confidentialitySchema = z.enum(["public", "internal", "restricted"]).default("internal");

const tableSchema = z.object({
  headers: z.array(z.string().max(160)).min(1).max(12),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).max(12)).max(120),
});

const docxSchema = z.object({
  work_id: workIdSchema,
  title: z.string().min(1).max(180),
  filename: filenameSchema,
  subtitle: z.string().max(300).optional(),
  author: z.string().max(120).optional(),
  confidentiality: confidentialitySchema,
  source_refs: sourceRefsSchema,
  sections: z.array(z.object({
    heading: z.string().max(180).optional(),
    level: z.number().int().min(1).max(3).default(1),
    paragraphs: z.array(z.string().max(5000)).max(30).default([]),
    bullets: z.array(z.string().max(1000)).max(30).default([]),
    tables: z.array(tableSchema).max(5).default([]),
  })).min(1).max(40),
});

const pptxSchema = z.object({
  work_id: workIdSchema,
  title: z.string().min(1).max(180),
  filename: filenameSchema,
  subtitle: z.string().max(300).optional(),
  author: z.string().max(120).optional(),
  confidentiality: confidentialitySchema,
  source_refs: sourceRefsSchema,
  slides: z.array(z.object({
    title: z.string().min(1).max(160),
    subtitle: z.string().max(240).optional(),
    body: z.string().max(1800).optional(),
    bullets: z.array(z.string().max(360)).max(9).default([]),
    footnote: z.string().max(260).optional(),
  })).min(1).max(30),
});

const cellSchema = z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]);
const xlsxSchema = z.object({
  work_id: workIdSchema,
  title: z.string().min(1).max(180),
  filename: filenameSchema,
  author: z.string().max(120).optional(),
  confidentiality: confidentialitySchema,
  source_refs: sourceRefsSchema,
  sheets: z.array(z.object({
    name: z.string().min(1).max(31),
    columns: z.array(z.object({
      header: z.string().min(1).max(120),
      key: z.string().min(1).max(80),
      width: z.number().min(6).max(60).optional(),
    })).min(1).max(40),
    rows: z.array(z.record(z.string(), cellSchema)).max(1000),
  })).min(1).max(12),
});

const textSchema = z.object({
  work_id: workIdSchema,
  title: z.string().min(1).max(180),
  filename: filenameSchema,
  content: z.string().max(500_000),
  content_type: z.enum(["text/markdown", "text/plain", "text/csv", "application/json", "application/yaml", "text/yaml"]),
  kind: z.enum(["note", "report", "deliverable", "dataset", "code", "document"]).default("deliverable"),
  confidentiality: confidentialitySchema,
  source_refs: sourceRefsSchema,
});

function safeFilename(filename, extension) {
  const cleaned = String(filename)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 110) || `项目产物${extension}`;
  return cleaned.toLowerCase().endsWith(extension) ? cleaned : `${cleaned}${extension}`;
}

function normalizeCell(value) {
  if (value == null) return "";
  return String(value);
}

export async function generateDocx(spec) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [new TextRun({ text: spec.title, bold: true, size: 38, font: "Microsoft YaHei" })],
    }),
  ];

  if (spec.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [new TextRun({ text: spec.subtitle, color: "666666", size: 22, font: "Microsoft YaHei" })],
    }));
  }

  for (const section of spec.sections) {
    if (section.heading) {
      children.push(new Paragraph({
        heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][section.level - 1],
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: section.heading, bold: true, font: "Microsoft YaHei" })],
      }));
    }
    for (const paragraph of section.paragraphs || []) {
      children.push(new Paragraph({
        spacing: { line: 360, after: 120 },
        children: [new TextRun({ text: paragraph, size: 22, font: "Microsoft YaHei" })],
      }));
    }
    for (const bullet of section.bullets || []) {
      children.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { line: 340, after: 80 },
        children: [new TextRun({ text: bullet, size: 22, font: "Microsoft YaHei" })],
      }));
    }
    for (const table of section.tables || []) {
      const rows = [table.headers, ...table.rows].map((row, rowIndex) => new TableRow({
        children: table.headers.map((_, columnIndex) => new TableCell({
          width: { size: Math.floor(100 / table.headers.length), type: WidthType.PERCENTAGE },
          shading: rowIndex === 0 ? { fill: "EDEDED" } : undefined,
          children: [new Paragraph({
            children: [new TextRun({
              text: normalizeCell(row[columnIndex]),
              bold: rowIndex === 0,
              size: 20,
              font: "Microsoft YaHei",
            })],
          })],
        })),
      }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
      children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
    }
  }

  const document = new Document({
    creator: spec.author || "长翼久安知识库",
    title: spec.title,
    description: "由长翼久安线上 Agent 生成并持久化",
    styles: {
      default: {
        document: { run: { font: "Microsoft YaHei", size: 22 } },
        heading1: { run: { font: "Microsoft YaHei", size: 30, bold: true } },
        heading2: { run: { font: "Microsoft YaHei", size: 26, bold: true } },
        heading3: { run: { font: "Microsoft YaHei", size: 23, bold: true } },
      },
    },
    sections: [{ properties: {}, children }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}

export async function generatePptx(spec) {
  const presentation = new pptxgen();
  presentation.layout = "LAYOUT_WIDE";
  presentation.author = spec.author || "长翼久安知识库";
  presentation.subject = "长翼久安项目产物";
  presentation.title = spec.title;
  presentation.company = "长翼久安";
  presentation.lang = "zh-CN";
  presentation.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
    lang: "zh-CN",
  };

  const cover = presentation.addSlide();
  cover.background = { color: "FFFFFF" };
  cover.addShape(presentation.ShapeType.line, { x: 0.8, y: 1.15, w: 0.7, h: 0, line: { color: "111111", width: 3 } });
  cover.addText(spec.title, { x: 0.8, y: 1.55, w: 11.5, h: 1.25, fontFace: "Microsoft YaHei", fontSize: 30, bold: true, color: "111111", margin: 0, breakLine: false });
  if (spec.subtitle) cover.addText(spec.subtitle, { x: 0.82, y: 3.0, w: 10.8, h: 0.7, fontFace: "Microsoft YaHei", fontSize: 15, color: "666666", margin: 0 });
  cover.addText("长翼久安知识库", { x: 0.82, y: 6.65, w: 3.2, h: 0.3, fontFace: "Microsoft YaHei", fontSize: 10, color: "777777", margin: 0 });

  spec.slides.forEach((item, index) => {
    const slide = presentation.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(item.title, { x: 0.65, y: 0.45, w: 11.5, h: 0.55, fontFace: "Microsoft YaHei", fontSize: 23, bold: true, color: "111111", margin: 0 });
    slide.addShape(presentation.ShapeType.line, { x: 0.65, y: 1.12, w: 12.0, h: 0, line: { color: "D9D9D9", width: 1 } });
    let y = 1.42;
    if (item.subtitle) {
      slide.addText(item.subtitle, { x: 0.72, y, w: 11.6, h: 0.48, fontFace: "Microsoft YaHei", fontSize: 13, color: "666666", margin: 0 });
      y += 0.62;
    }
    if (item.body) {
      slide.addText(item.body, { x: 0.72, y, w: 11.6, h: Math.min(2.0, 0.58 + item.body.length / 280), fontFace: "Microsoft YaHei", fontSize: 16, color: "222222", breakLine: false, valign: "top", margin: 0.04 });
      y += Math.min(2.2, 0.72 + item.body.length / 260);
    }
    for (const bullet of item.bullets || []) {
      if (y > 6.35) break;
      slide.addText(bullet, { x: 0.92, y, w: 11.1, h: 0.5, fontFace: "Microsoft YaHei", fontSize: 16, color: "222222", bullet: { indent: 18 }, margin: 0.02, breakLine: false });
      y += 0.58;
    }
    if (item.footnote) slide.addText(item.footnote, { x: 0.72, y: 6.72, w: 10.8, h: 0.28, fontFace: "Microsoft YaHei", fontSize: 9, color: "777777", margin: 0 });
    slide.addText(String(index + 1).padStart(2, "0"), { x: 12.05, y: 6.72, w: 0.55, h: 0.25, fontFace: "Aptos", fontSize: 9, color: "888888", align: "right", margin: 0 });
  });

  const output = await presentation.write({ outputType: "nodebuffer" });
  return Buffer.from(output);
}

export async function generateXlsx(spec) {
  const zip = new JSZip();
  const now = new Date().toISOString();
  const sheetOverrides = spec.sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${sheetOverrides}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(spec.title)}</dc:title><dc:creator>${escapeXml(spec.author || "长翼久安知识库")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>长翼久安知识库</Application></Properties>`);

  const workbookSheets = spec.sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("");
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets></workbook>`);
  const workbookRels = spec.sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("");
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels}<Relationship Id="rId${spec.sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFE5E7EB"/></left><right style="thin"><color rgb="FFE5E7EB"/></right><top style="thin"><color rgb="FFE5E7EB"/></top><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);

  spec.sheets.forEach((sheet, index) => {
    const columns = sheet.columns.map((column, columnIndex) => `<col min="${columnIndex + 1}" max="${columnIndex + 1}" width="${column.width || Math.min(40, Math.max(12, column.header.length * 2 + 4))}" customWidth="1"/>`).join("");
    const headerCells = sheet.columns.map((column, columnIndex) => xlsxCell(columnIndex, 1, column.header, 1)).join("");
    const rows = [`<row r="1" ht="26" customHeight="1">${headerCells}</row>`];
    sheet.rows.forEach((row, rowIndex) => {
      const cells = sheet.columns.map((column, columnIndex) => xlsxCell(columnIndex, rowIndex + 2, row[column.key], 0)).join("");
      rows.push(`<row r="${rowIndex + 2}">${cells}</row>`);
    });
    const lastCell = `${xlsxColumnName(sheet.columns.length - 1)}${Math.max(1, sheet.rows.length + 1)}`;
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rows.join("")}</sheetData><autoFilter ref="A1:${lastCell}"/></worksheet>`);
  });

  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));
}

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);
}

function xlsxColumnName(index) {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function xlsxCell(columnIndex, rowIndex, value, style) {
  const reference = `${xlsxColumnName(columnIndex)}${rowIndex}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value ?? "")}</t></is></c>`;
}

function compactPublishedResult(result, resource) {
  const structured = result?.structuredContent || {};
  const artifactId = structured.artifact_id || structured.artifactId;
  const resourceUri = structured.resource_uri || structured.resourceUri;
  const rawResourceUri = structured.raw_resource_uri || structured.rawResourceUri;
  if (!artifactId) throw new Error("知识库没有返回产物标识");
  return {
    artifact_id: artifactId,
    resource_uri: rawResourceUri || resourceUri,
    title: resource.title,
    filename: resource.filename,
    mime_type: resource.content_type,
    size_bytes: structured.size_bytes,
    status: structured.status || "published",
  };
}

async function publishResource(mcpClient, workId, resource) {
  const result = await mcpClient.callTool({
    name: "kb_publish_resource",
    arguments: { work_id: workId, resource },
    options: { timeout: 90_000 },
  });
  return compactPublishedResult(result, resource);
}

async function publishBinary(mcpClient, input, buffer, contentType, extension, kind) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error("生成的文件为空");
  if (buffer.length > MAX_BINARY_BYTES) throw new Error("生成文件超过 640KB 在线持久化限制，请拆分内容");
  return publishResource(mcpClient, input.work_id, {
    title: input.title,
    filename: safeFilename(input.filename, extension),
    kind,
    content_type: contentType,
    encoding: "base64",
    content: buffer.toString("base64"),
    confidentiality: input.confidentiality,
    source_refs: input.source_refs || [],
  });
}

export function createArtifactTools(mcpClient) {
  return {
    create_docx: tool({
      description: "生成并持久化正式 Word DOCX 文件。适用于项目书、报告、函件、总结、方案和其他正式文本。工具内部完成二进制生成与上传，不要再调用普通资源发布工具重复上传。必须传入已建立的 work_id。",
      inputSchema: docxSchema,
      execute: async (input) => publishBinary(mcpClient, input, await generateDocx(input), DOCX_MIME, ".docx", "document"),
    }),
    create_pptx: tool({
      description: "生成并持久化可编辑的 PowerPoint PPTX 文件。适用于汇报、答辩、路演和展示。每页保持一个核心主题，工具内部完成二进制生成与上传。必须传入已建立的 work_id。",
      inputSchema: pptxSchema,
      execute: async (input) => publishBinary(mcpClient, input, await generatePptx(input), PPTX_MIME, ".pptx", "document"),
    }),
    create_xlsx: tool({
      description: "生成并持久化可编辑的 Excel XLSX 文件。适用于计划表、预算、名单、进度、清单和结构化数据。工具内部完成二进制生成与上传。必须传入已建立的 work_id。",
      inputSchema: xlsxSchema,
      execute: async (input) => publishBinary(mcpClient, input, await generateXlsx(input), XLSX_MIME, ".xlsx", "dataset"),
    }),
    publish_text_file: tool({
      description: "按原始扩展名持久化文本、代码、JSON、CSV、YAML 或 Markdown 文件。代码和配置文件使用 text/plain 并保留用户需要的文件名；不要把所有产物强制改成 Markdown。必须传入已建立的 work_id。",
      inputSchema: textSchema,
      execute: async (input) => publishResource(mcpClient, input.work_id, {
        title: input.title,
        filename: safeFilename(input.filename, ""),
        kind: input.kind,
        content_type: input.content_type,
        encoding: "utf8",
        content: input.content,
        confidentiality: input.confidentiality,
        source_refs: input.source_refs || [],
      }),
    }),
  };
}
