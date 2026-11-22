// Autonomous skill acquisition (phase 6, policy jd-autonomous-v1): the
// administrator names a capability from the allowlisted source catalogue; JD
// pins the upstream commit, downloads the archive, repackages instruction text
// only (scripts and binaries are never included), runs the same quarantine
// inspector, records the import and — only when validation is fully clean —
// publishes the immutable version with recorded provenance and NO fabricated
// human review. Every billable run that loads an acquired skill still requires
// an explicit, recorded agentic-time confirmation (jd_confirm_run_skill_cost).
import {inspectSkillPackage, SKILL_PACKAGE_LIMITS, SKILLS_STORAGE_BUCKET} from './jd-skills-package.ts';
import {buildZip, readZipEntries} from './jd-skills-zip.mjs';
import {AUTONOMOUS_SOURCE, getAutonomousSourceEntry} from './jd-skills-source-index.mjs';

const MAX_ZIPBALL_BYTES = 32 * 1024 * 1024;
const MAX_SELECTED_BYTES = 4 * 1024 * 1024;
const BLOCKED_SEGMENTS = new Set(['bin', 'scripts', 'hooks', 'install', '__macosx']);

const fetchGuarded = async (url: string, accept: string) => {
 const parsed = new URL(url);
 const allowedHosts: string[] = [AUTONOMOUS_SOURCE.apiHost, AUTONOMOUS_SOURCE.archiveHost];
 if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname)) {
  throw Error('Blocked acquisition source');
 }
 const res = await fetch(url, {headers: {'user-agent': 'jd-skills-acquisition', accept}, signal: AbortSignal.timeout(20000)});
 if (!res.ok) throw Error(`Source fetch failed with HTTP ${res.status}`);
 return res;
};

export const resolveUpstreamCommit = async (): Promise<string> => {
 const res = await fetchGuarded(`https://${AUTONOMOUS_SOURCE.apiHost}/repos/${AUTONOMOUS_SOURCE.repo}/commits/${AUTONOMOUS_SOURCE.ref}`, 'application/vnd.github+json');
 const body = await res.json();
 const sha = body && typeof body === 'object' ? (body as any).sha : null;
 if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw Error('Upstream commit could not be pinned');
 return sha;
};

// Complete the packaging frontmatter without touching the instruction body —
// the same contract as the phase-4 starter packager (licence line replaced,
// semver version, category and tags added).
export const repackageSkillFrontmatter = (original: string, entry: {id: string; category: string}) => {
 if (!original.startsWith('---')) throw Error('Upstream SKILL.md has no frontmatter');
 const end = original.indexOf('\n---', 3);
 if (end < 0) throw Error('Upstream SKILL.md frontmatter is unterminated');
 const lines = original.slice(4, end).split('\n').filter((line) => !/^license\s*:/i.test(line));
 lines.push('license: Apache-2.0', 'version: 1.0.0', `category: ${entry.category}`, 'tags:', '  - anthropic', '  - jd-acquired', `  - ${AUTONOMOUS_SOURCE.repo.replace('/', '-')}`);
 return `---\n${lines.join('\n')}\n---${original.slice(end + 4)}`;
};

// Select the text-only subset of the upstream skill directory: SKILL.md, the
// licence file when present, and bounded .md/.txt reference text. Paths may
// carry an arbitrary archive root prefix. Scripted and binary content is never
// selected, so the inspector sees an inert package.
export const upstreamMarker = (entryId: string) => `skills/${entryId}/`;
export const upstreamRelative = (full: string, entryId: string) => {
 const marker = upstreamMarker(entryId);
 const at = full.indexOf(marker);
 return at < 0 ? null : full.slice(at + marker.length);
};
export const selectUpstreamFiles = (paths: string[], entryId: string): string[] => {
 const selected = paths.filter((full) => {
  const rel = upstreamRelative(full, entryId);
  if (rel === null || !rel || rel.length > 250) return false;
  if (rel.split('/').some((s) => BLOCKED_SEGMENTS.has(s.toLowerCase()))) return false;
  return /\.(md|txt)$/i.test(rel);
 }).sort();
 if (!selected.some((full) => upstreamRelative(full, entryId) === 'SKILL.md')) throw Error('Upstream skill directory has no SKILL.md text');
 return selected;
};

const packagingNote = (commit: string, entryId: string) => `Acquired autonomously for JD under policy jd-autonomous-v1 from
${AUTONOMOUS_SOURCE.repo}@${commit} (path skills/${entryId}, Apache-2.0 as stated by that repository).

Instruction and reference text only. Executable scripts from the upstream skill
were intentionally omitted: JD records package files as inert attachments and
never executes, installs or fetches package content. Publication was automatic
because validation was fully clean; provenance is recorded in
jd_skill_acquisitions. Every billable run that loads this skill requires a
recorded agentic-time confirmation. Nothing was executed during acquisition.`;

export type AcquisitionReceipt = {
 skill_id: string | null; version: number | null; state: 'published' | 'needs_review' | 'validation_failed'; autonomous: boolean;
 source: {repo: string; ref: string; commit: string; path: string}; package_hash: string | null;
 estimated_seconds: number; billing: {model: string}; inspection: {status: string; errors: number; warnings: number; entryCount: number};
 hiring_enabled: false; execution_enabled: false;
};

