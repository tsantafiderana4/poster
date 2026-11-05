import { useEffect, useState, type ReactNode } from 'react';

export const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <h3>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 1, unit, onChange } = props;
  const digits = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
        <span className="num-wrap">
          <input
            className="num"
            type="number"
            value={Number(value.toFixed(digits))}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
          />
          {unit && <em>{unit}</em>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}

export function Seg<T extends string | number>(props: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button key={String(o.value)} title={o.title} className={cls(o.value === props.value && 'on')} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cls('toggle', disabled && 'disabled')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="sw" />
      <span>{label}</span>
    </label>
  );
}

const SWATCHES = ['#ffffff', '#f4f1ea', '#111111', '#0b0b0c', '#e30613', '#ff3fd4', '#0f2a3d', '#2f6b4f', '#f2b705'];

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
      </div>
      <div className="color-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input
          className="hex"
          value={txt}
          onChange={(e) => {
            setTxt(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
        />
      </div>
      <div className="swatches">
        {SWATCHES.map((s) => (
          <button key={s} className={cls('swatch', s === value && 'on')} style={{ background: s }} title={s} onClick={() => onChange(s)} />
        ))}
      </div>
    </div>
  );
}

export function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  format: 'M6 3h9l4 4v14H6z M15 3v4h4',
  grid: 'M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9.5a1.5 1.5 0 1 0 0-.01',
  text: 'M5 6V4h14v2 M12 4v16 M9 20h6',
  export: 'M12 3v12 M7 10l5 5 5-5 M5 21h14',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  rotL: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5',
  rotR: 'M21 12a9 9 0 1 1-3-6.7 M21 4v5h-5',
  flip: 'M12 3v18 M8 7l-5 5 5 5z M16 7l5 5-5 5z',
  center: 'M12 2v4 M12 18v4 M2 12h4 M18 12h4 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  plus: 'M12 5v14 M5 12h14',
};
