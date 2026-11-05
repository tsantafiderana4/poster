import type { Doc, ShapeItem, ShapeKind } from './types';
import { cellRect, extendToBleed, uid } from './layout';

export interface ShapePart {
  d: string;
  /** Assombrissement de la couleur (1 = couleur de base). */
  shade: number;
}

export interface ShapeDef {
  kind: ShapeKind;
  label: string;
  /** Boîte de dessin (unités SVG). */
  bw: number;
  bh: number;
  parts: ShapePart[];
  /** Centre vertical du texte et taille de base, en unités de la boîte. */
  ty: number;
  fs: number;
  defaultText: string;
}

function burstPath(points: number, cx: number, cy: number, ro: number, ri: number) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 ? ri : ro;
    d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)} `;
  }
  return d + 'Z';
}

export const SHAPES: Record<ShapeKind, ShapeDef> = {
  burst: {
    kind: 'burst', label: 'Étoile', bw: 100, bh: 100, ty: 50, fs: 24, defaultText: 'NEW',
    parts: [{ d: burstPath(18, 50, 50, 50, 41), shade: 1 }],
  },
  circle: {
    kind: 'circle', label: 'Pastille', bw: 100, bh: 100, ty: 50, fs: 26, defaultText: 'NEW',
    parts: [
      { d: 'M0 50 A50 50 0 1 0 100 50 A50 50 0 1 0 0 50 Z', shade: 1 },
      { d: 'M6 50 A44 44 0 1 0 94 50 A44 44 0 1 0 6 50 Z M9 50 A41 41 0 1 1 91 50 A41 41 0 1 1 9 50 Z', shade: 0.7 },
    ],
  },
  ribbon: {
    kind: 'ribbon', label: 'Ruban', bw: 200, bh: 60, ty: 22, fs: 24, defaultText: 'NOUVEAU',
    parts: [
      { d: 'M0 16 H40 V60 H0 L12 38 Z M200 16 H160 V60 H200 L188 38 Z', shade: 0.72 },
      { d: 'M30 44 L40 60 L40 44 Z M170 44 L160 60 L160 44 Z', shade: 0.45 },
      { d: 'M30 0 H170 V44 H30 Z', shade: 1 },
    ],
  },
  bow: {
    kind: 'bow', label: 'Nœud', bw: 120, bh: 92, ty: 40, fs: 9, defaultText: '',
    parts: [
      { d: 'M54 44 L36 88 L46 82 L52 92 L60 48 Z M66 44 L84 88 L74 82 L68 92 L60 48 Z', shade: 0.75 },
      { d: 'M60 38 C40 8 4 2 6 28 C8 54 40 52 60 42 Z M60 38 C80 8 116 2 114 28 C112 54 80 52 60 42 Z', shade: 1 },
      { d: 'M60 38 C46 22 20 14 18 28 C20 40 44 42 60 41 Z M60 38 C74 22 100 14 102 28 C100 40 76 42 60 41 Z', shade: 0.82 },
      { d: 'M50 40 A10 10 0 1 0 70 40 A10 10 0 1 0 50 40 Z', shade: 0.88 },
    ],
  },
  tag: {
    kind: 'tag', label: 'Étiquette', bw: 160, bh: 56, ty: 28, fs: 26, defaultText: 'NEW',
    parts: [{ d: 'M14 0 H146 A14 14 0 0 1 160 14 V42 A14 14 0 0 1 146 56 H14 A14 14 0 0 1 0 42 V14 A14 14 0 0 1 14 0 Z', shade: 1 }],
  },
  band: {
    kind: 'band', label: "Bande d'angle", bw: 220, bh: 36, ty: 18, fs: 20, defaultText: 'NEW',
    parts: [{ d: 'M0 0 H220 V36 H0 Z', shade: 1 }],
  },
};

export const SHAPE_KINDS: ShapeKind[] = ['burst', 'circle', 'ribbon', 'bow', 'tag', 'band'];

export function shade(hex: string, f: number): string {
  if (f === 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * f));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function newShape(kind: ShapeKind, p: Partial<ShapeItem> = {}): ShapeItem {
  const def = SHAPES[kind];
  return {
    id: uid(), kind, x: 0.5, y: 0.3, w: kind === 'band' ? 90 : kind === 'ribbon' ? 90 : 45, rot: kind === 'burst' ? -12 : 0,
    fill: kind === 'bow' ? '#d4002a' : '#e30613', text: def.defaultText, textColor: '#ffffff', font: 'Bebas Neue', weight: 400,
    textScale: 1, shadow: true, cellId: null, ...p,
  };
}

export const shapeHeight = (s: ShapeItem) => (s.w * SHAPES[s.kind].bh) / SHAPES[s.kind].bw;

/** Rectangle de découpe (mm, repère du format fini) si la forme est attachée à une case. */
export function shapeClip(doc: Doc, s: ShapeItem) {
  if (!s.cellId) return null;
  const c = doc.cells.find((x) => x.id === s.cellId);
  return c ? extendToBleed(doc, cellRect(doc, c)) : null;
}

/** Trouve la case qui contient le point (mm). */
export function cellAt(doc: Doc, xMm: number, yMm: number) {
  return doc.cells.find((c) => {
    const r = cellRect(doc, c);
    return xMm >= r.x && xMm <= r.x + r.w && yMm >= r.y && yMm <= r.y + r.h;
  });
}

const pathCache = new Map<string, Path2D>();
const path2d = (d: string) => {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
};

/** Dessine une forme sur le canvas. k : px par mm, (ox, oy) : origine du format fini en px. */
export function drawShape(ctx: CanvasRenderingContext2D, doc: Doc, s: ShapeItem, k: number, ox: number, oy: number, radius: number) {
  const def = SHAPES[s.kind];
  const wPx = s.w * k;
  const hPx = shapeHeight(s) * k;
  ctx.save();
  const clip = shapeClip(doc, s);
  if (clip) {
    const r = Math.max(0, Math.min(radius * k, (clip.w * k) / 2, (clip.h * k) / 2));
    ctx.beginPath();
    ctx.roundRect(ox + clip.x * k, oy + clip.y * k, clip.w * k, clip.h * k, r);
    ctx.clip();
  }
  ctx.translate(ox + s.x * doc.width * k, oy + s.y * doc.height * k);
  ctx.rotate((s.rot * Math.PI) / 180);
  if (s.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowOffsetY = 0.6 * k;
    ctx.shadowBlur = 2 * k;
  }
  ctx.save();
  ctx.scale(wPx / def.bw, hPx / def.bh);
  ctx.translate(-def.bw / 2, -def.bh / 2);
  for (const part of def.parts) {
    ctx.fillStyle = shade(s.fill, part.shade);
    ctx.fill(path2d(part.d), 'evenodd');
  }
  ctx.restore();
  ctx.shadowColor = 'transparent';
  if (s.text) {
    const unit = wPx / def.bw;
    const fs = def.fs * s.textScale * unit;
    ctx.font = `${s.weight} ${fs}px "${s.font}"`;
    ctx.fillStyle = s.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = s.text.split('\n');
    const y0 = (def.ty - def.bh / 2) * unit - ((lines.length - 1) * fs * 1.05) / 2;
    lines.forEach((l, i) => ctx.fillText(l, 0, y0 + i * fs * 1.05));
  }
  ctx.restore();
}
