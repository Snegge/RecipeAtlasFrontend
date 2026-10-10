# Recipe Atlas: module-based Angular frontend

This version refactors the RecipeAtlas frontend into NgModules and separate component files. It uses the same C# API and the same recipe data contract. Angular and Angular Material versions remain unchanged.

## Replace your current frontend

Your current frontend path is `D:\Programmier Umgebung\RecipeAtlasFrontend`.

1. Stop `npm start` with Ctrl+C.
2. Commit or back up your current frontend, especially any changes you made locally.
3. Extract this archive to a temporary directory. It contains a `frontend` folder.
4. Replace the old project's `src` folder with the new `frontend/src` folder. Replace it completely instead of merging, so the old `pages` directory and standalone routing files do not remain.
5. Copy the other files from `frontend` into your frontend project root, including `angular.json`, `package.json`, `package-lock.json`, all `tsconfig` files, and the formatting configuration. Preserve your existing `.git` directory. If you changed the API port, retain that target in `proxy.conf.json`.
6. Run:

```powershell
cd "D:\Programmier Umgebung\RecipeAtlasFrontend"
npm ci
npm test
npm start
```

Keep the backend running in its own terminal:

```powershell
cd "D:\Programmier Umgebung\RecipeAtlas"
dotnet run --project backend/RecipeAtlas.Api --launch-profile http
```

Open http://localhost:4200 and use your existing owner password. No database migration, password reset, or backend changes are needed for this refactor.

Use Node.js 24.15+ within version 24, or another version supported by the `engines` entry in package.json. If PowerShell blocks npm.ps1, use `npm.cmd` for the commands above.

This package includes the login correction from our conversation. It cannot include any other edits made only on your computer, so compare those before replacing your files.

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

`npm run build` produces the deployable app in `dist/recipeatlas`. Auth and recipes are lazy-loaded feature modules.

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

Deploy this frontend branch (`WebsiteReipeEctraction`) together with the backend `WebsiteScraping` branch and its `StringIngredientQuantities` migration. Old numeric/null API payloads are incompatible. See the backend's `docs/quantity-strings.md` for exact migration/startup commands, data backup requirements and conversion definitions. The existing URL import dialog, imported-photo fallback, mobile layout and unsaved-draft protection are retained.

`src/app/core/utils/measurement-units.json` and `fixtures/quantity-cases.json` mirror the backend definitions/cases. Keep both copies synchronized and run `python3 tests/check_shared_contracts.py ../RecipeAtlasFrontend` from the backend checkout. Frontend checks remain `npm test` and `npm run build`.

## Social description and pasted-text import

Use `feature/social-description-import` in both repositories. Its backend base is
`WebsiteScraping`; the existing frontend base is spelled `WebsiteReipeEctraction`
(`WebsiteRecipeExtraction` was absent). The existing link dialog now supports
public YouTube videos/Shorts, TikTok videos and Instagram Reels, plus **Text**.
On caption retrieval failure, **Paste description instead** keeps the original
URL. Standalone text needs no URL. Loading prevents duplicate requests, closing
the dialog cancels the request, and failures keep the dialog open. Photo import
remains disabled. Drafts use the existing editor, review confirmation and unsaved
change protection; missing fields must be supplied before saving.

```bash
git fetch origin WebsiteReipeEctraction feature/social-description-import
git switch feature/social-description-import
npm ci
npm test
npm run build
npm start
```

Start the matching backend at `http://localhost:5080`; Angular proxies `/api`.
No AI credentials or platform selection belong in Angular. Backend installation,
pinned yt-dlp version, secure model/key configuration, authenticated example
requests, limits and live verification steps are documented in
[the backend setup guide](https://github.com/Snegge/RecipeAtlas/blob/feature/social-description-import/docs/social-description-import.md).
No new database migration is required. Social import is description-only:
no video/audio, subtitles, comments, bios or linked pages are read. Missing or
blocked captions yield an actionable error rather than an invented recipe.
AI-extracted ingredients require review, and source wording/quantities remain
available. Website imports continue working without AI configuration.
