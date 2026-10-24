import type { z } from "zod";

export interface JsonRequest<T> {
  /** Stable name for logs, e.g. "question_blueprint". */
  task: string;
  system: string;
  /** User content. Wrap untrusted text (resumes, transcripts) in tagged blocks before passing it. */
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly name: string;
  /** Returns schema-validated JSON or throws LLMError. */
  generateJSON<T>(req: JsonRequest<T>): Promise<T>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly kind: "config" | "http" | "rate_limit" | "invalid_output" | "network",
    public readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}
