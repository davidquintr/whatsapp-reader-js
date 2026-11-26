import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync, crc32 } from "node:zlib";
import { readZip, findChatEntry } from "../assets/js/zip.js";

/** Builds a ZIP in memory: [{name, data, store?}] */
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const raw = Buffer.from(f.data);
    const body = f.store ? raw : deflateRawSync(raw);
    const method = f.store ? 0 : 8;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Blob([...locals, dir, eocd]);
}

test("reads deflated and stored entries with UTF-8 names", async () => {
  const zip = makeZip([
    { name: "WhatsApp Chat with Luisa Téllez.txt", data: "11/23/26, 8:40 PM - Ana: hola ñandú" },
    { name: "IMG-20261123-WA0003.jpg", data: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), store: true },
  ]);
  const entries = await readZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ["WhatsApp Chat with Luisa Téllez.txt", "IMG-20261123-WA0003.jpg"]);
  assert.equal(await findChatEntry(entries).text(), "11/23/26, 8:40 PM - Ana: hola ñandú");
  const img = new Uint8Array(await (await entries[1].blob()).arrayBuffer());
  assert.deepEqual([...img], [0xff, 0xd8, 0xff, 1, 2, 3]);
});

test("prefers iOS _chat.txt over other text files", async () => {
  const zip = makeZip([
    { name: "notes.txt", data: "x" },
    { name: "_chat.txt", data: "[23/11/26, 20:40:30] Ana: hola" },
  ]);
  assert.equal(findChatEntry(await readZip(zip)).baseName, "_chat.txt");
});

test("rejects files that are not ZIPs", async () => {
  await assert.rejects(readZip(new Blob(["just text"])), /Not a ZIP/);
});
