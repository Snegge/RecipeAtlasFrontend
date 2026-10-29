import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, stable(value[key])]),
        )
      : value;
for (const [path, digest] of Object.entries(readJson('contracts/quantity-fingerprints.json'))) {
  assert.equal(
    createHash('sha256')
      .update(JSON.stringify(stable(readJson(path))))
      .digest('hex'),
    digest,
    `${path}: synchronise the authoritative backend fixtures`,
  );
}
const api = readJson('contracts/recipoke.openapi.json');
const schemas = api.components.schemas;
const program = ts.createProgram(
  [
    'src/app/core/models/recipe.model.ts',
    'src/app/core/models/recipe-import.model.ts',
    'src/app/core/models/account.model.ts',
    'src/app/core/models/shopping.model.ts',
  ],
  { strict: true, noEmit: true, target: ts.ScriptTarget.ES2022 },
);
const checker = program.getTypeChecker();
const interfaces = new Map();
for (const source of program.getSourceFiles()) {
  if (!source.fileName.includes('/core/models/')) continue;
  ts.forEachChild(source, (node) => {
    if (ts.isInterfaceDeclaration(node))
      interfaces.set(node.name.text, checker.getTypeAtLocation(node));
  });
}
let assertions = 0;
function compare(type, schema, path, input = false) {
  if (schema?.oneOf) {
    const values = schema.oneOf.filter(choice => choice.type !== 'null');
    assert(schema.oneOf.length === 2 && values.length === 1, `${path}: unsupported union`);
    const choice = values[0];
    const valueSchema = choice.$ref ? schemas[choice.$ref.split('/').at(-1)] : choice;
    assert(valueSchema?.type, `${path}: nullable union must contain a typed value`);
    schema = { ...valueSchema, type: [valueSchema.type, 'null'].flat() };
  }
  if (schema.$ref) schema = schemas[schema.$ref.split('/').at(-1)];
  assert(schema, `Missing schema: ${path}`);
  const variants = type.isUnion() ? type.types : [type];
  const nullable = variants.some((t) => t.flags & ts.TypeFlags.Null);
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!input) assert.equal(nullable, types.includes('null'), `${path}: nullable contract`);
  else assert(!nullable || types.includes('null'), `${path}: input must be supported by API`);
  const value = checker.getNonNullableType(type);
  assertions++;
  if (types.includes('integer') || types.includes('number')) {
    // ASP.NET describes AllowReadingFromString on numeric inputs. Numeric output remains JSON numbers.
    assert(value.flags & ts.TypeFlags.NumberLike, `${path}: expected number`);
  } else if (types.includes('string'))
    assert(value.flags & ts.TypeFlags.StringLike, `${path}: expected string`);
  else if (types.includes('boolean'))
    assert(
      (value.isUnion() ? value.types : [value]).every((t) => t.flags & ts.TypeFlags.BooleanLike),
      `${path}: expected boolean`,
    );
  else if (types.includes('array')) {
    const element = checker.getIndexTypeOfType(value, ts.IndexKind.Number);
    assert(element, `${path}: expected array`);
    compare(element, schema.items, `${path}[]`, input);
  } else if (schema.properties) {
    const properties = new Map(checker.getPropertiesOfType(value).map((p) => [p.name, p]));
    assert.deepEqual(
      [...properties.keys()].sort(),
      Object.keys(schema.properties).sort(),
      `${path}: JSON properties`,
    );
    for (const [key, child] of Object.entries(schema.properties)) {
      const property = properties.get(key);
      compare(
        checker.getTypeOfSymbolAtLocation(
          property,
          property.valueDeclaration ?? property.declarations[0],
        ),
        child,
        `${path}.${key}`,
        input,
      );
    }
  } else
    throw new Error(
      `Unsupported schema at ${path}; extend the focused contract checker explicitly`,
    );
}
for (const [frontend, backend] of Object.entries({
  Ingredient: 'IngredientResponse',
  Recipe: 'RecipeResponse',
  RecipeCard: 'RecipeCard',
  RecipePage: 'RecipePage',
  Unit: 'UnitDefinition',
  ImportedIngredient: 'ImportedIngredient',
  RecipeImportDraft: 'RecipeImportDraft',
  RecipeImportResult: 'RecipeImportResult',
  CurrentUserResponse: 'CurrentUserResponse',
  AccountResponse: 'AccountResponse',
  InvitationResponse: 'InvitationResponse',
  CreatedInvitation: 'CreatedInvitation',
  InvitationValidity: 'InvitationValidity',
  CookbookResponse: 'CookbookResponse',
  MemberResponse: 'MemberResponse',
  CookbookInvitationResponse: 'CookbookInvitationResponse',
  CookbookMembersResponse: 'CookbookMembersResponse',
  VersionResponse: 'VersionResponse',
  RecipeImageResponse: 'ImageResponse',
  ShoppingItemResponse: 'ShoppingItemResponse',
  ShoppingListSummary: 'ShoppingListSummary',
  ShoppingMemberResponse: 'ShoppingMemberResponse',
  ShoppingPendingInvitation: 'ShoppingPendingInvitation',
  ShoppingListResponse: 'ShoppingListResponse',
  ShoppingInvitationResponse: 'ShoppingInvitationResponse',
  ShoppingMutationResponse: 'ShoppingMutationResponse',
  ShoppingReservationResponse: 'ShoppingReservationResponse',

})) {
  assert(interfaces.has(frontend), `Missing frontend interface ${frontend}`);
  compare(interfaces.get(frontend), schemas[backend], frontend);
}
assert.throws(() => compare(interfaces.get('ShoppingMutationResponse'), {
  ...schemas.ShoppingMutationResponse,
  properties: { ...schemas.ShoppingMutationResponse.properties,
    item: { $ref: '#/components/schemas/ShoppingItemResponse' } },
}, 'negative.shoppingNullable'), /nullable contract/);
compare(interfaces.get('RecipeWriteRequest'), schemas.RecipeInput, 'RecipeWriteRequest', true);
assert.deepEqual(schemas.IngredientInput.properties.quantity.type, ['null', 'string']);
assert.equal(schemas.IngredientResponse.properties.quantity.type, 'string');
assert.throws(
  () =>
    compare(
      interfaces.get('Ingredient'),
      {
        ...schemas.IngredientResponse,
        properties: { ...schemas.IngredientResponse.properties, quantity: { type: 'number' } },
      },
      'negative.quantity',
    ),
  /expected number/,
);
const paths = new Set(Object.keys(api.paths).map((path) => path.replace(/\/$/, '')));
for (const file of [
  'recipe-api.service.ts',
  'recipe-import.service.ts',
  'auth.service.ts',
  'cookbook.service.ts',
  'account-admin.service.ts',
]) {
  const source = readFileSync(`src/app/core/services/${file}`, 'utf8');
  for (const match of source.matchAll(/['`"](\/api\/[^'`"]+)['`"]/g)) {
    const path = match[1].replace(/\$\{([^}]+)\}/g, '{$1}').replace(/\/$/, '');
    assert(paths.has(path), `Unknown frontend API route ${path}`);
  }
}
assert(
  readFileSync('src/app/core/interceptors/api.interceptor.ts', 'utf8').includes(
    "'X-RecipeAtlas': '1'",
  ),
);
for (const [path, methods] of Object.entries(api.paths))
  for (const [method, operation] of Object.entries(methods)) {
    if (path.startsWith('/api/') && !['get', 'head', 'options'].includes(method))
      assert(
        operation.parameters?.some(
          (p) => p.in === 'header' && p.name === 'X-RecipeAtlas' && p.required,
        ),
        `${method} ${path}: write header`,
      );
  }
// Every versioned operation advertises its rejection contract and strong header where applicable.
for (const [path, methods] of Object.entries(api.paths)) {
  const aggregate =
    /^\/api\/cookbooks\/\{id\}/.test(path) ||
    path.startsWith('/api/cookbooks/{cookbookId}/recipes/{id}') ||
    path === '/api/cookbook-invitations/{id}';
  for (const [method, operation] of Object.entries(methods)) {
    if (!aggregate || !['put', 'delete', 'post'].includes(method)) continue;
    if (path.endsWith('/recipes') || path.includes('import')) continue;
    assert(
      operation.responses['428'] && operation.responses['400'],
      `${method} ${path}: version preconditions`,
    );
    const header = method === 'delete' || (method === 'put' && path.endsWith('/image'));
    assert(operation.responses[header ? '412' : '409'], `${method} ${path}: stale version status`);
    if (header)
      assert(
        operation.parameters?.some((p) => p.in === 'header' && p.name === 'If-Match' && p.required),
        `${method} ${path}: strong If-Match`,
      );
  }
}
// Shopping service composes item routes from its list base; compare the resolved templates.
const shoppingSource = readFileSync('src/app/core/services/shopping.service.ts', 'utf8');
const shoppingTemplates = [
  ...shoppingSource.matchAll(/['`"](\/api\/shopping[^'`"]+)['`"]/g),
  ...shoppingSource.matchAll(/`(\$\{base\}[^`]+)`/g),
];
for (const match of shoppingTemplates) {
  const path = match[1].replace('${base}', '/api/shopping-lists/{listId}')
    .replace(/\$\{(?:c\.)?([^}]+)\}/g, '{$1}').replace('{invitationId}', '{id}');
  assert(paths.has(path), `Unknown shopping route ${path}`);
}
for (const [path, methods] of Object.entries(api.paths)) {
  if (!path.startsWith('/api/shopping-lists')) continue;
  for (const [method, operation] of Object.entries(methods)) {
    const reservation = path.endsWith('/reservation');
    const versioned = !reservation && (['put', 'delete'].includes(method) ||
      method === 'post' && ['/invitations', '/respond', '/leave', '/transfer'].some(suffix => path.endsWith(suffix)));
    if (versioned || reservation && method === 'post') {
      assert(operation.responses['428'] && operation.responses['400'], `${method} ${path}: shopping preconditions`);
      assert(operation.responses[method === 'delete' ? '412' : '409'], `${method} ${path}: shopping conflict`);
    }
    if (method === 'delete' && !reservation) {
      for (const name of ['If-Match', 'X-Operation-Id'])
        assert(operation.parameters.some(p => p.name === name && p.in === 'header' && p.required), `${path}: ${name}`);
    }
  }
}
console.log(
  `Contract checks passed: ${assertions} transport type/nullability checks, routes, write header and authoritative quantity fingerprints.`,
);
