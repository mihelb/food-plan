/** Date helpers working on local ISO dates (YYYY-MM-DD) without time-zone drift. */

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = fromIso(iso);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(iso, -dow);
}

export function weekDates(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i));
}

export function formatDay(iso: string): { weekday: string; date: string } {
  const d = fromIso(iso);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
  };
}

export function today(): string {
  return toIso(new Date());
}
