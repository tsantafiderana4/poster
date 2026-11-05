import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Cell, Doc, ImageAsset, Selection, ShapeItem, TextItem } from './types';
import { cellRect, clamp, cssFilter, dpiOf, extendToBleed, gridTracks, imageRatio, moveBoundary, placeImage, ratioLabel, sortCells } from './layout';
import { SHAPES, shade, shapeClip, shapeHeight } from './shapes';
import { cls, Icon, ICONS } from './ui';

interface Props {
  doc: Doc;
  images: Record<string, ImageAsset>;
  scale: number;
  preview: boolean;
  showGuides: boolean;
  selection: Selection;
  onSelectCell: (id: string, additive: boolean) => void;
  onSelectText: (id: string) => void;
  onClear: () => void;
  onCellChange: (id: string, patch: Partial<Cell>, key?: string) => void;
  onTextChange: (id: string, patch: Partial<TextItem>, key?: string) => void;
  onDropOnCell: (id: string, dt: DataTransfer) => void;
  onPickForCell: (id: string) => void;
  onDocCommit: (fn: (d: Doc) => Doc, key?: string) => void;
  onCellRatio: (id: string, ratio: number) => void;
  onSelectShape: (id: string) => void;
  onShapeChange: (id: string, patch: Partial<ShapeItem>, key?: string) => void;
}

export function Poster(p: Props) {
  const { doc, scale: s, preview } = p;
  const b = doc.bleed;
  const [guide, setGuide] = useState(false);
  const frameW = (preview ? doc.width : doc.width + 2 * b) * s;
  const frameH = (preview ? doc.height : doc.height + 2 * b) * s;
  const selCells = p.selection?.kind === 'cells' ? p.selection.ids : [];
  const selText = p.selection?.kind === 'text' ? p.selection.id : null;
  const selShape = p.selection?.kind === 'shape' ? doc.shapes.find((x) => x.id === (p.selection as { id: string }).id) : undefined;

  return (
    <div className="poster-wrap" style={{ width: frameW, height: frameH }}>
    <div className={cls('sheet-frame', preview && 'is-preview')} style={{ width: frameW, height: frameH }}>
      <div
        className="sheet"
        style={{
          width: (doc.width + 2 * b) * s,
          height: (doc.height + 2 * b) * s,
          marginLeft: preview ? -b * s : 0,
          marginTop: preview ? -b * s : 0,
          background: doc.background,
        }}
        onPointerDown={() => p.onClear()}
      >
        {sortCells(doc.cells).map((c) => (
          <CellView
            key={c.id}
            cell={c}
            doc={doc}
            s={s}
            asset={c.imageId ? p.images[c.imageId] : undefined}
            selected={selCells.includes(c.id)}
            preview={preview}
            onSelect={p.onSelectCell}
            onChange={p.onCellChange}
            onDrop={p.onDropOnCell}
            onPick={p.onPickForCell}
          />
        ))}
        {doc.shapes.map((sh) => (
          <ShapeView
            key={sh.id}
            sh={sh}
            doc={doc}
            s={s}
            selected={selShape?.id === sh.id}
            onSelect={p.onSelectShape}
            onChange={p.onShapeChange}
            setGuide={setGuide}
          />
        ))}
        {doc.texts.map((t) => (
          <TextView
            key={t.id}
            t={t}
            doc={doc}
            s={s}
            selected={selText === t.id}
            preview={preview}
            onSelect={p.onSelectText}
            onChange={p.onTextChange}
            setGuide={setGuide}
          />
        ))}
        {!preview && p.showGuides && (
          <>
            {b > 0 && (
              <div
                className="trim-guide"
                style={{ left: b * s, top: b * s, width: doc.width * s, height: doc.height * s, boxShadow: `0 0 0 ${b * s}px rgba(255, 60, 90, 0.16)` }}
                title="Ligne de coupe"
              />
            )}
            <div className="safe-guide" style={{ left: (b + 5) * s, top: (b + 5) * s, width: (doc.width - 10) * s, height: (doc.height - 10) * s }} />
          </>
        )}
        {guide && <div className="snap-guide" style={{ left: (b + doc.width / 2) * s }} />}
      </div>
    </div>
      {!preview &&
        selCells.length === 1 &&
        (() => {
          const cell = doc.cells.find((c) => c.id === selCells[0]);
          return cell ? (
            <CellOverlay
              key={cell.id}
              doc={doc}
              cell={cell}
              asset={cell.imageId ? p.images[cell.imageId] : undefined}
              s={s}
              onDocCommit={p.onDocCommit}
              onCellChange={p.onCellChange}
              onCellRatio={p.onCellRatio}
              onPick={p.onPickForCell}
            />
          ) : null;
        })()}
      {!preview && selShape && <ShapeHandles sh={selShape} doc={doc} s={s} onChange={p.onShapeChange} />}
    </div>
  );
}

