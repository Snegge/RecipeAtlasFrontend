# Recipoke: module-based Angular frontend

This version refactors the Recipoke frontend into NgModules and separate component files. It uses the same C# API and the same recipe data contract. Angular and Angular Material versions remain unchanged.

See the [German architecture guide](docs/architecture.md) for editor state ownership, contract synchronisation and verification.

## Local development

Use the existing `Snegge/RecipeAtlasFrontend` checkout on `main`. The GitHub repository and checkout directory have not been renamed. From that directory:

```sh
npm ci
npm run check:contracts
npm test
npm run build
npm start
```

Use Node.js 24.15+ within version 24, or another version supported by `engines` in package.json. In a separate terminal in the sibling `RecipeAtlas` checkout, after configuring the existing owner password as described in the backend README:

```sh
dotnet run --project backend/RecipeAtlas.Api/Recipoke.Api.csproj --launch-profile http
```

The frontend runs on port 4200 and proxies `/api` to port 5080. Keep using your existing owner password. No database migration or password reset is required by this rename.

## Recipoke rename compatibility

The npm package is `recipoke-frontend`, the Angular project is `recipoke`, and production output is `dist/recipoke`. The Dockerfile copies that new output path. Browser titles, navigation, accessibility labels and import messages use Recipoke. The book favicon contains no text; there is no web app manifest to rename.

`X-RecipeAtlas: 1` remains the write header so existing clients and the API stay compatible. The backend retains its `RecipeAtlas.Session` cookie, `RecipeAtlas` data-protection identity and `RecipeAtlas.LocalDevelopment` user-secrets ID. Deployment variables `RECIPE_ATLAS_DOMAIN` and `RECIPE_ATLAS_PASSWORD_HASH`, Compose project/volume names, `/app/data`, API routes and JSON contracts remain unchanged. Keep the existing Compose project name and data/key volumes. No browser storage keys need migration; imported drafts remain in memory. Repository names, remote URLs and sibling checkout paths remain unchanged.

## Structure

```text
src/
  main.ts
  styles.scss
  app/
    app.module.ts
    app-routing.module.ts
    app.component.ts
    app.component.html
    app.component.scss
    app.component.spec.ts
    core/
      models/
        recipe.model.ts
      services/
        auth.service.ts
        recipe-api.service.ts
      guards/
        auth.guard.ts
        unsaved-changes.guard.ts
      interceptors/
        api.interceptor.ts
      utils/
        api-error.ts
        photo.ts
    shared/
      material.module.ts
      shared.module.ts
      components/
        icon/
        confirm-dialog/
    features/
      auth/
        auth.module.ts
        auth-routing.module.ts
        pages/
          login/
      recipes/
        recipes.module.ts
        recipes-routing.module.ts
        models/
          recipe-form.model.ts
        pages/
          recipe-list/
          recipe-detail/
          recipe-editor/
        components/
          recipe-card/
          ingredient-editor/
          step-editor/
          photo-picker/
```

Every component folder contains its own `.component.ts`, `.component.html`, and `.component.scss`. Focused regression tests use neighboring `.component.spec.ts` files.

## What belongs where

| File or directory | Responsibility |
|---|---|
| app.module.ts | Root declarations, browser support, HTTP client, interceptor, change detection |
| app-routing.module.ts | Root URLs and lazy loading of feature modules |
| shared/material.module.ts | Angular Material UI module imports and exports |
| shared/shared.module.ts | Shared UI components, CommonModule, ReactiveFormsModule, RouterModule, MaterialModule |
| features/auth/auth.module.ts | Login component declarations and auth routing |
| features/recipes/recipes.module.ts | Recipe page and editor component declarations |
| core/services | HTTP requests and authentication state |
| core/guards | Access checks and unsaved-change protection |
| core/interceptors | Required X-RecipeAtlas header for API writes |
| core/models | API data interfaces |
| features/recipes/models | Typed form contracts passed to editor children |
| component.scss files | Styles specific to that component, including responsive rules |
| src/styles.scss | Material theme, global resets, typography, reusable layout/error/loading utilities |

All components explicitly use `standalone: false`. They no longer have component-level `imports` arrays. Feature modules import `SharedModule`, which supplies common template dependencies.

TypeScript `import` statements still exist wherever a file uses a service, decorator, interface, or other symbol. For example, a component injecting `MatDialog` must import that service class. This is separate from importing `MatDialogModule` for template support, which is centralized in MaterialModule.

Core services use `providedIn: 'root'`. They remain singletons without a separate CoreModule or repeated feature-level providers.

## Editor component boundaries

`RecipeEditorComponent` owns the complete reactive form, validation, loaded recipe, selected photo, and save sequence.

| Child component | Input data | Output events |
|---|---|---|
| RecipeCardComponent | Recipe list item | Navigation through its link |
| IngredientEditorComponent | Typed ingredient FormArray, available units, busy state | Add, remove, unit changed |
| StepEditorComponent | Typed step FormArray, busy state | Add, remove, reorder |
| PhotoPickerComponent | Preview URL, busy/preparation states, photo error | File selected, photo removed |

The children do not save independently or create separate copies of form data. Their inputs reference the parent's form controls, and their outputs request parent actions. This preserves validation and one consistent save operation.

## Generate another component

Run this from the frontend root:

```powershell
npx ng generate component features/recipes/components/recipe-notes --module features/recipes/recipes.module
```

The project defaults in angular.json configure:

- Non-standalone components.
- Separate HTML and SCSS files.
- `.component` filename suffixes.

The command adds the generated component to `RecipesModule`. Specifying `--module` keeps the destination unambiguous when both feature and routing modules are nearby.

The defaults were checked with a generator dry run. No example component is included in the project.

