import { useEffect, useState } from 'react';
import type { Align, Cell, Doc, ImageAsset, Rot, SavedLayout, ShapeItem, ShapeKind, TextItem } from './types';
import { SHAPES, SHAPE_KINDS, newShape } from './shapes';
import { ShapeSvg } from './Poster';
import {
  FONTS, FORMATS, RATIOS, TEMPLATES, THEMES, applyTheme, cellDpi, cellRect, changeFormat, extendToBleed, fillHoles, holeCount,
  imageRatio, newText, ones, pageWithRatio, ratioLabel, regularSpecs, withGrid, type Template,
} from './layout';
import { exportSize, type ExportOpts } from './render';
import { ColorField, Icon, ICONS, Section, Seg, Slider, Toggle, cls } from './ui';

type Commit = (fn: (d: Doc) => Doc, key?: string) => void;

/* ---------------- Choix de ratio ---------------- */

export function RatioPicker(props: { current: number; onPick: (r: number) => void; extra?: { label: string; value: number }[] }) {
  const [a, setA] = useState(4);
  const [b, setB] = useState(5);
  const list = [...(props.extra ?? []), ...RATIOS];
  return (
    <>
      <div className="chips">
        {list.map((r) => (
          <button
            key={r.label}
            className={cls('chip', Math.abs(r.value - props.current) / r.value < 0.006 && 'on')}
            onClick={() => props.onPick(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="ratio-custom">
        <span>Personnalisé</span>
        <input type="number" min={0.1} step={0.1} value={a} onChange={(e) => setA(Number(e.target.value))} />
        <b>:</b>
        <input type="number" min={0.1} step={0.1} value={b} onChange={(e) => setB(Number(e.target.value))} />
        <button className="ghost" disabled={!(a > 0 && b > 0)} onClick={() => props.onPick(a / b)}>
          OK
        </button>
      </div>
    </>
  );
}

/* ---------------- Format ---------------- */

export function FormatPanel({ doc, commit }: { doc: Doc; commit: Commit }) {
  const portrait = doc.width <= doc.height;
  const [cw, setCw] = useState(doc.width);
  const [ch, setCh] = useState(doc.height);
  useEffect(() => {
    setCw(doc.width);
    setCh(doc.height);
  }, [doc.width, doc.height]);

  return (
    <>
      <Section title="Format d'impression">
        <div className="format-grid">
          {FORMATS.map((f) => {
            const w = portrait ? Math.min(f.w, f.h) : Math.max(f.w, f.h);
            const h = portrait ? Math.max(f.w, f.h) : Math.min(f.w, f.h);
            return (
              <button key={f.id} className={cls('format-btn', doc.formatId === f.id && 'on')} onClick={() => commit((d) => changeFormat(d, w, h, f.id))}>
                <strong>{f.label}</strong>
                <small>
                  {f.w / 10} × {f.h / 10} cm
                </small>
              </button>
            );
          })}
        </div>
        <Seg
          options={[
            { value: 'p', label: 'Portrait' },
            { value: 'l', label: 'Paysage' },
          ]}
          value={portrait ? 'p' : 'l'}
          onChange={(v) => {
            if ((v === 'p') !== portrait) commit((d) => changeFormat(d, d.height, d.width, d.formatId));
          }}
        />
      </Section>
      <Section title={`Ratio de la page (actuel ${ratioLabel(doc.width / doc.height)})`}>
        <RatioPicker
          current={doc.width / doc.height}
          extra={[
            { label: 'A (1:√2)', value: 1 / Math.SQRT2 },
            { label: 'Bannière 3:1', value: 3 },
          ]}
          onPick={(r) => commit((d) => pageWithRatio(d, r))}
        />
        <p className="hint">La largeur est conservée, la hauteur s'adapte.</p>
      </Section>
      <Section title="Format personnalisé (mm)">
        <div className="grid2">
          <label className="mini">
            Largeur
            <input type="number" min={50} max={2000} value={cw} onChange={(e) => setCw(Number(e.target.value))} />
          </label>
          <label className="mini">
            Hauteur
            <input type="number" min={50} max={2000} value={ch} onChange={(e) => setCh(Number(e.target.value))} />
          </label>
        </div>
        <button
          className="ghost full"
          disabled={!(cw >= 50 && ch >= 50 && cw <= 2000 && ch <= 2000) || (cw === doc.width && ch === doc.height)}
          onClick={() => commit((d) => changeFormat(d, cw, ch, 'custom'))}
        >
          Appliquer {cw} × {ch} mm
        </button>
      </Section>
      <Section title="Fonds perdus">
        <Seg
          options={[
            { value: 0, label: 'Aucun' },
            { value: 3, label: '3 mm' },
            { value: 5, label: '5 mm' },
          ]}
          value={doc.bleed}
          onChange={(v) => commit((d) => ({ ...d, bleed: v }))}
        />
        <p className="hint">
          Les imprimeurs demandent en général 3 mm de fonds perdus : les images collées au bord dépassent du format pour éviter les liserés
          blancs après la coupe. La zone rouge sur le poster sera coupée.
        </p>
      </Section>
      <Section title="Fond">
        <ColorField label="Couleur de fond" value={doc.background} onChange={(v) => commit((d) => ({ ...d, background: v }), 'bg')} />
      </Section>
      <div className="info-box">
        Format fini : <strong>{doc.width} × {doc.height} mm</strong>
        {doc.bleed > 0 && (
          <>
            <br />
            Avec fonds perdus : {doc.width + 2 * doc.bleed} × {doc.height + 2 * doc.bleed} mm
          </>
        )}
      </div>
    </>
  );
}

/* ---------------- Grille ---------------- */

function TemplateThumb({ t, ratio }: { t: Template; ratio: number }) {
  const W = 60;
  const H = Math.round(60 * ratio);
  const g = 3;
  const cw = (W - g * (t.cols + 1)) / t.cols;
  const rh = (H - g * (t.rows + 1)) / t.rows;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tpl-svg">
      <rect width={W} height={H} rx={2} className="tpl-bg" />
      {t.cells.map(([c, r, cs, rs], i) => (
        <rect key={i} x={g + c * (cw + g)} y={g + r * (rh + g)} width={cs * cw + (cs - 1) * g} height={rs * rh + (rs - 1) * g} rx={1.5} className="tpl-cell" />
      ))}
    </svg>
  );
}

export function GridPanel(props: {
  doc: Doc;
  commit: Commit;
  selectedCells: string[];
  onMerge: () => void;
  onSplit: (id: string) => void;
}) {
  const { doc, commit } = props;
  const ratio = Math.min(1.6, Math.max(0.6, doc.height / doc.width));
  const holes = holeCount(doc);
  const single = props.selectedCells.length === 1 ? doc.cells.find((c) => c.id === props.selectedCells[0]) : undefined;
  const maxV = Math.round(doc.height / 2);

  return (
    <>
      <Section title="Modèles de mise en page">
        <div className="tpl-grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="tpl"
              title={t.label}
              onClick={() => commit((d) => withGrid(d, t.cols, t.rows, t.cells))}
            >
              <TemplateThumb t={t} ratio={ratio} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Grille régulière">
        <Slider
          label="Colonnes"
          value={doc.cols}
          min={1}
          max={8}
          onChange={(v) => commit((d) => withGrid(d, v, d.rows, regularSpecs(v, d.rows)), 'cols')}
        />
        <Slider
          label="Lignes"
          value={doc.rows}
          min={1}
          max={8}
          onChange={(v) => commit((d) => withGrid(d, d.cols, v, regularSpecs(d.cols, v)), 'rows')}
        />
        <p className="hint">Cliquez une photo puis tirez les poignées sur ses bords pour élargir ou réduire colonnes et lignes.</p>
        <button
          className="ghost full"
          disabled={doc.colSizes.every((v) => v === doc.colSizes[0]) && doc.rowSizes.every((v) => v === doc.rowSizes[0])}
          onClick={() => commit((d) => ({ ...d, colSizes: ones(d.cols), rowSizes: ones(d.rows) }))}
        >
          Égaliser colonnes et lignes
        </button>
      </Section>
      <Section title="Fusionner / diviser">
        <p className="hint">Maj + clic (ou Ctrl + clic) sur plusieurs cases voisines, puis « Fusionner ».</p>
        <div className="btn-row">
          <button className="ghost" disabled={props.selectedCells.length < 2} onClick={props.onMerge}>
            Fusionner ({props.selectedCells.length})
          </button>
          <button className="ghost" disabled={!single || (single.cs === 1 && single.rs === 1)} onClick={() => single && props.onSplit(single.id)}>
            Diviser
          </button>
        </div>
        {holes > 0 && (
          <button className="ghost full" onClick={() => commit((d) => ({ ...d, cells: fillHoles(d) }))}>
            Combler les {holes} emplacement{holes > 1 ? 's' : ''} vide{holes > 1 ? 's' : ''}
          </button>
        )}
      </Section>
      <Section title="Espacements (mm)">
        <Slider label="Entre les images" value={doc.gap} min={0} max={40} step={0.5} unit="mm" onChange={(v) => commit((d) => ({ ...d, gap: v }), 'gap')} />
        <Slider label="Marges côtés" value={doc.marginX} min={0} max={Math.round(doc.width / 3)} step={0.5} unit="mm" onChange={(v) => commit((d) => ({ ...d, marginX: v }), 'mx')} />
        <Slider label="Marge haut" value={doc.marginTop} min={0} max={maxV} step={0.5} unit="mm" onChange={(v) => commit((d) => ({ ...d, marginTop: v }), 'mt')} />
        <Slider label="Marge bas" value={doc.marginBottom} min={0} max={maxV} step={0.5} unit="mm" onChange={(v) => commit((d) => ({ ...d, marginBottom: v }), 'mb')} />
        <div className="btn-row">
          <button className="ghost" onClick={() => commit((d) => ({ ...d, gap: 0, marginX: 0, marginTop: 0, marginBottom: 0 }))}>
            Bord à bord
          </button>
          <button
            className="ghost"
            onClick={() => {
              const m = Math.round(Math.min(doc.width, doc.height) * 0.05);
              commit((d) => ({ ...d, gap: Math.round(m / 3), marginX: m, marginTop: m, marginBottom: m }));
            }}
          >
            Marges égales
          </button>
        </div>
      </Section>
      <Section title="Style des cases">
        <Slider label="Coins arrondis" value={doc.radius} min={0} max={40} step={0.5} unit="mm" onChange={(v) => commit((d) => ({ ...d, radius: v }), 'radius')} />
        <Slider label="Bordure" value={doc.borderWidth} min={0} max={10} step={0.25} unit="mm" onChange={(v) => commit((d) => ({ ...d, borderWidth: v }), 'bw')} />
        {doc.borderWidth > 0 && <ColorField label="Couleur de bordure" value={doc.borderColor} onChange={(v) => commit((d) => ({ ...d, borderColor: v }), 'bc')} />}
      </Section>
    </>
  );
}

/* ---------------- Mes modèles (mises en page enregistrées) ---------------- */

function LayoutThumb({ L }: { L: SavedLayout }) {
  const W = 60;
  const H = Math.round((60 * L.format.height) / L.format.width);
  const pseudo = {
    width: L.format.width, height: L.format.height, cols: L.cols, rows: L.rows, colSizes: L.colSizes, rowSizes: L.rowSizes,
    gap: L.gap, marginX: L.marginX, marginTop: L.marginTop, marginBottom: L.marginBottom,
  } as Doc;
  const k = W / L.format.width;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tpl-svg">
      <rect width={W} height={H} rx={2} fill={L.background} />
      {L.cells.map(([c, r, cs, rs], i) => {
        const rc = cellRect(pseudo, { c, r, cs, rs } as Cell);
        return <rect key={i} x={rc.x * k} y={rc.y * k} width={rc.w * k} height={rc.h * k} rx={1} className="tpl-cell" />;
      })}
    </svg>
  );
}

export function LayoutsSection(props: {
  layouts: SavedLayout[];
  defaultId: string | null;
  onSave: (name: string, withFormat: boolean, withTexts: boolean) => void;
  onApply: (L: SavedLayout) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [withFormat, setWithFormat] = useState(true);
  const [withTexts, setWithTexts] = useState(false);
  return (
    <Section title={`Mes modèles (${props.layouts.length})`}>
      {open ? (
        <div className="save-layout">
          <input autoFocus placeholder="Nom du modèle (ex. Affiche cinéma)" value={name} onChange={(e) => setName(e.target.value)} />
          <div style={{ marginTop: 10 }}>
            <Toggle label="Inclure le format de page" checked={withFormat} onChange={setWithFormat} />
            <Toggle label="Inclure les textes et formes" checked={withTexts} onChange={setWithTexts} />
          </div>
          <div className="btn-row">
            <button className="ghost" onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button
              className="primary"
              disabled={!name.trim()}
              onClick={() => {
                props.onSave(name.trim(), withFormat, withTexts);
                setOpen(false);
                setName('');
              }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <button className="primary full" style={{ marginTop: 0, marginBottom: 10 }} onClick={() => setOpen(true)}>
          Enregistrer cette grille comme modèle
        </button>
      )}
      <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
        Le modèle garde la grille, les tailles de cases, les marges, les bordures et le fond. ★ = utilisé pour chaque nouveau poster.
      </p>
      <div className="layout-list">
        {props.layouts.map((L) => (
          <div key={L.id} className="layout-row">
            <LayoutThumb L={L} />
            <div className="layout-info">
              <strong>{L.name}</strong>
              <small>
                {L.cols}×{L.rows} · {L.cells.length} cases{L.useFormat ? ` · ${L.format.width}×${L.format.height} mm` : ''}
                {L.texts ? ' · textes' : ''}
              </small>
            </div>
            <button
              className={cls('star', props.defaultId === L.id && 'on')}
              title={props.defaultId === L.id ? 'Ne plus utiliser par défaut' : 'Utiliser pour chaque nouveau poster'}
              onClick={() => props.onSetDefault(props.defaultId === L.id ? null : L.id)}
            >
              ★
            </button>
            <button className="sm" onClick={() => props.onApply(L)}>
              Appliquer
            </button>
            <button className="sm ghost danger" title="Supprimer" onClick={() => confirm(`Supprimer le modèle « ${L.name} » ?`) && props.onDelete(L.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Formes ---------------- */

export function ShapesSection({ onAdd }: { onAdd: (k: ShapeKind) => void }) {
  return (
    <Section title="Formes et badges">
      <div className="shape-grid">
        {SHAPE_KINDS.map((k) => {
          const sh = newShape(k, { rot: 0 });
          const def = SHAPES[k];
          return (
            <button key={k} className="shape-btn" onClick={() => onAdd(k)}>
              <span className="shape-prev">
                <div style={{ aspectRatio: `${def.bw} / ${def.bh}`, maxHeight: 40, width: def.bw > def.bh ? '100%' : 40 }}>
                  <ShapeSvg sh={sh} />
                </div>
              </span>
              {def.label}
            </button>
          );
        })}
      </div>
      <p className="hint">Idéal pour signaler les « NEW » films. Déplacez la forme à la souris ; poignées pour la taille et la rotation.</p>
    </Section>
  );
}

export function ShapeInspector(props: {
  sh: ShapeItem;
  update: (p: Partial<ShapeItem>, key?: string) => void;
  canAttach: boolean;
  onAttach: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFront: () => void;
}) {
  const { sh, update } = props;
  const k = (n: string) => `${n}-${sh.id}`;
  return (
    <>
      <Section title="Forme">
        <div className="chips">
          {SHAPE_KINDS.map((kind) => (
            <button key={kind} className={cls('chip', sh.kind === kind && 'on')} onClick={() => update({ kind })}>
              {SHAPES[kind].label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Texte de la forme">
        <textarea rows={2} value={sh.text} placeholder="NEW" onChange={(e) => update({ text: e.target.value }, k('text'))} />
        <div className="chips" style={{ margin: '8px 0 12px' }}>
          {['NEW', 'NOUVEAU', 'BIENTÔT', 'EXCLU', '-50%', 'AVANT-PREMIÈRE'].map((t) => (
            <button key={t} className="chip" onClick={() => update({ text: t })}>
              {t}
            </button>
          ))}
        </div>
        <div className="field">
          <select value={sh.font} onChange={(e) => update({ font: e.target.value })} style={{ fontFamily: `"${sh.font}"` }}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="grid2">
          <select value={sh.weight} onChange={(e) => update({ weight: Number(e.target.value) })}>
            {[400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                Graisse {w}
              </option>
            ))}
          </select>
          <span />
        </div>
        <Slider label="Taille du texte" value={sh.textScale * 100} min={30} max={250} unit="%" onChange={(v) => update({ textScale: v / 100 }, k('ts'))} />
        <ColorField label="Couleur du texte" value={sh.textColor} onChange={(v) => update({ textColor: v }, k('tc'))} />
      </Section>
      <Section title="Apparence">
        <ColorField label="Couleur de la forme" value={sh.fill} onChange={(v) => update({ fill: v }, k('fill'))} />
        <Slider label="Largeur" value={sh.w} min={8} max={600} step={0.5} unit="mm" onChange={(v) => update({ w: v }, k('w'))} />
        <Slider label="Rotation" value={sh.rot} min={-180} max={180} unit="°" onChange={(v) => update({ rot: v }, k('rot'))} />
        <div className="chips" style={{ marginBottom: 12 }}>
          {[-45, -15, 0, 15, 45, 90].map((r) => (
            <button key={r} className={cls('chip', sh.rot === r && 'on')} onClick={() => update({ rot: r })}>
              {r}°
            </button>
          ))}
        </div>
        <Toggle label="Ombre portée" checked={sh.shadow} onChange={(v) => update({ shadow: v })} />
        <Toggle
          label="Découper aux bords de la photo"
          checked={!!sh.cellId}
          disabled={!sh.cellId && !props.canAttach}
          onChange={(v) => (v ? props.onAttach() : update({ cellId: null }))}
        />
        {!sh.cellId && !props.canAttach && <p className="hint">Placez le centre de la forme sur une photo pour pouvoir la découper.</p>}
      </Section>
      <Section title="Position">
        <Slider label="Horizontal" value={sh.x * 100} min={0} max={100} step={0.5} unit="%" onChange={(v) => update({ x: v / 100 }, k('x'))} />
        <Slider label="Vertical" value={sh.y * 100} min={0} max={100} step={0.5} unit="%" onChange={(v) => update({ y: v / 100 }, k('y'))} />
        <div className="btn-row">
          <button className="ghost" onClick={props.onFront}>
            Premier plan
          </button>
          <button className="ghost" onClick={props.onDuplicate}>
            Dupliquer
          </button>
          <button className="ghost danger" onClick={props.onDelete}>
            Supprimer
          </button>
        </div>
      </Section>
    </>
  );
}

/* ---------------- Images ---------------- */

export function ImagesPanel(props: {
  doc: Doc;
  images: ImageAsset[];
  onBrowse: () => void;
  onFiles: (f: File[]) => void;
  onAssign: (imageId: string) => void;
  onRemove: (imageId: string) => void;
  onAutoFill: () => void;
  onShuffle: () => void;
  onClearCells: () => void;
  hasCellSelected: boolean;
}) {
  const used = new Set(props.doc.cells.map((c) => c.imageId).filter(Boolean));
  const empty = props.doc.cells.filter((c) => !c.imageId).length;
  const [over, setOver] = useState(false);
  return (
    <>
      <div
        className={cls('dropzone', over && 'over')}
        onClick={props.onBrowse}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          props.onFiles([...e.dataTransfer.files]);
        }}
      >
        <Icon d={ICONS.image} size={28} />
        <strong>Ajouter des images</strong>
        <span>Glissez vos photos ici ou cliquez. Elles remplissent les cases vides.</span>
      </div>
      <div className="btn-row">
        <button className="ghost" disabled={!empty || !props.images.length} onClick={props.onAutoFill}>
          Remplir les vides
        </button>
        <button className="ghost" disabled={used.size < 2} onClick={props.onShuffle}>
          Mélanger
        </button>
        <button className="ghost" disabled={!used.size} onClick={props.onClearCells}>
          Vider
        </button>
      </div>
      <Section title={`Bibliothèque (${props.images.length})`}>
        {props.images.length === 0 ? (
          <p className="hint">Aucune image pour l'instant.</p>
        ) : (
          <>
            <p className="hint">
              Glissez une miniature sur une case{props.hasCellSelected ? ', ou cliquez-la pour la placer dans la case sélectionnée' : ''}.
            </p>
            <div className="lib">
              {props.images.map((a) => (
                <div
                  key={a.id}
                  className={cls('thumb', used.has(a.id) && 'used')}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-img', a.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => props.hasCellSelected && props.onAssign(a.id)}
                  title={`${a.name} — ${a.w} × ${a.h} px`}
                >
                  <img src={a.url} alt="" draggable={false} />
                  {used.has(a.id) && <span className="used-dot">✓</span>}
                  <button
                    className="thumb-del"
                    title="Supprimer de la bibliothèque"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onRemove(a.id);
                    }}
                  >
                    ×
                  </button>
                  <span className="thumb-px">{(a.w * a.h / 1e6).toFixed(1)} Mpx</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>
    </>
  );
}

/* ---------------- Textes ---------------- */

export function TextsPanel(props: { doc: Doc; commit: Commit; selectedText: string | null; onSelect: (id: string) => void }) {
  const { doc, commit } = props;
  const add = (p: Partial<TextItem>) => {
    const t = newText({ color: doc.texts[0]?.color ?? '#1a1a1a', ...p });
    commit((d) => ({ ...d, texts: [...d.texts, t] }));
    props.onSelect(t.id);
  };
  const k = Math.min(doc.width, doc.height) / 297;
  return (
    <>
      <Section title="Ajouter">
        <div className="add-grid">
          <button className="add-btn" onClick={() => add({ content: 'GRAND TITRE', size: 28 * k, font: 'Bebas Neue', weight: 400, y: 0.08, lineHeight: 1 })}>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 22 }}>Titre</span>
          </button>
          <button className="add-btn" onClick={() => add({ content: 'Sous-titre', size: 8 * k, font: 'Montserrat', weight: 600, y: 0.18, uppercase: true, letterSpacing: 0.25 })}>
            <span style={{ fontFamily: 'Montserrat', fontWeight: 600, fontSize: 11, letterSpacing: '0.2em' }}>SOUS-TITRE</span>
          </button>
          <button className="add-btn" onClick={() => add({ content: 'Votre texte ici.\nDeuxième ligne.', size: 4.5 * k, font: 'Inter', weight: 400, y: 0.5, lineHeight: 1.4 })}>
            <span style={{ fontFamily: 'Inter', fontSize: 12 }}>Paragraphe</span>
          </button>
          <button
            className="add-btn"
            onClick={() => add({ content: 'BANDEAU', size: 9 * k, font: 'Oswald', weight: 600, y: 0.45, bg: '#e30613', color: '#ffffff', padding: 4 * k, letterSpacing: 0.1 })}
          >
            <span className="band-prev">BANDEAU</span>
          </button>
        </div>
      </Section>
      <Section title={`Textes du poster (${doc.texts.length})`}>
        {doc.texts.length === 0 && <p className="hint">Aucun texte.</p>}
        <div className="text-list">
          {doc.texts.map((t) => (
            <button key={t.id} className={cls('text-row', props.selectedText === t.id && 'on')} onClick={() => props.onSelect(t.id)}>
              <span className="text-row-swatch" style={{ background: t.color }} />
              <span className="text-row-label" style={{ fontFamily: `"${t.font}"` }}>
                {t.content.split('\n')[0] || '(vide)'}
              </span>
              <small>{t.size.toFixed(0)} mm</small>
            </button>
          ))}
        </div>
        <p className="hint">Déplacez les textes à la souris sur le poster. Ils s'aimantent au centre (Alt pour désactiver).</p>
      </Section>
      <Section title="Thèmes">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button key={t.id} className="theme" style={{ background: t.bg }} onClick={() => commit((d) => applyTheme(d, t))}>
              <span style={{ fontFamily: `"${t.title.font}"`, fontWeight: t.title.weight, color: t.title.color }}>Aa</span>
              <small style={{ color: t.body.color, fontFamily: `"${t.body.font}"` }}>{t.label}</small>
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ---------------- Export ---------------- */

export type ExportType = 'pdf' | 'png' | 'jpg' | 'docx';

/** Word n'accepte pas de page plus grande que 22 pouces (558 mm). */
export const WORD_MAX_MM = 558;

export function ExportPanel(props: {
  doc: Doc;
  images: Record<string, ImageAsset>;
  opts: ExportOpts;
  setOpts: (o: ExportOpts) => void;
  type: ExportType;
  setType: (t: ExportType) => void;
  busy: boolean;
  onExport: () => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
  onNewProject: () => void;
}) {
  const { doc, opts, setOpts } = props;
  const z = exportSize(doc, opts);
  const mpx = (z.wPx * z.hPx) / 1e6;
  const low = doc.cells.filter((c) => c.imageId && props.images[c.imageId] && cellDpi(doc, c, props.images[c.imageId]) < 150).length;
  const empty = doc.cells.filter((c) => !c.imageId).length;
  return (
    <>
      <Section title="Fichier">
        <Seg
          options={[
            { value: 'pdf', label: 'PDF' },
            { value: 'png', label: 'PNG' },
            { value: 'jpg', label: 'JPEG' },
            { value: 'docx', label: 'Word' },
          ]}
          value={props.type}
          onChange={props.setType}
        />
        <p className="hint">
          {props.type === 'pdf'
            ? 'PDF à la taille exacte du poster : le plus simple pour un imprimeur.'
            : props.type === 'png'
              ? 'PNG sans perte, résolution inscrite dans le fichier.'
              : props.type === 'jpg'
                ? 'JPEG qualité maximale, fichier plus léger que le PNG.'
                : 'Document Word (.docx) : le poster occupe toute la page, sans marges, à la taille du format. Imprimez depuis Word en « taille réelle ».'}
        </p>
        {props.type === 'docx' && Math.max(z.wMm, z.hMm) > WORD_MAX_MM && (
          <div className="info-box warn">
            Word limite les pages à {WORD_MAX_MM} mm. Le poster sera réduit à l'échelle ({Math.round((WORD_MAX_MM / Math.max(z.wMm, z.hMm)) * 100)} %) dans le
            document. Pour imprimer en taille réelle, préférez le PDF.
          </div>
        )}
      </Section>
      <Section title="Résolution">
        <Seg
          options={[
            { value: 100, label: '100 DPI', title: 'Brouillon / écran' },
            { value: 150, label: '150 DPI', title: 'Grand format vu de loin' },
            { value: 300, label: '300 DPI', title: 'Qualité imprimerie' },
          ]}
          value={opts.dpi}
          onChange={(v) => setOpts({ ...opts, dpi: v })}
        />
        <div className={cls('info-box', mpx > 120 && 'warn')}>
          {z.wPx} × {z.hPx} px · {mpx.toFixed(1)} Mpx
          {mpx > 120 && (
            <>
              <br />
              Très grande image : si l'export échoue, passez à 150 DPI.
            </>
          )}
        </div>
      </Section>
      <Section title="Netteté des photos">
        <Seg
          options={[
            { value: 0, label: 'Aucune', title: 'Photos telles quelles' },
            { value: 1, label: 'Légère', title: 'Recommandé pour l’impression' },
            { value: 2, label: 'Forte', title: 'Photos un peu floues ou grand format' },
          ]}
          value={opts.sharpen}
          onChange={(v) => setOpts({ ...opts, sharpen: v })}
        />
        <p className="hint">Chaque photo est redimensionnée à sa taille d'impression exacte puis accentuée pour compenser l'adoucissement de l'encre sur le papier.</p>
      </Section>
      <Section title="Repères d'impression">
        <Toggle label={`Inclure les fonds perdus (${doc.bleed} mm)`} checked={opts.bleed && doc.bleed > 0} disabled={doc.bleed === 0} onChange={(v) => setOpts({ ...opts, bleed: v })} />
        <Toggle label="Traits de coupe" checked={opts.cropMarks} onChange={(v) => setOpts({ ...opts, cropMarks: v })} />
      </Section>
      <Section title="Vérification">
        <ul className="checks">
          <li className={low ? 'bad' : 'ok'}>{low ? `${low} image${low > 1 ? 's' : ''} sous 150 DPI (risque de flou)` : 'Résolution des images correcte'}</li>
          <li className={empty ? 'mid' : 'ok'}>{empty ? `${empty} case${empty > 1 ? 's' : ''} vide${empty > 1 ? 's' : ''} (ne seront pas imprimées)` : 'Toutes les cases ont une image'}</li>
          <li className="ok">
            Format {doc.width} × {doc.height} mm
          </li>
        </ul>
      </Section>
      <button className="primary big full" disabled={props.busy} onClick={props.onExport}>
        <Icon d={ICONS.export} /> {props.busy ? 'Rendu en cours…' : `Exporter en ${props.type.toUpperCase()}`}
      </button>
      <Section title="Projet">
        <div className="btn-row">
          <button className="ghost" onClick={props.onSaveProject}>
            Enregistrer (.json)
          </button>
          <button className="ghost" onClick={props.onOpenProject}>
            Ouvrir…
          </button>
        </div>
        <button className="ghost full danger" onClick={props.onNewProject}>
          Nouveau poster
        </button>
        <p className="hint">Le projet est sauvegardé automatiquement dans ce navigateur. Le fichier .json contient aussi les images, pour le reprendre sur un autre appareil.</p>
      </Section>
    </>
  );
}

/* ---------------- Inspecteur ---------------- */

export function CellInspector(props: {
  doc: Doc;
  cell: Cell;
  asset?: ImageAsset;
  update: (patch: Partial<Cell>, key?: string) => void;
  onPick: () => void;
  onSplit: () => void;
  onRemoveCell: () => void;
  onFiltersAll: () => void;
  onRatio: (r: number) => void;
}) {
  const { doc, cell, asset, update } = props;
  const k = (n: string) => `${n}-${cell.id}`;
  const trim = cellRect(doc, cell);
  const r = extendToBleed(doc, trim);
  const dpi = asset ? cellDpi(doc, cell, asset) : 0;
  const q = dpi >= 250 ? 'ok' : dpi >= 150 ? 'mid' : 'bad';
  return (
    <>
      <Section title="Case">
        <div className="kv">
          {Math.round(r.w)} × {Math.round(r.h)} mm{cell.cs > 1 || cell.rs > 1 ? ` · ${cell.cs}×${cell.rs} cases fusionnées` : ''}
        </div>
        <div className="btn-row">
          <button className="ghost" onClick={props.onPick}>
            {asset ? 'Remplacer' : 'Ajouter une image'}
          </button>
          {asset && (
            <button className="ghost" onClick={() => update({ imageId: null })}>
              Retirer
            </button>
          )}
        </div>
        <div className="btn-row">
          {(cell.cs > 1 || cell.rs > 1) && (
            <button className="ghost" onClick={props.onSplit}>
              Diviser
            </button>
          )}
          <button className="ghost danger" onClick={props.onRemoveCell}>
            Supprimer la case
          </button>
        </div>
      </Section>
      <Section title={`Taille et ratio (actuel ${ratioLabel(trim.w / trim.h)})`}>
        {asset && (
          <button className="primary full ratio-photo" onClick={() => props.onRatio(imageRatio(asset, cell))}>
            Adapter la case à la photo ({ratioLabel(imageRatio(asset, cell))})
          </button>
        )}
        <RatioPicker current={trim.w / trim.h} onPick={props.onRatio} />
        <p className="hint">
          Les lignes ou colonnes voisines s'adaptent. Vous pouvez aussi tirer les poignées <b className="accent">●</b> sur les bords de la case.
        </p>
      </Section>
      {asset && (
        <>
          <Section title="Cadrage">
            <Seg
              options={[
                { value: 'cover', label: 'Remplir la case' },
                { value: 'contain', label: 'Image entière' },
              ]}
              value={cell.fit}
              onChange={(v) => update({ fit: v, zoom: 1, ox: 0, oy: 0 })}
            />
            <Slider label="Zoom" value={cell.zoom} min={0.3} max={8} step={0.01} unit="×" onChange={(v) => update({ zoom: v }, k('zoom'))} />
            <Slider label="Position horizontale" value={cell.ox * 100} min={-100} max={100} step={1} unit="%" onChange={(v) => update({ ox: v / 100 }, k('ox'))} />
            <Slider label="Position verticale" value={cell.oy * 100} min={-100} max={100} step={1} unit="%" onChange={(v) => update({ oy: v / 100 }, k('oy'))} />
            <div className="icon-row">
              <button title="Rotation à gauche" onClick={() => update({ rot: ((cell.rot + 270) % 360) as Rot, zoom: 1, ox: 0, oy: 0 })}>
                <Icon d={ICONS.rotL} />
              </button>
              <button title="Rotation à droite" onClick={() => update({ rot: ((cell.rot + 90) % 360) as Rot, zoom: 1, ox: 0, oy: 0 })}>
                <Icon d={ICONS.rotR} />
              </button>
              <button title="Miroir" className={cls(cell.flipX && 'on')} onClick={() => update({ flipX: !cell.flipX })}>
                <Icon d={ICONS.flip} />
              </button>
              <button title="Recentrer" onClick={() => update({ zoom: 1, ox: 0, oy: 0 })}>
                <Icon d={ICONS.center} />
              </button>
            </div>
            <p className="hint">Sur le poster : glissez l'image pour la recadrer, molette pour zoomer, poignée ⇄ pour l'échanger avec une autre case.</p>
          </Section>
          <Section
            title="Retouche"
            right={
              <button className="link" onClick={() => update({ brightness: 1, contrast: 1, saturate: 1, grayscale: 0 })}>
                Réinitialiser
              </button>
            }
          >
            <Slider label="Luminosité" value={cell.brightness * 100} min={30} max={170} unit="%" onChange={(v) => update({ brightness: v / 100 }, k('br'))} />
            <Slider label="Contraste" value={cell.contrast * 100} min={30} max={170} unit="%" onChange={(v) => update({ contrast: v / 100 }, k('ct'))} />
            <Slider label="Saturation" value={cell.saturate * 100} min={0} max={200} unit="%" onChange={(v) => update({ saturate: v / 100 }, k('st'))} />
            <Slider label="Noir et blanc" value={cell.grayscale * 100} min={0} max={100} unit="%" onChange={(v) => update({ grayscale: v / 100 }, k('gs'))} />
            <button className="ghost full" onClick={props.onFiltersAll}>
              Appliquer ces retouches à toutes les images
            </button>
          </Section>
          <Section title="Qualité d'impression">
            <div className={cls('quality', q)}>
              <strong>{Math.round(dpi)} DPI</strong>
              <span>{q === 'ok' ? 'Excellente' : q === 'mid' ? 'Correcte' : 'Insuffisante : risque de flou'}</span>
            </div>
            <div className="kv">
              {asset.w} × {asset.h} px · {asset.name}
            </div>
          </Section>
        </>
      )}
    </>
  );
}

export function MultiInspector({ count, onMerge, onClear }: { count: number; onMerge: () => void; onClear: () => void }) {
  return (
    <Section title={`${count} cases sélectionnées`}>
      <button className="primary full" onClick={onMerge}>
        Fusionner en une seule case
      </button>
      <button className="ghost full" onClick={onClear}>
        Retirer les images
      </button>
    </Section>
  );
}

export function TextInspector(props: {
  t: TextItem;
  update: (patch: Partial<TextItem>, key?: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t, update } = props;
  const k = (n: string) => `${n}-${t.id}`;
  return (
    <>
      <Section title="Texte">
        <textarea rows={3} value={t.content} onChange={(e) => update({ content: e.target.value }, k('content'))} />
        <div className="field">
          <div className="field-head">
            <span>Police</span>
          </div>
          <select value={t.font} onChange={(e) => update({ font: e.target.value })} style={{ fontFamily: `"${t.font}"` }}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: `"${f}"` }}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <Slider label="Taille" value={t.size} min={2} max={200} step={0.5} unit="mm" onChange={(v) => update({ size: v }, k('size'))} />
        <div className="grid2">
          <select value={t.weight} onChange={(e) => update({ weight: Number(e.target.value) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>
                Graisse {w}
              </option>
            ))}
          </select>
          <Seg<Align>
            options={[
              { value: 'left', label: '⯇', title: 'Aligner à gauche' },
              { value: 'center', label: '≡', title: 'Centrer' },
              { value: 'right', label: '⯈', title: 'Aligner à droite' },
            ]}
            value={t.align}
            onChange={(v) => update({ align: v })}
          />
        </div>
        <ColorField label="Couleur" value={t.color} onChange={(v) => update({ color: v }, k('color'))} />
        <div className="toggles">
          <Toggle label="Majuscules" checked={t.uppercase} onChange={(v) => update({ uppercase: v })} />
          <Toggle label="Italique" checked={t.italic} onChange={(v) => update({ italic: v })} />
          <Toggle label="Ombre portée" checked={t.shadow} onChange={(v) => update({ shadow: v })} />
        </div>
        <Slider label="Interlettrage" value={t.letterSpacing} min={-0.1} max={1} step={0.01} unit="em" onChange={(v) => update({ letterSpacing: v }, k('ls'))} />
        <Slider label="Interligne" value={t.lineHeight} min={0.7} max={2.5} step={0.05} onChange={(v) => update({ lineHeight: v }, k('lh'))} />
      </Section>
      <Section title="Bandeau">
        <Toggle label="Fond de couleur derrière le texte" checked={!!t.bg} onChange={(v) => update({ bg: v ? '#000000' : null })} />
        {t.bg && (
          <>
            <ColorField label="Couleur du bandeau" value={t.bg} onChange={(v) => update({ bg: v }, k('bgc'))} />
            <Slider label="Marge intérieure" value={t.padding} min={0} max={40} step={0.5} unit="mm" onChange={(v) => update({ padding: v }, k('pad'))} />
          </>
        )}
      </Section>
      <Section title="Position">
        <Slider label="Horizontal" value={t.x * 100} min={0} max={100} step={0.5} unit="%" onChange={(v) => update({ x: v / 100 }, k('x'))} />
        <Slider label="Vertical" value={t.y * 100} min={0} max={100} step={0.5} unit="%" onChange={(v) => update({ y: v / 100 }, k('y'))} />
        <div className="btn-row">
          <button className="ghost" onClick={() => update({ x: 0.5, align: 'center' })}>
            Centrer
          </button>
          <button className="ghost" onClick={props.onDuplicate}>
            Dupliquer
          </button>
          <button className="ghost danger" onClick={props.onDelete}>
            Supprimer
          </button>
        </div>
      </Section>
    </>
  );
}
