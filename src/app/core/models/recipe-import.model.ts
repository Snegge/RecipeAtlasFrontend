export interface ImportedIngredient {
  name: string;
  quantity: string;
  unit: string | null;
  note: string | null;
  originalText: string;
  requiresReview: boolean;
  reviewReason?: string | null;
}

export interface RecipeImportDraft {
  title: string;
  description: string | null;
  sourceUrl: string;
  servings: number | null;
  originalYield: string | null;
  ingredients: ImportedIngredient[];
  steps: string[];
  externalImageUrl: string | null;
}

export interface RecipeImportResult {
  sourceType: string;
  draft: RecipeImportDraft;
  warnings: string[];
}
