#!/usr/bin/env node
// Dev tool (network required): package curated starter skills from Anthropic's
// public skills repository (https://github.com/anthropics/skills) into
// instruction-only ZIPs under public/skills/ for the JD skills dashboard.
// Package content is never executed by JD; scripts from the upstream skills
// are intentionally omitted (JD records any shipped scripts as inert assets
// and never runs them). Every produced archive is verified with the same
// inspector used by the secure import pipeline before it is written.
//
// Usage: npm run skills:build
import {writeFileSync, mkdirSync} from 'node:fs';
import zlib from 'node:zlib';
import {inspectSkillPackage} from '../supabase/functions/_shared/jd-skills-package.ts';

const REPO = 'anthropics/skills', BRANCH = 'main';
// Curated for JD business operations. skill-creator exceeds the 32k
// instruction budget; doc-coauthoring ships no licence file upstream.
const SKILLS = [
  {id: 'xlsx', category: 'documents', include: ['SKILL.md', 'LICENSE.txt']},
  {id: 'docx', category: 'documents', include: ['SKILL.md', 'LICENSE.txt']},
  {id: 'pdf', category: 'documents', include: ['SKILL.md', 'LICENSE.txt', 'FORMS.md', 'REFERENCE.md']},
  {id: 'pptx', category: 'documents', include: ['SKILL.md', 'LICENSE.txt']},
  {id: 'internal-comms', category: 'communications', include: ['SKILL.md', 'LICENSE.txt', 'examples/3p-updates.md', 'examples/company-newsletter.md', 'examples/faq-answers.md', 'examples/general-comms.md']},
  {id: 'brand-guidelines', category: 'communications', include: ['SKILL.md', 'LICENSE.txt']},
];
const PACKAGING_NOTE = `Repackaged for JD from Anthropic's public skills repository
(https://github.com/anthropics/skills, Apache-2.0 as stated by that repository).

This JD starter package contains the skill's instruction and reference text
only. Executable scripts from the upstream skill were intentionally omitted:
the JD platform records package files as inert attachments and never executes,
installs or fetches package content. The SKILL.md frontmatter was completed
with packaging metadata (version, licence identifier, category, tags); the
instruction body is unchanged. Publication still requires an independent
administrator review inside JD.
`;

const crc32 = bytes => zlib.crc32 ? zlib.crc32(Buffer.from(bytes)) >>> 0 : (() => {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let b = 0; b < 8; b += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
})();
const u16 = value => [value & 0xff, (value >> 8) & 0xff];
const u32 = value => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
const encoder = new TextEncoder();

function zipEntry({path, data}) {
  const nameBytes = encoder.encode(path), dataBytes = typeof data === 'string' ? encoder.encode(data) : data;
  const compressed = zlib.deflateRawSync(dataBytes, {level: 9});
  const crc = crc32(dataBytes);
  const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0),
    ...u32(crc), ...u32(compressed.length), ...u32(dataBytes.length), ...u16(nameBytes.length), ...u16(0),
    ...nameBytes, ...compressed]);
  const central = new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u16(0), ...u16(0),
    ...u32(crc), ...u32(compressed.length), ...u32(dataBytes.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
    ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...nameBytes]);
  return {local, central};
}

function buildZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const built = zipEntry(entry);
    locals.push(built.local);
    new DataView(built.central.buffer).setUint32(42, offset, true);
    centrals.push(built.central);
    offset += built.local.length;
  }
  const cdStart = offset, centralBytes = centrals.reduce((n, part) => n + part.length, 0);
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, centralBytes, true);
  view.setUint32(16, cdStart, true);
  return new Uint8Array([...locals.reduce((n, p) => n + p.length, 0) ? concat(locals) : [], ...concat(centrals), ...eocd]);
}
const concat = parts => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let cursor = 0;
  for (const part of parts) { out.set(part, cursor); cursor += part.length; }
  return out;
};

async function fetchJson(url) {
  const res = await fetch(url, {headers: {'user-agent': 'jd-skills-packager'}});
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}
async function fetchBlob(path) {
  const meta = await fetchJson(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`);
  return Buffer.from(meta.content, 'base64');
}

// Complete the packaging frontmatter without touching the instruction body.
function repackageSkillMd(original, skill) {
  const text = original.toString('utf8');
  if (!text.startsWith('---')) throw new Error(`${skill.id}: upstream SKILL.md has no frontmatter`);
  const end = text.indexOf('\n---', 3);
  if (end < 0) throw new Error(`${skill.id}: unterminated upstream frontmatter`);
  const lines = text.slice(4, end).split('\n').filter(line => !/^license\s*:/i.test(line));
  lines.push('license: Apache-2.0', 'version: 1.0.0', `category: ${skill.category}`, 'tags:', '  - anthropic', '  - starter', '  - jd-repackaged');
  return text.slice(4, end).length ? '---\n' + lines.join('\n') + '\n---' + text.slice(end + 4) : text;
}

const tree = (await fetchJson(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`)).tree.filter(t => t.type === 'blob').map(t => t.path);
mkdirSync('public/skills', {recursive: true});
for (const skill of SKILLS) {
  const entries = [];
  for (const rel of skill.include) {
    const upstream = `skills/${skill.id}/${rel}`;
    if (!tree.includes(upstream)) throw new Error(`${upstream} missing upstream`);
    const data = rel === 'SKILL.md' ? Buffer.from(repackageSkillMd(await fetchBlob(upstream), skill), 'utf8')
      : rel === 'LICENSE.txt' ? await fetchBlob(upstream)
      : await fetchBlob(upstream);
    entries.push({path: rel, data});
  }
  entries.push({path: 'PACKAGING.md', data: Buffer.from(PACKAGING_NOTE, 'utf8')});
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const zip = buildZip(entries);
  const inspection = await inspectSkillPackage(zip, {originalFilename: `${skill.id}.zip`});
  if (!inspection.ok || inspection.status === 'validation_failed') {
    throw new Error(`${skill.id}: packaged archive failed inspection: ` + JSON.stringify(inspection.errors));
  }
  writeFileSync(`public/skills/${skill.id}.zip`, zip);
  console.log(`${skill.id}.zip  ${(zip.length / 1024).toFixed(1)} KiB  files=${entries.length}  status=${inspection.status}  license=${inspection.license.status}`);
}
console.log('Starter packages written and verified. Nothing was executed.');