/* ---------- Formes ---------- */

export function ShapeSvg({ sh }: { sh: ShapeItem }) {
  const def = SHAPES[sh.kind];
  const lines = sh.text ? sh.text.split('\n') : [];
  const fs = def.fs * sh.textScale;
  const y0 = def.ty - ((lines.length - 1) * fs * 1.05) / 2;
  return (
    <svg viewBox={`0 0 ${def.bw} ${def.bh}`} width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}>
      {def.parts.map((part, i) => (
        <path key={i} d={part.d} fill={shade(sh.fill, part.shade)} fillRule="evenodd" />
      ))}
      {lines.map((l, i) => (
        <text
          key={i}
          x={def.bw / 2}
          y={y0 + i * fs * 1.05}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily={`"${sh.font}"`}
          fontWeight={sh.weight}
          fontSize={fs}
          fill={sh.textColor}
        >
          {l}
        </text>
      ))}
    </svg>
  );
}

function ShapeView(props: {
  sh: ShapeItem;
  doc: Doc;
  s: number;
  selected: boolean;
  onSelect: Props['onSelectShape'];
  onChange: Props['onShapeChange'];
  setGuide: (v: boolean) => void;
}) {
  const { sh, doc, s, selected } = props;
  const b = doc.bleed;
  const live = useRef(props);
  live.current = props;
  const h = shapeHeight(sh);
  const clip = shapeClip(doc, sh);
  const cx = (b + sh.x * doc.width) * s;
  const cy = (b + sh.y * doc.height) * s;

  const onPointerDown = (e: RPointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    props.onSelect(sh.id);
    const sx = e.clientX;
    const sy = e.clientY;
    const x0 = sh.x;
    const y0 = sh.y;
    const move = (ev: PointerEvent) => {
      const { doc, s } = live.current;
      let nx = x0 + (ev.clientX - sx) / s / doc.width;
      const ny = y0 + (ev.clientY - sy) / s / doc.height;
      const snap = !ev.altKey && Math.abs((nx - 0.5) * doc.width * s) < 6;
      if (snap) nx = 0.5;
      live.current.setGuide(snap);
      live.current.onChange(sh.id, { x: clamp(nx, -0.2, 1.2), y: clamp(ny, -0.2, 1.2) }, 'move-' + sh.id);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      live.current.setGuide(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ox = clip ? (b + clip.x) * s : 0;
  const oy = clip ? (b + clip.y) * s : 0;
  const el = (
    <div
      className={cls('shape-item', selected && 'selected')}
      style={{
        left: cx - ox,
        top: cy - oy,
        width: sh.w * s,
        height: h * s,
        transform: `translate(-50%, -50%) rotate(${sh.rot}deg)`,
        filter: sh.shadow ? `drop-shadow(0 ${0.6 * s}px ${1 * s}px rgba(0,0,0,0.35))` : 'none',
      }}
      onPointerDown={onPointerDown}
    >
      <ShapeSvg sh={sh} />
    </div>
  );
  if (!clip) return el;
  return (
    <div className="shape-clip" style={{ left: ox, top: oy, width: clip.w * s, height: clip.h * s, borderRadius: doc.radius * s }}>
      {el}
    </div>
  );
}

/** Poignées de taille et de rotation d'une forme sélectionnée. */
function ShapeHandles({ sh, doc, s, onChange }: { sh: ShapeItem; doc: Doc; s: number; onChange: Props['onShapeChange'] }) {
  const b = doc.bleed;
  const cx = (b + sh.x * doc.width) * s;
  const cy = (b + sh.y * doc.height) * s;
  const hw = (sh.w * s) / 2;
  const hh = (shapeHeight(sh) * s) / 2;
  const a = (sh.rot * Math.PI) / 180;
  const rotPt = (x: number, y: number) => ({ left: cx + x * Math.cos(a) - y * Math.sin(a), top: cy + x * Math.sin(a) + y * Math.cos(a) });

  const drag = (e: RPointerEvent, mode: 'size' | 'rot') => {
    e.stopPropagation();
    e.preventDefault();
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const centerX = box.left + cx;
    const centerY = box.top + cy;
    const w0 = sh.w;
    const d0 = Math.hypot(e.clientX - centerX, e.clientY - centerY) || 1;
    const a0 = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const r0 = sh.rot;
    const key = `${mode}-${sh.id}-${Date.now()}`;
    const move = (ev: PointerEvent) => {
      if (mode === 'size') {
        const d = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
        onChange(sh.id, { w: clamp(Math.round(((w0 * d) / d0) * 2) / 2, 8, 600) }, key);
      } else {
        let r = r0 + ((Math.atan2(ev.clientY - centerY, ev.clientX - centerX) - a0) * 180) / Math.PI;
        r = ((((r + 180) % 360) + 360) % 360) - 180;
        if (ev.shiftKey) r = Math.round(r / 15) * 15;
        else for (const snap of [-90, -45, 0, 45, 90]) if (Math.abs(r - snap) < 3) r = snap;
        onChange(sh.id, { rot: Math.round(r) }, key);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const corner = rotPt(hw, hh);
  const top = rotPt(0, -hh - 26);
  const stem = rotPt(0, -hh);
  return (
    <>
      <div className="shape-box" style={{ left: cx, top: cy, width: hw * 2, height: hh * 2, transform: `translate(-50%, -50%) rotate(${sh.rot}deg)` }} />
      <div className="rot-stem" style={{ left: stem.left, top: stem.top, height: 26, transform: `translate(-50%, -100%) rotate(${sh.rot}deg)`, transformOrigin: '50% 100%' }} />
      <div className="sh-handle rot" style={top} title="Tourner (Maj : par pas de 15°)" onPointerDown={(e) => drag(e, 'rot')}>
        <Icon d={ICONS.rotR} size={12} />
      </div>
      <div className="sh-handle size" style={corner} title="Agrandir / réduire" onPointerDown={(e) => drag(e, 'size')} />
    </>
  );
}

function CellView(props: {
  cell: Cell;
  doc: Doc;
  s: number;
  asset?: ImageAsset;
  selected: boolean;
  preview: boolean;
  onSelect: Props['onSelectCell'];
  onChange: Props['onCellChange'];
  onDrop: Props['onDropOnCell'];
  onPick: Props['onPickForCell'];
}) {
  const { cell, doc, s, asset, selected, preview } = props;
  const b = doc.bleed;
  const r = extendToBleed(doc, cellRect(doc, cell));
  const pl = asset ? placeImage(r.w, r.h, asset, cell) : null;
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [panning, setPanning] = useState(false);
  const live = useRef(props);
  live.current = props;

  // Molette : zoom de l'image de la case sélectionnée.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      const { cell, selected, onChange } = live.current;
      if (!cell.imageId || !selected) return;
      e.preventDefault();
      const z = clamp(cell.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06), 0.3, 8);
      onChange(cell.id, { zoom: z }, 'zoom-' + cell.id);
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  const onPointerDown = (e: RPointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    props.onSelect(cell.id, additive);
    if (!pl || additive) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const ox0 = cell.ox;
    const oy0 = cell.oy;
    const mx = pl.maxX * s;
    const my = pl.maxY * s;
    const move = (ev: PointerEvent) => {
      const patch: Partial<Cell> = {};
      if (mx > 0.5) patch.ox = clamp(ox0 + (ev.clientX - sx) / mx, -1, 1);
      if (my > 0.5) patch.oy = clamp(oy0 + (ev.clientY - sy) / my, -1, 1);
      if (patch.ox !== undefined || patch.oy !== undefined) live.current.onChange(cell.id, patch, 'pan-' + cell.id);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setPanning(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    setPanning(true);
  };

  const dpi = asset && pl ? dpiOf(asset, pl) : 0;

  return (
    <div
      ref={ref}
      className={cls('cell', selected && 'selected', !asset && 'empty', over && 'drag-over', panning && 'panning', pl && 'has-img')}
      style={{ left: (r.x + b) * s, top: (r.y + b) * s, width: r.w * s, height: r.h * s, borderRadius: doc.radius * s }}
      onPointerDown={onPointerDown}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        props.onDrop(cell.id, e.dataTransfer);
      }}
    >
      {asset && pl && (
        <div className="img-box" style={{ left: (pl.cx - pl.dw / 2) * s, top: (pl.cy - pl.dh / 2) * s, width: pl.dw * s, height: pl.dh * s }}>
          <img
            src={asset.url}
            alt=""
            draggable={false}
            style={{
              width: pl.iw * s,
              height: pl.ih * s,
              left: ((pl.dw - pl.iw) / 2) * s,
              top: ((pl.dh - pl.ih) / 2) * s,
              transform: `rotate(${cell.rot}deg)${cell.flipX ? ' scaleX(-1)' : ''}`,
              filter: cssFilter(cell),
            }}
          />
        </div>
      )}
      {asset && doc.borderWidth > 0 && (
        <div className="cell-border" style={{ border: `${doc.borderWidth * s}px solid ${doc.borderColor}`, borderRadius: doc.radius * s }} />
      )}
      {!asset && !preview && (
        <div className="placeholder">
          <span>Déposez une image</span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              props.onPick(cell.id);
            }}
          >
            + Parcourir
          </button>
        </div>
      )}
      {!preview && asset && dpi < 200 && (
        <span className={cls('dpi-badge', dpi < 150 && 'bad')} title="Résolution à l'impression">
          {Math.round(dpi)} dpi
        </span>
      )}
      <div className="ring" />
    </div>
  );
}

type Edge = { axis: 'col' | 'row'; k: number; side: 'left' | 'right' | 'top' | 'bottom'; outer?: boolean };

/** Barre d'outils et poignées de redimensionnement de la case sélectionnée. */
function CellOverlay(props: {
  doc: Doc;
  cell: Cell;
  asset?: ImageAsset;
  s: number;
  onDocCommit: Props['onDocCommit'];
  onCellChange: Props['onCellChange'];
  onCellRatio: Props['onCellRatio'];
  onPick: Props['onPickForCell'];
}) {
  const { doc, cell, asset, s } = props;
  const b = doc.bleed;
  const r = cellRect(doc, cell);
  const [drag, setDrag] = useState<Edge[] | null>(null);
  const live = useRef(props);
  live.current = props;
  const stop = (e: RPointerEvent) => e.stopPropagation();

  // Côtés intérieurs : déplacent une ligne de grille. Côtés extérieurs : changent la marge.
  const left: Edge = cell.c > 0 ? { axis: 'col', k: cell.c, side: 'left' } : { axis: 'col', k: 0, side: 'left', outer: true };
  const right: Edge =
    cell.c + cell.cs < doc.cols ? { axis: 'col', k: cell.c + cell.cs, side: 'right' } : { axis: 'col', k: doc.cols, side: 'right', outer: true };
  const top: Edge = cell.r > 0 ? { axis: 'row', k: cell.r, side: 'top' } : { axis: 'row', k: 0, side: 'top', outer: true };
  const bottom: Edge =
    cell.r + cell.rs < doc.rows ? { axis: 'row', k: cell.r + cell.rs, side: 'bottom' } : { axis: 'row', k: doc.rows, side: 'bottom', outer: true };
  const edges = [left, right, top, bottom];
  const corners: [Edge, Edge][] = [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ];

  /** Prépare l'application d'un glissement d (mm) sur un côté, à partir de l'état de départ. */
  const prepare = (edge: Edge) => {
    const t = gridTracks(doc);
    if (!edge.outer) {
      const base = edge.axis === 'col' ? t.cols : t.rows;
      const avail = edge.axis === 'col' ? t.colAvail : t.rowAvail;
      return (dd: Doc, d: number): Doc => {
        const sizes = moveBoundary(base, edge.k, d, avail);
        return edge.axis === 'col' ? { ...dd, colSizes: sizes } : { ...dd, rowSizes: sizes };
      };
    }
    const field = edge.axis === 'col' ? 'marginX' : edge.side === 'top' ? 'marginTop' : 'marginBottom';
    const m0 = doc[field];
    const sign = edge.side === 'left' || edge.side === 'top' ? 1 : -1;
    const other = edge.side === 'top' ? doc.marginBottom : edge.side === 'bottom' ? doc.marginTop : doc.marginX;
    const max = edge.axis === 'col' ? doc.width / 2 - 10 : doc.height - other - 20;
    return (dd: Doc, d: number): Doc => ({ ...dd, [field]: Math.round(clamp(m0 + sign * d, 0, max) * 2) / 2 });
  };

  const startResize = (e: RPointerEvent, list: Edge[]) => {
    e.stopPropagation();
    e.preventDefault();
    const appliers = list.map((edge) => ({ edge, apply: prepare(edge) }));
    const sx = e.clientX;
    const sy = e.clientY;
    const key = `resize-${list.map((x) => x.side).join('-')}-${Date.now()}`;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / live.current.s;
      const dy = (ev.clientY - sy) / live.current.s;
      live.current.onDocCommit((dd) => appliers.reduce((acc, a) => a.apply(acc, a.edge.axis === 'col' ? dx : dy), dd), key);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    setDrag(list);
  };

  const coord = (edge: Edge) => {
    const g = edge.outer ? 0 : doc.gap / 2;
    if (edge.side === 'left') return (b + r.x - g) * s;
    if (edge.side === 'right') return (b + r.x + r.w + g) * s;
    if (edge.side === 'top') return (b + r.y - g) * s;
    return (b + r.y + r.h + g) * s;
  };
  const pos = (edge: Edge) =>
    edge.axis === 'col' ? { left: coord(edge), top: (b + r.y + r.h / 2) * s } : { left: (b + r.x + r.w / 2) * s, top: coord(edge) };

  // Lignes de grille complètes pendant le glissement.
  const lines = (drag ?? []).map((edge) =>
    edge.axis === 'col'
      ? { left: coord(edge), top: (b + doc.marginTop) * s, width: 0, height: (doc.height - doc.marginTop - doc.marginBottom) * s }
      : { left: (b + doc.marginX) * s, top: coord(edge), width: (doc.width - 2 * doc.marginX) * s, height: 0 },
  );
  const isActive = (edge: Edge) => !!drag?.some((x) => x.side === edge.side);

  const barTop = (b + r.y) * s - 44;
  const toolbarStyle = { left: (b + r.x + r.w / 2) * s, top: barTop >= 4 ? barTop : (b + r.y) * s + 8 };
  const z = (f: number) => props.onCellChange(cell.id, { zoom: clamp(cell.zoom * f, 0.3, 8) }, 'zoom-' + cell.id);

  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className="grid-line" style={l} />
      ))}
      {edges.map((e) => (
        <div
          key={e.side}
          className={cls('rz', e.axis === 'col' ? 'rz-col' : 'rz-row', e.outer && 'outer', isActive(e) && 'active')}
          style={pos(e)}
          title={e.outer ? 'Glisser pour changer la marge' : 'Glisser pour redimensionner la case'}
          onPointerDown={(ev) => startResize(ev, [e])}
        />
      ))}
      {corners.map(([ex, ey]) => (
        <div
          key={ex.side + ey.side}
          className={cls('rz rz-corner', isActive(ex) && isActive(ey) && 'active')}
          style={{ left: coord(ex), top: coord(ey), cursor: (ex.side === 'left') === (ey.side === 'top') ? 'nwse-resize' : 'nesw-resize' }}
          title="Glisser pour redimensionner en largeur et en hauteur"
          onPointerDown={(ev) => startResize(ev, [ex, ey])}
        />
      ))}
      <div className={cls('size-label', drag && 'active')} style={{ left: (b + r.x) * s + 8, top: (b + r.y + r.h) * s - 30 }}>
        {Math.round(r.w)} × {Math.round(r.h)} mm · {ratioLabel(r.w / r.h)}
      </div>
      <div className="cell-toolbar" style={toolbarStyle} onPointerDown={stop}>
        {asset ? (
          <>
            <div
              className="tb-btn drag"
              draggable
              title="Glisser vers une autre case pour échanger les images"
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-cell', cell.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              ⇄
            </div>
            <span className="tb-sep" />
            <button className="tb-btn" title="Dézoomer" onClick={() => z(1 / 1.15)}>
              −
            </button>
            <span className="tb-val">{Math.round(cell.zoom * 100)}%</span>
            <button className="tb-btn" title="Zoomer" onClick={() => z(1.15)}>
              +
            </button>
            <span className="tb-sep" />
            <button
              className="tb-btn"
              title="Pivoter de 90°"
              onClick={() => props.onCellChange(cell.id, { rot: ((cell.rot + 90) % 360) as Cell['rot'], zoom: 1, ox: 0, oy: 0 })}
            >
              <Icon d={ICONS.rotR} size={15} />
            </button>
            <button className={cls('tb-btn', cell.flipX && 'on')} title="Miroir" onClick={() => props.onCellChange(cell.id, { flipX: !cell.flipX })}>
              <Icon d={ICONS.flip} size={15} />
            </button>
            <button
              className="tb-btn text"
              title="Remplir la case ou afficher l'image entière"
              onClick={() => props.onCellChange(cell.id, { fit: cell.fit === 'cover' ? 'contain' : 'cover', zoom: 1, ox: 0, oy: 0 })}
            >
              {cell.fit === 'cover' ? 'Remplir' : 'Entière'}
            </button>
            <button className="tb-btn" title="Recentrer" onClick={() => props.onCellChange(cell.id, { zoom: 1, ox: 0, oy: 0 })}>
              <Icon d={ICONS.center} size={15} />
            </button>
            <button className="tb-btn text" title="Adapter la case au ratio de la photo" onClick={() => props.onCellRatio(cell.id, imageRatio(asset, cell))}>
              Ratio photo
            </button>
            <span className="tb-sep" />
            <button className="tb-btn danger" title="Retirer l'image" onClick={() => props.onCellChange(cell.id, { imageId: null })}>
              ×
            </button>
          </>
        ) : (
          <button className="tb-btn text" onClick={() => props.onPick(cell.id)}>
            + Ajouter une image
          </button>
        )}
      </div>
    </>
  );
}

