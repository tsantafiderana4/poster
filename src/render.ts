import type { Doc, ImageAsset, TextItem } from './types';
import { cellRect, cssFilter, extendToBleed, placeImage, sortCells } from './layout';
import { drawShape } from './shapes';

const cache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('Image illisible'));
      im.src = url;
    });
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface ExportOpts {
  dpi: number;
  bleed: boolean;
  cropMarks: boolean;
  /** Netteté d'impression : 0 aucune, 1 légère, 2 forte. */
  sharpen: 0 | 1 | 2;
}

const SHARPEN_AMOUNT = [0, 0.5, 1] as const;
/** Au-delà, on dessine directement l'image (photo très zoomée sur grand format). */
const MAX_PREP_PX = 25e6;

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('Image trop grande pour ce navigateur. Essayez une résolution plus basse.');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return { c, g };
}

/**
 * Redimensionne l'image à sa taille d'impression exacte (en pixels).
 * Les grandes réductions se font par moitiés successives : plus net, sans moiré ni crénelage.
 */
function resample(im: HTMLImageElement, tw: number, th: number): HTMLCanvasElement {
  let cur: CanvasImageSource = im;
  let cw = im.naturalWidth;
  let ch = im.naturalHeight;
  while (cw / 2 >= tw && ch / 2 >= th) {
    const nw = Math.round(cw / 2);
    const nh = Math.round(ch / 2);
    const { c, g } = makeCanvas(nw, nh);
    g.drawImage(cur, 0, 0, nw, nh);
    if (cur instanceof HTMLCanvasElement) cur.width = cur.height = 0;
    cur = c;
    cw = nw;
    ch = nh;
  }
  const { c, g } = makeCanvas(tw, th);
  g.drawImage(cur, 0, 0, tw, th);
  if (cur instanceof HTMLCanvasElement) cur.width = cur.height = 0;
  return c;
}

