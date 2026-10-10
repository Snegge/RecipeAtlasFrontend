import data from './measurement-units.json';
export interface MeasurementUnit {
  code: string;
  aliases: string[];
  factor: string;
  reviewReason: string;
}
const aliases = new Map<string, MeasurementUnit>(
  data.definitions.flatMap((u) => u.aliases.map((a) => [a, u] as [string, MeasurementUnit])),
);
const allAliases = [...aliases.keys(), ...data.unresolvedAliases].sort(
  (a, b) => b.length - a.length,
);
export function matchUnit(
  text: string,
): { text: string; definition: MeasurementUnit | null } | null {
  for (const alias of allAliases) {
    if (!text.toLowerCase().startsWith(alias)) continue;
    let rest = text.slice(alias.length);
    if (rest.startsWith('.')) rest = rest.slice(1);
    if (!rest || /^\s/.test(rest))
      return {
        text: text.slice(0, text.length - rest.length),
        definition: aliases.get(alias) ?? null,
      };
  }
  if (/^(?:us|u\.s\.|uk|imperial|metric|british)\b/i.test(text))
    return { text: text.split(' ')[0], definition: null };
  return null;
}