function TextView(props: {
  t: TextItem;
  doc: Doc;
  s: number;
  selected: boolean;
  preview: boolean;
  onSelect: Props['onSelectText'];
  onChange: Props['onTextChange'];
  setGuide: (v: boolean) => void;
}) {
  const { t, doc, s, selected } = props;
  const b = doc.bleed;
  const frac = t.align === 'left' ? 0 : t.align === 'center' ? 0.5 : 1;
  const live = useRef(props);
  live.current = props;

  const onPointerDown = (e: RPointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    props.onSelect(t.id);
    const sx = e.clientX;
    const sy = e.clientY;
    const x0 = t.x;
    const y0 = t.y;
    const move = (ev: PointerEvent) => {
      const { doc, s } = live.current;
      let nx = x0 + (ev.clientX - sx) / s / doc.width;
      const ny = y0 + (ev.clientY - sy) / s / doc.height;
      const snap = !ev.altKey && t.align === 'center' && Math.abs((nx - 0.5) * doc.width * s) < 6;
      if (snap) nx = 0.5;
      live.current.setGuide(snap);
      live.current.onChange(t.id, { x: clamp(nx, -0.2, 1.2), y: clamp(ny, -0.2, 1.2) }, 'move-' + t.id);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      live.current.setGuide(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className={cls('text-item', selected && 'selected')}
      style={{
        left: (b + t.x * doc.width) * s,
        top: (b + t.y * doc.height) * s,
        transform: `translateX(${-frac * 100}%)`,
        padding: t.bg ? t.padding * s : 0,
        background: t.bg ?? 'transparent',
        fontFamily: `"${t.font}"`,
        fontSize: t.size * s,
        fontWeight: t.weight,
        fontStyle: t.italic ? 'italic' : 'normal',
        color: t.color,
        lineHeight: t.lineHeight,
        letterSpacing: `${t.letterSpacing}em`,
        textAlign: t.align,
        textTransform: t.uppercase ? 'uppercase' : 'none',
        textShadow: t.shadow ? `0 ${0.4 * s}px ${1.6 * s}px rgba(0,0,0,0.55)` : 'none',
      }}
      onPointerDown={onPointerDown}
    >
      {t.content || ' '}
    </div>
  );
}
