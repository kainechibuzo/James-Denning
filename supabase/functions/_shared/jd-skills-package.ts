// JD Skills package inspector — pure, dependency-free ZIP inspection.
//
// This module parses a ZIP archive WITHOUT executing any of its contents and
// produces a deterministic manifest plus a conservative validation report for
// the Skills Admin import pipeline (documentation/JD_SKILLS_ADMIN_ARCHITECTURE.md).
//
// Governance invariants:
// - Upload is not execution approval: nothing here runs, installs or fetches
//   package-provided code or URLs; scripts/binaries are recorded as inert.
// - Skill text is untrusted data: the report flags instruction-override and
//   credential-like patterns instead of trusting package content.
// - All output is bounded: entry count, sizes and ratio limits fail closed.
export const SKILLS_RELEASE_FLAG = "JD_SKILLS_ENABLED";
export const SKILLS_STORAGE_BUCKET = "jd-skill-packages";

export const SKILL_PACKAGE_LIMITS = Object.freeze({
  maxArchiveBytes: 20 * 1024 * 1024,
  maxTotalUncompressedBytes: 40 * 1024 * 1024,
  maxFileCount: 400,
  maxPerFileUncompressedBytes: 8 * 1024 * 1024,
  maxCompressionRatio: 200,
  maxPathLength: 512,
  maxEntryCommentBytes: 1024,
  maxInstructionChars: 32000,
  maxNameChars: 120,
  maxDescriptionChars: 2000,
  maxTags: 12,
  maxSpecialistRoles: 8,
});

const SPECIALIST_ROLE_IDS = Object.freeze([
  "business_advisor", "research_analyst", "finance_analyst", "operations_planner",
  "product_designer", "software_engineer", "security_reviewer", "quality_assurance",
]);

export const SKILL_MANIFEST_SCHEMA_VERSION = 1;

type SkillFinding = { code: string; path?: string; message: string };

export type SkillPackageReport = {
  ok: boolean;
  status: "validated" | "needs_review" | "validation_failed";
  manifest: Record<string, unknown> | null;
  manifestHash: string | null;
  packageHash: string;
  entryCount: number;
  totalUncompressedBytes: number;
  errors: SkillFinding[];
  warnings: SkillFinding[];
  findings: SkillFinding[];
  license: { declared: string | null; licenseFile: boolean; status: string };
};

const failReport = (message: string, code = "invalid_package"): SkillPackageReport => ({
  ok: false, status: "validation_failed", manifest: null, manifestHash: null,
  packageHash: "", entryCount: 0, totalUncompressedBytes: 0,
  errors: [{ code, message }], warnings: [], findings: [],
  license: { declared: null, licenseFile: false, status: "unknown" },
});

const HEX = (value: number) => value.toString(16).padStart(2, "0");

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), HEX).join("");
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice().buffer as ArrayBuffer]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEocd(view: DataView, length: number): { offset: number; entries: number; cdSize: number; cdOffset: number } | null {
  const scanStart = Math.max(0, length - 65557);
  for (let offset = length - 22; offset >= scanStart; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const entries = view.getUint16(offset + 10, true);
    const cdSize = view.getUint32(offset + 12, true);
    const cdOffset = view.getUint32(offset + 16, true);
    return { offset, entries, cdSize, cdOffset };
  }
  return null;
}

const decodeName = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: false }).decode(bytes);

