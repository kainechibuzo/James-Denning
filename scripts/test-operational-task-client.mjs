import test from "node:test";
import assert from "node:assert/strict";
import { transitionOperationalTask, taskTransitionAction } from "../src/chat/operational-task-client.mjs";

const taskId = "11111111-1111-4111-8111-111111111111";
const auditId = "22222222-2222-4222-8222-222222222222";
const request = { taskId, status: "in_progress", role: "manager" };
const confirmed = () => ({ task: { id: taskId, status: "in_progress" }, auditRecorded: true, auditId });
function stub(result) {
  const calls = [];
  return { calls, functions: { invoke: async (...args) => {
    calls.push(args);
    if (result instanceof Error) throw result;
    return result;
  } } };
}

for (const role of ["owner", "admin", "manager", "staff"]) {
  test(`${role} uses the correct authenticated action and requires confirmed evidence`, async () => {
    const client = stub({ data: confirmed(), error: null });
    const result = await transitionOperationalTask(client, { ...request, role });
    assert.deepEqual(result, confirmed());
    assert.deepEqual(client.calls, [["jd-automation", { body: {
      action: role === "staff" ? "operations.task.transition_own" : "operations.task.transition",
      taskId, status: "in_progress",
    } }]]);
  });
}
for (const role of [undefined, "viewer", "finance", "hr", "contractor", "teacher", "unknown"]) {
  test(`${role} cannot issue a manager task mutation`, async () => {
    const client = stub({ data: confirmed() });
    assert.equal(taskTransitionAction(role), null);
    await assert.rejects(transitionOperationalTask(client, { ...request, role }), { status: 403 });
    assert.equal(client.calls.length, 0);
  });
}
for (const status of ["queued", "cancelled"]) {
  test(`staff cannot request ${status}`, async () => {
    const client = stub({ data: confirmed() });
    await assert.rejects(transitionOperationalTask(client, { ...request, status, role: "staff" }), { status: 403 });
    assert.equal(client.calls.length, 0);
  });
}
for (const input of [{ taskId: "draft-1" }, { taskId: "" }, { status: "published" }]) {
  test(`invalid input fails before network: ${JSON.stringify(input)}`, async () => {
    const client = stub({ data: confirmed() });
    await assert.rejects(transitionOperationalTask(client, { ...request, ...input }), { status: 400 });
    assert.equal(client.calls.length, 0);
  });
}
for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
  test(`HTTP ${status} is actionable, sanitised and never auto-retried`, async () => {
    const client = stub({ error: { message: "SECRET diagnostic", context: { status } }, data: null });
    await assert.rejects(transitionOperationalTask(client, request), (err) => {
      assert.equal(err.status, status);
      assert.doesNotMatch(err.message, /SECRET/);
      assert.match(err.message, /refresh|permission/i);
      return true;
    });
    assert.equal(client.calls.length, 1);
  });
}
const badEvidence = [
  undefined, {}, { task: {} },
  { ...confirmed(), auditRecorded: false },
  { ...confirmed(), auditRecorded: undefined },
  { ...confirmed(), auditRecorded: "true" },
  { ...confirmed(), auditId: undefined },
  { ...confirmed(), auditId: "not-an-audit-id" },
  { ...confirmed(), task: { id: taskId } },
  { ...confirmed(), task: { id: auditId, status: "in_progress" } },
  { ...confirmed(), task: { id: taskId, status: "queued" } },
];
for (const [i, data] of badEvidence.entries()) {
  test(`2xx with incomplete or mismatched evidence ${i} cannot report success`, async () => {
    const client = stub({ data });
    await assert.rejects(transitionOperationalTask(client, request), /confirmed task and audit evidence/);
    assert.equal(client.calls.length, 1);
  });
}
test("body-level error is not success even with task fields", async () => {
  const client = stub({ data: { ...confirmed(), error: "SECRET error" } });
  await assert.rejects(transitionOperationalTask(client, request), /may have been saved/);
  assert.equal(client.calls.length, 1);
});
test("thrown network failure leaves the outcome unknown and does not retry", async () => {
  const client = stub(new Error("SECRET request body"));
  await assert.rejects(transitionOperationalTask(client, request), /may have been saved/);
  assert.equal(client.calls.length, 1);
});
