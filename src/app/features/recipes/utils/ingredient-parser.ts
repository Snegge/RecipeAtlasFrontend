import { Ingredient } from '../../../core/models/recipe.model';

export type IngredientParseResult =
  | { success: true; ingredient: Ingredient }
  | { success: false; error: string };

const unitGroups: Record<string, readonly string[]> = {
  g: ['g', 'gram', 'grams', 'gramm'],
  kg: ['kg', 'kilogram', 'kilograms', 'kilogramm'],
  ml: [
    'ml',
    'milliliter',
    'milliliters',
    'millilitre',
    'millilitres',
  ],
  l: ['l', 'liter', 'liters', 'litre', 'litres'],
  tsp: [
    'tsp',
    'tsps',
    'teaspoon',
    'teaspoons',
    'tl',
    'teelöffel',
    'teeloeffel',
  ],
  tbsp: [
    'tbsp',
    'tbsps',
    'tablespoon',
    'tablespoons',
    'el',
    'esslöffel',
    'essloeffel',
    'eßlöffel',
  ],
  piece: [
    'piece',
    'pieces',
    'pc',
    'pcs',
    'stück',
    'stücke',
    'stueck',
    'stuecke',
    'stk',
  ],
  pinch: ['pinch', 'pinches', 'prise', 'prisen'],
};

const unitAliases = new Map<string, string>(
  Object.entries(unitGroups).flatMap(([code, aliases]) =>
    aliases.map((alias): [string, string] => [alias, code]),
  ),
);

const unicodeFractions: Record<string, string> = {
  '½': '1/2',
  '¼': '1/4',
  '¾': '3/4',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
  '⅓': '1/3',
  '⅔': '2/3',
};

function failure(error: string): IngredientParseResult {
  return { success: false, error };
}

function normalizeFractions(text: string): string {
  return text.replace(
    /[½¼¾⅛⅜⅝⅞⅓⅔]/g,
    (fraction: string, offset: number) => {
      // "1½" becomes "1 1/2".
      const separator =
        offset > 0 && /\d/.test(text[offset - 1]) ? ' ' : '';

      return separator + unicodeFractions[fraction];
    },
  );
}

function parseQuantity(text: string): number | null {
  if (!text.includes('/')) {
    const number = Number(text.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  const match = text.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);

  if (!match) return null;

  const whole = Number(match[1] ?? 0);
  const numerator = Number(match[2]);
  const denominator = Number(match[3]);

  if (denominator === 0) return null;

  // Mixed fractions must use a proper fractional part.
  if (match[1] !== undefined && numerator >= denominator) {
    return null;
  }

  return whole + numerator / denominator;
}

export function parseIngredient(
  input: string,
): IngredientParseResult {
  if (input.length > 600) {
    return failure('The ingredient line is too long.');
  }

  let text = input.trim().replace(/\s+/g, ' ');

  if (!text) {
    return failure('Enter an ingredient.');
  }

  // Optional trailing note: "200 g flour (sifted)".
  let note: string | null = null;
  const noteMatch = text.match(/\s*\(([^()]*)\)$/);

  if (noteMatch) {
    note = noteMatch[1].trim() || null;
    text = text.slice(0, noteMatch.index).trim();
  }

  if (/[()]/.test(text)) {
    return failure(
      'Put one optional note in parentheses at the end.',
    );
  }

  if (note && note.length > 300) {
    return failure('Notes must not exceed 300 characters.');
  }

  // Quantity is deliberately absent for "to taste".
  const tasteMatch = text.match(
    /^(.+?)\s+(?:to taste|nach geschmack)$/i,
  );

  if (tasteMatch) {
    const name = tasteMatch[1].trim();

    if (/^[\d½¼¾⅛⅜⅝⅞⅓⅔+\-]/.test(name)) {
      return failure(
        'Do not include a quantity with “to taste”.',
      );
    }

    if (name.length > 200) {
      return failure(
        'Ingredient names must not exceed 200 characters.',
      );
    }

    return {
      success: true,
      ingredient: {
        name,
        quantity: null,
        unit: 'toTaste',
        note,
      },
    };
  }

  text = normalizeFractions(text);

  // Accepts:
  // 200 g flour
  // 200g flour
  // 1,5 kg potatoes
  // 1/2 tsp salt
  // 1 1/2 tbsp oil
  const match = text.match(
    /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)\s*([a-zäöüß]+)\.?\s+(.+)$/i,
  );

  if (!match) {
    return failure(
      'Use quantity + unit + ingredient, for example “200 g flour” or “2 Stück Eier”.',
    );
  }

  const [, quantityText, unitText, rawName] = match;
  const unit = unitAliases.get(unitText.toLowerCase());
  const name = rawName.trim();

  if (!unit) {
    return failure(
      `Unknown unit “${unitText}”. Use g, kg, ml, l, tsp/TL, tbsp/EL, piece/Stück or pinch/Prise.`,
    );
  }

  if (name.length > 200) {
    return failure(
      'Ingredient names must not exceed 200 characters.',
    );
  }

  if (/^[\d×+]/.test(name)) {
    return failure(
      'Use one quantity per ingredient. Calculate package totals manually.',
    );
  }

  // "1,000" could mean one or one thousand.
  // Leading-zero decimals such as "0.125" remain valid.
  if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(quantityText)) {
    return failure(
      'Ambiguous separator. Write 1000 for one thousand, or use a fraction for a decimal amount.',
    );
  }

  const quantity = parseQuantity(quantityText);

  if (
    quantity === null ||
    !Number.isFinite(quantity) ||
    quantity < 0.001 ||
    quantity > 100000
  ) {
    return failure(
      'Quantity must be between 0.001 and 100000.',
    );
  }

  const scaled = quantity * 1000;

  if (Math.abs(scaled - Math.round(scaled)) > 0.000001) {
    return failure(
      'Use at most three decimal places. For 1/3, enter an approximation such as 0.333.',
    );
  }

  return {
    success: true,
    ingredient: {
      name,
      quantity: Math.round(scaled) / 1000,
      unit,
      note,
    },
  };
}