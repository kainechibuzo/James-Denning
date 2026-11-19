import { assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
const sql = await Deno.readTextFile(new URL("../../migrations/20261119120000_jd_connector_outcome_unknown.sql", import.meta.url));
Deno.test("connector schema permits explicit unknown outcomes for executions and approvals", () => {
  assertMatch(sql, /'running','succeeded','failed','outcome_unknown'/);
  assertMatch(sql, /'pending','approved','denied','executed','failed','expired','outcome_unknown'/);
  assertMatch(sql, /must not retry automatically/);
});
