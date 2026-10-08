export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string;
  note: string | null;
}
export interface RecipeInput {
  title: string;
  description: string | null;
  sourceUrl: string | null;
  servings: number;
  ingredients: Ingredient[];
  steps: string[];
}
export interface Recipe extends RecipeInput {
  id: string;
  imageUrl: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}
export interface RecipeCard {
  id: string;
  title: string;
  description: string | null;
  servings: number;
  imageUrl: string | null;
  updatedAtUtc: string;
}
export interface RecipePage {
  items: RecipeCard[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Unit {
  code: string;
  label: string;
  milliliters: number | null;
}
