import "server-only";
import type { AttachmentKind } from "@/lib/attachments";

// Turns an uploaded file into the form the agent consumes: either extracted
// plain text (PDF/DOCX/TXT/MD/HTML/CSS/…) or, for images, nothing — images are
// handed to the model as a vision block by the read tool, not as text.

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// Extensions we treat as plain text regardless of the (often unreliable) MIME.
const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "csv",
  "tsv",
  "json",
  "xml",
  "svg",
  "yml",
  "yaml",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
]);

export type ExtractInput = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export type ExtractResult =
  | { ok: true; kind: AttachmentKind; extractedText: string | null }
  | { ok: false; error: string };

function ext(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}

export async function extractAttachment({
  filename,
  mimeType,
  buffer,
}: ExtractInput): Promise<ExtractResult> {
  const e = ext(filename);
  const mime = mimeType.toLowerCase();

  // Images → vision, no text extraction.
  if (IMAGE_MIME.has(mime) || ["png", "jpg", "jpeg", "webp", "gif"].includes(e)) {
    return { ok: true, kind: "image", extractedText: null };
  }

  // PDF
  if (mime === "application/pdf" || e === "pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return { ok: true, kind: "text", extractedText: result.text ?? "" };
      } finally {
        await parser.destroy();
      }
    } catch (err) {
      return {
        ok: false,
        error: `PDF konnte nicht gelesen werden: ${
          err instanceof Error ? err.message : "unbekannter Fehler"
        }`,
      };
    }
  }

  // DOCX
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    e === "docx"
  ) {
    try {
      const mammoth = (await import("mammoth")).default;
      const { value } = await mammoth.extractRawText({ buffer });
      return { ok: true, kind: "text", extractedText: value ?? "" };
    } catch (err) {
      return {
        ok: false,
        error: `DOCX konnte nicht gelesen werden: ${
          err instanceof Error ? err.message : "unbekannter Fehler"
        }`,
      };
    }
  }

  // Plain-text-ish formats (incl. foreign HTML/CSS used as a reference).
  if (mime.startsWith("text/") || TEXT_EXT.has(e) || isLikelyTextMime(mime)) {
    return { ok: true, kind: "text", extractedText: buffer.toString("utf-8") };
  }

  return {
    ok: false,
    error: `Nicht unterstützter Dateityp: ${mimeType || e || "unbekannt"}`,
  };
}

function isLikelyTextMime(mime: string): boolean {
  return (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/xhtml+xml" ||
    mime === "image/svg+xml"
  );
}
