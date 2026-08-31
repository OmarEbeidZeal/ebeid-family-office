/**
 * What kind of file is this, really?
 *
 * Extensions lie: banks hand out CAMT.053 as `.txt`, MT940 as `.sta`, and
 * anything at all as `.csv`. The file itself does not lie, so detection reads
 * the first bytes and, for text files, the first few kilobytes of content.
 * The extension is only ever a tie-breaker.
 */
import { decodeText, detectFileKind } from "../statement-parse.server";
import { looksLikeCamt } from "./camt053.server";
import { looksLikeMt940 } from "./mt940.server";
import { looksLikeQif } from "./qif.server";
import type { SourceFormat } from "./formats";

const SAMPLE_BYTES = 96_000;

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/** True for anything that is clearly not text, so we never try to decode it. */
function binaryKind(bytes: Uint8Array): SourceFormat | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "xlsx"; // zip: xlsx/xlsm
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return "xlsx"; // legacy .xls
  return null;
}

export type Sniffed = {
  format: SourceFormat;
  /** The decoded file, for the text formats — decoding twice is wasteful. */
  text: string | null;
};

export function sniffFormat(
  bytes: Uint8Array,
  fileName: string,
  mimeType?: string | null,
): Sniffed | null {
  const binary = binaryKind(bytes);
  if (binary) return { format: binary, text: null };

  const sample = decodeText(bytes.subarray(0, SAMPLE_BYTES));

  if (looksLikeCamt(sample)) return { format: "camt053", text: decodeText(bytes) };
  if (looksLikeQif(sample)) return { format: "qif", text: decodeText(bytes) };
  if (looksLikeMt940(sample)) return { format: "mt940", text: decodeText(bytes) };

  // An XML file that is not CAMT.053 is worth saying so about, rather than
  // being fed to a CSV parser that will make nothing of it.
  if (/^\s*<\?xml|^\s*<[A-Za-z]/.test(sample.slice(0, 400)) && /<\/[A-Za-z]/.test(sample)) {
    return { format: "camt053", text: decodeText(bytes) };
  }

  const byExtension = detectFileKind(fileName, mimeType);
  if (byExtension === "pdf") return { format: "pdf", text: null };
  if (byExtension === "xlsx") return { format: "xlsx", text: null };
  if (byExtension === "csv") return { format: "csv", text: decodeText(bytes) };

  // Delimited text is the last reasonable reading of a file we can decode.
  return /[,;\t|]/.test(sample) ? { format: "csv", text: decodeText(bytes) } : null;
}
