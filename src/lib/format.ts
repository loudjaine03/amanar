/** Une valeur pas encore calculée (null) s'affiche "TBD", jamais 0 ni un chiffre inventé. */
export function fmt(value: number | null | undefined, unit = '', digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'TBD';
  const n = Number(value.toFixed(digits));
  return unit ? `${n} ${unit}` : String(n);
}
