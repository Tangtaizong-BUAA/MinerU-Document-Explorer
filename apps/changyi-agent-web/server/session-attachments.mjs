import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";

const DEFAULT_ROOT = process.env.CYJ_AGENT_ATTACHMENT_DIR || "/tmp/changyi-jiuan-agent-attachments";
const DEFAULT_TTL_MS = Number(process.env.CYJ_AGENT_ATTACHMENT_TTL_MS || 2 * 60 * 60 * 1000);
const MAX_TEXT_CHARS = 120_000;
const MAX_IMAGES = 4;

function safeSegment(value, label) {
  const text = String(value || "");
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(text)) throw Object.assign(new Error(`${label}无效`), { status: 400 });
  return text;
}

function cleanFilename(value) {
  const cleaned = basename(String(value || "项目文件")).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "项目文件").slice(0, 180);
}

function attachmentPaths(root, sessionId, attachmentId) {
  const session = safeSegment(sessionId, "会话标识");
  const attachment = safeSegment(attachmentId, "附件标识");
  const folder = resolve(root, session, attachment);
  if (!folder.startsWith(`${resolve(root)}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("附件路径无效");
  return { folder, metadata: join(folder, "metadata.json"), content: join(folder, "content.bin") };
}

function stripXml(xml) {
  return String(xml || "")
    .replace(/<w:tab\b[^>]*\/?\s*>/g, "\t")
    .replace(/<w:br\b[^>]*\/?\s*>/g, "\n")
    .replace(/<a:br\b[^>]*\/?\s*>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

async function officeText(bytes, extension) {
  const zip = await JSZip.loadAsync(bytes);
  if (extension === ".docx") {
    const xml = await zip.file("word/document.xml")?.async("string");
    return stripXml(xml);
  }
  if (extension === ".pptx") {
    const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
    const chunks = [];
    for (let i = 0; i < slides.length; i += 1) chunks.push(`## 幻灯片 ${i + 1}\n${stripXml(await zip.file(slides[i]).async("string"))}`);
    return chunks.join("\n\n");
  }
  if (extension === ".xlsx") {
    const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    const shared = [...String(sharedXml || "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => stripXml(match[1]));
    const sheets = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort();
    const chunks = [];
    for (let i = 0; i < sheets.length; i += 1) {
      const xml = await zip.file(sheets[i]).async("string");
      const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
        return [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((cell) => {
          const value = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1] || "";
          return /\bt="s"/.test(cell[1]) ? shared[Number(value)] || "" : stripXml(value);
        }).join("\t");
      });
      chunks.push(`## 工作表 ${i + 1}\n${rows.join("\n")}`);
    }
    return chunks.join("\n\n");
  }
  return "";
}

async function pdfText(bytes) {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return { text: result.text || "", pages: result.total || result.pages?.length || 0 };
  } finally {
    await parser.destroy();
  }
}

async function pdfImages(bytes, pages) {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getScreenshot({ partial: pages, desiredWidth: 1400, imageBuffer: true, imageDataUrl: false });
    return result.pages.slice(0, MAX_IMAGES).map((page) => ({ type: "image", data: Buffer.from(page.data).toString("base64"), mimeType: "image/png" }));
  } finally {
    await parser.destroy();
  }
}

async function officeImages(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const media = Object.keys(zip.files).filter((name) => /^(word|ppt|xl)\/media\//.test(name) && /\.(png|jpe?g|webp|gif)$/i.test(name)).slice(0, MAX_IMAGES);
  const output = [];
  for (const name of media) {
    const data = await zip.file(name).async("nodebuffer");
    const extension = extname(name).toLowerCase();
    output.push({ type: "image", data: data.toString("base64"), mimeType: extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : extension === ".gif" ? "image/gif" : "image/jpeg" });
  }
  return output;
}

export class SessionAttachmentStore {
  constructor({ root = DEFAULT_ROOT, ttlMs = DEFAULT_TTL_MS } = {}) {
    this.root = root;
    this.ttlMs = ttlMs;
  }

  async stage({ sessionId, filename, mimeType, bytes }) {
    safeSegment(sessionId, "会话标识");
    const attachmentId = `att-${randomUUID()}`;
    const paths = attachmentPaths(this.root, sessionId, attachmentId);
    const metadata = {
      attachmentId,
      sessionId,
      name: cleanFilename(filename),
      mimeType: String(mimeType || "application/octet-stream"),
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      stagedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
      status: "staged",
    };
    await mkdir(paths.folder, { recursive: true, mode: 0o700 });
    await writeFile(paths.content, bytes, { mode: 0o600 });
    await writeFile(paths.metadata, `${JSON.stringify(metadata)}\n`, { mode: 0o600 });
    return metadata;
  }

  async get(sessionId, attachmentId) {
    const paths = attachmentPaths(this.root, sessionId, attachmentId);
    const metadata = JSON.parse(await readFile(paths.metadata, "utf8"));
    if (Date.parse(metadata.expiresAt) <= Date.now()) {
      await rm(paths.folder, { recursive: true, force: true });
      throw Object.assign(new Error("附件已过期，请重新添加"), { status: 410 });
    }
    return { ...metadata, paths };
  }

  async read(sessionId, attachmentId, { mode = "text", pages = [1, 2, 3] } = {}) {
    const attachment = await this.get(sessionId, attachmentId);
    const bytes = await readFile(attachment.paths.content);
    const extension = extname(attachment.name).toLowerCase();
    if (mode === "visual") {
      if (attachment.mimeType.startsWith("image/")) return { attachment, content: [{ type: "image", data: bytes.toString("base64"), mimeType: attachment.mimeType }] };
      if (extension === ".pdf") return { attachment, content: await pdfImages(bytes, pages.slice(0, MAX_IMAGES)) };
      if ([".docx", ".pptx", ".xlsx"].includes(extension)) return { attachment, content: await officeImages(bytes) };
      throw new Error("该附件没有可读取的视觉内容");
    }
    let text = "";
    let details = {};
    if (attachment.mimeType.startsWith("text/") || [".md", ".txt", ".csv", ".json", ".yaml", ".yml"].includes(extension)) text = bytes.toString("utf8");
    else if (extension === ".pdf") {
      const parsed = await pdfText(bytes);
      text = parsed.text;
      details = { pageCount: parsed.pages };
    } else if ([".docx", ".pptx", ".xlsx"].includes(extension)) text = await officeText(bytes, extension);
    else if (attachment.mimeType.startsWith("image/")) return this.read(sessionId, attachmentId, { mode: "visual", pages });
    else throw new Error("该附件暂时无法提取文字，可先查看视觉内容");
    const truncated = text.length > MAX_TEXT_CHARS;
    text = text.slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) text = "未提取到可用文字；这可能是扫描件或图片型文档，请改用 visual 模式查看页面。";
    if (truncated) text += "\n\n[内容已按本轮上下文上限截断，可结合页码或关键词继续处理。]";
    return { attachment, content: [{ type: "text", text }], details: { ...details, truncated } };
  }

  async bytes(sessionId, attachmentId) {
    const attachment = await this.get(sessionId, attachmentId);
    return { attachment, bytes: await readFile(attachment.paths.content) };
  }

  async remove(sessionId, attachmentId) {
    const { folder } = attachmentPaths(this.root, sessionId, attachmentId);
    await rm(folder, { recursive: true, force: true });
  }

  async cleanup() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const sessions = await readdir(this.root, { withFileTypes: true });
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const folder = join(this.root, session.name);
      const age = Date.now() - (await stat(folder)).mtimeMs;
      if (age > this.ttlMs * 2) await rm(folder, { recursive: true, force: true });
    }
  }
}
