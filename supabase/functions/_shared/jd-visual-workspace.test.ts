import { assertEquals } from "jsr:@std/assert@1";
import { buildJdVisualWorkspace } from "./jd-visual-workspace.ts";

Deno.test("builds checklist and department metrics from persisted tenant tasks", () => {
  const ui = buildJdVisualWorkspace({ tasksAvailable: true, tasks: [
    { id: "1", title: "Close books", department: "Finance", status: "completed" },
    { id: "2", title: "Review invoices", department: "Finance", status: "blocked" },
    { id: "3", title: "Prepare delivery", department: "Operations", status: "in_progress" },
  ] });
  assertEquals(ui.blocks.length, 2);
  const checklist = ui.blocks[0] as any;
  assertEquals(checklist.items[0].status, "completed");
  assertEquals(checklist.items[1].id, "2");
  assertEquals(checklist.items[2].status, "in_progress");
  const departments = ui.blocks[1] as any;
  assertEquals(departments.items[0].name, "Finance");
  assertEquals(departments.items[0].metric, "0 open");
  assertEquals(departments.items[0].status, "blocked");
});

Deno.test("evidence is only rendered from persisted steps and audit records", () => {
  const ui = buildJdVisualWorkspace({ evidenceAvailable: true, steps: [
    { id: "step-1", tool_key: "get_workspace_overview", status: "completed", output_json: { evidence: { total_members: 18, sample_truncated: false } } },
    { id: "step-2", tool_key: "get_billing_snapshot", status: "failed", error_message: "Source unavailable" },
  ], audit: [{ id: "audit-1", event_type: "automation.completed", created_at: "2026-11-13T00:00:00Z" }] });
  assertEquals(ui.blocks.length, 2);
  const evidence = ui.blocks[1] as any;
  assertEquals(evidence.status, "blocked");
  assertEquals(evidence.items.length, 3);
  assertEquals(evidence.items[2].reference, "audit-1");
  assertEquals(String(evidence.items[0].label).includes("total_members: 18"), true);
});

Deno.test("does not manufacture visual blocks when source reads are unavailable", () => {
  assertEquals(buildJdVisualWorkspace({ tasksAvailable: false, evidenceAvailable: false }).blocks, []);
});

Deno.test("does not label an empty evidence source as verified", () => {
  const ui = buildJdVisualWorkspace({ evidenceAvailable: true, steps: [], audit: [] });
  const evidence = ui.blocks.find((block: any) => block.type === "evidence") as any;
  assertEquals(evidence.status, "pending");
  assertEquals(evidence.items, []);
});
