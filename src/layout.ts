import type { Cell, Doc, SavedLayout, TextItem } from './types';

export const uid = () => Math.random().toString(36).slice(2, 10);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/* ---------- Formats ---------- */

export interface Format {
  id: string;
  label: string;
  w: number;
  h: number;
}

export const FORMATS: Format[] = [
  { id: 'A4', label: 'A4', w: 210, h: 297 },
  { id: 'A3', label: 'A3', w: 297, h: 420 },
  { id: 'A2', label: 'A2', w: 420, h: 594 },
  { id: 'A1', label: 'A1', w: 594, h: 841 },
  { id: '30x40', label: '30 × 40', w: 300, h: 400 },
  { id: '40x60', label: '40 × 60', w: 400, h: 600 },
  { id: '50x70', label: '50 × 70', w: 500, h: 700 },
  { id: '60x90', label: '60 × 90', w: 600, h: 900 },
  { id: 'C50', label: 'Carré 50', w: 500, h: 500 },
];

export const FONTS = [
  'Bebas Neue',
  'Anton',
  'Oswald',
  'Montserrat',
  'Inter',
  'Playfair Display',
  'Cormorant Garamond',
  'Dancing Script',
];

/* ---------- Cases ---------- */

export function newCell(c: number, r: number, cs = 1, rs = 1): Cell {
  return {
    id: uid(), c, r, cs, rs, imageId: null, fit: 'cover', zoom: 1, ox: 0, oy: 0, rot: 0, flipX: false,
    brightness: 1, contrast: 1, saturate: 1, grayscale: 0,
  };
}

export type Spec = [number, number, number, number];

export interface Template {
  id: string;
  label: string;
  cols: number;
  rows: number;
  cells: Spec[];
}

export function regularSpecs(cols: number, rows: number): Spec[] {
  const out: Spec[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([c, r, 1, 1]);
  return out;
}

export const TEMPLATES: Template[] = [
  { id: 'single', label: 'Pleine page', cols: 1, rows: 1, cells: regularSpecs(1, 1) },
  { id: 'duo-v', label: 'Duo empilé', cols: 1, rows: 2, cells: regularSpecs(1, 2) },
  { id: 'duo-h', label: 'Duo', cols: 2, rows: 1, cells: regularSpecs(2, 1) },
  { id: 'trip', label: 'Triptyque', cols: 3, rows: 1, cells: regularSpecs(3, 1) },
  { id: 'g2', label: 'Grille 2×2', cols: 2, rows: 2, cells: regularSpecs(2, 2) },
  { id: 'g3', label: 'Grille 3×3', cols: 3, rows: 3, cells: regularSpecs(3, 3) },
  { id: 'g34', label: 'Grille 3×4', cols: 3, rows: 4, cells: regularSpecs(3, 4) },
  { id: 'hero', label: 'Héros + 3', cols: 3, rows: 3, cells: [[0, 0, 3, 2], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1]] },
  { id: 'mag', label: 'Magazine', cols: 3, rows: 3, cells: [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1]] },
  { id: 'side', label: 'Colonne', cols: 3, rows: 4, cells: [[0, 0, 2, 4], [2, 0, 1, 1], [2, 1, 1, 1], [2, 2, 1, 1], [2, 3, 1, 1]] },
  { id: 'mosaic', label: 'Mosaïque', cols: 4, rows: 4, cells: [[0, 0, 2, 2], [2, 0, 2, 1], [2, 1, 1, 1], [3, 1, 1, 1], [0, 2, 1, 2], [1, 2, 2, 2], [3, 2, 1, 2]] },
  {
    id: 'frame', label: 'Cadre', cols: 4, rows: 4,
    cells: [[1, 1, 2, 2], [0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [3, 0, 1, 1], [0, 1, 1, 1], [3, 1, 1, 1], [0, 2, 1, 1], [3, 2, 1, 1], [0, 3, 1, 1], [1, 3, 1, 1], [2, 3, 1, 1], [3, 3, 1, 1]],
  },
];

export const sortCells = (cells: Cell[]) => [...cells].sort((a, b) => a.r - b.r || a.c - b.c);

/** Recrée les cases à partir d'un modèle, en gardant les images dans l'ordre de lecture. */
export function applySpecs(old: Cell[], specs: Spec[]): Cell[] {
  const src = sortCells(old).filter((c) => c.imageId);
  return specs.map((s, i) => {
    const n = newCell(...s);
    const o = src[i];
    if (o) {
      n.imageId = o.imageId;
      n.rot = o.rot;
      n.flipX = o.flipX;
      n.fit = o.fit;
      n.brightness = o.brightness;
      n.contrast = o.contrast;
      n.saturate = o.saturate;
      n.grayscale = o.grayscale;
    }
    return n;
  });
}

