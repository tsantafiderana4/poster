export type Fit = 'cover' | 'contain';
export type Rot = 0 | 90 | 180 | 270;
export type Align = 'left' | 'center' | 'right';

export interface ImageAsset {
  id: string;
  name: string;
  url: string;
  w: number;
  h: number;
}

/** Une case de la grille. Position et taille en unités de grille. */
export interface Cell {
  id: string;
  c: number;
  r: number;
  cs: number;
  rs: number;
  imageId: string | null;
  fit: Fit;
  zoom: number;
  /** Décalage de l'image dans la case, de -1 à 1 (fraction du débordement). */
  ox: number;
  oy: number;
  rot: Rot;
  flipX: boolean;
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
}

export interface TextItem {
  id: string;
  content: string;
  /** Position du point d'ancrage, en fraction du format fini (0 à 1). */
  x: number;
  y: number;
  /** Taille de la police en mm. */
  size: number;
  font: string;
  weight: number;
  color: string;
  align: Align;
  lineHeight: number;
  /** Interlettrage en em. */
  letterSpacing: number;
  uppercase: boolean;
  italic: boolean;
  bg: string | null;
  /** Marge intérieure du bandeau, en mm. */
  padding: number;
  shadow: boolean;
}

export type ShapeKind = 'burst' | 'circle' | 'ribbon' | 'bow' | 'tag' | 'band';

/** Forme décorative (badge « NEW », ruban, nœud…). */
export interface ShapeItem {
  id: string;
  kind: ShapeKind;
  /** Centre, en fraction du format fini. */
  x: number;
  y: number;
  /** Largeur en mm (la hauteur suit les proportions de la forme). */
  w: number;
  rot: number;
  fill: string;
  text: string;
  textColor: string;
  font: string;
  weight: number;
  /** Multiplicateur de la taille du texte. */
  textScale: number;
  shadow: boolean;
  /** Si défini, la forme est découpée aux bords de cette case. */
  cellId: string | null;
}

/** Toutes les mesures sont en millimètres, par rapport au format fini (sans fonds perdus). */
export interface Doc {
  formatId: string;
  width: number;
  height: number;
  bleed: number;
  cols: number;
  rows: number;
  /** Largeur relative de chaque colonne / hauteur relative de chaque ligne (poids). */
  colSizes: number[];
  rowSizes: number[];
  cells: Cell[];
  gap: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  radius: number;
  borderWidth: number;
  borderColor: string;
  background: string;
  texts: TextItem[];
  shapes: ShapeItem[];
}

/** Mise en page enregistrée par l'utilisateur pour ses futurs posters. */
export interface SavedLayout {
  id: string;
  name: string;
  createdAt: number;
  cols: number;
  rows: number;
  cells: [number, number, number, number][];
  colSizes: number[];
  rowSizes: number[];
  gap: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  radius: number;
  borderWidth: number;
  borderColor: string;
  background: string;
  /** Format du poster d'origine (toujours enregistré, pour adapter les mesures). */
  format: { formatId: string; width: number; height: number; bleed: number };
  /** Imposer ce format en appliquant le modèle. */
  useFormat: boolean;
  texts?: TextItem[];
  shapes?: ShapeItem[];
}

export type Selection =
  | { kind: 'cells'; ids: string[] }
  | { kind: 'text'; id: string }
  | { kind: 'shape'; id: string }
  | null;
