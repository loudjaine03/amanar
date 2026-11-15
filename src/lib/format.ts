/** A value not computed yet (null) shows as "TBD", never 0 or an invented number. */
export function fmt(value: number | null | undefined, unit = "", digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "TBD";
  const n = Number(value.toFixed(digits));
  return unit ? `${n}${unit === "°" || unit === "%" ? "" : " "}${unit}` : String(n);
}
