import { sanitizeGeneratedFilename, validateDocumentContent } from "./jd-agent-file-generator.ts";

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
}
function rejects(fn: () => unknown, label: string) {
  let failed = false;
  try { fn(); } catch { failed = true; }
  equal(failed, true, label);
}

Deno.test("JD document drafts accept text formats without rewriting content", () => {
  const markdown = "# Quarterly report\n\nA useful and complete report body.";
  equal(validateDocumentContent("md", markdown), markdown, "markdown retained");
  equal(validateDocumentContent("csv", "name,total\nNorth,42\nSouth,38"), "name,total\nNorth,42\nSouth,38", "csv retained");
});

Deno.test("JD XLSX drafts validate bounded sheet and cell structures", () => {
  const spec = JSON.stringify({ sheets: [{ name: "Summary", rows: [["Metric", "Value"], ["Revenue", 4200], ["Active", true]] }] });
  equal(validateDocumentContent("xlsx", spec), spec, "valid workbook spec");
  rejects(() => validateDocumentContent("xlsx", JSON.stringify({ sheets: [] })), "empty workbook rejected");
  rejects(() => validateDocumentContent("xlsx", JSON.stringify({ sheets: [{ rows: [[{}]] }] })), "object cell rejected");
});

Deno.test("JD PPTX drafts validate slide structures", () => {
  const spec = JSON.stringify({ slides: [{ title: "Overview", bullets: ["One", "Two"] }] });
  equal(validateDocumentContent("pptx", spec), spec, "valid presentation spec");
  rejects(() => validateDocumentContent("pptx", JSON.stringify({ slides: [] })), "empty deck rejected");
});

Deno.test("JD document drafts enforce the content size floor and ceiling", () => {
  rejects(() => validateDocumentContent("txt", "too short"), "short content rejected");
  rejects(() => validateDocumentContent("txt", "x".repeat(95001)), "oversized content rejected");
});

Deno.test("JD source-code drafts accept common text-based project formats", () => {
  equal(validateDocumentContent("html", "<main><h1>Campus portal</h1></main>"), "<main><h1>Campus portal</h1></main>", "html retained");
  equal(validateDocumentContent("ts", "export const answer: number = 42;"), "export const answer: number = 42;", "typescript retained");
  equal(validateDocumentContent("sql", "select count(*) from public.profiles;"), "select count(*) from public.profiles;", "sql retained");
});

Deno.test("JD generated filenames remain relative and cannot traverse directories", () => {
  equal(sanitizeGeneratedFilename("src/main", "ts"), "src/main.ts", "extension appended");
  equal(sanitizeGeneratedFilename("src/main.ts", "ts"), "src/main.ts", "extension preserved");
  let rejected = false;
  try { sanitizeGeneratedFilename("../secrets", "txt"); } catch { rejected = true; }
  equal(rejected, true, "path traversal rejected");
});