## Add an Angular Material component

Edit `src/app/shared/material.module.ts`. Import the desired Material module and add it to `MATERIAL_MODULES`. It then becomes available to templates in modules importing SharedModule.

Do not add Material UI modules to each component. Components still import any Material service classes they inject.

## Functionality retained

- Password login, session checking, and sign out.
- Recipe search, pagination, cards, detail view, and ingredient checkboxes.
- Create, edit, and delete recipes.
- Standardized ingredient units from the backend.
- Add/remove ingredients and add/remove/reorder steps.
- Photo selection, resizing, upload, replacement, and deletion.
- Client validation, loading/empty/error states, and save feedback.
- Confirmation before deletion or leaving unsaved changes.
- Cookie authentication and the required API write header.

The login form now uses `[formGroup]="form"` with `(ngSubmit)="login()"`. This fixes the original template issue where no form directive emitted ngSubmit. The list's request subscription is also isolated with `untracked`, so incidental signal reads inside service/interceptor code do not become list-refresh dependencies.

No public sharing, offline synchronization, or additional backend features were introduced.

## Run checks and build

```powershell
npm test
npm run build
```

Tests use Angular TestBed with Vitest and jsdom. They do not require Chrome, a running API, or your password. HTTP-facing services are stubbed so the checks isolate form submission, module routing, and component wiring.

`npm run build` produces the deployable app in `dist/recipoke`. Auth and recipes are lazy-loaded feature modules.

To format the source files consistently:

```powershell
npm run format
```

## Deployment

The included Dockerfile, Caddyfile, and `compose.fullstack.example.yaml` retain the previous deployment approach. The Compose example assumes the backend and frontend directories live together under one repository root:

```text
repository-root/
  backend/
  frontend/
  Dockerfile
  compose.yaml
  .env
```

If you keep the frontend in a separate repository, use your existing deployment process or arrange those build contexts before using that example. Local development works with separate repositories.

The frontend uses relative `/api` URLs. Its development proxy forwards those requests to `http://localhost:5080`. Production Caddy serves the frontend and forwards `/api` and `/health` to the API on the same origin.

Keep your existing production data volume, environment variables, and domain configuration. Docker deployment is not necessary to use this refactor locally.

## References

- NgModules: https://angular.dev/guide/ngmodules/overview
- Angular version compatibility: https://angular.dev/reference/versions

## Verification for this package

- Production build passed.
- Seven regression checks passed across four test files.
- All eleven components have separate TS, HTML, and SCSS files.
- Component generation was checked with a dry run.
- Tests cover lazy module navigation, rendered login form submission, rejected-login loading recovery, recipe list loading, child form binding, ingredient/step actions, and photo-upload retry without duplicate creation.

The tests run in jsdom with stubbed API services. They do not verify real-browser visual layout or a live Docker deployment.

## Quantity strings and website import

Ingredient quantities are strings across the API, import drafts and forms: `2`, `0.5`, `1/2`, `1 1/2`, `3-4`. Use the text quantity field for manual entry. Quick entry and website imports normalize decimals/ranges and convert pounds/weight ounces to g and cups/explicit fluid ounces to ml. Unspecified cups/fluid ounces assume US customary definitions and are marked for review; 250 ml metric cooking cups also need review because conventions differ. Original source text and notes remain visible. Fix incomplete quantities/units and choose “Confirm reviewed” before saving flagged ingredients. `toTaste` clears and disables quantity; changing its unit restores validation.

The detail serving selector scales the original stored quantities, including both range endpoints, without changing the recipe. Fractions are retained where possible. Unparseable values display their original text with “not scaled”.

Deploy the current frontend and backend `main` versions together and its `StringIngredientQuantities` migration. Old numeric/null API payloads are incompatible. See the backend's `docs/quantity-strings.md` for exact migration/startup commands, data backup requirements and conversion definitions. The existing URL import dialog, imported-photo fallback, mobile layout and unsaved-draft protection are retained.

`src/app/core/utils/measurement-units.json` and `fixtures/quantity-cases.json` mirror the backend definitions/cases. The backend Domain resource and backend fixtures are authoritative. Use `scripts/sync_frontend_contracts.py` from the backend to synchronise them; see `docs/architecture.md`. Keep both copies synchronized and run `python3 tests/check_shared_contracts.py ../RecipeAtlasFrontend` from the backend checkout. Frontend checks remain `npm test` and `npm run build`.

## Social description and pasted-text import

The social/text import feature is included in `main` in both repositories. Historically it was developed on `feature/social-description-import`, based on backend `WebsiteScraping` and frontend `WebsiteReipeEctraction`. The existing link dialog now supports
public YouTube videos/Shorts, TikTok videos and Instagram Reels, plus **Text**.
On caption retrieval failure, **Paste description instead** keeps the original
URL. Standalone text needs no URL. Loading prevents duplicate requests, closing
the dialog cancels the request, and failures keep the dialog open. Photo import
remains disabled. Drafts use the existing editor, review confirmation and unsaved
change protection; missing fields must be supplied before saving.

```bash
npm ci
npm test
npm run build
npm start
```

Start the matching backend at `http://localhost:5080`; Angular proxies `/api`.
No AI credentials or platform selection belong in Angular. Backend installation,
pinned yt-dlp version, secure model/key configuration, authenticated example
requests, limits and live verification steps are documented in
[the backend setup guide](https://github.com/Snegge/RecipeAtlas/blob/main/docs/social-description-import.md).
No new database migration is required. Social import is description-only:
no video/audio, subtitles, comments, bios or linked pages are read. Missing or
blocked captions yield an actionable error rather than an invented recipe.
AI-extracted ingredients require review, and source wording/quantities remain
available. Website imports continue working without AI configuration.