/** Conservative ZIP reader: rejects encrypted/zip64/symlink/oversized entries. */
async function readZipEntries(
  bytes: Uint8Array,
  errors: SkillFinding[],
  warnings: SkillFinding[],
): Promise<Array<{ path: string; content: Uint8Array | null; size: number; directory: boolean; inert: boolean }>> {
  const limits = SKILL_PACKAGE_LIMITS;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view, bytes.length);
  if (!eocd) {
    errors.push({ code: "not_a_zip", message: "The archive could not be read as a ZIP package." });
    return [];
  }
  if (eocd.entries > limits.maxFileCount) {
    errors.push({ code: "too_many_files", message: `The archive contains more than ${limits.maxFileCount} files.` });
    return [];
  }
  const seenPaths = new Set<string>();
  const entries: Array<{ path: string; content: Uint8Array | null; size: number; directory: boolean; inert: boolean }> = [];
  let cursor = eocd.cdOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < eocd.entries; index += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      errors.push({ code: "corrupt_central_directory", message: "The archive directory is malformed." });
      return [];
    }
    const madeBy = view.getUint16(cursor + 4, true);
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crcExpected = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const externalAttrs = view.getUint32(cursor + 38, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decodeName(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (commentLength > limits.maxEntryCommentBytes) {
      errors.push({ code: "entry_comment_too_large", path: name, message: "Archive entry metadata exceeds the comment limit." });
      return [];
    }
    if (nameLength > limits.maxPathLength) {
      errors.push({ code: "path_too_long", message: "An archive path exceeds the 512-character limit." });
      return [];
    }
    if ((flags & 0x1) !== 0) {
      errors.push({ code: "encrypted_entry", path: name, message: "Encrypted archive entries are not supported." });
      return [];
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      errors.push({ code: "zip64_unsupported", path: name, message: "ZIP64 archives are not supported." });
      return [];
    }
    if (method !== 0 && method !== 8) {
      errors.push({ code: "unsupported_compression", path: name, message: "Only stored and deflate entries are supported." });
      return [];
    }
    const unixMode = madeBy >>> 8 === 3 ? (externalAttrs >>> 16) & 0xffff : 0;
    const directory = name.endsWith("/") || (unixMode !== 0 && (unixMode & 0o170000) === 0o040000);
    if (!directory && unixMode !== 0 && (unixMode & 0o170000) === 0o120000) {
      errors.push({ code: "symlink_entry", path: name, message: "Symlink entries are not allowed in a skills package." });
      return [];
    }
    const normalised = name.replace(/\\/g, "/");
    if (!directory) {
      if (normalised.startsWith("/") || /^[a-zA-Z]:/.test(normalised) || normalised.split("/").includes("..") || normalised.includes("\0")) {
        errors.push({ code: "unsafe_path", path: name, message: "Archive paths must be relative and cannot traverse directories." });
        return [];
      }
      const lower = normalised.toLowerCase();
      if (seenPaths.has(lower)) {
        errors.push({ code: "duplicate_path", path: name, message: "The archive contains conflicting duplicate paths." });
        return [];
      }
      seenPaths.add(lower);
    }
    if (directory || uncompressedSize === 0) {
      entries.push({ path: normalised, content: null, size: 0, directory, inert: false });
      continue;
    }
    if (uncompressedSize > limits.maxPerFileUncompressedBytes) {
      errors.push({ code: "file_too_large", path: name, message: `Files must be at most ${limits.maxPerFileUncompressedBytes} bytes.` });
      return [];
    }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      errors.push({ code: "corrupt_local_header", path: name, message: "The archive entry is malformed." });
      return [];
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) {
      errors.push({ code: "corrupt_entry_data", path: name, message: "The archive entry data is truncated." });
      return [];
    }
    let content: Uint8Array;
    if (method === 0) content = bytes.subarray(dataStart, dataStart + compressedSize);
    else {
      try {
        content = await inflateRaw(bytes.subarray(dataStart, dataStart + compressedSize));
      } catch {
        errors.push({ code: "inflate_failed", path: name, message: "A deflated entry could not be read." });
        return [];
      }
    }
    if (content.length !== uncompressedSize) {
      errors.push({ code: "size_mismatch", path: name, message: "The extracted file size does not match the archive metadata." });
      return [];
    }
    if (crc32(content) !== crcExpected) {
      errors.push({ code: "checksum_mismatch", path: name, message: "The extracted file failed its integrity check." });
      return [];
    }
    totalUncompressed += content.length;
    if (totalUncompressed > limits.maxTotalUncompressedBytes) {
      errors.push({ code: "archive_too_large", message: "The decompressed package exceeds the total size limit." });
      return [];
    }
    if (compressedSize > 0 && content.length / compressedSize > limits.maxCompressionRatio) {
      errors.push({ code: "decompression_bomb", path: name, message: "The entry expands beyond the allowed compression ratio." });
      return [];
    }
    // Scripts, binaries and install hooks are never executed: they are kept
    // inert and flagged in the inventory for the reviewer.
    const inert = /\.(sh|bash|bat|cmd|com|exe|dll|so|dylib|ps1|py|pyc|jar|class|wasm|bin|deb|rpm|msi|appimage)$/i.test(normalised)
      || ["makefile", "dockerfile"].includes(normalised.split("/").pop()!.toLowerCase())
      || normalised.split("/").some((segment) => ["bin", "scripts", "hooks", "install"].includes(segment.toLowerCase()));
    entries.push({ path: normalised, content, size: content.length, directory: false, inert });
  }
  return entries;
}

