export type JdDocumentFormat = "txt" | "md" | "csv" | "json" | "html" | "css" | "js" | "ts" | "py" | "sql" | "xml" | "yaml" | "docx" | "xlsx" | "pptx";

export const JD_DOCUMENT_MIME: Record<JdDocumentFormat, string> = {
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  ts: "text/plain",
  py: "text/x-python",
  sql: "application/sql",
  xml: "application/xml",
  yaml: "text/yaml",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function sanitizeGeneratedFilename(value: unknown, format: JdDocumentFormat): string {
  const raw = typeof value === "string" ? value.trim().replace(/\\/g, "/") : "";
  if (!raw || raw.startsWith("/") || raw.length > 160) throw new Error("A relative filename of at most 160 characters is required");
  const segments = raw.split("/");
  if (segments.some((part) => !part || part === "." || part === "..")) throw new Error("Filename path traversal is not allowed");
  const clean = segments.map((part) => part.replace(/[^a-z0-9._-]/gi, "-")).join("/");
  const extension = format;
  const leaf = clean.split("/").pop() || "";
  const safeLeaf = leaf.toLowerCase().endsWith("." + extension) ? leaf : leaf + "." + extension;
  return [...clean.split("/").slice(0, -1), safeLeaf].join("/");
}
export function validateDocumentContent(format: JdDocumentFormat, content: string): string {
  if (typeof content !== "string" || content.trim().length < 20 || new TextEncoder().encode(content).length > 95000) {
    throw new Error("Document content must be between 20 bytes and 95 KB");
  }
  if (format === "json") {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  }
  if (format === "xlsx") {
    const spec = JSON.parse(content);
    if (!Array.isArray(spec.sheets) || spec.sheets.length < 1 || spec.sheets.length > 8) {
      throw new Error("An XLSX draft needs between 1 and 8 sheets");
    }
    for (const sheet of spec.sheets) {
      if (!Array.isArray(sheet.rows) || sheet.rows.length < 1 || sheet.rows.length > 500) {
        throw new Error("Each spreadsheet sheet needs between 1 and 500 rows");
      }
      if (sheet.rows.some((row: unknown) => !Array.isArray(row) || row.length > 30 ||
        row.some((cell: unknown) => !["string", "number", "boolean"].includes(typeof cell)))) {
        throw new Error("Spreadsheet cells must be strings, numbers or booleans, with at most 30 columns");
      }
    }
  }
  if (format === "pptx") {
    const spec = JSON.parse(content);
    if (!Array.isArray(spec.slides) || spec.slides.length < 1 || spec.slides.length > 20) {
      throw new Error("A presentation needs between 1 and 20 slides");
    }
    for (const slide of spec.slides) {
      if (typeof slide.title !== "string" || !Array.isArray(slide.bullets) || slide.bullets.length > 8 ||
        slide.bullets.some((bullet: unknown) => typeof bullet !== "string")) {
        throw new Error("Each presentation slide needs a title and up to 8 text bullets");
      }
    }
  }
  return content;
}

export async function generateJdDocument(format: JdDocumentFormat, rawContent: string, title: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  textContent: string;
}> {
  const content = validateDocumentContent(format, rawContent);
  if (["txt", "md", "csv", "json", "html", "css", "js", "ts", "py", "sql", "xml", "yaml"].includes(format)) {
    return { bytes: new TextEncoder().encode(content), mimeType: JD_DOCUMENT_MIME[format], extension: format, textContent: content };
  }

  if (format === "xlsx") {
    const XLSX = await import("https://esm.sh/xlsx@0.18.5");
    const spec = JSON.parse(content);
    const workbook = XLSX.utils.book_new();
    for (const sheet of spec.sheets) {
      const rows = sheet.rows.map((row: unknown[]) => row.map((cell) => cell));
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, String(sheet.name || "Sheet").slice(0, 31));
    }
    const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
    return { bytes, mimeType: JD_DOCUMENT_MIME.xlsx, extension: "xlsx", textContent: content };
  }

  if (format === "pptx") {
    const module = await import("https://esm.sh/pptxgenjs@3.12.0");
    const PptxGenJS = module.default;
    const presentation = new PptxGenJS();
    presentation.layout = "LAYOUT_WIDE";
    const spec = JSON.parse(content);
    for (const item of spec.slides) {
      const slide = presentation.addSlide();
      slide.background = { color: "FFFFFF" };
      slide.addText(String(item.title).slice(0, 180), { x: 0.55, y: 0.35, w: 12.1, h: 0.75, fontSize: 26, bold: true, color: "20242B", breakLine: false });
      const bullets = item.bullets.map((bullet: string) => ({ text: bullet.slice(0, 500), options: { bullet: { indent: 18 }, hanging: 4 } }));
      slide.addText(bullets, { x: 0.7, y: 1.35, w: 11.8, h: 5.5, fontSize: 17, color: "333942", breakLine: false, valign: "top", paraSpaceAfter: 12 });
    }
    const output = await presentation.write({ outputType: "uint8array" });
    return { bytes: new Uint8Array(output as Uint8Array), mimeType: JD_DOCUMENT_MIME.pptx, extension: "pptx", textContent: content };
  }

  const module = await import("https://esm.sh/docx@8.5.0");
  const children: any[] = [];
  children.push(new module.Paragraph({ text: title, heading: module.HeadingLevel.TITLE }));
  const lines = content.split(/\r?\n/).slice(0, 500);
  for (const line of lines) {
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length === 1 ? module.HeadingLevel.HEADING_1
        : heading[1].length === 2 ? module.HeadingLevel.HEADING_2 : module.HeadingLevel.HEADING_3;
      children.push(new module.Paragraph({ text: heading[2].slice(0, 500), heading: level }));
    } else {
      children.push(new module.Paragraph({ children: [new module.TextRun(line.slice(0, 3000))] }));
    }
  }
  const document = new module.Document({ sections: [{ children }] });
  const output = await module.Packer.toBuffer(document);
  const bytes = new Uint8Array(output);
  return { bytes, mimeType: JD_DOCUMENT_MIME.docx, extension: "docx", textContent: content };
}
