// Erzeugt das App-Icon (rotes Pik auf dunklem Grund) als PNG und ICO, ohne Zusatzpakete.
// node scripts/make-icon.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BG = [11, 11, 13], RED = [212, 20, 47], RIM = [92, 10, 22];

// Form in Einheitskoordinaten (u, v von 0 bis 1, v nach unten)
function inRoundedSquare(u, v, r = 0.2) {
  const dx = Math.max(r - u, 0, u - (1 - r)), dy = Math.max(r - v, 0, v - (1 - r));
  return dx * dx + dy * dy <= r * r;
}
function inSpade(u, v) {
  const dx = Math.abs(u - 0.5);
  // zwei runde Lappen unten
  const r = 0.175, cy = 0.56, cx = 0.155;
  if ((dx - cx) ** 2 + (v - cy) ** 2 <= r * r) return true;
  // Oberteil: von der Spitze bis zu den Lappen, Seiten leicht gewölbt
  const top = 0.12, bottom = 0.6;
  if (v >= top && v <= bottom) {
    const t = (v - top) / (0.5 - top);
    const w = 0.319 * Math.pow(Math.min(1, Math.sin(Math.min(t, 1) * Math.PI / 2)), 1.35);
    if (dx <= w && (v <= 0.5 || dx <= cx)) return true;
  }
  // Stiel mit geschwungenen Seiten
  if (v >= 0.6 && v <= 0.88) {
    const t = (v - 0.6) / 0.28;
    return dx <= 0.022 + 0.13 * t * t;
  }
  return false;
}
function pixel(u, v) {
  if (!inRoundedSquare(u, v)) return null;
  if (inSpade(u, v)) return RED;
  if (!inRoundedSquare((u - 0.025) / 0.95, (v - 0.025) / 0.95, 0.18)) return RIM;
  return BG;
}

function render(size) {
  const ss = 4, buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = pixel((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (y * size + x) * 4;
    if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; buf[i + 3] = 255 * a / (ss * ss); }
  }
  return buf;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const rgba = render(size), raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function ico(sizes) {
  const imgs = sizes.map(png), head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
    off += imgs[i].length;
  });
  return Buffer.concat([head, ...imgs]);
}

const root = path.join(__dirname, "..");
fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "icon.ico"), ico([16, 24, 32, 48, 64, 128, 256]));
fs.writeFileSync(path.join(root, "build", "icon.png"), png(512));
fs.writeFileSync(path.join(root, "src", "renderer", "icon.png"), png(256));
console.log("Icon erzeugt: build/icon.ico, build/icon.png, src/renderer/icon.png");
