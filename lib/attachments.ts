// AdelTe attachments — text/code files sent as model context.
// Hard caps keep prompts bounded. Classification ALWAYS runs on the user's
// message only, never on attachment content (pasted code may contain words
// like "delete" or "malware" that must not trip the safety gate).

export interface Attachment {
  name: string;
  text: string;
}

export const MAX_FILES = 5;
export const MAX_CHARS_PER_FILE = 20000;
export const MAX_TOTAL_CHARS = 60000;

function cleanName(name: string): string {
  return (name || "file").replace(/[^\w.\-() ]/g, "_").slice(0, 80) || "file";
}

/** Normalize + enforce caps. Returns kept files and human-readable notes. */
export function sanitizeAttachments(input: unknown): { files: Attachment[]; notes: string[] } {
  const notes: string[] = [];
  if (!Array.isArray(input)) return { files: [], notes };
  const files: Attachment[] = [];
  let total = 0;
  for (const item of input) {
    if (files.length >= MAX_FILES) {
      notes.push(`Only the first ${MAX_FILES} files were kept.`);
      break;
    }
    const rec = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const name = cleanName(typeof rec.name === "string" ? rec.name : "file");
    let text = typeof rec.text === "string" ? rec.text : "";
    if (!text.trim()) continue;
    if (text.length > MAX_CHARS_PER_FILE) {
      text = text.slice(0, MAX_CHARS_PER_FILE);
      notes.push(`${name} was truncated to ${MAX_CHARS_PER_FILE} chars.`);
    }
    if (total + text.length > MAX_TOTAL_CHARS) {
      notes.push(`Total attachment budget (${MAX_TOTAL_CHARS} chars) reached — remaining files skipped.`);
      break;
    }
    total += text.length;
    files.push({ name, text });
  }
  return { files, notes };
}

/** Build the provider-facing message: user text + fenced file blocks. */
export function buildContextMessage(message: string, files: Attachment[]): string {
  if (files.length === 0) return message;
  const blocks = files.map((f) => `<file name="${f.name}">\n${f.text}\n</file>`);
  return `${message}\n\nAttached files for context:\n${blocks.join("\n")}`;
}

/** Short label for chat bubbles + history, e.g. " [attached: a.py, b.log]". */
export function attachmentLabel(files: Attachment[]): string {
  if (files.length === 0) return "";
  return " [attached: " + files.map((f) => f.name).join(", ") + "]";
}
