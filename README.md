# Recipoke Angular frontend

Invitation-only accounts and shared cookbooks for the Recipoke API. Angular 22 with lazy NgModules, typed Reactive Forms, Signals and RxJS; no global state library or browser token storage.

Use **`feature/accounts-and-cookbooks` in both repositories**. The backend must be migrated and bootstrapped before signing in. See the backend [upgrade/runbook](https://github.com/Snegge/RecipeAtlas/blob/feature/accounts-and-cookbooks/docs/accounts-and-cookbooks.md) and the German [frontend architecture guide](docs/architecture.md).

## Local development

Supported Node versions are in `package.json`; CI uses **24.19.0**. From this checkout:

```sh
npm ci
npm run check:contracts
npm test
npm run build
npm start
```

In the backend checkout, with .NET SDK 10.0.401:

```sh
dotnet restore --locked-mode
dotnet tool restore
dotnet build --no-restore
dotnet user-secrets set 'Accounts:PublicAppUrl' 'http://localhost:4200' --project backend/RecipeAtlas.Api
dotnet run --no-build --project backend/RecipeAtlas.Api -- --bootstrap-admin
dotnet run --no-build --project backend/RecipeAtlas.Api --launch-profile http
```

Bootstrap prompts for a username, display name and hidden password (12–256 characters). No default password or public registration exists. It creates/claims the initial personal cookbook and safely refuses reinitialisation. Existing installations must stop writes and follow the backup/upgrade runbook first. The obsolete owner hash is not reused; everyone signs in afresh.

Open `http://localhost:4200`; the development proxy forwards `/api` to port 5080. `/workspace/.setup/env.sh` is cloud-only and not needed on your local machine.

## Workflows

- Sign in with username/password. **Cookbooks** lists only owned/shared books and lets active users create books. Select a book to browse its recipes.
- Owner: recipe/photo changes plus **Members and settings**. Add an existing exact username as Viewer or Editor, change/remove members, or rename. Ownership cannot be transferred/removed.
- Editor: recipe CRUD/import/photo actions. Viewer: read-only recipes, photos, quantities and serving scaling. Nonowners may leave a book.
- **Account** changes the password with the current password; other sessions are invalidated.
- Global administrators additionally see **Accounts**: list ordinary account status, deactivate/reactivate, issue/list/revoke invitations. This grants no automatic private cookbook access.
- A newly created invitation link is copyable once; it is a bearer capability and must be shared privately. The recipient opens `/invite#token=...`, validates without consuming, selects a profile/password and submits. Invalid/expired/revoked/used links show clear states. The page removes the fragment and contains no third-party resources or analytics.
- Recipe imports remain editable in-memory drafts. Select a writable cookbook and use **Import recipe → Link/Text**. Saving rechecks current server permissions. Missing fields/review flags must be resolved as before.

When access changes during editing, a denied save keeps unsaved fields/photos and explains how to preserve them before leaving. Explicit logout/account switch clears user data, imported drafts, photos and cookbook selection; old in-flight responses cannot restore prior-user data. An expired session alone keeps unsaved editor work. Navigation guards aid usability; backend authorization remains authoritative.

For a two-browser sharing demonstration, use [the backend walkthrough](https://github.com/Snegge/RecipeAtlas/blob/feature/accounts-and-cookbooks/docs/accounts-and-cookbooks.md#two-user-demonstration).

## Structure and state ownership

```text
src/app/
  app-routing.module.ts             # lazy accounts/cookbooks/auth/recipes
  core/
    models/                        # transport interfaces; separate from forms
    services/
      session-state.ts             # current user + session generation, single owner
      auth.service.ts              # cookie/session HTTP operations
      cookbook-context.ts          # selected book, derived UI permissions
      cookbook.service.ts          # explicit cookbook/member API requests
      account-admin.service.ts     # account/invitation API requests
      recipe-api.service.ts        # explicit cookbook ID on content requests
      recipe-draft.service.ts      # in-memory import handoff
    guards/                        # auth, admin, cookbook, unsaved changes
    interceptors/                  # write header, session cancellation, 401
  features/
    auth/pages/login/
    accounts/                      # invitation, password settings, admin
    cookbooks/                     # overview/create, owner settings/membership
    recipes/
      pages/recipe-editor/         # component-scoped coordinator/form/photo owners
      pages/recipe-list/
      pages/recipe-detail/
      components/                  # existing form children/import dialog/cards
  shared/                          # Material/UI modules and existing components
```

The editor retains its component-scoped coordinator and focused form/photo helpers. Save text first, remember its ID, then save the photo; retry never creates a duplicate. Ingredient/step order, quantity strings/fractions/ranges/conversions, review, cancellation and unsaved navigation protection remain in place. New account/cookbook pages use labelled forms and responsive cards with 44px touch controls rather than wide desktop tables.

## API and compatibility

Same-origin HttpOnly `Recipoke.Session`, Strict SameSite, Secure in Production. `X-RecipeAtlas: 1` remains the write header. No CORS, JWT/localStorage session or global role cache. Old `RecipeAtlas.Session` is deliberately rejected. Server-side stamp/activity checks enforce password changes/deactivation; reactivation requires fresh login.

New frontend content routes: `/cookbooks`, `/cookbooks/{cookbookId}/recipes[/new|/{id}|/{id}/edit]`, `/cookbooks/{cookbookId}/settings`. Account routes: `/login`, `/invite`, `/account`, `/admin`. Corresponding recipe API routes are `/api/cookbooks/{cookbookId}/recipes`; import stays `/api/recipes/import`. Recipe JSON fields and string quantities remain stable; `imageUrl` changes to a cookbook route. Deploy both repositories together; old unscoped recipe URLs are retired.

The package/project remain `recipoke-frontend`/`recipoke`; build output is `dist/recipoke`. GitHub names, remote URLs, `RECIPE_ATLAS_DOMAIN`, Compose volume/project identities and backend content root/data paths remain unchanged. Deployment no longer needs `RECIPE_ATLAS_PASSWORD_HASH`; use the bootstrap command. Preserve existing data/key mounts. The Compose example still assumes a backend build context at `.` and frontend at `./frontend`; arrange the contexts explicitly for separate checkouts.

## Verification and contracts

`npm test` runs Angular TestBed/Vitest in jsdom without a browser/API or credentials. Tests cover quantities/imports/editor/photos and account invitation/roles/guards/session isolation. `npm run build` creates the production SPA. These checks do not prove real-browser visual layout, live providers, public TLS or container runtime.

The backend owns `contracts/recipoke.openapi.json`, Domain measurement definitions and quantity fixtures. `npm run check:contracts` checks transport properties/nullability/types, routes, write header and fixture fingerprints. From the backend after intentionally updating contracts:

```sh
python3 scripts/export_openapi.py
python3 scripts/sync_frontend_contracts.py /absolute/path/to/RecipeAtlasFrontend
python3 tests/check_shared_contracts.py /absolute/path/to/RecipeAtlasFrontend
python3 scripts/sync_frontend_contracts.py /absolute/path/to/RecipeAtlasFrontend --check
```

Use the actual root with `package.json`. Frontend CI checks copied artifacts locally and does not require private backend credentials; the cross-repository command detects unsynchronised copies. `npm ci` uses the lockfile. npm funding/update/install-script notices are not vulnerability findings; check the actual audit output.

Known limits: in-memory drafts lost on refresh, recipe edits remain last-write-wins, no account deletion/promotion UI, ownership transfer, cookbook deletion, reset email, shopping lists, cooking sessions, offline sync or PWA. Invitation links cannot be recovered after creation. Permissions always come from the server, even when UI controls were visible earlier.

Optional real-browser smoke with both local checkouts and installed Chromium (backend already built, dotnet on PATH):

```sh
node tests/browser-accounts-smoke.mjs /absolute/path/to/RecipeAtlas /path/to/chromium
```

This starts isolated backend/frontend instances with synthetic data and separate browser contexts, exercises the invitation/sharing/editor/account flows and measures horizontal layout at 320px/1280px. The 21 checks passed with Chromium 154. No external provider, existing browser profile or user database is used. This cross-repository check is not part of frontend-only CI and does not replace a full visual/mobile review.