export async function acquireSkill({entryId, admin, actorId, requestId, json, completeRpc, createRpc, publishRpc}: {
 entryId: string; admin: any; actorId: string; requestId: string; json: (body: any, status?: number) => Response;
 completeRpc: (args: any) => Promise<any>; createRpc: (args: any) => Promise<any>; publishRpc: (args: any) => Promise<any>;
}) {
 const entry = getAutonomousSourceEntry(entryId);
 if (!entry) return json({error: 'The requested capability is not in the allowlisted source catalogue.'}, 400);
 const commit = await resolveUpstreamCommit();
 const archiveRes = await fetchGuarded(`https://${AUTONOMOUS_SOURCE.archiveHost}/${AUTONOMOUS_SOURCE.repo}/zip/${commit}`, 'application/zip');
 const raw = new Uint8Array(await archiveRes.arrayBuffer());
 if (raw.length === 0 || raw.length > MAX_ZIPBALL_BYTES) return json({error: 'The upstream archive exceeded the acquisition size bound.'}, 502);
 const root = readZipEntries(raw);
 const first = root.entries[0]?.path || '';
 const rootDir = first.slice(0, first.indexOf('/') + 1);
 if (!rootDir) return json({error: 'The upstream archive has no readable root.'}, 502);
 let selected: string[];
 try {
  selected = selectUpstreamFiles(root.entries.map((e) => e.path), entry.id);
 } catch (e: any) {
  return json({error: `Upstream skill directory is not acquirable: ${e?.message || 'missing SKILL.md'}`}, 502);
 }
 const extract = async (path: string) => {
  const found = root.entries.find((e) => e.path === path);
  if (!found) throw Error(`Missing upstream file ${path}`);
  return root.extract(found);
 };
 const files = new Map<string, Uint8Array>();
 let total = 0;
 for (const path of selected) {
  const rel = upstreamRelative(path, entry.id)!;
  const data = await extract(path);
  if (data.length > SKILL_PACKAGE_LIMITS.maxPerFileUncompressedBytes) continue;
  total += data.length;
  if (total > MAX_SELECTED_BYTES) return json({error: 'The upstream skill text exceeded the acquisition size bound.'}, 502);
  files.set(rel, data);
 }
 let skillMd: string;
 try {
  skillMd = repackageSkillFrontmatter(new TextDecoder().decode(files.get('SKILL.md')), entry);
 } catch (e: any) {
  return json({error: `Upstream SKILL.md could not be repackaged: ${e?.message || 'invalid frontmatter'}`}, 502);
 }
 const entries = [...files.entries()].map(([path, data]) => ({path, data: path === 'SKILL.md' ? new TextEncoder().encode(skillMd) : data}));
 entries.push({path: 'PACKAGING.md', data: new TextEncoder().encode(packagingNote(commit, entry.id))});
 entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
 const zipBytes = await buildZip(entries);
 const inspection = await inspectSkillPackage(zipBytes, {originalFilename: `${entry.id}.zip`});
 const filename = `${entry.id}-${commit.slice(0, 8)}.zip`;
 const importReceipt = await createRpc({p_actor: actorId, p_request: requestId, p_filename: filename});
 const {error: uploadError} = await admin.storage.from(SKILLS_STORAGE_BUCKET).upload(importReceipt.storage_path, zipBytes, {contentType: 'application/zip', upsert: false});
 if (uploadError && !/exist/i.test(String(uploadError?.message || ''))) {
  return json({error: 'The acquired package could not be quarantined; nothing was recorded. Retry with the same request identifier.'}, 502);
 }
 const report = {
  kind: 'skills_package_report',
  // Same mapping as the upload path: the database records review outcomes only.
  status: inspection.status === 'validated' ? 'needs_review' : inspection.status, inspection_status: inspection.status,
  archiveBytes: zipBytes.length, entryCount: inspection.entryCount ?? entries.length,
  summary: inspection.status === 'validated' ? 'Autonomous acquisition inspected clean; publication authorised by policy jd-autonomous-v1.'
   : inspection.status === 'needs_review' ? 'Autonomous acquisition needs human review; nothing was published automatically.'
   : 'Acquisition inspection failed; the package was never executed.',
  errors: inspection.errors, warnings: inspection.warnings, findings: inspection.findings, license: inspection.license,
  packageHash: inspection.packageHash, manifestHash: inspection.manifestHash, originalFilename: filename,
 };
 const manifest = inspection.manifest ? {...inspection.manifest, content_hash: inspection.manifestHash} : null;
 const completed = await completeRpc({p_actor: actorId, p_request: requestId, p_import: importReceipt.import_id, p_package_hash: inspection.packageHash, p_report: report, p_manifest: manifest});
 const receipt: AcquisitionReceipt = {
  skill_id: completed.skill_id || null, version: completed.version || null,
  state: completed.status === 'validation_failed' ? 'validation_failed' : 'needs_review', autonomous: false,
  source: {repo: AUTONOMOUS_SOURCE.repo, ref: AUTONOMOUS_SOURCE.ref, commit, path: `skills/${entry.id}`},
  package_hash: inspection.packageHash, estimated_seconds: entry.expectedMinutes * 60, billing: {model: 'per_run_cost_confirmation'},
  inspection: {status: inspection.status, errors: inspection.errors.length, warnings: inspection.warnings.length, entryCount: inspection.entryCount ?? entries.length},
  hiring_enabled: false, execution_enabled: false,
 };
 if (completed.status === 'needs_review') {
  const published = await publishRpc({
   p_actor: actorId, p_request: requestId, p_import: importReceipt.import_id,
   p_source: {repo: AUTONOMOUS_SOURCE.repo, ref: AUTONOMOUS_SOURCE.ref, commit, path: `skills/${entry.id}`, policy: AUTONOMOUS_SOURCE.policy},
   p_note: `Autonomous acquisition from ${AUTONOMOUS_SOURCE.repo}@${commit.slice(0, 8)} under policy ${AUTONOMOUS_SOURCE.policy}; validated clean, never executed; per-run cost confirmation still required.`,
  });
  receipt.state = 'published';
  receipt.version = published.version;
  receipt.skill_id = published.skill_id;
  receipt.autonomous = true;
 }
 return json({receipt});
}