/** Applique une grille (modèle ou régulière) en remettant les colonnes et lignes à égalité. */
export function withGrid(d: Doc, cols: number, rows: number, specs: Spec[]): Doc {
  return { ...d, cols, rows, colSizes: ones(cols), rowSizes: ones(rows), cells: applySpecs(d.cells, specs) };
}

export function mergeCells(cells: Cell[], ids: string[]): { cells: Cell[]; id: string } | { error: string } {
  const sel = cells.filter((c) => ids.includes(c.id));
  if (sel.length < 2) return { error: 'Sélectionnez au moins 2 cases (Maj + clic).' };
  const c0 = Math.min(...sel.map((c) => c.c));
  const r0 = Math.min(...sel.map((c) => c.r));
  const c1 = Math.max(...sel.map((c) => c.c + c.cs));
  const rEnd = Math.max(...sel.map((c) => c.r + c.rs));
  const inBox: Cell[] = [];
  for (const c of cells) {
    const hit = c.c < c1 && c.c + c.cs > c0 && c.r < rEnd && c.r + c.rs > r0;
    if (!hit) continue;
    const inside = c.c >= c0 && c.c + c.cs <= c1 && c.r >= r0 && c.r + c.rs <= rEnd;
    if (!inside) return { error: 'Fusion impossible : la zone choisie doit former un rectangle.' };
    inBox.push(c);
  }
  const keep = sel.find((c) => c.imageId) ?? inBox.find((c) => c.imageId) ?? sel[0];
  const merged: Cell = { ...keep, c: c0, r: r0, cs: c1 - c0, rs: rEnd - r0, zoom: 1, ox: 0, oy: 0 };
  return { cells: [...cells.filter((c) => !inBox.includes(c)), merged], id: merged.id };
}

export function splitCell(cells: Cell[], id: string): Cell[] {
  const t = cells.find((c) => c.id === id);
  if (!t) return cells;
  const out: Cell[] = [];
  for (let r = 0; r < t.rs; r++)
    for (let c = 0; c < t.cs; c++)
      out.push(r === 0 && c === 0 ? { ...t, cs: 1, rs: 1, zoom: 1, ox: 0, oy: 0 } : newCell(t.c + c, t.r + r));
  return [...cells.filter((c) => c.id !== id), ...out];
}

/** Ajoute une case 1×1 à chaque emplacement de la grille non couvert. */
export function fillHoles(doc: Doc): Cell[] {
  const used = new Set<string>();
  for (const c of doc.cells)
    for (let r = c.r; r < c.r + c.rs; r++) for (let k = c.c; k < c.c + c.cs; k++) used.add(`${k},${r}`);
  const add: Cell[] = [];
  for (let r = 0; r < doc.rows; r++)
    for (let c = 0; c < doc.cols; c++) if (!used.has(`${c},${r}`)) add.push(newCell(c, r));
  return add.length ? [...doc.cells, ...add] : doc.cells;
}

export function holeCount(doc: Doc): number {
  return fillHoles(doc).length - doc.cells.length;
}

/* ---------- Géométrie (mm) ---------- */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ones = (n: number) => Array.from({ length: n }, () => 1);

export function normSizes(a: number[] | undefined, n: number): number[] {
  return Array.isArray(a) && a.length === n && a.every((v) => v > 0) ? a : ones(n);
}

/** Complète un document ancien ou importé (tailles de grille manquantes). */
export function normalizeDoc(d: Doc): Doc {
  return {
    ...d,
    colSizes: normSizes(d.colSizes, d.cols),
    rowSizes: normSizes(d.rowSizes, d.rows),
    shapes: Array.isArray(d.shapes) ? d.shapes : [],
  };
}

/* ---------- Mises en page enregistrées ---------- */

