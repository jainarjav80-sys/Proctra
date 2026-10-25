import "server-only";

export const RESUME_MAX_BYTES = 15 * 1024 * 1024;

export const RESUME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;
export type ResumeKind = keyof typeof RESUME_TYPES;

export class ResumeParseError extends Error {}

/** Checks magic bytes, not the client-declared MIME type: PDF starts "%PDF-", DOCX is a ZIP holding word/. */
export function sniffResumeKind(buf: Uint8Array): ResumeKind | null {
  const head = Buffer.from(buf.subarray(0, 5)).toString("latin1");
  if (head === "%PDF-") return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // A ZIP; a DOCX names its parts "word/document.xml" and "[Content_Types].xml" in the local headers.
    const sample = Buffer.from(buf.subarray(0, Math.min(buf.length, 64 * 1024))).toString("latin1");
    if (sample.includes("word/") || sample.includes("[Content_Types].xml")) return "docx";
  }
  return null;
}

/** Plain text from a resume file, normalised for the LLM. */
export async function extractResumeText(buf: Uint8Array): Promise<{ kind: ResumeKind; text: string }> {
  if (buf.byteLength > RESUME_MAX_BYTES) throw new ResumeParseError("Resume is larger than 15 MB");
  const kind = sniffResumeKind(buf);
  if (!kind) throw new ResumeParseError("File is not a PDF or DOCX");

  let text: string;
  if (kind === "pdf") {
    const [{ PDFParse }, { getData }] = await Promise.all([import("pdf-parse"), import("pdf-parse/worker")]);
    // pdf.js worker as a data URL: on Vercel the worker file isn't traced into the function bundle.
    PDFParse.setWorker(getData());
    const parser = new PDFParse({ data: buf });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: Buffer.from(buf) })).value;
  }

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < 100) {
    throw new ResumeParseError(
      "Very little text could be extracted. Scanned or image-only resumes aren't supported in the prototype (no OCR).",
    );
  }
  return { kind, text: text.slice(0, 40000) };
}