function parseFrontmatter(source: string): { fields: Record<string, string | string[]>; errors: SkillFinding[]; warnings: SkillFinding[] } {
  const fields: Record<string, string | string[]> = {};
  const errors: SkillFinding[] = [];
  const warnings: SkillFinding[] = [];
  const text = source.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return { fields, errors: [...errors, { code: "missing_frontmatter", message: "SKILL.md must start with a YAML frontmatter block." }], warnings };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { fields, errors: [...errors, { code: "unterminated_frontmatter", message: "The SKILL.md frontmatter block is not closed." }], warnings };
  const block = text.slice(4, end);
  let currentListKey: string | null = null;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) continue;
    if (/^\s/.test(line) && currentListKey && /^-\s+.+/.test(line.trim())) {
      const list = fields[currentListKey];
      if (Array.isArray(list)) list.push(line.trim().slice(2).trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    currentListKey = null;
    const match = /^([A-Za-z][A-Za-z0-9_-]{0,63})\s*:\s*(.*)$/.exec(line);
    if (!match) {
      warnings.push({ code: "frontmatter_ignored_line", message: "A frontmatter line could not be parsed and was ignored." });
      continue;
    }
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (value === "") { currentListKey = key; fields[key] = []; continue; }
    if (/^[\[{}]/.test(value) || value.includes(": ") && !/^["']/.test(value)) {
      warnings.push({ code: "frontmatter_complex_field", message: `The '${key}' field uses an unsupported nested format and was ignored.` });
      continue;
    }
    fields[key] = value.replace(/^["']|["']$/g, "");
  }
  return { fields, errors, warnings };
}

const INJECTION_PATTERNS: readonly { code: string; pattern: RegExp; message: string }[] = Object.freeze([
  { code: "injection_override", pattern: /\bignore\b.{0,40}\b(previous|prior|above|earlier)\b.{0,20}\binstructions?\b/i, message: "Attempt to override prior instructions detected." },
  { code: "injection_override", pattern: /\bdisregard\b.{0,40}\b(instructions|policy|policies|rules|guardrails)/i, message: "Attempt to disregard JD policy detected." },
  { code: "injection_system_prompt", pattern: /\b(system prompt|developer message|you are now|new instructions?:)/i, message: "Prompt-override framing detected." },
  { code: "injection_authority", pattern: /\b(grant|approve|authorise|authorize)\b.{0,30}\b(yourself|tools|permissions|execution authority)\b/i, message: "Attempt to claim authority or permissions detected." },
  { code: "injection_secret_exfiltration", pattern: /\b(send|post|upload|exfiltrate)\b.{0,40}\b(credentials?|api keys?|secrets?|tokens?)\b/i, message: "Attempt to move secrets out of the workspace detected." },
]);

const CREDENTIAL_PATTERNS: readonly { code: string; pattern: RegExp; message: string }[] = Object.freeze([
  { code: "credential_pattern", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, message: "A private key block was found in package text." },
  { code: "credential_pattern", pattern: /\bBearer\s+[A-Za-z0-9_.-]{20,}/, message: "A Bearer token was found in package text." },
  { code: "credential_pattern", pattern: /\b(?:sk_live_|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}/, message: "A provider API token was found in package text." },
]);

function scanSkillText(path: string, content: string, errors: SkillFinding[], warnings: SkillFinding[], findings: SkillFinding[]): void {
  for (const rule of INJECTION_PATTERNS) {
    if (rule.pattern.test(content)) {
      findings.push({ code: rule.code, path, message: rule.message });
      warnings.push({ code: rule.code, path, message: "Security finding: " + rule.message });
    }
  }
  for (const rule of CREDENTIAL_PATTERNS) {
    if (rule.pattern.test(content)) {
      errors.push({ code: rule.code, path, message: rule.message });
    }
  }
}

const canonicalise = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
      out[key] = canonicalise((value as Record<string, unknown>)[key]);
      return out;
    }, {});
  }
  return value;
};