export function layoutFromDoc(d: Doc, name: string, withFormat: boolean, withTexts: boolean): SavedLayout {
  return {
    id: uid(), name, createdAt: Date.now(),
    cols: d.cols, rows: d.rows, cells: sortCells(d.cells).map((c) => [c.c, c.r, c.cs, c.rs]),
    colSizes: [...d.colSizes], rowSizes: [...d.rowSizes],
    gap: d.gap, marginX: d.marginX, marginTop: d.marginTop, marginBottom: d.marginBottom,
    radius: d.radius, borderWidth: d.borderWidth, borderColor: d.borderColor, background: d.background,
    format: { formatId: d.formatId, width: d.width, height: d.height, bleed: d.bleed },
    useFormat: withFormat,
    texts: withTexts ? d.texts : undefined,
    shapes: withTexts ? d.shapes.map((s) => ({ ...s, cellId: null })) : undefined,
  };
}

/** Applique une mise en page enregistrée en gardant les photos du poster actuel. */
export function applyLayout(d: Doc, L: SavedLayout): Doc {
  let next: Doc = {
    ...d,
    cols: L.cols, rows: L.rows, colSizes: [...L.colSizes], rowSizes: [...L.rowSizes],
    cells: applySpecs(d.cells, L.cells),
    gap: L.gap, marginX: L.marginX, marginTop: L.marginTop, marginBottom: L.marginBottom,
    radius: L.radius, borderWidth: L.borderWidth, borderColor: L.borderColor, background: L.background,
    texts: L.texts ? L.texts.map((t) => ({ ...t, id: uid() })) : d.texts,
    shapes: L.shapes ? L.shapes.map((s) => ({ ...s, id: uid() })) : d.shapes,
  };
  // Les mesures ont été enregistrées pour le format d'origine.
  next = { ...next, formatId: L.format.formatId, width: L.format.width, height: L.format.height, bleed: L.format.bleed };
  if (!L.useFormat && (L.format.width !== d.width || L.format.height !== d.height)) {
    const scaled = changeFormat(next, d.width, d.height, d.formatId);
    // Les textes du poster actuel sont déjà à la bonne taille.
    next = { ...scaled, bleed: d.bleed, texts: L.texts ? scaled.texts : d.texts, shapes: L.shapes ? scaled.shapes : d.shapes };
  } else if (!L.useFormat) {
    next = { ...next, formatId: d.formatId, bleed: d.bleed };
  }
  return normalizeDoc(next);
}

const sumRange = (a: number[], i0: number, i1: number) => {
  let s = 0;
  for (let i = i0; i < i1; i++) s += a[i] ?? 0;
  return s;
};

function track(sizes: number[], n: number, avail: number) {
  const s = normSizes(sizes, n);
  const total = s.reduce((a, b) => a + b, 0);
  return s.map((v) => (avail * v) / total);
}

/** Largeur de chaque colonne et hauteur de chaque ligne, en mm. */
export function gridTracks(doc: Doc) {
  const colAvail = Math.max(doc.cols, doc.width - 2 * doc.marginX - doc.gap * (doc.cols - 1));
  const rowAvail = Math.max(doc.rows, doc.height - doc.marginTop - doc.marginBottom - doc.gap * (doc.rows - 1));
  return { cols: track(doc.colSizes, doc.cols, colAvail), rows: track(doc.rowSizes, doc.rows, rowAvail), colAvail, rowAvail };
}

export function cellRect(doc: Doc, cell: Cell): Rect {
  const t = gridTracks(doc);
  return {
    x: doc.marginX + sumRange(t.cols, 0, cell.c) + cell.c * doc.gap,
    y: doc.marginTop + sumRange(t.rows, 0, cell.r) + cell.r * doc.gap,
    w: sumRange(t.cols, cell.c, cell.c + cell.cs) + (cell.cs - 1) * doc.gap,
    h: sumRange(t.rows, cell.r, cell.r + cell.rs) + (cell.rs - 1) * doc.gap,
  };
}

const minTrack = (avail: number) => Math.max(3, avail * 0.04);

/** Déplace la ligne de grille k (entre la piste k-1 et k) de d mm. */
export function moveBoundary(base: number[], k: number, d: number, avail: number): number[] {
  const min = minTrack(avail);
  const a0 = base[k - 1];
  const b0 = base[k];
  if (a0 === undefined || b0 === undefined || a0 + b0 < 2 * min) return base;
  const dd = clamp(d, min - a0, b0 - min);
  const out = [...base];
  out[k - 1] = a0 + dd;
  out[k] = b0 - dd;
  return out;
}

