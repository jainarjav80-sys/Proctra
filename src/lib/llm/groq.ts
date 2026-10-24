import { LLMError, type JsonRequest, type LLMProvider } from "./types";
import { parseAndValidate, schemaInstruction } from "./json";

const URL = "https://api.groq.com/openai/v1/chat/completions";

/** Groq's OpenAI-compatible API in JSON mode; the schema goes in the system prompt, then zod validates. */
export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateJSON<T>(req: JsonRequest<T>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          temperature: req.temperature ?? 0.4,
          max_tokens: req.maxOutputTokens ?? 8192,
          response_format: { type: "json_object" },
          ...(/gpt-oss/.test(this.model) ? { reasoning_effort: req.reasoning ?? "medium", include_reasoning: false } : {}),
          messages: [
            { role: "system", content: `${req.system}\n\n${schemaInstruction(req.schema)}` },
            { role: "user", content: req.prompt },
          ],
        }),
        signal: req.signal,
      });
    } catch (e) {
      throw new LLMError(`Network error: ${(e as Error).message}`, this.name, "network");
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new LLMError(`HTTP ${res.status}: ${detail}`, this.name, res.status === 429 ? "rate_limit" : "http", res.status);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text) throw new LLMError("Empty response", this.name, "invalid_output");
    return parseAndValidate(text, req.schema, this.name);
  }
}