const bounded = (value: unknown, min: number, max: number): string | null =>
  typeof value === "string" && value.trim().length >= min && value.length <= max ? value.trim() : null;

/**
 * Inspect one uploaded skills ZIP. Never executes package content; produces
 * the deterministic manifest, package hash and review report.
 */
export async function inspectSkillPackage(
  archive: Uint8Array,
  options: { originalFilename?: string } = {},
): Promise<SkillPackageReport> {
  const limits = SKILL_PACKAGE_LIMITS;
  if (!archive || archive.byteLength === 0) return failReport("The uploaded package is empty.");
  if (archive.byteLength > limits.maxArchiveBytes) return failReport(`The package exceeds the ${limits.maxArchiveBytes}-byte upload limit.`);
  const errors: SkillFinding[] = [];
  const warnings: SkillFinding[] = [];
  const findings: SkillFinding[] = [];
  const packageHash = await sha256Hex(archive);
  const entries = await readZipEntries(archive, errors, warnings);
  if (errors.length) {
    return { ...failReport("The package was rejected by archive safety checks."), packageHash, entryCount: entries.length, errors };
  }
  const skillEntry = entries.find((entry) => entry.path.toLowerCase() === "skill.md")
    || entries.find((entry) => entry.path.toLowerCase().endsWith("/skill.md") && entry.path.split("/").length === 2);
  if (!skillEntry || !skillEntry.content) {
    return { ...failReport("The package does not contain a SKILL.md instruction file at its root."), packageHash };
  }
  const skillText = new TextDecoder("utf-8", { fatal: false }).decode(skillEntry.content).slice(0, limits.maxInstructionChars);
  const { fields, errors: frontmatterErrors, warnings: frontmatterWarnings } = parseFrontmatter(skillText);
  errors.push(...frontmatterErrors);
  warnings.push(...frontmatterWarnings);
  if (errors.length) {
    return { ...failReport("The package manifest could not be validated."), packageHash, entryCount: entries.length, errors, warnings };
  }
  const name = bounded(fields.name, 2, limits.maxNameChars);
  const description = bounded(fields.description, 12, limits.maxDescriptionChars);
  const version = bounded(fields.version, 1, 32);
  const license = bounded(fields.license, 1, 80);
  if (!name) errors.push({ code: "invalid_name", message: "Frontmatter 'name' must contain 2\u2013120 characters." });
  if (!description) errors.push({ code: "invalid_description", message: "Frontmatter 'description' must contain 12\u20132000 characters." });
  if (!version || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) errors.push({ code: "invalid_version", message: "Frontmatter 'version' must be a semantic version like 1.0.0." });
  if (!license) errors.push({ code: "invalid_license", message: "Frontmatter 'license' must declare an SPDX identifier or 'UNLICENSED'." });
  if (errors.length) {
    return { ...failReport("The package manifest is incomplete."), packageHash, entryCount: entries.length, errors, warnings };
  }
  const tags = Array.isArray(fields.tags) ? fields.tags.slice(0, limits.maxTags) : [];
  if (!Array.isArray(fields.tags) || fields.tags.some((tag) => !bounded(tag, 1, 40))) {
    warnings.push({ code: "tags_ignored", message: "Tags must be a list of short strings; malformed entries were dropped." });
  }
  const specialistRoles = Array.isArray(fields.specialist_roles) ? fields.specialist_roles.slice(0, limits.maxSpecialistRoles) : [];
  const unknownRoles = specialistRoles.filter((role) => !SPECIALIST_ROLE_IDS.includes(String(role).toLowerCase()));
  if (unknownRoles.length) {
    warnings.push({ code: "unknown_specialist_roles", message: "Unrecognised specialist roles were recorded but do not grant access: " + unknownRoles.slice(0, 4).join(", ") });
  }
  if (fields.category != null && !bounded(fields.category, 1, 80)) {
    warnings.push({ code: "category_ignored", message: "The 'category' field was dropped because it is not a short string." });
  }
  const licenseFile = entries.some((entry) => /^licen[cs]e(\.txt|\.md|)$/i.test(entry.path.split("/").pop() || ""));
  const files: Array<Record<string, unknown>> = [];
  const textDecoder = new TextDecoder("utf-8", { fatal: false });
  for (const entry of entries) {
    if (entry.directory) continue;
    const digest = entry.content ? await sha256Hex(entry.content) : "";
    files.push({
      path: entry.path, bytes: entry.size, sha256: digest,
      role: entry.path === skillEntry.path ? "instruction" : entry.inert ? "inert_asset" : "reference",
      ...(entry.inert ? { executed: false } : {}),
    });
    if (!entry.inert && /\.(md|txt|json|ya?ml)$/i.test(entry.path) && entry.content && entry.path !== skillEntry.path) {
      scanSkillText(entry.path, textDecoder.decode(entry.content), errors, warnings, findings);
    }
  }
  if (files.filter((file) => file.role === "inert_asset").length) {
    warnings.push({ code: "inert_scripts_present", message: "Script or executable files are present. They are recorded as inert attachments and are never executed or installed." });
  }
  scanSkillText(skillEntry.path, skillText, errors, warnings, findings);
  const instructionText = skillText;
  const declaredLicense = license === "UNLICENSED" ? null : license;
  const licenseStatus = license === "UNLICENSED" ? "unlicensed_review_required" : licenseFile ? "declared_with_license_file" : "declared_only";
  if (errors.length) {
    return {
      ok: false, status: "validation_failed", manifest: null, manifestHash: null, packageHash,
      entryCount: files.length, totalUncompressedBytes: files.reduce((total, file) => total + Number(file.bytes || 0), 0),
      errors, warnings, findings,
      license: { declared: declaredLicense, licenseFile, status: licenseStatus },
    };
  }
  const manifest = {
    schemaVersion: SKILL_MANIFEST_SCHEMA_VERSION,
    name: name!,
    description: description!,
    version: version!,
    license: license!,
    ...(fields.category ? { category: bounded(fields.category, 1, 80) } : {}),
    tags: tags.map((tag) => String(tag).toLowerCase()),
    specialistRoles: specialistRoles.map((role) => String(role).toLowerCase()),
    entrypoint: skillEntry.path,
    instructionText,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + Number(file.bytes || 0), 0),
    files,
    source: { kind: "zip_upload", ...(options.originalFilename ? { originalFilename: String(options.originalFilename).slice(0, 200) } : {}) },
  };
  const manifestHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(canonicalise(manifest))));
  const status: SkillPackageReport["status"] = warnings.length || licenseStatus === "unlicensed_review_required" ? "needs_review" : "validated";
  return {
    ok: true, status, manifest, manifestHash, packageHash,
    entryCount: files.length, totalUncompressedBytes: manifest.totalBytes,
    errors, warnings, findings,
    license: { declared: declaredLicense, licenseFile, status: licenseStatus },
  };
}
