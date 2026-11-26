// Minimal ZIP reader for WhatsApp "with media" exports.
// Reads only the parts it needs through Blob.slice(), so large archives are not
// loaded into memory, and inflates with the native DecompressionStream.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX_COMMENT = 0xffff;

/**
 * @typedef {{name: string, size: number, blob: () => Promise<Blob>, text: () => Promise<string>}} ZipEntry
 * @param {Blob} file
 * @returns {Promise<ZipEntry[]>}
 */
export async function readZip(file) {
  const tailSize = Math.min(file.size, 22 + MAX_COMMENT);
  const tail = new DataView(await file.slice(file.size - tailSize).arrayBuffer());

  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file");

  const count = tail.getUint16(eocd + 10, true);
  const dirSize = tail.getUint32(eocd + 12, true);
  const dirOffset = tail.getUint32(eocd + 16, true);
  if (dirOffset === 0xffffffff || count === 0xffff) throw new Error("ZIP64 archives are not supported");

  const dir = new DataView(await file.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
  const utf8 = new TextDecoder("utf-8");
  const latin = new TextDecoder("latin1");
  const entries = [];

  let p = 0;
  for (let n = 0; n < count; n++) {
    if (dir.getUint32(p, true) !== CENTRAL_SIG) throw new Error("Corrupt ZIP directory");
    const flags = dir.getUint16(p + 8, true);
    const method = dir.getUint16(p + 10, true);
    const compressedSize = dir.getUint32(p + 20, true);
    const size = dir.getUint32(p + 24, true);
    const nameLength = dir.getUint16(p + 28, true);
    const extraLength = dir.getUint16(p + 30, true);
    const commentLength = dir.getUint16(p + 32, true);
    const localOffset = dir.getUint32(p + 42, true);
    const nameBytes = new Uint8Array(dir.buffer, dir.byteOffset + p + 46, nameLength);
    const name = (flags & 0x800 ? utf8 : latin).decode(nameBytes);
    p += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue; // directory
    if (flags & 0x1) continue; // encrypted

    const blob = async () => {
      const local = new DataView(await file.slice(localOffset, localOffset + 30).arrayBuffer());
      if (local.getUint32(0, true) !== LOCAL_SIG) throw new Error("Corrupt ZIP entry");
      const start = localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true);
      const data = file.slice(start, start + compressedSize);
      if (method === 0) return data;
      if (method !== 8) throw new Error(`Unsupported compression method ${method}`);
      const stream = data.stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).blob();
    };
    const baseName = name.split("/").pop();
    entries.push({ name, baseName, size, blob, text: async () => (await blob()).text() });
  }
  return entries;
}

/** Picks the chat transcript inside a WhatsApp export. */
export function findChatEntry(entries) {
  const txt = entries.filter((e) => /\.txt$/i.test(e.name));
  return (
    txt.find((e) => /^_chat\.txt$/i.test(e.baseName)) || // iOS
    txt.find((e) => /whatsapp|chat/i.test(e.baseName)) || // Android: "WhatsApp Chat with …", "Chat de WhatsApp con …"
    txt[0] ||
    null
  );
}

export function isZip(file) {
  return /\.zip$/i.test(file.name) || /zip/.test(file.type);
}