/** Redistribue les pistes pour que [i0, i1) mesure `target` mm ; null si impossible. */
function fitSpan(base: number[], i0: number, i1: number, target: number, avail: number): number[] | null {
  const min = minTrack(avail);
  const inside = i1 - i0;
  const outside = base.length - inside;
  if (outside === 0) return null;
  const others = avail - target;
  if (target < min * inside || others < min * outside) return null;
  const sIn = sumRange(base, i0, i1);
  const sOut = base.reduce((a, b) => a + b, 0) - sIn;
  return base.map((v, i) => (i >= i0 && i < i1 ? (v / sIn) * target : (v / sOut) * others));
}

/** Donne à une case le ratio largeur/hauteur voulu, en ajustant lignes ou colonnes. */
export function applyCellRatio(doc: Doc, cell: Cell, ratio: number): Doc | null {
  const t = gridTracks(doc);
  const r = cellRect(doc, cell);
  const gapsV = (cell.rs - 1) * doc.gap;
  const gapsH = (cell.cs - 1) * doc.gap;
  const rows = fitSpan(t.rows, cell.r, cell.r + cell.rs, r.w / ratio - gapsV, t.rowAvail);
  const cols = fitSpan(t.cols, cell.c, cell.c + cell.cs, r.h * ratio - gapsH, t.colAvail);
  const costRows = Math.abs(r.w / ratio - r.h) / t.rowAvail;
  const costCols = Math.abs(r.h * ratio - r.w) / t.colAvail;
  if (rows && (!cols || costRows <= costCols)) return { ...doc, colSizes: t.cols, rowSizes: rows };
  if (cols) return { ...doc, colSizes: cols, rowSizes: t.rows };
  return null;
}

/** Ratio largeur/hauteur d'une image en tenant compte de sa rotation. */
export const imageRatio = (img: { w: number; h: number }, cell: Cell) => (cell.rot % 180 ? img.h / img.w : img.w / img.h);

export const RATIOS: { label: string; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '9:16', value: 9 / 16 },
  { label: '5:4', value: 5 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
];

export function ratioLabel(r: number): string {
  const near = RATIOS.find((x) => Math.abs(x.value - r) / x.value < 0.015);
  return near ? near.label : r.toFixed(2);
}

/** Change le ratio de la page en gardant la largeur (ou la hauteur si la page devient trop grande). */
export function pageWithRatio(d: Doc, ratio: number): Doc {
  let w = d.width;
  let h = Math.round(w / ratio);
  if (h > 2000 || h < 50) {
    h = d.height;
    w = Math.round(h * ratio);
  }
  return changeFormat(d, w, h, 'custom');
}

/** Une case collée au bord du format déborde dans les fonds perdus. */
export function extendToBleed(doc: Doc, r: Rect): Rect {
  const b = doc.bleed;
  if (b <= 0) return r;
  const e = 0.01;
  let { x, y, w, h } = r;
  if (r.x <= e) { x -= b; w += b; }
  if (r.y <= e) { y -= b; h += b; }
  if (r.x + r.w >= doc.width - e) w += b;
  if (r.y + r.h >= doc.height - e) h += b;
  return { x, y, w, h };
}

export interface Placement {
  /** Taille du cadre de l'image après rotation. */
  dw: number;
  dh: number;
  /** Centre de l'image dans la case. */
  cx: number;
  cy: number;
  maxX: number;
  maxY: number;
  /** Taille de l'image avant rotation. */
  iw: number;
  ih: number;
}

export function placeImage(W: number, H: number, img: { w: number; h: number }, cell: Cell): Placement {
  const rotated = cell.rot % 180 !== 0;
  const bw = rotated ? img.h : img.w;
  const bh = rotated ? img.w : img.h;
  const base = cell.fit === 'cover' ? Math.max(W / bw, H / bh) : Math.min(W / bw, H / bh);
  const s = base * cell.zoom;
  const dw = bw * s;
  const dh = bh * s;
  const maxX = Math.abs(dw - W) / 2;
  const maxY = Math.abs(dh - H) / 2;
  return { dw, dh, cx: W / 2 + cell.ox * maxX, cy: H / 2 + cell.oy * maxY, maxX, maxY, iw: img.w * s, ih: img.h * s };
}

/** Résolution réelle de l'image une fois imprimée (placement en mm). */
export const dpiOf = (img: { w: number }, p: Placement) => img.w / (p.iw / 25.4);

export function cellDpi(doc: Doc, cell: Cell, img: { w: number; h: number }) {
  const r = extendToBleed(doc, cellRect(doc, cell));
  return dpiOf(img, placeImage(r.w, r.h, img, cell));
}

