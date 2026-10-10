import { describe, expect, it } from 'vitest';
import cases from './fixtures/quantity-cases.json';
import { parseQuantity, scaleQuantity } from './quantity';
import { parseIngredientDraft } from '../../features/recipes/utils/ingredient-parser';

describe('Quantity contract shared with C#', () => {
  for (const test of cases.quantities)
    it(`parses ${JSON.stringify(test.input)}`, () => {
      expect(parseQuantity(test.input)?.canonical ?? null).toBe(test.expected);
    });
  for (const test of cases.ingredients)
    it(`extracts ${test.input}`, () => {
      expect(parseIngredientDraft(test.input)).toMatchObject({
        name: test.name,
        quantity: test.quantity,
        unit: test.unit,
        note: test.note,
        originalText: test.input,
        requiresReview: test.requiresReview,
      });
    });
  it('scales both range endpoints and preserves fractions', () => {
    expect(scaleQuantity('3-4', 4, 2)).toEqual({ text: '6-8', scaled: true });
    expect(scaleQuantity('1/3-2/3', 4, 2).text).toBe('2/3-1 1/3');
    expect(scaleQuantity('1 1/2', 4, 2).text).toBe('3');
    expect(scaleQuantity('0,5', 4, 2).text).toBe('1');
  });
  it('scales from the original each time, without accumulated display rounding', () => {
    const original = '0.333';
    expect(scaleQuantity(original, 3, 2).text).toBe('0.5');
    expect(scaleQuantity(original, 6, 2).text).toBe('0.999');
    expect(scaleQuantity(original, 2, 2).text).toBe(original);
    expect(scaleQuantity('1/3', 3, 2).text).toBe('1/2');
  });
  it('retains malformed text and indicates that scaling failed', () => {
    expect(scaleQuantity('1/0', 4, 2)).toEqual({ text: '1/0', scaled: false });
    expect(scaleQuantity('broken', 4, 2)).toEqual({ text: 'broken', scaled: false });
  });
  it('never rounds a small positive scaled amount to zero', () => {
    const result = scaleQuantity('0.001', 1, 1000);
    expect(result.scaled).toBe(true);
    expect(result.text).toBe('1/1000000');
  });
});
