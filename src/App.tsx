import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Cell, Doc, ImageAsset, Selection, TextItem } from './types';
import type { SavedLayout, ShapeItem, ShapeKind } from './types';
import {
  applyCellRatio, applyLayout, cellRect, defaultDoc, layoutFromDoc, mergeCells, newText, normalizeDoc, sortCells, splitCell, uid,
} from './layout';
import { cellAt, newShape } from './shapes';
import { buildDocx } from './word';
import { canvasToBytes, download, fontsReady, loadImage, renderPoster, type ExportOpts } from './render';
import { idb, type StoredImage } from './db';
import { Poster } from './Poster';
import { PwaStatus } from './pwa';
import {
  CellInspector, ExportPanel, FormatPanel, GridPanel, ImagesPanel, LayoutsSection, MultiInspector, ShapeInspector, ShapesSection, TextInspector,
  TextsPanel, type ExportType,
} from './panels';
import { Icon, ICONS, Seg, cls } from './ui';

/* ---------- Historique (annuler / rétablir) ---------- */

interface Hist {
  past: Doc[];
  present: Doc;
  future: Doc[];
}

function useHistory() {
  const [h, setH] = useState<Hist>(() => ({ past: [], present: defaultDoc(), future: [] }));
  const last = useRef<{ key: string; t: number } | null>(null);
  const commit = useCallback((fn: (d: Doc) => Doc, key?: string) => {
    const now = Date.now();
    const merge = !!key && !!last.current && last.current.key === key && now - last.current.t < 1000;
    last.current = key ? { key, t: now } : null;
    setH((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      return { past: merge ? s.past : [...s.past.slice(-100), s.present], present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => {
    last.current = null;
    setH((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    last.current = null;
    setH((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);
  const reset = useCallback((d: Doc) => {
    last.current = null;
    setH({ past: [], present: d, future: [] });
  }, []);
  return { doc: h.present, canUndo: h.past.length > 0, canRedo: h.future.length > 0, commit, undo, redo, reset };
}

type Tab = 'format' | 'grid' | 'images' | 'text' | 'export';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'format', label: 'Format', icon: ICONS.format },
  { id: 'grid', label: 'Grille', icon: ICONS.grid },
  { id: 'images', label: 'Images', icon: ICONS.image },
  { id: 'text', label: 'Textes', icon: ICONS.text },
  { id: 'export', label: 'Exporter', icon: ICONS.export },
];

const IMAGE_FIELDS = ['imageId', 'fit', 'zoom', 'ox', 'oy', 'rot', 'flipX', 'brightness', 'contrast', 'saturate', 'grayscale'] as const;
type ImageFields = Pick<Cell, (typeof IMAGE_FIELDS)[number]>;
const imageFields = (c: Cell): ImageFields => Object.fromEntries(IMAGE_FIELDS.map((k) => [k, c[k]])) as ImageFields;

function blobToDataURL(b: Blob) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

/** Images d'exemple générées localement (?demo dans l'adresse). */
async function demoFiles(): Promise<File[]> {
  const palettes = [
    ['#ff7e5f', '#feb47b'], ['#2b5876', '#4e4376'], ['#11998e', '#38ef7d'],
    ['#fc466b', '#3f5efb'], ['#f7971e', '#ffd200'], ['#232526', '#7f8c8d'],
  ];
  const out: File[] = [];
  for (let i = 0; i < palettes.length; i++) {
    const c = document.createElement('canvas');
    c.width = i % 2 ? 2400 : 3600;
    c.height = i % 2 ? 3600 : 2400;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, palettes[i][0]);
    grad.addColorStop(1, palettes[i][1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.arc(c.width * (0.15 + 0.14 * k), c.height * (0.3 + 0.08 * (k % 3)), c.width * 0.06 * (1 + (k % 3)), 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.font = `bold ${c.width / 6}px sans-serif`;
    g.textAlign = 'center';
    g.fillText(String(i + 1), c.width / 2, c.height * 0.8);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9));
    out.push(new File([blob], `exemple-${i + 1}.jpg`, { type: 'image/jpeg' }));
  }
  return out;
}

export default function App() {
  const { doc, canUndo, canRedo, commit, undo, redo, reset } = useHistory();
  const [images, setImages] = useState<ImageAsset[]>([]);
  const imageMap = useMemo(() => Object.fromEntries(images.map((i) => [i.id, i])), [images]);
  const [sel, setSel] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>('images');
  const [preview, setPreview] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [stage, setStage] = useState({ w: 800, h: 600 });
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportOpts, setExportOpts] = useState<ExportOpts>({ dpi: 300, bleed: true, cropMarks: false });
  const [exportType, setExportType] = useState<ExportType>('pdf');
  const stageRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<string | null>(null);

  const say = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3500);
  }, []);

  /* ----- chargement / sauvegarde automatique ----- */
  useEffect(() => {
    (async () => {
      try {
        const [d, rows] = await Promise.all([idb.get<Doc>('kv', 'doc'), idb.all<StoredImage>('images')]);
        setImages(rows.map((r) => ({ id: r.id, name: r.name, w: r.w, h: r.h, url: URL.createObjectURL(r.blob) })));
        if (d && Array.isArray(d.cells) && typeof d.width === 'number') reset(normalizeDoc({ ...defaultDoc(), ...d }));
        if (new URLSearchParams(location.search).has('demo') && !rows.length) {
          const files = await demoFiles();
          const a = await addFilesRef.current(files);
          placeRef.current(a.map((x) => x.id));
        }
      } catch (e) {
        console.warn('Chargement local impossible', e);
      }
      setLoaded(true);
    })();
  }, [reset]);

  useEffect(() => {
    if (!loaded) return;
    setSaveState('saving');
    const t = window.setTimeout(() => {
      idb.put('kv', doc, 'doc').then(
        () => setSaveState('saved'),
        () => setSaveState('error'),
      );
    }, 500);
    return () => window.clearTimeout(t);
  }, [doc, loaded]);


  /* ----- taille de la zone de travail ----- */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const SW = preview ? doc.width : doc.width + 2 * doc.bleed;
  const SH = preview ? doc.height : doc.height + 2 * doc.bleed;
  const fit = Math.max(0.05, Math.min((stage.w - 80) / SW, (stage.h - 80) / SH));
  const scale = fit * zoom;

  /* ----- sélection valide ----- */
  useEffect(() => {
    setSel((s) => {
      if (!s) return s;
      if (s.kind === 'text') return doc.texts.some((t) => t.id === s.id) ? s : null;
      if (s.kind === 'shape') return doc.shapes.some((t) => t.id === s.id) ? s : null;
      const ids = s.ids.filter((id) => doc.cells.some((c) => c.id === id));
      return ids.length === s.ids.length ? s : ids.length ? { kind: 'cells', ids } : null;
    });
  }, [doc.cells, doc.texts, doc.shapes]);

  /* ----- opérations ----- */
  const updateCell = useCallback(
    (id: string, patch: Partial<Cell>, key?: string) => commit((d) => ({ ...d, cells: d.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)) }), key),
    [commit],
  );
  const updateText = useCallback(
    (id: string, patch: Partial<TextItem>, key?: string) => commit((d) => ({ ...d, texts: d.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), key),
    [commit],
  );

  const addFiles = useCallback(
    async (files: File[]): Promise<ImageAsset[]> => {
      const list = files.filter((f) => f.type.startsWith('image/'));
      if (files.length && !list.length) say("Ce fichier n'est pas une image reconnue (JPEG, PNG, WebP…).");
      const out: ImageAsset[] = [];
      for (const f of list) {
        const url = URL.createObjectURL(f);
        try {
          const im = await loadImage(url);
          const a: ImageAsset = { id: uid(), name: f.name, url, w: im.naturalWidth, h: im.naturalHeight };
          out.push(a);
          idb.put('images', { id: a.id, name: a.name, w: a.w, h: a.h, blob: f } satisfies StoredImage).catch(() => say('Stockage local plein : enregistrez le projet en .json.'));
        } catch {
          URL.revokeObjectURL(url);
          say(`Impossible de lire « ${f.name} » (format HEIC non pris en charge par le navigateur ?).`);
        }
      }
      if (out.length) setImages((p) => [...p, ...out]);
      return out;
    },
    [say],
  );

  /** Place des images : d'abord dans la case visée, puis dans les cases vides. */
  const placeImages = useCallback(
    (ids: string[], targetId?: string) =>
      commit((d) => {
        const queue = [...ids];
        const assign = new Map<string, string>();
        if (targetId && queue.length) assign.set(targetId, queue.shift()!);
        for (const c of sortCells(d.cells)) {
          if (!queue.length) break;
          if (!c.imageId && !assign.has(c.id)) assign.set(c.id, queue.shift()!);
        }
        if (!assign.size) return d;
        return {
          ...d,
          cells: d.cells.map((c) => (assign.has(c.id) ? { ...c, imageId: assign.get(c.id)!, zoom: 1, ox: 0, oy: 0, rot: 0, flipX: false } : c)),
        };
      }),
    [commit],
  );

  const addFilesRef = useRef(addFiles);
  addFilesRef.current = addFiles;
  const placeRef = useRef(placeImages);
  placeRef.current = placeImages;

  const onFiles = useCallback(
    async (files: File[], target?: string) => {
      const a = await addFiles(files);
      if (a.length) placeImages(a.map((x) => x.id), target);
    },
    [addFiles, placeImages],
  );

  const onDropOnCell = useCallback(
    (cellId: string, dt: DataTransfer) => {
      const from = dt.getData('application/x-cell');
      if (from) {
        if (from === cellId) return;
        commit((d) => {
          const a = d.cells.find((c) => c.id === from);
          const b = d.cells.find((c) => c.id === cellId);
          if (!a || !b) return d;
          const fa = imageFields(a);
          const fb = imageFields(b);
          return { ...d, cells: d.cells.map((c) => (c.id === from ? { ...c, ...fb } : c.id === cellId ? { ...c, ...fa } : c)) };
        });
        setSel({ kind: 'cells', ids: [cellId] });
        return;
      }
      const imgId = dt.getData('application/x-img');
      if (imgId) {
        updateCell(cellId, { imageId: imgId, zoom: 1, ox: 0, oy: 0, rot: 0, flipX: false });
        setSel({ kind: 'cells', ids: [cellId] });
        return;
      }
      if (dt.files.length) onFiles([...dt.files], cellId);
    },
    [commit, updateCell, onFiles],
  );

  const browse = (target: string | null) => {
    pickTarget.current = target;
    fileRef.current?.click();
  };

  const removeImage = (id: string) => {
    const a = imageMap[id];
    commit((d) => ({ ...d, cells: d.cells.map((c) => (c.imageId === id ? { ...c, imageId: null } : c)) }));
    setImages((p) => p.filter((x) => x.id !== id));
    idb.del('images', id).catch(() => {});
    if (a) window.setTimeout(() => URL.revokeObjectURL(a.url), 1000);
  };

  const setCellRatio = useCallback(
    (id: string, ratio: number) => {
      const c = doc.cells.find((x) => x.id === id);
      const next = c ? applyCellRatio(doc, c, ratio) : null;
      if (next) commit(() => next);
      else say('Ce ratio est impossible ici sans écraser les autres cases. Réduisez les marges ou fusionnez des cases.');
    },
    [doc, commit, say],
  );

  const merge = () => {
    if (sel?.kind !== 'cells') return;
    const res = mergeCells(doc.cells, sel.ids);
    if ('error' in res) return say(res.error);
    commit((d) => ({ ...d, cells: res.cells }));
    setSel({ kind: 'cells', ids: [res.id] });
  };

  const selectCell = useCallback((id: string, additive: boolean) => {
    setSel((s) => {
      if (additive && s?.kind === 'cells') {
        const ids = s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id];
        return ids.length ? { kind: 'cells', ids } : null;
      }
      return { kind: 'cells', ids: [id] };
    });
  }, []);
  const selectText = useCallback((id: string) => setSel({ kind: 'text', id }), []);
  const selectShape = useCallback((id: string) => setSel({ kind: 'shape', id }), []);
  const updateShape = useCallback(
    (id: string, patch: Partial<ShapeItem>, key?: string) => commit((d) => ({ ...d, shapes: d.shapes.map((t) => (t.id === id ? { ...t, ...patch } : t)) }), key),
    [commit],
  );

  const addShape = (kind: ShapeKind) => {
    const k = Math.min(doc.width, doc.height) / 297;
    const target = sel?.kind === 'cells' && sel.ids.length === 1 ? doc.cells.find((c) => c.id === sel.ids[0]) : undefined;
    let sh = newShape(kind);
    sh = { ...sh, w: Math.round(sh.w * k) };
    if (target) {
      const r = cellRect(doc, target);
      if (kind === 'band') {
        const w = Math.min(r.w, r.h) * 0.85;
        const d = w * 0.2;
        sh = { ...sh, w, rot: -45, x: (r.x + d) / doc.width, y: (r.y + d) / doc.height, cellId: target.id };
      } else {
        sh = { ...sh, w: Math.min(sh.w, r.w * 0.45), x: (r.x + r.w * 0.78) / doc.width, y: (r.y + r.h * 0.18) / doc.height };
      }
    }
    commit((d) => ({ ...d, shapes: [...d.shapes, sh] }));
    setSel({ kind: 'shape', id: sh.id });
  };


  /* ----- mes modèles ----- */
  const [layouts, setLayouts] = useState<SavedLayout[]>([]);
  const [defaultLayout, setDefaultLayout] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([idb.get<SavedLayout[]>('kv', 'layouts'), idb.get<string | null>('kv', 'defaultLayout')])
      .then(([l, d]) => {
        if (Array.isArray(l)) setLayouts(l);
        if (d) setDefaultLayout(d);
      })
      .catch(() => {});
  }, []);
  const storeLayouts = (l: SavedLayout[]) => {
    setLayouts(l);
    idb.put('kv', l, 'layouts').catch(() => say("Impossible d'enregistrer le modèle dans ce navigateur."));
  };
  const storeDefault = (id: string | null) => {
    setDefaultLayout(id);
    idb.put('kv', id, 'defaultLayout').catch(() => {});
    say(id ? 'Ce modèle sera utilisé pour chaque nouveau poster.' : 'Modèle par défaut retiré.');
  };

  /* ----- clavier ----- */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Escape') return setSel(null);
      if (!sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (sel.kind === 'text') commit((d) => ({ ...d, texts: d.texts.filter((t) => t.id !== sel.id) }));
        else if (sel.kind === 'shape') commit((d) => ({ ...d, shapes: d.shapes.filter((t) => t.id !== sel.id) }));
        else commit((d) => ({ ...d, cells: d.cells.map((c) => (sel.ids.includes(c.id) ? { ...c, imageId: null } : c)) }));
        return;
      }
      const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      const dir = arrows[key];
      if (!dir) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      if (sel.kind === 'text') {
        commit(
          (d) => ({
            ...d,
            texts: d.texts.map((t) => (t.id === sel.id ? { ...t, x: t.x + (dir[0] * step) / d.width, y: t.y + (dir[1] * step) / d.height } : t)),
          }),
          'nudge-' + sel.id,
        );
      } else if (sel.kind === 'shape') {
        commit(
          (d) => ({
            ...d,
            shapes: d.shapes.map((t) => (t.id === sel.id ? { ...t, x: t.x + (dir[0] * step) / d.width, y: t.y + (dir[1] * step) / d.height } : t)),
          }),
          'nudge-' + sel.id,
        );
      } else if (sel.ids.length === 1) {
        const id = sel.ids[0];
        commit(
          (d) => ({
            ...d,
            cells: d.cells.map((c) =>
              c.id === id ? { ...c, ox: Math.max(-1, Math.min(1, c.ox + dir[0] * 0.02 * step)), oy: Math.max(-1, Math.min(1, c.oy + dir[1] * 0.02 * step)) } : c,
            ),
          }),
          'nudge-' + id,
        );
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [sel, undo, redo, commit]);

  /* ----- export ----- */
  const doExport = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      await fontsReady(doc);
      const opts = { ...exportOpts, bleed: exportOpts.bleed && doc.bleed > 0 };
      const { canvas, wMm, hMm } = await renderPoster(doc, imageMap, opts);
      const base = `poster-${doc.formatId}-${opts.dpi}dpi`;
      if (exportType === 'pdf') {
        const { jsPDF } = await import('jspdf');
        const bytes = await canvasToBytes(canvas, 'image/jpeg', opts.dpi);
        const pdf = new jsPDF({ unit: 'mm', format: [wMm, hMm], orientation: wMm > hMm ? 'landscape' : 'portrait', compress: true });
        pdf.addImage(bytes, 'JPEG', 0, 0, wMm, hMm, undefined, 'NONE');
        pdf.setProperties({ title: 'Poster', creator: 'Poster Pro' });
        pdf.save(`${base}.pdf`);
      } else if (exportType === 'docx') {
        const bytes = await canvasToBytes(canvas, 'image/jpeg', opts.dpi);
        const { blob, scaled } = await buildDocx(bytes, wMm, hMm);
        download(blob, `${base}.docx`);
        if (scaled) {
          canvas.width = canvas.height = 0;
          say('Document Word créé (réduit : Word limite les pages à 558 mm).');
          setBusy(false);
          return;
        }
      } else {
        const type = exportType === 'png' ? 'image/png' : 'image/jpeg';
        const bytes = await canvasToBytes(canvas, type, opts.dpi);
        download(new Blob([bytes], { type }), `${base}.${exportType}`);
      }
      canvas.width = canvas.height = 0;
      say('Export terminé.');
    } catch (e) {
      console.error(e);
      say(e instanceof Error ? e.message : "Erreur pendant l'export.");
    }
    setBusy(false);
  };

  /* ----- fichiers projet ----- */
  const saveProject = async () => {
    try {
      const imgs = await Promise.all(
        images.map(async (a) => ({ id: a.id, name: a.name, w: a.w, h: a.h, data: await blobToDataURL(await (await fetch(a.url)).blob()) })),
      );
      download(new Blob([JSON.stringify({ app: 'poster-pro', version: 2, doc, images: imgs })], { type: 'application/json' }), 'mon-poster.posterpro.json');
    } catch {
      say("Impossible d'enregistrer le projet.");
    }
  };

  const openProject = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== 'poster-pro' || !data.doc?.cells) throw new Error();
      await idb.clear('images');
      images.forEach((a) => URL.revokeObjectURL(a.url));
      const list: ImageAsset[] = [];
      for (const im of data.images ?? []) {
        const blob = await (await fetch(im.data)).blob();
        await idb.put('images', { id: im.id, name: im.name, w: im.w, h: im.h, blob } satisfies StoredImage).catch(() => {});
        list.push({ id: im.id, name: im.name, w: im.w, h: im.h, url: URL.createObjectURL(blob) });
      }
      setImages(list);
      reset(normalizeDoc({ ...defaultDoc(), ...data.doc }));
      setSel(null);
      say('Projet ouvert.');
    } catch {
      say("Ce fichier n'est pas un projet Poster Pro valide.");
    }
  };

  const newProject = () => {
    if (!confirm('Commencer un nouveau poster ? Le poster actuel sera remplacé (les images restent dans la bibliothèque).')) return;
    const L = layouts.find((x) => x.id === defaultLayout);
    reset(L ? applyLayout(defaultDoc(), { ...L, useFormat: true }) : defaultDoc());
    setSel(null);
  };

  /* ----- rendu ----- */
  const selCells = sel?.kind === 'cells' ? sel.ids : [];
  const oneCell = selCells.length === 1 ? doc.cells.find((c) => c.id === selCells[0]) : undefined;
  const selTextItem = sel?.kind === 'text' ? doc.texts.find((t) => t.id === sel.id) : undefined;
  const selShapeItem = sel?.kind === 'shape' ? doc.shapes.find((t) => t.id === sel.id) : undefined;

  let inspector: ReactNode;
  if (oneCell) {
    inspector = (
      <CellInspector
        doc={doc}
        cell={oneCell}
        asset={oneCell.imageId ? imageMap[oneCell.imageId] : undefined}
        update={(p, k) => updateCell(oneCell.id, p, k)}
        onPick={() => browse(oneCell.id)}
        onSplit={() => commit((d) => ({ ...d, cells: splitCell(d.cells, oneCell.id) }))}
        onRemoveCell={() => {
          commit((d) => ({ ...d, cells: d.cells.filter((c) => c.id !== oneCell.id) }));
          setSel(null);
        }}
        onRatio={(r) => setCellRatio(oneCell.id, r)}
        onFiltersAll={() => {
          const { brightness, contrast, saturate, grayscale } = oneCell;
          commit((d) => ({ ...d, cells: d.cells.map((c) => ({ ...c, brightness, contrast, saturate, grayscale })) }));
          say('Retouches appliquées à toutes les images.');
        }}
      />
    );
  } else if (selCells.length > 1) {
    inspector = (
      <MultiInspector
        count={selCells.length}
        onMerge={merge}
        onClear={() => commit((d) => ({ ...d, cells: d.cells.map((c) => (selCells.includes(c.id) ? { ...c, imageId: null } : c)) }))}
      />
    );
  } else if (selShapeItem) {
    const sh = selShapeItem;
    const under = cellAt(doc, sh.x * doc.width, sh.y * doc.height);
    inspector = (
      <ShapeInspector
        sh={sh}
        update={(p, k) => updateShape(sh.id, p, k)}
        canAttach={!!under}
        onAttach={() => under && updateShape(sh.id, { cellId: under.id })}
        onDuplicate={() => {
          const c = { ...sh, id: uid(), x: Math.min(0.95, sh.x + 0.04), y: Math.min(0.95, sh.y + 0.03) };
          commit((d) => ({ ...d, shapes: [...d.shapes, c] }));
          setSel({ kind: 'shape', id: c.id });
        }}
        onFront={() => commit((d) => ({ ...d, shapes: [...d.shapes.filter((x) => x.id !== sh.id), sh] }))}
        onDelete={() => commit((d) => ({ ...d, shapes: d.shapes.filter((x) => x.id !== sh.id) }))}
      />
    );
  } else if (selTextItem) {
    inspector = (
      <TextInspector
        t={selTextItem}
        update={(p, k) => updateText(selTextItem.id, p, k)}
        onDuplicate={() => {
          const t = { ...selTextItem, id: uid(), y: Math.min(0.95, selTextItem.y + 0.04) };
          commit((d) => ({ ...d, texts: [...d.texts, t] }));
          setSel({ kind: 'text', id: t.id });
        }}
        onDelete={() => commit((d) => ({ ...d, texts: d.texts.filter((t) => t.id !== selTextItem.id) }))}
      />
    );
  } else {
    inspector = (
      <div className="empty-insp">
        <h3>Réglages</h3>
        <p>Cliquez sur une case pour recadrer son image (glisser, zoom, rotation, retouche) ou sur un texte pour le modifier.</p>
        <ul>
          <li>
            <kbd>Maj</kbd> + clic : sélection multiple, puis fusion
          </li>
          <li>
            <kbd>Molette</kbd> : zoom dans la case sélectionnée
          </li>
          <li>
            <kbd>Flèches</kbd> : déplacer (Maj = ×10)
          </li>
          <li>
            <kbd>Suppr</kbd> : retirer l'image ou le texte
          </li>
          <li>
            <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd> : annuler / rétablir
          </li>
        </ul>
        <button
          className="ghost full"
          onClick={() => {
            const t = newText({ content: 'Nouveau texte', color: doc.texts[0]?.color ?? '#1a1a1a' });
            commit((d) => ({ ...d, texts: [...d.texts, t] }));
            setSel({ kind: 'text', id: t.id });
          }}
        >
          <Icon d={ICONS.plus} size={14} /> Ajouter un texte
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">P</span>
          <span>Poster Pro</span>
        </div>
        <div className="tb-group">
          <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Annuler (Ctrl+Z)">
            <Icon d={ICONS.undo} />
          </button>
          <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Rétablir (Ctrl+Y)">
            <Icon d={ICONS.redo} />
          </button>
        </div>
        <div className="tb-group">
          <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))} title="Dézoomer">
            −
          </button>
          <button className="zoom-label" onClick={() => setZoom(1)} title="Ajuster à l'écran">
            {zoom === 1 ? 'Ajuster' : `${Math.round(zoom * 100)} %`}
          </button>
          <button className="icon-btn" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} title="Zoomer">
            +
          </button>
        </div>
        <Seg
          options={[
            { value: 'edit', label: 'Édition' },
            { value: 'preview', label: 'Aperçu final' },
          ]}
          value={preview ? 'preview' : 'edit'}
          onChange={(v) => setPreview(v === 'preview')}
        />
        <label className="tb-check" title="Ligne de coupe et zone de sécurité">
          <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /> Repères
        </label>
        <div className="tb-spacer" />
        <PwaStatus />
        <span className={cls('save-state', saveState)}>
          {saveState === 'saving' ? 'Enregistrement…' : saveState === 'saved' ? 'Enregistré' : saveState === 'error' ? 'Non enregistré' : ''}
        </span>
        <button className="primary" onClick={() => setTab('export')}>
          <Icon d={ICONS.export} size={16} /> Exporter
        </button>
      </header>

      <aside className="sidebar">
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={cls('tab', tab === t.id && 'on')} onClick={() => setTab(t.id)}>
              <Icon d={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="panel">
          {tab === 'format' && <FormatPanel doc={doc} commit={commit} />}
          {tab === 'grid' && (
            <>
              <LayoutsSection
                layouts={layouts}
                defaultId={defaultLayout}
                onSave={(name, withFormat, withTexts) => {
                  storeLayouts([layoutFromDoc(doc, name, withFormat, withTexts), ...layouts]);
                  say(`Modèle « ${name} » enregistré.`);
                }}
                onApply={(L) => {
                  commit((d) => applyLayout(d, L));
                  setSel(null);
                }}
                onDelete={(id) => {
                  storeLayouts(layouts.filter((x) => x.id !== id));
                  if (defaultLayout === id) storeDefault(null);
                }}
                onSetDefault={storeDefault}
              />
              <GridPanel doc={doc} commit={commit} selectedCells={selCells} onMerge={merge} onSplit={(id) => commit((d) => ({ ...d, cells: splitCell(d.cells, id) }))} />
            </>
          )}
          {tab === 'images' && (
            <ImagesPanel
              doc={doc}
              images={images}
              onBrowse={() => browse(null)}
              onFiles={(f) => onFiles(f)}
              hasCellSelected={!!oneCell}
              onAssign={(id) => oneCell && updateCell(oneCell.id, { imageId: id, zoom: 1, ox: 0, oy: 0, rot: 0, flipX: false })}
              onRemove={removeImage}
              onAutoFill={() => {
                const used = new Set(doc.cells.map((c) => c.imageId));
                const free = images.filter((a) => !used.has(a.id)).map((a) => a.id);
                if (!free.length) return say('Toutes les images de la bibliothèque sont déjà placées.');
                placeImages(free);
              }}
              onShuffle={() =>
                commit((d) => {
                  const filled = d.cells.filter((c) => c.imageId);
                  const pool = filled.map(imageFields);
                  for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                  }
                  const m = new Map(filled.map((c, i) => [c.id, { ...pool[i], zoom: 1, ox: 0, oy: 0 }]));
                  return { ...d, cells: d.cells.map((c) => (m.has(c.id) ? { ...c, ...m.get(c.id)! } : c)) };
                })
              }
              onClearCells={() => commit((d) => ({ ...d, cells: d.cells.map((c) => ({ ...c, imageId: null })) }))}
            />
          )}
          {tab === 'text' && (
            <>
              <ShapesSection onAdd={addShape} />
              <TextsPanel doc={doc} commit={commit} selectedText={selTextItem?.id ?? null} onSelect={selectText} />
            </>
          )}
          {tab === 'export' && (
            <ExportPanel
              doc={doc}
              images={imageMap}
              opts={exportOpts}
              setOpts={setExportOpts}
              type={exportType}
              setType={setExportType}
              busy={busy}
              onExport={doExport}
              onSaveProject={saveProject}
              onOpenProject={() => projectRef.current?.click()}
              onNewProject={newProject}
            />
          )}
        </div>
      </aside>

      <main
        className="stage"
        ref={stageRef}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('stage-inner')) setSel(null);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
        }}
      >
        <div className="stage-inner">
          <Poster
            doc={doc}
            images={imageMap}
            scale={scale}
            preview={preview}
            showGuides={showGuides}
            selection={sel}
            onSelectCell={selectCell}
            onSelectText={selectText}
            onClear={() => setSel(null)}
            onCellChange={updateCell}
            onTextChange={updateText}
            onDropOnCell={onDropOnCell}
            onPickForCell={(id) => browse(id)}
            onDocCommit={commit}
            onCellRatio={setCellRatio}
            onSelectShape={selectShape}
            onShapeChange={updateShape}
          />
        </div>
      </main>

      <aside className="inspector">{inspector}</aside>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const f = [...(e.target.files ?? [])];
          e.target.value = '';
          if (f.length) onFiles(f, pickTarget.current ?? undefined);
        }}
      />
      <input
        ref={projectRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) openProject(f);
        }}
      />
      {busy && (
        <div className="busy">
          <div className="spinner" />
          <span>Rendu haute définition ({exportOpts.dpi} DPI)…</span>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}    </div>
  );
}
