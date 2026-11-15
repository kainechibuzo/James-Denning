import { assertEquals, assert } from "jsr:@std/assert@1";
import { jsonSchemaToZod } from "./jd-mcp-schema.ts";

Deno.test("converts required and optional object properties", () => {
  const schema = jsonSchemaToZod({
    type: "object",
    properties: { title: { type: "string", minLength: 2 }, limit: { type: "integer", minimum: 1, maximum: 10 } },
    required: ["title"],
    additionalProperties: false,
  });
  assert(schema.safeParse({ title: "ok" }).success);
  assert(schema.safeParse({ title: "ok", limit: 5 }).success);
  assert(!schema.safeParse({ limit: 5 }).success);
  assert(!schema.safeParse({ title: "x" }).success);
  assert(!schema.safeParse({ title: "ok", extra: true }).success);
});

Deno.test("converts enums, arrays, nested objects and nullable values", () => {
  const schema = jsonSchemaToZod({
    type: "object",
    properties: {
      priority: { type: "string", enum: ["low", "normal", "high"] },
      tasks: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
      due_at: { type: ["string", "null"] },
    },
    required: ["priority", "tasks", "due_at"],
    additionalProperties: false,
  });
  assert(schema.safeParse({ priority: "high", tasks: [{ name: "Inspect" }], due_at: null }).success);
  assert(!schema.safeParse({ priority: "urgent", tasks: [{ name: "Inspect" }], due_at: null }).success);
  assert(!schema.safeParse({ priority: "high", tasks: [], due_at: null }).success);
});

Deno.test("preserves defaults and object additional-property schemas", () => {
  const schema = jsonSchemaToZod({
    type: "object",
    properties: { limit: { type: "integer", default: 10 } },
    additionalProperties: { type: "string" },
  });
  const parsed = schema.parse({ extra: "value" });
  assertEquals(parsed.limit, 10);
  assertEquals(parsed.extra, "value");
});
