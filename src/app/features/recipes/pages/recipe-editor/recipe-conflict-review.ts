import { Recipe } from '../../../../core/models/recipe.model';
import {
  ConflictField,
  ConflictSource,
} from '../../../../shared/components/conflict-review/conflict-review.component';
import { RecipeEditValues } from './recipe-editor-form';
import { RecipeEditorPhoto } from './recipe-editor-photo';

const scalars = ['title', 'description', 'servings', 'sourceUrl'] as const;
const labels = ['Title', 'Description', 'Servings', 'Source link'];
function ingredientText(values: RecipeEditValues) {
  return values.ingredients
    .map(
      (row, i) =>
        `${i + 1}. ${row.quantity} ${row.unit} ${row.name}${row.note ? ' — ' + row.note : ''}`,
    )
    .join('\n');
}
export function recipeConflictFields(
  local: RecipeEditValues,
  server: Recipe,
  photos: RecipeEditorPhoto,
): ConflictField[] {
  return [
    ...scalars.map((key, index) => ({
      id: key,
      label: labels[index],
      local: String(local[key] ?? ''),
      server: String(server[key] ?? ''),
    })),
    {
      id: 'ingredients',
      label: 'Ingredients (whole ordered section)',
      local: ingredientText(local),
      server: ingredientText(server),
    },
    {
      id: 'steps',
      label: 'Steps (whole ordered section)',
      local: local.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
      server: server.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    },
    {
      id: 'photo',
      label: 'Picture',
      local: photos.pendingDescription(),
      server: server.imageUrl ? 'Current server picture' : 'No server picture',
      localImage: photos.preview(),
      serverImage: server.imageUrl
        ? server.imageUrl + '?v=' + encodeURIComponent(server.version)
        : null,
      canKeepLocal: photos.hasUnsavedChanges(),
    },
  ];
}
export function mergeRecipeChoices(
  local: RecipeEditValues,
  server: Recipe,
  choices: Record<string, ConflictSource>,
): RecipeEditValues {
  const selected = { ...local };
  for (const key of scalars)
    if (choices[key] === 'server') Object.assign(selected, { [key]: server[key] });
  if (choices['ingredients'] === 'server')
    selected.ingredients = server.ingredients.map((row) => ({ ...row }));
  if (choices['steps'] === 'server') selected.steps = [...server.steps];
  return selected;
}
