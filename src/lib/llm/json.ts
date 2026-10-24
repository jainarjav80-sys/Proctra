import { z } from "zod";
import { LLMError } from "./types";

/** JSON Schema for a zod schema, minus keys providers reject. */
export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/** Parses model text as JSON (tolerating ```json fences) and validates it. */
export function parseAndValidate<T>(text: string, schema: z.ZodType<T>, provider: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new LLMError("Model returned non-JSON output", provider, "invalid_output");
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new LLMError(`Output failed schema validation: ${result.error.issues[0]?.message}`, provider, "invalid_output");
  }
  return result.data;
}

export function schemaInstruction(schema: z.ZodType): string {
  return `Respond with a single JSON object only, no prose, matching this JSON Schema:\n${JSON.stringify(toProviderJsonSchema(schema))}`;
}
