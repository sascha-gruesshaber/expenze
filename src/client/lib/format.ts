const eurFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function fmt(n: number | null | undefined): string {
  return eurFormat.format(n || 0);
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '\u2014';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}
