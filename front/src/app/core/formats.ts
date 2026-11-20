// Formats français (montants, dates, mois) et petites aides partagées.

export const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const euros2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export const dateFr = (d?: string) => (d ? d.split('-').reverse().join('/') : '');

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function libelleMois(aaaamm: string): string {
  const [a, m] = aaaamm.split('-').map(Number);
  return `${MOIS[m - 1]} ${String(a).slice(2)}`;
}

/** 1 234 567 → « 1,23 M€ », 12 345 → « 12,3 k€ ». */
export function compact(v: number): string {
  if (Math.abs(v) >= 1e6) return `${nombre.format(Math.round(v / 1e4) / 100)} M€`;
  if (Math.abs(v) >= 1e3) return `${nombre.format(Math.round(v / 100) / 10)} k€`;
  return `${nombre.format(Math.round(v))} €`;
}

/** « élevé » → « eleve » : nom de classe CSS sans accents. */
export const classeCss = (t: unknown) =>
  String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]/gi, '');

export function echapper(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