/** Accentuation (masque flou, rayon 1 px) pour compenser l'adoucissement de l'impression. */
function unsharp(c: HTMLCanvasElement, amount: number) {
  const w = c.width;
  const h = c.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  // Flou gaussien 3×3 séparable [1 2 1] : passe horizontale…
  const tmp = new Uint16Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      const l = (row + (x > 0 ? x - 1 : x)) * 4;
      const r = (row + (x < w - 1 ? x + 1 : x)) * 4;
      const t = (row + x) * 3;
      tmp[t] = d[l] + 2 * d[i] + d[r];
      tmp[t + 1] = d[l + 1] + 2 * d[i + 1] + d[r + 1];
      tmp[t + 2] = d[l + 2] + 2 * d[i + 2] + d[r + 2];
    }
  }
  // …puis verticale, et application : pixel + force × (pixel − flou).
  for (let y = 0; y < h; y++) {
    const up = (y > 0 ? y - 1 : y) * w;
    const dn = (y < h - 1 ? y + 1 : y) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const t = (row + x) * 3;
      const tu = (up + x) * 3;
      const td = (dn + x) * 3;
      const i = (row + x) * 4;
      for (let k = 0; k < 3; k++) {
        const blur = (tmp[tu + k] + 2 * tmp[t + k] + tmp[td + k]) / 16;
        d[i + k] = d[i + k] + amount * (d[i + k] - blur);
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** Image prête à imprimer : taille exacte en pixels + netteté. */
function printReady(im: HTMLImageElement, tw: number, th: number, sharpen: ExportOpts['sharpen']): CanvasImageSource {
  if (tw < 1 || th < 1 || tw * th > MAX_PREP_PX) return im;
  const c = resample(im, tw, th);
  const a = SHARPEN_AMOUNT[sharpen] ?? 0;
  if (a > 0) unsharp(c, a);
  return c;
}

/** Zone autour des fonds perdus réservée aux traits de coupe (mm). */
export const SLUG = 10;

export function exportSize(doc: Doc, o: ExportOpts) {
  const b = o.bleed ? doc.bleed : 0;
  const s = o.cropMarks ? SLUG : 0;
  const wMm = doc.width + 2 * (b + s);
  const hMm = doc.height + 2 * (b + s);
  const k = o.dpi / 25.4;
  return { b, s, wMm, hMm, wPx: Math.round(wMm * k), hPx: Math.round(hMm * k) };
}

export async function fontsReady(doc: Doc) {
  await Promise.all([
    ...doc.texts.map((t) => document.fonts.load(`${t.italic ? 'italic ' : ''}${t.weight} 64px "${t.font}"`).catch(() => [])),
    ...(doc.shapes ?? []).map((s) => document.fonts.load(`${s.weight} 64px "${s.font}"`).catch(() => [])),
  ]);
  await document.fonts.ready;
}

/** Dessine un texte en pixels. (ox, oy) : origine du format fini en pixels, k : pixels par mm. */
function drawText(ctx: CanvasRenderingContext2D, t: TextItem, doc: Doc, k: number, ox: number, oy: number) {
  const content = t.uppercase ? t.content.toUpperCase() : t.content;
  const lines = content.split('\n');
  const fs = t.size * k;
  ctx.save();
  ctx.font = `${t.italic ? 'italic ' : ''}${t.weight} ${fs}px "${t.font}"`;
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in ctx) c.letterSpacing = `${t.letterSpacing * fs}px`;
  const widths = lines.map((l) => ctx.measureText(l).width);
  const m = ctx.measureText('Hg');
  const A = m.fontBoundingBoxAscent ?? fs * 0.8;
  const D = m.fontBoundingBoxDescent ?? fs * 0.2;
  const lh = t.lineHeight * fs;
  const pad = t.bg ? t.padding * k : 0;
  const boxW = Math.max(0, ...widths) + 2 * pad;
  const boxH = lines.length * lh + 2 * pad;
  const X = ox + t.x * doc.width * k;
  const Y = oy + t.y * doc.height * k;
  const frac = t.align === 'left' ? 0 : t.align === 'center' ? 0.5 : 1;
  const left = X - frac * boxW;
  if (t.bg) {
    ctx.fillStyle = t.bg;
    ctx.fillRect(left, Y, boxW, boxH);
  }
  if (t.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowOffsetY = 0.4 * k;
    ctx.shadowBlur = 1.6 * k;
  }
  ctx.fillStyle = t.color;
  ctx.textAlign = t.align;
  ctx.textBaseline = 'alphabetic';
  const tx = t.align === 'left' ? left + pad : t.align === 'center' ? left + boxW / 2 : left + boxW - pad;
  lines.forEach((l, i) => ctx.fillText(l, tx, Y + pad + i * lh + (lh - (A + D)) / 2 + A));
  ctx.restore();
}

export async function renderPoster(doc: Doc, images: Record<string, ImageAsset>, o: ExportOpts) {
  const z = exportSize(doc, o);
  const canvas = document.createElement('canvas');
  canvas.width = z.wPx;
  canvas.height = z.hPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image trop grande pour ce navigateur. Essayez une résolution plus basse.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const k = z.wPx / z.wMm;
  const off = (z.b + z.s) * k;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, z.wPx, z.hPx);
  ctx.setTransform(k, 0, 0, k, off, off);

  ctx.save();
  ctx.beginPath();
  ctx.rect(-z.b, -z.b, doc.width + 2 * z.b, doc.height + 2 * z.b);
  ctx.clip();
  ctx.fillStyle = doc.background;
  ctx.fillRect(-z.b, -z.b, doc.width + 2 * z.b, doc.height + 2 * z.b);

  for (const cell of sortCells(doc.cells)) {
    const asset = cell.imageId ? images[cell.imageId] : undefined;
    if (!asset) continue;
    const r = extendToBleed(doc, cellRect(doc, cell));
    const im = await loadImage(asset.url);
    const p = placeImage(r.w, r.h, asset, cell);
    ctx.save();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, doc.radius);
    ctx.clip();
    const f = cssFilter(cell);
    if (f !== 'none') ctx.filter = f;
    // Taille d'impression en pixels, et centre calé sur la grille de pixels pour un rendu 1:1 (sans flou de rééchantillonnage).
    const tw = Math.round(p.iw * k);
    const th = Math.round(p.ih * k);
    const rotated = cell.rot % 180 !== 0;
    const snap = (mm: number, size: number) => ((Math.round(off + mm * k - size / 2) + size / 2) - off) / k;
    ctx.translate(snap(r.x + p.cx, rotated ? th : tw), snap(r.y + p.cy, rotated ? tw : th));
    ctx.rotate((cell.rot * Math.PI) / 180);
    if (cell.flipX) ctx.scale(-1, 1);
    const src = printReady(im, tw, th, o.sharpen);
    ctx.drawImage(src, -tw / (2 * k), -th / (2 * k), tw / k, th / k);
    if (src instanceof HTMLCanvasElement) src.width = src.height = 0;
    ctx.restore();
    if (doc.borderWidth > 0) {
      const bw = doc.borderWidth / 2;
      ctx.save();
      ctx.strokeStyle = doc.borderColor;
      ctx.lineWidth = doc.borderWidth;
      roundRectPath(ctx, r.x + bw, r.y + bw, r.w - 2 * bw, r.h - 2 * bw, Math.max(0, doc.radius - bw));
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const sh of doc.shapes ?? []) drawShape(ctx, doc, sh, k, off, off, doc.radius);
  for (const t of doc.texts) drawText(ctx, t, doc, k, off, off);
  ctx.restore();

  if (z.s > 0) {
    ctx.setTransform(k, 0, 0, k, off, off);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.1;
    const d1 = z.b + 2;
    const d2 = z.b + z.s - 1;
    const W = doc.width;
    const H = doc.height;
    ctx.beginPath();
    for (const x of [0, W]) {
      ctx.moveTo(x, -d2); ctx.lineTo(x, -d1);
      ctx.moveTo(x, H + d1); ctx.lineTo(x, H + d2);
    }
    for (const y of [0, H]) {
      ctx.moveTo(-d2, y); ctx.lineTo(-d1, y);
      ctx.moveTo(W + d1, y); ctx.lineTo(W + d2, y);
    }
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { canvas, ...z };
}

/* ---------- Résolution inscrite dans les fichiers (pour l'imprimeur) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngWithDpi(buf: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // pHYs
  v.setUint32(8, ppm);
  v.setUint32(12, ppm);
  chunk[16] = 1;
  v.setUint32(17, crc32(chunk.subarray(4, 17)));
  // Remplace un pHYs existant, sinon insère après IHDR.
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 8;
  while (off + 8 < buf.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    if (type === 'pHYs') {
      buf.set(chunk.subarray(8, 21), off + 8);
      return buf;
    }
    if (type === 'IDAT') break;
    off += 12 + len;
  }
  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, 33));
  out.set(chunk, 33);
  out.set(buf.subarray(33), 33 + chunk.length);
  return out;
}

function jpegSetDpi(buf: Uint8Array, dpi: number) {
  const isJfif = buf[2] === 0xff && buf[3] === 0xe0 && String.fromCharCode(buf[6], buf[7], buf[8], buf[9]) === 'JFIF';
  if (!isJfif) return;
  buf[13] = 1;
  buf[14] = dpi >> 8;
  buf[15] = dpi & 0xff;
  buf[16] = dpi >> 8;
  buf[17] = dpi & 0xff;
}

export async function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', dpi: number) {
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Export impossible : image trop grande pour ce navigateur.'))), type, 1),
  );
  let buf = new Uint8Array(await blob.arrayBuffer());
  if (type === 'image/png') buf = pngWithDpi(buf, dpi);
  else jpegSetDpi(buf, dpi);
  return buf;
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
