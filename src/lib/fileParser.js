// File attachment parser: plain text (.txt/.md/.csv/.json/.log/.yml/.yaml/.xml/.html),
// PDF, and DOCX. PDF/DOCX libraries are dynamically imported so users who never
// attach a file pay no initial bundle cost.

export const MAX_FILES = 3;
export const MAX_TOTAL_BYTES = 200 * 1024;  // hard cap on the sum of all files
export const SOFT_LIMIT_BYTES = 80 * 1024;  // warn the user above this size
export const HARD_LIMIT_BYTES = 150 * 1024; // reject a single file above this size

// Above this total attachment size, "auto" summary mode kicks in and a single
// gpt-5.4-mini call compresses each file before it's sent to the 3 main models.
// Keeps long-context cost roughly constant across rounds.
export const SUMMARY_THRESHOLD_BYTES = 50 * 1024;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "log", "yml", "yaml", "xml", "html", "htm",
]);
const PDF_EXTENSIONS  = new Set(["pdf"]);
const DOCX_EXTENSIONS = new Set(["docx"]);

export function extensionOf(filename) {
  const i = (filename || "").lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

export function isSupported(filename) {
  const ext = extensionOf(filename);
  return TEXT_EXTENSIONS.has(ext) || PDF_EXTENSIONS.has(ext) || DOCX_EXTENSIONS.has(ext);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

// Pre-flight validation against the current attachment list. Returns
// { ok: true, warn? } or { ok: false, reason }. UI surfaces the reason.
export function validateAttachment(currentList, newFile) {
  if (!newFile) return { ok: false, reason: "ファイルが空です" };
  if (currentList.length >= MAX_FILES) {
    return { ok: false, reason: `添付は最大${MAX_FILES}ファイルまでです` };
  }
  if (!isSupported(newFile.name)) {
    return { ok: false, reason: `未対応の形式です（対応: txt/md/csv/json/pdf/docx 等）` };
  }
  if (newFile.size > HARD_LIMIT_BYTES) {
    return {
      ok: false,
      reason: `1ファイル ${formatBytes(HARD_LIMIT_BYTES)} までです（このファイル: ${formatBytes(newFile.size)}）`,
    };
  }
  const currentTotal = currentList.reduce((sum, a) => sum + (a.size || 0), 0);
  if (currentTotal + newFile.size > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      reason: `合計サイズが ${formatBytes(MAX_TOTAL_BYTES)} を超えます（追加後: ${formatBytes(currentTotal + newFile.size)}）`,
    };
  }
  return {
    ok: true,
    warn: newFile.size > SOFT_LIMIT_BYTES
      ? `${formatBytes(newFile.size)} と大きめです。トークン消費にご注意ください。`
      : null,
  };
}

// Cache the dynamically-loaded pdfjs module so a second attachment in the same
// session does not pay the network/parse cost again.
let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [{ default: PdfWorker }, pdfjs] = await Promise.all([
        import("pdfjs-dist/build/pdf.worker.mjs?worker"),
        import("pdfjs-dist"),
      ]);
      pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

async function parsePdf(file) {
  const pdfjs = await loadPdfjs();
  const data  = new Uint8Array(await file.arrayBuffer());
  const pdf   = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text    = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    pages.push(text.trim());
  }
  return pages.filter(Boolean).join("\n\n");
}

let mammothPromise = null;
function loadMammoth() {
  if (!mammothPromise) {
    mammothPromise = import("mammoth/mammoth.browser.js").then((m) => m.default || m);
  }
  return mammothPromise;
}

async function parseDocx(file) {
  const mammoth = await loadMammoth();
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result?.value || "").trim();
}

// Extracts text from a single File and returns an attachment record.
// Throws with a user-friendly message on parse failure.
export async function parseFile(file) {
  const ext = extensionOf(file.name);
  let text = "";
  if (TEXT_EXTENSIONS.has(ext)) {
    text = await file.text();
  } else if (PDF_EXTENSIONS.has(ext)) {
    text = await parsePdf(file);
  } else if (DOCX_EXTENSIONS.has(ext)) {
    text = await parseDocx(file);
  } else {
    throw new Error(`未対応のファイル形式です: .${ext}`);
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("ファイルから本文を抽出できませんでした");
  }
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    ext,
    text: trimmed,
  };
}

// Rough token estimate. ~4 chars/token is OpenAI's stated heuristic for English
// and is conservative for Japanese (which packs more bytes per token).
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Build the attachments block that gets injected into the user prompt.
// Returns an empty string when there are no attachments so callers can
// concatenate unconditionally.
// When an attachment has a `summary` field, that summarised text is used
// instead of the full body so long files don't blow out the context window.
export function buildAttachmentsBlock(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return "";
  const sections = attachments.map((a) => {
    const useSummary = typeof a.summary === "string" && a.summary.length > 0;
    const header = useSummary
      ? `==== ${a.name}（要約版） ====`
      : `==== ${a.name} ====`;
    const body = useSummary ? a.summary : a.text;
    return `${header}\n${body}`;
  });
  return `\n\n【添付ファイル】\n${sections.join("\n\n")}`;
}

// Total attachment size in bytes. Used both for the size-cap UI and for
// deciding whether "auto" summary mode should engage.
export function totalAttachmentBytes(attachments) {
  if (!Array.isArray(attachments)) return 0;
  return attachments.reduce((s, a) => s + (a.size || 0), 0);
}

// Resolve the user's summary preference into a concrete on/off decision.
// "auto" engages once the combined attachment size crosses the threshold.
export function shouldSummarize(mode, attachments) {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return totalAttachmentBytes(attachments) >= SUMMARY_THRESHOLD_BYTES;
}