export function cssFilter(c: Cell): string {
  if (c.brightness === 1 && c.contrast === 1 && c.saturate === 1 && c.grayscale === 0) return 'none';
  return `brightness(${c.brightness}) contrast(${c.contrast}) saturate(${c.saturate}) grayscale(${c.grayscale})`;
}

/** Change de format en adaptant marges, espacements et textes. */
export function changeFormat(d: Doc, w: number, h: number, formatId: string): Doc {
  const f = Math.min(w, h) / Math.min(d.width, d.height);
  const sc = (v: number) => r1(v * f);
  return {
    ...d, formatId, width: w, height: h,
    gap: sc(d.gap), marginX: sc(d.marginX), marginTop: sc(d.marginTop), marginBottom: sc(d.marginBottom),
    radius: sc(d.radius), borderWidth: sc(d.borderWidth),
    texts: d.texts.map((t) => ({ ...t, size: r1(t.size * f), padding: r1(t.padding * f) })),
    shapes: (d.shapes ?? []).map((s) => ({ ...s, w: r1(s.w * f) })),
  };
}

/* ---------- Textes et thèmes ---------- */

export function newText(p: Partial<TextItem> = {}): TextItem {
  return {
    id: uid(), content: 'Texte', x: 0.5, y: 0.5, size: 10, font: 'Montserrat', weight: 600, color: '#1a1a1a',
    align: 'center', lineHeight: 1.1, letterSpacing: 0, uppercase: false, italic: false, bg: null, padding: 4, shadow: false,
    ...p,
  };
}

export interface Theme {
  id: string;
  label: string;
  bg: string;
  title: { font: string; weight: number; color: string };
  body: { font: string; weight: number; color: string };
}

export const THEMES: Theme[] = [
  { id: 'papier', label: 'Papier', bg: '#f4f1ea', title: { font: 'Bebas Neue', weight: 400, color: '#1a1a1a' }, body: { font: 'Montserrat', weight: 600, color: '#1a1a1a' } },
  { id: 'noir', label: 'Cinéma noir', bg: '#0b0b0c', title: { font: 'Bebas Neue', weight: 400, color: '#f2f2f2' }, body: { font: 'Oswald', weight: 400, color: '#e50914' } },
  { id: 'swiss', label: 'Swiss', bg: '#ffffff', title: { font: 'Inter', weight: 900, color: '#e30613' }, body: { font: 'Inter', weight: 500, color: '#111111' } },
  { id: 'neon', label: 'Néon', bg: '#140026', title: { font: 'Anton', weight: 400, color: '#ff3fd4' }, body: { font: 'Montserrat', weight: 500, color: '#7df9ff' } },
  { id: 'galerie', label: 'Galerie', bg: '#fbfaf7', title: { font: 'Playfair Display', weight: 700, color: '#2b2b2b' }, body: { font: 'Cormorant Garamond', weight: 500, color: '#555555' } },
  { id: 'ocean', label: 'Océan', bg: '#0f2a3d', title: { font: 'Montserrat', weight: 800, color: '#ffffff' }, body: { font: 'Montserrat', weight: 400, color: '#9fd3e6' } },
];

export function applyTheme(d: Doc, t: Theme): Doc {
  const biggest = d.texts.reduce<TextItem | null>((m, x) => (!m || x.size > m.size ? x : m), null);
  return {
    ...d,
    background: t.bg,
    texts: d.texts.map((x) => ({ ...x, ...(x === biggest ? t.title : t.body) })),
  };
}

export function defaultDoc(): Doc {
  const t = TEMPLATES.find((x) => x.id === 'mag')!;
  const H = 420;
  return {
    formatId: 'A3', width: 297, height: H, bleed: 3,
    cols: t.cols, rows: t.rows, colSizes: ones(t.cols), rowSizes: ones(t.rows), cells: t.cells.map((s) => newCell(...s)),
    gap: 4, marginX: 14, marginTop: 14, marginBottom: 62,
    radius: 0, borderWidth: 0, borderColor: '#ffffff', background: '#f4f1ea',
    texts: [
      newText({ content: 'VOTRE TITRE', y: (H - 56) / H, size: 30, font: 'Bebas Neue', weight: 400, letterSpacing: 0.02, lineHeight: 1 }),
      newText({ content: 'Sous-titre · Date · Lieu', y: (H - 22) / H, size: 5.5, font: 'Montserrat', weight: 600, letterSpacing: 0.3, uppercase: true }),
    ],
    shapes: [],
  };
}
