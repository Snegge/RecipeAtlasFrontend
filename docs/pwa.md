# Installable Recipoke and public offline shell

Recipoke uses Angular 22.2.1's maintained `@angular/service-worker`, registered after stability (30-second maximum). It keeps versioned shell assets together without a second worker framework. Backend domain, database, authorization, concurrency, shopping receipts and event contracts are unchanged. See the backend ADR 016. Official references: https://angular.dev/ecosystem/service-workers/getting-started and https://angular.dev/ecosystem/service-workers/communications.

## Cache and authentication boundary

`ngsw-config.json` prefetches index.html, root JS/CSS bundles (including lazy chunks), favicon, manifest and PNG icons only. There are no data groups or runtime URL groups. Fonts and Material icons are already local. Navigation fallback allowlists only application routes; API, health, photo and SignalR routes are excluded. Angular may return a network-error 504 offline; it must never return shell HTML for server routes. Navigation serves the cached public index, not a cached personalized page. Invitation query strings are not cache keys; invitation secrets remain POST bodies/fragments and must not enter logging or analytics.

An offline launch renders navigation and sign-in UI with a connection-required message. It cannot confirm authentication or load private data. Existing session memory may remain visible and is labelled potentially stale after network failure. Online events are hints; successful API responses clear the failed-connection indicator. A failed auth probe returns false without declaring the session expired; confirmed 401 still uses existing cleanup. Logout clears local state first; a failed server logout reports an error and does not establish server revocation. Reconnect may restore the still-valid cookie session. Public shell caches remain on logout. No previous worker exists in the inspected baseline, so no cache migration is necessary.

No IndexedDB, private persistence, offline write success, durable queue, replay, push or background sync is added. Shopping's existing explicit retry/receipt behavior remains in memory. Cold first visit offline is unsupported.

## Installation and updates

Desktop Chrome/Edge and supported Android browsers: use Install Recipoke when the browser makes its prompt available, or the browser's install menu. Safari on iPhone/iPad: Share ? Add to Home Screen. Other browsers vary. The app never automatically prompts; absent prompt support, its button reveals manual instructions. Standalone display or iOS standalone hides it, and appinstalled updates the running UI. Detection cannot identify every previously installed instance. Standard 192/512 PNGs, a separately padded 512 maskable PNG and 180 Apple icon derive from the existing green book favicon. Manifest language matches the English UI. ID/start/scope are relative and stable.

VERSION_READY offers Reload and Continue for now, with no automatic reload or activateUpdate. Unrecoverable errors show a persistent reload explanation. Reload is refused while the current DirtyPage has unsaved changes, a navigation blocker, any dialog, logout, or an intercepted API mutation is active. Resolve shopping drafts/uncertain actions first. A full reload chooses a coherent worker version; mutations are never replayed. Checks start after stability and repeat every six hours while visible; Angular also checks on navigation. There is no blocking startup dependency or reload loop.

## Hosting and release procedure

The existing topology serves at `/`: frontend Caddy owns static files; ASP.NET Core is API-only. `/api`, `/api/*` and `/health` go to the API without SPA fallback. Do not deploy this build under a subpath without rebuilding with the matching base href and adapting Caddy and API routing: the existing client intentionally uses origin-root `/api` paths. Worker is beside index, scope `/`; no Service-Worker-Allowed override is needed. Use same-origin HTTPS (localhost/loopback is the browser development exception), preserve cookie/security headers and never cache API responses at a CDN. Disable query logging/analytics on invitation pages.

Caddy policy: hashed main/chunk/styles/polyfills JS/CSS are public immutable for one year; manifest/favicon/icons are public for one day; index, worker scripts and ngsw.json revalidate (`no-cache`). Missing files with extensions return 404, not index. API responses remain no-store, including errors and authenticated images.

1. In the frontend run `npm ci`, `npm run check:contracts`, `npm test`, `npm run build`. In backend run `dotnet build --no-restore` and `dotnet run --no-build --project tests/Recipoke.Tests`. See each README for restore and other HTTP regression commands.
2. Build and verify the complete `dist/recipoke` before publishing. Never generate ngsw.json against a partially uploaded tree. Publish new hashed assets first, then public icons/manifest, index and worker files; publish ngsw.json last. Prefer an atomic directory switch after the complete tree is available.
3. **Retain old hashed chunks** alongside the new output for old tabs and lazy imports. The stock replacement Docker image alone does not retain earlier assets. For production, maintain release directories containing the new complete dist plus prior hashed JS/CSS files, and mount the selected directory read-only at `/srv` on Caddy via your Compose override. Keep `/srv/index.html` and `/srv/ngsw.json` from the same new build. Switch the complete mount/release atomically with your existing deployment tooling. Keep releases for your maximum supported open-tab lifetime (initial operational policy: seven days); tabs older than retention may need an explicit reload. Never overwrite a hash-named asset with different bytes.
4. Keep existing Compose project name, API data/key volume and same-origin proxy. Configure actual frontend build context in `compose.fullstack.example.yaml`; `./frontend` is an example, not the sibling checkout's assumed location. The backend-only Caddyfile does not serve the frontend and cannot provide PWA hosting by itself.
5. Roll back index, worker metadata and public metadata together to a retained complete release, preserving both generations of hashed assets. Existing tabs may keep their assigned version until reload. No PWA database migration exists. Backend schema rollback rules still apply separately.

For local browser verification after production build, from the backend checkout:

```
node tests/pwa_browser.mjs /absolute/frontend/root /absolute/chromium/executable
node tests/shopping_browser.mjs /absolute/frontend/root /absolute/chromium/executable
```

The PWA runner starts a disposable SQLite backend and a local production-file HTTP proxy. It tests the Angular worker, not Caddy configuration. It serves A then an index with a B marker and matching generated hash manifest, announces B without reload, and verifies explicit reload selects B. It checks desktop/narrow mobile shell, cache URLs and offline server requests. It is not a physical-device installation test, full container deployment test or a second independently compiled application release. Run deployment smoke checks with real Caddy before release: direct frontend navigation, missing chunk 404, unknown API 404/no-store, JS/CSS and manifest MIME, no-cache index/ngsw, immutable hashed assets, HTTPS and worker scope. Never use a real user database for smoke tests.

## Development recovery and limits

Development `npm start` has no worker. Use a separate disposable browser profile for production checks. Inspect DevTools Application ? Service Workers/Cache Storage, and `/ngsw/state` for Angular worker diagnostics. First close old app tabs and reload online. If necessary in a disposable development profile, unregister only this application's worker at its exact scope and remove only its identified `ngsw:` caches. Do not clear all origin storage or unregister unrelated workers. An unrecoverable version requires deliberate reload after work is saved/copied; drafts cannot survive reload in this phase.

Automated evidence and outstanding checks are recorded in the backend verification report. Real Android/iOS devices, app-store behavior, public TLS and full release infrastructure require separate validation.
