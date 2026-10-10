// Exact arithmetic shared in policy with backend QuantityText. Round only for display/conversion.
export interface Rational {
  n: bigint;
  d: bigint;
}
export interface ParsedQuantity {
  canonical: string;
  values: Rational[];
}
export const QUANTITY_ATOM = String.raw`(?:\d+\s+\d+\s*/\s*\d+|\d+\s*/\s*\d+|(?:\d+(?:[.,]\d+)?|[.,]\d+))`;
export const QUANTITY_PATTERN =
  QUANTITY_ATOM + String.raw`(?:\s*(?:[-–—]|\bto\b|\bbis\b)\s*${QUANTITY_ATOM})?`;
const fractions: Record<string, string> = {
  '½': '1/2',
  '¼': '1/4',
  '¾': '3/4',
  '⅐': '1/7',
  '⅑': '1/9',
  '⅒': '1/10',
  '⅓': '1/3',
  '⅔': '2/3',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};
export function expandFractions(text: string): string {
  return text
    .replace(/⁄/g, '/')
    .replace(
      /[½¼¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g,
      (fraction: string, offset: number) =>
        (offset > 0 && /\d/.test(text[offset - 1]) ? ' ' : '') +
        fractions[fraction] +
        (offset + 1 < text.length && /\d/.test(text[offset + 1]) ? ' ' : ''),
    );
}
export function decimalRational(text: string): Rational {
  const parts = text.split('.');
  return { n: BigInt(parts.join('')), d: 10n ** BigInt(parts[1]?.length ?? 0) };
}
export function multiply(a: Rational, b: Rational): Rational {
  return { n: a.n * b.n, d: a.d * b.d };
}
function compare(a: Rational, b: Rational): number {
  const delta = a.n * b.d - b.n * a.d;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}
export function inBounds(v: Rational): boolean {
  return compare(v, { n: 1n, d: 1000n }) >= 0 && compare(v, { n: 100000n, d: 1n }) <= 0;
}
export function parseQuantity(input: unknown): ParsedQuantity | null {
  if (typeof input !== 'string' || !input.trim() || input.length > 64) return null;
  const text = expandFractions(input.trim());
  if (!new RegExp(`^${QUANTITY_PATTERN}$`, 'i').test(text)) return null;
  const endpoints = text.split(/\s*(?:[-–—]|\bto\b|\bbis\b)\s*/i);
  const values: Rational[] = [];
  const canonical: string[] = [];
  for (const endpoint of endpoints) {
    const fraction = endpoint.trim().match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
    let value: Rational;
    let normalized: string;
    if (fraction) {
      const whole = BigInt(fraction[1] ?? 0),
        n = BigInt(fraction[2]),
        d = BigInt(fraction[3]);
      if (d === 0n || (fraction[1] !== undefined && n >= d)) return null;
      value = { n: whole * d + n, d };
      normalized = (fraction[1] !== undefined && whole > 0n ? `${whole} ` : '') + `${n}/${d}`;
    } else {
      const parts = endpoint.trim().replace(',', '.').split('.');
      normalized =
        (parts[0].replace(/^0+/, '') || '0') +
        (parts[1]?.replace(/0+$/, '') ? '.' + parts[1].replace(/0+$/, '') : '');
      value = decimalRational(normalized);
    }
    if (!inBounds(value)) return null;
    values.push(value);
    canonical.push(normalized);
  }
  if (values.length === 2 && compare(values[0], values[1]) > 0) return null;
  const normalized = canonical.join('-');
  return normalized.length <= 64 ? { canonical: normalized, values } : null;
}
export function formatDecimal(value: Rational, places = 3): string {
  const scale = 10n ** BigInt(places),
    raw = value.n * scale;
  let rounded = raw / value.d;
  if ((raw % value.d) * 2n >= value.d) rounded++;
  if (rounded === 0n && value.n > 0n) return formatFraction(value);
  const digits = rounded.toString().padStart(places + 1, '0');
  return places === 0
    ? digits
    : (digits.slice(0, -places) + '.' + digits.slice(-places))
        .replace(/0+$/, '')
        .replace(/\.$/, '');
}
function formatFraction(value: Rational): string {
  let a = value.n,
    b = value.d;
  while (b) {
    const r = a % b;
    a = b;
    b = r;
  }
  const n = value.n / a,
    d = value.d / a,
    whole = n / d,
    remainder = n % d;
  return remainder === 0n
    ? whole.toString()
    : (whole > 0n ? `${whole} ` : '') + `${remainder}/${d}`;
}
export function convertQuantity(quantity: ParsedQuantity, factor: string): string | null {
  const values = quantity.values.map((v) => multiply(v, decimalRational(factor)));
  if (values.some((v) => !inBounds(v))) return null;
  const result = values.map((v) => formatDecimal(v)).join('-');
  return parseQuantity(result) ? result : null;
}
export function scaleQuantity(
  original: string,
  servings: number,
  baseServings: number,
): { text: string; scaled: boolean } {
  const parsed = parseQuantity(original);
  if (
    !parsed ||
    !Number.isInteger(servings) ||
    !Number.isInteger(baseServings) ||
    servings < 1 ||
    baseServings < 1
  )
    return { text: original, scaled: false };
  if (servings === baseServings) return { text: parsed.canonical, scaled: true };
  const factor = { n: BigInt(servings), d: BigInt(baseServings) };
  return {
    text: parsed.values
      .map((v, index) => {
        const scaled = multiply(v, factor);
        return parsed.canonical.split('-')[index].includes('/')
          ? formatFraction(scaled)
          : formatDecimal(scaled);
      })
      .join('-'),
    scaled: true,
  };
}
