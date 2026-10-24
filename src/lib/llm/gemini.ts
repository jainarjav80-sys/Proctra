import { LLMError, type JsonRequest, type LLMProvider } from "./types";
import { parseAndValidate, schemaInstruction, toProviderJsonSchema } from "./json";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generateJSON<T>(req: JsonRequest<T>): Promise<T> {
    try {
      return await this.call(req, true);
    } catch (e) {
      // Some schema shapes are rejected by structured output; retry with the schema in the prompt.
      if (e instanceof LLMError && e.kind === "http" && e.status === 400) return this.call(req, false);
      throw e;
    }
  }

  private async call<T>(req: JsonRequest<T>, structured: boolean): Promise<T> {
    const body = {
      systemInstruction: { parts: [{ text: structured ? req.system : `${req.system}\n\n${schemaInstruction(req.schema)}` }] },
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxOutputTokens ?? 8192,
        responseMimeType: "application/json",
        ...(structured ? { responseJsonSchema: toProviderJsonSchema(req.schema) } : {}),
      },
    };
    let res: Response;
    try {
      res = await fetch(`${BASE}/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal: req.signal,
      });
    } catch (e) {
      throw new LLMError(`Network error: ${(e as Error).message}`, this.name, "network");
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new LLMError(`HTTP ${res.status}: ${detail}`, this.name, res.status === 429 ? "rate_limit" : "http", res.status);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text) {
      throw new LLMError(`Empty response (finishReason=${json.candidates?.[0]?.finishReason ?? "none"})`, this.name, "invalid_output");
    }
    return parseAndValidate(text, req.schema, this.name);
  }
}
