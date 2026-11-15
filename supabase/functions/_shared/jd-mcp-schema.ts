import { z } from "npm:zod@^4.3.6";

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

/** Convert the JSON Schema subset emitted by JD's native tool registry into
 * Zod schemas so MCP clients receive the real argument contract. */
export function jsonSchemaToZod(input: unknown): any {
  const schema = asObject(input);
  if (Array.isArray(schema.anyOf)) {
    const options = schema.anyOf.map(jsonSchemaToZod);
    if (options.length === 1) return options[0];
    return z.union(options as [any, any, ...any[]]);
  }
  if (Array.isArray(schema.oneOf)) {
    const options = schema.oneOf.map(jsonSchemaToZod);
    if (options.length === 1) return options[0];
    return z.union(options as [any, any, ...any[]]);
  }
  if (Array.isArray(schema.type)) {
    const options = (schema.type as unknown[]).map((type) => jsonSchemaToZod({ ...schema, type }));
    if (options.length === 1) return options[0];
    return z.union(options as [any, any, ...any[]]);
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum.filter((value): value is string => typeof value === "string");
    if (values.length > 0) return z.enum(values as [string, ...string[]]);
  }
  if ("const" in schema) return z.literal(schema.const as any);

  let result: any;
  switch (schema.type) {
    case "object": {
      const properties = asObject(schema.properties);
      const required = new Set(Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === "string") : []);
      const shape: Record<string, any> = {};
      for (const [key, value] of Object.entries(properties)) {
        const property = jsonSchemaToZod(value);
        shape[key] = required.has(key) ? property : property.optional();
      }
      result = z.object(shape);
      if (schema.additionalProperties === false) result = result.strict();
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        result = result.catchall(jsonSchemaToZod(schema.additionalProperties));
      }
      break;
    }
    case "array": {
      result = z.array(jsonSchemaToZod(schema.items || {}));
      if (typeof schema.minItems === "number") result = result.min(schema.minItems);
      if (typeof schema.maxItems === "number") result = result.max(schema.maxItems);
      break;
    }
    case "string": {
      result = z.string();
      if (typeof schema.minLength === "number") result = result.min(schema.minLength);
      if (typeof schema.maxLength === "number") result = result.max(schema.maxLength);
      break;
    }
    case "integer":
    case "number": {
      result = z.number();
      if (schema.type === "integer") result = result.int();
      if (typeof schema.minimum === "number") result = result.min(schema.minimum);
      if (typeof schema.maximum === "number") result = result.max(schema.maximum);
      break;
    }
    case "boolean": result = z.boolean(); break;
    case "null": result = z.null(); break;
    default: result = z.unknown();
  }
  if (schema.nullable === true && schema.type !== "null") result = result.nullable();
  if ("default" in schema) result = result.default(schema.default);
  return result;
}
