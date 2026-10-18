# Recipoke Angular frontend

Invitation-only accounts and shared cookbooks for the Recipoke API. Angular 22 with lazy NgModules, typed Reactive Forms, Signals and RxJS; no global state library or browser token storage.

Use **`feature/shared-editing` in both repositories**. The backend must be migrated; bootstrap is needed once for a new installation or the original single-owner upgrade, not for this concurrency update. Backend and frontend must be deployed together; reload old tabs. See the [concurrency runbook](https://github.com/Snegge/RecipeAtlas/blob/feature/shared-editing/docs/shared-editing.md). See the backend [upgrade/runbook](https://github.com/Snegge/RecipeAtlas/blob/feature/shared-editing/docs/accounts-and-cookbooks.md) and the German [frontend architecture guide](docs/architecture.md).

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
dotnet run --project backend/RecipeAtlas.Api --launch-profile http
```

The bootstrap command is a one-time setup operation and exits; the second `dotnet run` starts the API. Skip bootstrap when your account setup is already complete. Bootstrap prompts for a username, display name and hidden password (12–256 characters). No default password or public registration exists. It creates/claims the initial personal cookbook and safely refuses reinitialisation. Existing installations must stop writes and follow the backup/upgrade runbook first. During the original single-owner upgrade the obsolete owner hash is not reused. The current UI/profile update preserves existing account sessions and accepted memberships; see the runbook for the distinction.

Open `http://localhost:4200`; the development proxy forwards `/api` to port 5080. `/workspace/.setup/env.sh` is cloud-only and not needed on your local machine.

## Workflows

- Sign in with username/password. **Cookbooks** shows image cards for owned/shared books. Mobile has two columns and a bottom **Create cookbook** action. Each card opens the recipes; its three-dot menu offers the actions allowed by your role.
- **Create cookbook** opens a dedicated page for name, description, cover and initial Viewer/Editor invitations. Owners edit details, accepted members and pending invitations on the settings page. Existing usernames are matched explicitly; ownership cannot be transferred.
- Cookbook invitations appear on the recipient's overview, at most five at once. Accept grants the stated role; decline grants no access. The inbox disappears when empty and refills after a response. Duplicate pending invitations are rejected. Existing memberships remain accepted.
- Owners can delete a cookbook and **all its recipes and images**, after an extra confirmation dialog. Nonowners can leave instead. Editors have recipe CRUD/import/photo actions; Viewers can read and scale quantities.
- **Account** changes display name, contact email and profile picture; password change remains a separate form requiring the current password and invalidates other sessions. Email is private to the account and administrator, not a login identifier; delivery and verification are not implemented.
- Global administrators see **Accounts Manager**: responsive account cards, activation controls and account-invitation management. This grants no automatic private cookbook access.
- Account-invitation links are copyable once and must be shared privately. The recipient opens `/invite#token=...`, validates without consuming, supplies profile, email and password, and submits. Invalid/expired/revoked/used links show clear states. The fragment is removed and no third-party resources or analytics are loaded.
- Recipe import is inside **Add recipe → Import recipe → Link/Text**. Results remain editable in-memory drafts; save rechecks permissions and existing review requirements.
- Mobile navigation uses a left slide-out menu and a right in-app back button outside the cookbook overview. Desktop navigation exposes the same routes. **Settings** deliberately contains no controls yet.

When access changes during editing, a denied save keeps unsaved fields/photos and explains how to preserve them before leaving. Explicit logout/account switch clears user data, imported drafts, photos and cookbook selection; old in-flight responses cannot restore prior-user data. An expired session alone keeps unsaved editor work. Navigation guards aid usability; backend authorization remains authoritative.

For a two-browser sharing demonstration, use [the backend walkthrough](https://github.com/Snegge/RecipeAtlas/blob/feature/shared-editing/docs/accounts-and-cookbooks.md#two-user-demonstration).

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
    accounts/                      # invitation, profile/password, admin, settings placeholder
    cookbooks/                     # card overview, invitation inbox, create/edit and members
    recipes/
      pages/recipe-editor/         # component-scoped coordinator/form/photo owners
      pages/recipe-list/
      pages/recipe-detail/
      components/                  # existing form children/import dialog/cards
  shared/                          # UI/avatar, scoped picture selection and existing components
```

The editor retains its component-scoped coordinator and focused form/photo helpers. Save text first, remember its ID, then save the photo; retry never creates a duplicate or repeats already committed text when only a picture remains pending. Conflicts preserve local work and require explicit review before another save. Ingredient/step order, quantity strings/fractions/ranges/conversions, review, cancellation and unsaved navigation protection remain in place. New account/cookbook pages use labelled forms and responsive cards with 44px touch controls rather than wide desktop tables.

## API and compatibility

Same-origin HttpOnly `Recipoke.Session`, Strict SameSite, Secure in Production. `X-RecipeAtlas: 1` remains the write header. No CORS, JWT/localStorage session or global role cache. Old `RecipeAtlas.Session` is deliberately rejected. Server-side stamp/activity checks enforce password changes/deactivation; reactivation requires fresh login.

New frontend content routes: `/cookbooks`, `/cookbooks/new`, `/cookbooks/{cookbookId}/recipes[/new|/{id}|/{id}/edit]`, `/cookbooks/{cookbookId}/settings`. Account routes: `/login`, `/invite`, `/account`, `/admin`, `/settings`. Corresponding recipe API routes are `/api/cookbooks/{cookbookId}/recipes`; import stays `/api/recipes/import`. Recipe JSON fields and string quantities remain stable; `imageUrl` changes to a cookbook route. Deploy both repositories together; old unscoped recipe URLs are retired.

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

Known limits: in-memory drafts lost on refresh, no account deletion/promotion UI, ownership transfer, reset email, shopping lists, cooking sessions, offline sync or PWA. Invitation links cannot be recovered after creation. Permissions always come from the server, even when UI controls were visible earlier.

Optional real-browser smoke with both local checkouts and installed Chromium (backend already built, dotnet on PATH):

```sh
node tests/browser-accounts-smoke.mjs /absolute/path/to/RecipeAtlas /path/to/chromium
```

This starts isolated backend/frontend instances with synthetic data and separate browser contexts, exercises the invitation/sharing/editor/account flows and measures horizontal layout at 320px/390px/1280px. The current suite has 48 checks, including profile/cover upload, pending cookbook invitations, role controls, mobile navigation, cookbook creation, deletion confirmation, Material icon centering and member-field spacing. It passed with Chromium 154. No external provider, existing browser profile or user database is used. This cross-repository check is not part of frontend-only CI. Set `RECIPOKE_SCREENSHOTS=/absolute/output/directory` to retain synthetic mobile/desktop screenshots for visual review; otherwise no screenshots are saved. It does not replace testing on physical mobile devices.


## Invitation troubleshooting and component conventions

After pulling backend changes, stop the old process and start with `dotnet run --project backend/RecipeAtlas.Api --launch-profile http` **without `--no-build`**. Pulling changes does not replace the compiled DLL. An older running backend can return 404 for `/api/cookbook-invitations` and add members immediately. The current UI explains a missing consent API and refuses to send member invitations to it. Existing accepted memberships are preserved; remove a test member first before testing a new invitation. See the backend runbook for the read-only endpoint checks.

Icons now use Angular Material **`mat-icon`** with 22 official Material Design SVGs bundled locally. `SharedModule` initializes the allowlisted `MatIconRegistry`; there are no external icon/font/CDN requests or new npm dependencies. Source revision and Apache-2.0 attribution are in `public/licenses/material-design-icons/`. Icon-only controls are centered independently of the body line height.

Accounts and Cookbooks follow the existing page/component convention. Every component has its own folder and matching `.component.ts`, `.component.html` and `.component.scss`; shared layout rules live in small Sass partials under each feature's `styles/`. Component-specific styles remain next to their template. The Settings and Avatar components also use external template/style files. Paginator and Checkbox modules are loaded only with Recipes, where they are used.

```text
features/accounts/
  pages/account-settings/
  pages/account-admin/
  pages/invitation-page/
  pages/app-settings/
  styles/_account-layout.scss
features/cookbooks/
  pages/cookbook-overview/
  pages/cookbook-editor/
  components/cookbook-invitations/
  styles/_cookbook-layout.scss
```
