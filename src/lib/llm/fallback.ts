import { LLMError, type JsonRequest, type LLMProvider } from "./types";

/**
 * Tries each provider in order. Any failure (rate limit, HTTP, network, invalid JSON) moves to the
 * next one. Throws the last error with every provider's failure attached.
 */
export class FallbackProvider implements LLMProvider {
  readonly name: string;
  constructor(private readonly providers: LLMProvider[]) {
    if (providers.length === 0) throw new LLMError("No LLM provider configured", "fallback", "config");
    this.name = providers.map((p) => p.name).join("→");
  }

  async generateJSON<T>(req: JsonRequest<T>): Promise<T> {
    const failures: string[] = [];
    for (const p of this.providers) {
      try {
        return await p.generateJSON(req);
      } catch (e) {
        if (req.signal?.aborted) throw e;
        failures.push((e as Error).message);
        console.warn(`[llm] ${req.task}: ${p.name} failed, ${failures.length < this.providers.length ? "falling back" : "giving up"}`, (e as Error).message);
      }
    }
    throw new LLMError(`All providers failed for ${req.task}: ${failures.join(" | ")}`, this.name, "http");
  }
}
