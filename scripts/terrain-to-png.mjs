// Re-packs the baked terrain files (public/data/terrain-*.bin, one byte per
// cell, written by scripts/bake-terrain.mjs) as 8-bit greyscale PNGs with the
// same bytes, because preview pages cannot serve .bin files. Lossless. The
// .bin files are deleted afterwards so they are not shipped.
// Usage: node scripts/terrain-to-png.mjs   (run after bake-terrain.mjs)
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const meta = JSON.parse(readFileSync('public/data/terrain-meta.json', 'utf8'));
const files = {
  region: [meta.region.nx, meta.region.nz],
  makkah: [meta.makkah.n, meta.makkah.n],
  madinah: [meta.madinah.n, meta.madinah.n],
};

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

for (const [name, [w, h]] of Object.entries(files)) {
  const bytes = readFileSync(`public/data/terrain-${name}.bin`);
  if (bytes.length !== w * h) throw new Error(`${name}: expected ${w * h} bytes, found ${bytes.length}`);
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0; // no filter
    bytes.copy(raw, y * (w + 1) + 1, y * w, y * w + w);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(`public/data/terrain-${name}.png`, png);
  unlinkSync(`public/data/terrain-${name}.bin`); // not shipped; the app reads the PNG
  console.log(`terrain-${name}.png ${w}x${h}: ${png.length} bytes (was ${bytes.length})`);
}
