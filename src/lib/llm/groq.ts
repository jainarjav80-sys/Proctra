import { LLMError, type JsonRequest, type LLMProvider } from "./types";
import { parseAndValidate, schemaInstruction } from "./json";

const URL = "https://api.groq.com/openai/v1/chat/completions";

/** Parses Groq's reset/retry headers ("2", "1m26.4s", "600ms") into milliseconds. */
export function parseRetryAfterMs(headers: Headers): number | null {
  const retryAfter = headers.get("retry-after");
  if (retryAfter && /^\d+(\.\d+)?$/.test(retryAfter)) return Math.ceil(Number(retryAfter) * 1000);
  const reset = headers.get("x-ratelimit-reset-tokens") ?? headers.get("x-ratelimit-reset-requests");
  if (!reset) return null;
  let ms = 0;
  for (const [, n, unit] of reset.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)) {
    ms += Number(n) * (unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000);
  }
  return ms ? Math.ceil(ms) : null;
}

export interface GroqOptions {
  /** On a 429, wait and retry this same model only if the server asks for at most this long. */
  maxRateLimitWaitMs?: number;
  /** Default reasoning effort for reasoning models when the request doesn't set one. */
  reasoning?: "low" | "medium" | "high";
  fetchImpl?: typeof fetch;
}

/**
 * One Groq model in JSON mode. The schema goes in the system prompt and zod validates the output.
 * A 429 is retried in place when the wait is short; otherwise it throws `rate_limit` and the
 * FallbackProvider moves on to the next model, which has its own separate per-model quota.
 */
export class GroqProvider implements LLMProvider {
  readonly name: string;
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly opts: GroqOptions = {},
  ) {
    this.name = `groq:${model}`;
  }

  async generateJSON<T>(req: JsonRequest<T>): Promise<T> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    const maxWait = this.opts.maxRateLimitWaitMs ?? 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await doFetch(URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify(this.body(req)),
          signal: req.signal,
        });
      } catch (e) {
        if (req.signal?.aborted) throw e;
        throw new LLMError(`Network error: ${(e as Error).message}`, this.name, "network");
      }
      if (res.status === 429) {
        const waitMs = parseRetryAfterMs(res.headers) ?? 1000 * 2 ** attempt;
        if (waitMs <= maxWait && attempt < 2) {
          await new Promise((r) => setTimeout(r, waitMs + 50));
          continue;
        }
        throw new LLMError(`Rate limited (retry in ${Math.round(waitMs / 1000)}s)`, this.name, "rate_limit", 429);
      }
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        throw new LLMError(`HTTP ${res.status}: ${detail}`, this.name, "http", res.status);
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      req.onUsage?.({ model: this.model, promptTokens: json.usage?.prompt_tokens ?? 0, completionTokens: json.usage?.completion_tokens ?? 0 });
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text) throw new LLMError("Empty response", this.name, "invalid_output");
      return parseAndValidate(text, req.schema, this.name);
    }
    throw new LLMError("Rate limited", this.name, "rate_limit", 429);
  }

  private body<T>(req: JsonRequest<T>) {
    const reasoningModel = /gpt-oss/.test(this.model);
    const thinkingModel = /qwen3/.test(this.model);
    return {
      model: this.model,
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxOutputTokens ?? 4096, // reserved against per-minute output quota up front: keep it tight
      response_format: { type: "json_object" },
      ...(reasoningModel ? { reasoning_effort: req.reasoning ?? this.opts.reasoning ?? "medium", include_reasoning: false } : {}),
      ...(thinkingModel ? { reasoning_format: "hidden" } : {}),
      messages: [
        { role: "system", content: `${req.system}\n\n${schemaInstruction(req.schema)}` },
        { role: "user", content: req.prompt },
      ],
    };
  }
}
