// Deterministic, offline security screening for uploaded business documents.
//
// IMPORTANT HONESTY NOTE: this is NOT a commercial antivirus engine and does not
// replace one. It is a defence-in-depth gate that runs on the server before any
// uploaded file is persisted or extracted. It:
//   1. Sniffs magic bytes and requires them to match the declared MIME type.
//   2. Rejects executables, scripts, OLE/macro-capable legacy containers and
//      macro-enabled OOXML (vbaProject.bin) outright.
//   3. Scans the full buffer for embedded PE (MZ + PE header) and ELF payloads,
//      which catches the common polyglot/extension-spoofing cases.
// Files that pass are marked `signature_screen_passed` — never "virus_free".

export type DetectedType =
  | "pdf" | "png" | "jpeg" | "tiff" | "docx"
  | "text" | "zip-container" | "ole2" | "executable" | "script" | "unsupported";

export interface ScreenResult {
  verdict: "pass" | "reject";
  reason: string | null;
  detected_type: DetectedType;
  declared_mime: string;
  scan_status: "signature_screen_passed" | "signature_screen_rejected";
}

const MB = 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 20 * MB;

export const DECLARED_MIME_TO_DETECTED: Record<string, DetectedType[]> = {
  "application/pdf": ["pdf"],
  "text/plain": ["text"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "image/png": ["png"],
  "image/jpeg": ["jpeg"],
  "image/tiff": ["tiff"],
};

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => {
  if (offset + signature.length > bytes.length) return false;
  for (let i = 0; i < signature.length; i += 1) if (bytes[offset + i] !== signature[i]) return false;
  return true;
};

const indexOfAscii = (bytes: Uint8Array, needle: string, from = 0) => {
  const target = new TextEncoder().encode(needle.toLowerCase());
  outer: for (let i = from; i + target.length <= bytes.length; i += 1) {
    for (let j = 0; j < target.length; j += 1) {
      const b = bytes[i + j];
      const lower = b >= 65 && b <= 90 ? b + 32 : b;
      if (lower !== target[j]) continue outer;
    }
    return i;
  }
  return -1;
};

// Verify an MZ header actually carries a PE signature — avoids flagging the two
// ASCII letters in otherwise-innocent binary content.
const peSignatureAt = (bytes: Uint8Array, offset: number) => {
  if (offset + 0x40 > bytes.length) return false;
  const e_lfanew = bytes[offset + 0x3c]
    | (bytes[offset + 0x3d] << 8)
    | (bytes[offset + 0x3e] << 16)
    | (bytes[offset + 0x3f] << 24);
  if (e_lfanew < 0x40 || offset + e_lfanew + 4 > bytes.length) return false;
  return bytes[offset + e_lfanew] === 0x50 // P
    && bytes[offset + e_lfanew + 1] === 0x45 // E
    && bytes[offset + e_lfanew + 2] === 0x00
    && bytes[offset + e_lfanew + 3] === 0x00;
};

export const findEmbeddedExecutable = (bytes: Uint8Array): { kind: string; offset: number } | null => {
  for (let i = 0; i + 4 <= bytes.length; i += 1) {
    // ELF
    if (bytes[i] === 0x7f && bytes[i + 1] === 0x45 && bytes[i + 2] === 0x4c && bytes[i + 3] === 0x46) {
      return { kind: "embedded ELF payload", offset: i };
    }
    // PE (MZ + PE\0\0 at e_lfanew)
    if (bytes[i] === 0x4d && bytes[i + 1] === 0x5a && peSignatureAt(bytes, i)) {
      return { kind: "embedded Windows PE payload", offset: i };
    }
  }
  return null;
};

export const sniffType = (bytes: Uint8Array): DetectedType => {
  if (!bytes.length) return "unsupported";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
    || startsWith(bytes, [0x49, 0x49, 0x2b, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2b])) return "tiff"; // incl. BigTIFF
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole2"; // legacy Office compound document
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])) {
    if (indexOfAscii(bytes, "vbaProject.bin") !== -1) return "executable"; // macro-enabled container
    if (indexOfAscii(bytes, "word/document.xml") !== -1 || indexOfAscii(bytes, "word/") !== -1) return "docx";
    return "zip-container";
  }
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return "executable"; // ELF
  if (startsWith(bytes, [0x4d, 0x5a]) && peSignatureAt(bytes, 0)) return "executable"; // PE
  if (startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(bytes, [0xfe, 0xed, 0xfa, 0xcf])
    || startsWith(bytes, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe])
    || startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe]) || startsWith(bytes, [0xbe, 0xba, 0xfe, 0xca])) return "executable"; // Mach-O / fat binary
  if (startsWith(bytes, [0x23, 0x21])) return "script"; // #!
  if (startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])) return "unsupported"; // UTF-16 BOM: unreadable as UTF-8 text
  // Plain text heuristic: no NUL/control bytes and valid UTF-8 in the sampled window.
  const window = bytes.subarray(0, Math.min(bytes.length, 8192));
  for (const b of window) {
    if (b === 0) return "unsupported";
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return "unsupported";
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(window);
    return "text";
  } catch {
    return "unsupported";
  }
};

const reject = (declaredMime: string, detected: DetectedType, reason: string): ScreenResult => ({
  verdict: "reject",
  reason,
  detected_type: detected,
  declared_mime: declaredMime,
  scan_status: "signature_screen_rejected",
});

export const screenDocument = (bytes: Uint8Array, declaredMime: string): ScreenResult => {
  const mime = String(declaredMime || "").toLowerCase();
  const allowed = DECLARED_MIME_TO_DETECTED[mime];
  if (!allowed) return reject(mime, "unsupported", "Declared MIME type is not supported for document upload.");
  if (!bytes.length) return reject(mime, "unsupported", "The uploaded file is empty.");
  if (bytes.length > DOCUMENT_MAX_BYTES) return reject(mime, "unsupported", "The uploaded file exceeds the 20 MB limit.");

  const detected = sniffType(bytes);

  if (detected === "executable") return reject(mime, detected, "The file contains executable code and cannot be stored as a document.");
  if (detected === "script") return reject(mime, detected, "The file is a script and cannot be stored as a document.");
  if (detected === "ole2") return reject(mime, detected, "Legacy Office (OLE) compound files are not accepted. Re-save the document as DOCX, PDF or plain text.");
  if (detected === "zip-container") return reject(mime, detected, "The file is a ZIP archive, not a supported document.");

  const embedded = findEmbeddedExecutable(bytes);
  if (embedded) return reject(mime, detected, `The file contains an ${embedded.kind} at offset ${embedded.offset} and was rejected.`);

  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && indexOfAscii(bytes, "vbaProject.bin") !== -1) {
    return reject(mime, detected, "Macro-enabled Word documents are not accepted.");
  }

  if (!allowed.includes(detected)) {
    return reject(mime, detected, `The file content (${detected}) does not match the declared type (${mime}).`);
  }

  return {
    verdict: "pass",
    reason: null,
    detected_type: detected,
    declared_mime: mime,
    scan_status: "signature_screen_passed",
  };
};
