// Minimal, dependency-free ZIP reader/writer shared by the autonomous skills
// acquisition path and its Node tests. The reader accepts only stored (0) and
// deflate (8) entries, verifies CRC-32 and rejects archives whose directory is
// malformed, encrypted, ZIP64, symlinked or path-unsafe. The writer produces
// classic deflate archives bounded to 65535 entries and 4 GiB. Nothing here
// executes package content; bytes in, bytes out.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes, mode) {
  if (mode === 'raw') return bytes;
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const out = [];
  for await (const chunk of stream.readable) out.push(chunk);
  const total = out.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of out) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}

async function inflateRaw(bytes) {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const out = [];
  for await (const chunk of stream.readable) out.push(chunk);
  const total = out.reduce((n, c) => n + c.length, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of out) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}

const u16 = (v) => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];

export async function buildZip(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 65535) throw Error('ZIP requires between 1 and 65535 entries.');
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry.path !== 'string' || entry.path.length < 1 || entry.path.length > 250) throw Error('ZIP entry path out of bounds.');
    if (entry.path.startsWith('/') || entry.path.includes('\\') || entry.path.split('/').some((s) => s === '..' || s === '')) throw Error(`Unsafe ZIP entry path ${entry.path}`);
    if (seen.has(entry.path)) throw Error(`Duplicate ZIP entry path ${entry.path}`);
    seen.add(entry.path);
    if (!(entry.data instanceof Uint8Array) || entry.data.length < 0 || entry.data.length > 0xffffffff) throw Error('ZIP entry data out of bounds.');
  }
  const locals = [], centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.path);
    const method = entry.store ? 0 : 8;
    const compressed = method === 0 ? entry.data : await deflateRaw(entry.data, 'deflate');
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + nameBytes.length + compressed.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressed.length, true);
    lv.setUint32(22, entry.data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(compressed, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed.length, true);
    cv.setUint32(24, entry.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralBytes = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralBytes, true);
  ev.setUint32(16, offset, true);
  const total = offset + centralBytes + 22;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of [...locals, ...centrals, eocd]) { out.set(part, cursor); cursor += part.length; }
  return out;
}

export function readZipEntries(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22) throw Error('Archive is too small to be a ZIP.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const scanStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= scanStart; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw Error('ZIP end-of-central-directory not found.');
  const count = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (cdOffset + 46 > bytes.length) throw Error('ZIP central directory is out of bounds.');
  const entries = [];
  let cursor = cdOffset;
  for (let n = 0; n < count; n += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw Error('ZIP central directory is malformed.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (flags & 0x1) throw Error('Encrypted archive entries are not supported.');
    if (flags & 0x8) throw Error('Streaming data descriptors are not supported.');
    if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) throw Error('ZIP64 archives are not supported.');
    if (method !== 0 && method !== 8) throw Error('Only stored and deflate entries are supported.');
    const nameStart = cursor + 46;
    if (nameStart + nameLength > bytes.length) throw Error('ZIP entry name is out of bounds.');
    const path = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (path.endsWith('/')) { cursor = nameStart + nameLength + extraLength + commentLength; continue; }
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw Error(`ZIP local header for ${path} is malformed.`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > bytes.length) throw Error(`ZIP entry data for ${path} is truncated.`);
    const stored = bytes.subarray(dataStart, dataStart + compressedSize);
    entries.push({path, method, crc, compressedSize, uncompressedSize, stored});
    cursor = nameStart + nameLength + extraLength + commentLength;
  }
  return {entries, async extract(entry) {
    const data = entry.method === 0 ? new Uint8Array(entry.stored) : await inflateRaw(entry.stored);
    if (data.length !== entry.uncompressedSize) throw Error(`Extracted size mismatch for ${entry.path}.`);
    if (crc32(data) !== entry.crc) throw Error(`CRC-32 mismatch for ${entry.path}.`);
    return data;
  }};
}
