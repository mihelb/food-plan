import { useEffect, useRef, useState } from 'react';

/** Decimal separator of the user's locale ("," in German, "." in English). */
const SEP = (1.5).toLocaleString().charAt(1) === ',' ? ',' : '.';

function format(v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return '';
  const s = String(Math.round(v * 1e6) / 1e6);
  return SEP === ',' ? s.replace('.', ',') : s;
}

/** Parse "2,49" or "2.49". Returns undefined for empty text and null for invalid text. */
export function parseDecimal(text: string): number | undefined | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  if (!/^\d*\.?\d*$/.test(t) || t === '.') return null;
  return Number(t);
}

interface Props {
  value: number | undefined;
  /** Called with the parsed value, or undefined when the field is cleared (unless `required`). */
  onChange: (v: number | undefined) => void;
  min?: number;
  /** An empty field is not committed; the last value comes back on blur. */
  required?: boolean;
  className?: string;
  placeholder?: string;
  title?: string;
  'aria-label'?: string;
}

/**
 * Number field that accepts both "," and "." as decimal separator, whatever the system
 * language. (A native <input type="number"> reads "2,49" as 249 in an English locale.)
 * The typed text is kept while editing; every valid keystroke is saved immediately.
 */
export function DecimalInput({ value, onChange, min = 0, required, className, placeholder, title, ...rest }: Props) {
  const [text, setText] = useState(() => format(value));
  const textRef = useRef(text);
  textRef.current = text;

  // Follow outside changes (e.g. auto-calculated values) without disturbing what is being typed.
  useEffect(() => {
    const parsed = parseDecimal(textRef.current);
    if (parsed !== value && !(parsed === undefined && required)) setText(format(value));
  }, [value, required]);

  return (
    <input
      type="text"
      inputMode="decimal"
      className={className}
      placeholder={placeholder}
      title={title}
      aria-label={rest['aria-label']}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        const parsed = parseDecimal(raw);
        if (parsed === null) return; // ignore characters that can't be part of a number
        setText(raw);
        if (parsed === undefined) {
          if (!required) onChange(undefined);
        } else onChange(Math.max(min, parsed));
      }}
      onBlur={() => setText(format(value))}
    />
  );
}
