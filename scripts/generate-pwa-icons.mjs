import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "../public");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function distToRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(px - cx) - halfW + r;
  const dy = Math.abs(py - cy) - halfH + r;
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
    Math.min(Math.max(dx, dy), 0) -
    r
  );
}

function renderIcon(size, { rounded, scale = 1.0 }) {
  const ss = 4;
  const w = size * ss;
  const h = size * ss;
  const hi = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y += 1) {
    const ny = y / h;
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;

      if (rounded) {
        const bgDist = distToRoundedBox(nx, ny, 0.5, 0.5, 0.46, 0.46, 0.11);
        if (bgDist > 0) continue;
      }

      // Rich ShootNote teal gradient (#0F766E -> #0B5B54)
      const grad = (nx + ny) * 0.5;
      let r = Math.round(15 * (1 - grad) + 11 * grad);
      let g = Math.round(118 * (1 - grad) + 91 * grad);
      let b = Math.round(110 * (1 - grad) + 84 * grad);

      const sx = (nx - 0.5) / scale + 0.5;
      const sy = (ny - 0.5) / scale + 0.5;

      let fg = false;
      let mintAccent = false;

      // Crisp ShootNote notepad sheet
      const sheetDist = distToRoundedBox(sx, sy, 0.47, 0.51, 0.21, 0.25, 0.045);
      if (sheetDist <= 0) {
        fg = true;
      }

      // Teal ruled lines inside sheet
      if (
        sheetDist < -0.025 &&
        sx >= 0.32 &&
        sx <= 0.58 &&
        (Math.abs(sy - 0.39) < 0.015 ||
          Math.abs(sy - 0.49) < 0.015 ||
          Math.abs(sy - 0.59) < 0.015)
      ) {
        fg = false;
        mintAccent = true;
      }

      // Stylus / Apple Pencil diagonal stroke crossing bottom-right
      if (distToSegment(sx, sy, 0.49, 0.65, 0.77, 0.31) <= 0.036) {
        fg = false;
        mintAccent = true;
      }

      // Warm amber spark dot (top right)
      const sparkDist = Math.hypot(sx - 0.72, sy - 0.24);
      if (sparkDist <= 0.055) {
        r = 251;
        g = 191;
        b = 36;
      } else if (fg) {
        r = 255;
        g = 255;
        b = 255;
      } else if (mintAccent) {
        r = 153;
        g = 246;
        b = 228;
      }

      const idx = (y * w + x) * 4;
      hi[idx] = r;
      hi[idx + 1] = g;
      hi[idx + 2] = b;
      hi[idx + 3] = 255;
    }
  }

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let dy = 0; dy < ss; dy += 1) {
        for (let dx = 0; dx < ss; dx += 1) {
          const idx = ((y * ss + dy) * w + (x * ss + dx)) * 4;
          sr += hi[idx];
          sg += hi[idx + 1];
          sb += hi[idx + 2];
          sa += hi[idx + 3];
        }
      }
      const samples = ss * ss;
      const outIdx = (y * size + x) * 4;
      out[outIdx] = Math.round(sr / samples);
      out[outIdx + 1] = Math.round(sg / samples);
      out[outIdx + 2] = Math.round(sb / samples);
      out[outIdx + 3] = Math.round(sa / samples);
    }
  }

  return encodePng(size, size, out);
}

fs.mkdirSync(path.join(publicDir, "icons"), { recursive: true });

fs.writeFileSync(
  path.join(publicDir, "icons/icon-192.png"),
  renderIcon(192, { rounded: true, scale: 1.0 })
);
fs.writeFileSync(
  path.join(publicDir, "icons/icon-512.png"),
  renderIcon(512, { rounded: true, scale: 1.0 })
);
fs.writeFileSync(
  path.join(publicDir, "icons/icon-maskable-512.png"),
  renderIcon(512, { rounded: false, scale: 0.78 })
);
fs.writeFileSync(
  path.join(publicDir, "apple-touch-icon.png"),
  renderIcon(180, { rounded: false, scale: 0.9 })
);

console.log("Generated ShootNote PWA icons");
