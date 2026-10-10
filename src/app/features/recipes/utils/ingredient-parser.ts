import { ImportedIngredient } from '../../../core/models/recipe-import.model';
import {
  convertQuantity,
  expandFractions,
  parseQuantity,
  QUANTITY_PATTERN,
} from '../../../core/utils/quantity';
import { matchUnit } from '../../../core/utils/unit-normalization';

export type IngredientParseResult =
  { success: true; ingredient: ImportedIngredient } | { success: false; error: string };
export function parseIngredientDraft(input: string): ImportedIngredient {
  const originalText = input;
  let text = input.trim().replace(/\s+/g, ' ');
  let note: string | null = null;
  const unresolved = (
    reason: string,
    name = originalText.trim(),
    quantity = '',
    unit: string | null = null,
  ): ImportedIngredient => ({
    name,
    quantity,
    unit: unit || null,
    note,
    originalText,
    requiresReview: true,
    reviewReason: reason,
  });
  if (!text || input.length > 600)
    return unresolved('Enter an ingredient line up to 600 characters.');
  const noteMatch = text.match(/\s+\(([^()]*)\)$/);
  if (noteMatch && !/^(us|uk|imperial|metric)$/i.test(noteMatch[1])) {
    note = noteMatch[1].trim() || null;
    text = text.slice(0, noteMatch.index).trim();
  }
  const taste = text.match(
    /^(?:(?:to taste|nach geschmack)\s+(.+)|(.+?)\s+(?:to taste|nach geschmack))$/i,
  );
  if (taste) {
    const name = taste[1] ?? taste[2];
    if (/^[\d.,+\-]/.test(expandFractions(name)))
      return unresolved('Do not include an amount with to taste.');
    return name.length <= 200 && (note?.length ?? 0) <= 300
      ? {
          name,
          quantity: '',
          unit: 'toTaste',
          note,
          originalText,
          requiresReview: false,
          reviewReason: null,
        }
      : unresolved('Name or note is too long.');
  }
  text = expandFractions(text);
  const amount = text.match(new RegExp(`^(${QUANTITY_PATTERN})\\s*(.*)$`, 'i'));
  if (!amount) return unresolved('Amount is missing or malformed; review the original ingredient.');
  const quantity = parseQuantity(amount[1]);
  let remainder = amount[2].trim();
  if (
    !quantity ||
    !remainder ||
    /^(?:[\d.,/–—−+\-×*%]|[eE][+-]?\d|to\b|bis\b|x\s*\d)/.test(remainder)
  )
    return unresolved('Quantity or ingredient name is invalid.');
  const match = matchUnit(remainder);
  let unit = 'piece',
    reviewReason: string | null = null,
    normalized = quantity.canonical;
  if (match) {
    remainder = remainder.slice(match.text.length).trim();
    if (!match.definition) {
      unit = '';
      reviewReason = 'Unit or measurement system is unresolved; choose a supported unit.';
    } else {
      unit = match.definition.code;
      reviewReason = match.definition.reviewReason || null;
      if (match.definition.factor !== '1') {
        const converted = convertQuantity(quantity, match.definition.factor);
        if (!converted)
          return unresolved('Converted amount is outside supported bounds.', remainder);
        normalized = converted;
      }
    }
  }

  const join = (second: string) => {
    note = note ? note + '; ' + second : second;
  };
  const packaging = remainder.match(
    new RegExp(`^(?:à|a|je|each)\\s*(${QUANTITY_PATTERN})\\s*(g|kg|ml|l)\\s+(.+)$`, 'i'),
  );
  if (packaging) {
    join('à ' + packaging[1] + ' ' + packaging[2]);
    remainder = packaging[3].trim();
  }
  const trailing = remainder.match(
    new RegExp(`\\s+(?:à|je|each)\\s*${QUANTITY_PATTERN}\\s*(?:g|kg|ml|l)$`, 'i'),
  );
  if (trailing) {
    join(trailing[0].trim());
    remainder = remainder.slice(0, trailing.index).trim();
  }
  const comma = remainder.indexOf(',');
  if (comma >= 0) {
    join(remainder.slice(comma + 1).trim());
    remainder = remainder.slice(0, comma).trim();
  }
  if (
    !remainder ||
    remainder.length > 200 ||
    (note?.length ?? 0) > 300 ||
    /^[\d×+\-]/.test(remainder)
  )
    return unresolved('Ingredient name or note is invalid.');
  return {
    name: remainder,
    quantity: normalized,
    unit: unit || null,
    note,
    originalText,
    requiresReview: reviewReason !== null,
    reviewReason,
  };
}
export function parseIngredient(input: string): IngredientParseResult {
  const ingredient = parseIngredientDraft(input);
  // Uncertain units/assumptions can be edited with source/review metadata; malformed amounts are rejected.
  if (!ingredient.quantity && ingredient.unit !== 'toTaste')
    return { success: false, error: ingredient.reviewReason ?? 'Review this ingredient.' };
  return { success: true, ingredient };
}
