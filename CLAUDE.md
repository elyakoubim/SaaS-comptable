# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Monorepo with two apps and a shared Postgres schema:
- `backend/` — Node.js 20 + Express (ESM, `"type": "module"`). Auth via bcrypt + signed JWT (HS256). FPS integration via OIDC (PKCE + RS256 `client_assertion`).
- `frontend/` — React 18 + Vite + React Router + Tailwind. Bearer token stored in `localStorage` (`nv_saas_auth_token`).
- `database/schema.sql` — PostgreSQL schema applied automatically by the backend on bootstrap.
- BullMQ + Redis — token refresh queue (`fps-token-refresh`) with an hourly cron registered by the worker.

## Documentation référence (locale, non commitée)

Le dossier `docs/` à la racine contient la documentation FPS (gitignored). Avant tout dev touchant à MyMinfin, Intervat ou le flow OIDC, consulter d'abord ces docs pour vérifier endpoints, rate limits, et règles métier :

- `docs/spec_saas_comptable.docx` — Spécification produit complète (modules dashboard / alertes / analyse, table de correspondance documents → niveau d'alerte)
- `docs/MMF-API-V09072025.docx` — API MyMinfin : search/download documents fiscaux, rate limits (1 search /10min /CBE), scénarios de test
- `docs/INTERVAT-API-V09072025.docx` — API Intervat : soumission déclarations TVA en XML, erreurs business multilingues (fr/nl/de/en)
- `docs/HOW-TO-ACCES-SPF-API-V25022025.docx` — Sécurité OAuth/OIDC FPS, business authorization (mandatee vs own data)
- `docs/IAM-OIDC-flow.pdf` — Flow OIDC détaillé
- `docs/PROCES-FPS-2025-05-26.docx` — Processus d'enregistrement/validation FPS (helpdesk ServiceNow, formulaires de test)
- `docs/acces_api_legakte.docx` — Credentials OIDC client "legakte" (clientID, scopes, redirect URIs)

## Common commands

Backend (run from `backend/`):
```
npm install
npm run dev         # nodemon src/server.js — http://localhost:4000
npm start           # production entrypoint
npm run worker      # BullMQ worker + scheduler (separate process)
npm run auth:smoke  # spawns app on AUTH_SMOKE_BASE_URL and exercises register/login/me
```

Frontend (run from `frontend/`):
```
npm install
npm run dev         # Vite — http://localhost:5173
npm run build       # outputs frontend/dist
```

Combined deploy (run from repo root): `npm run build` installs both workspaces and builds the frontend; `npm start` runs the backend, which serves `frontend/dist` when present (see `backend/src/app.js`). There is no test runner or linter wired up; treat `auth:smoke` as the only automated check.

Apply the database schema manually with `psql $DATABASE_URL -f database/schema.sql`, or just boot the backend — `ensureDatabaseSchema` in `backend/src/config/db.js` runs the same SQL on startup when `DATABASE_URL` is set.

## Architecture notes

### Two-process backend
`server.js` runs the HTTP API; `workers/scheduler.js` is a separate Node process that owns the BullMQ `Worker` and registers the hourly `refresh-all` job scheduler. The HTTP routes enqueue jobs (`workers/queues.js`) — they don't run refresh logic inline. Both processes share the same Postgres and Redis; running the API without the worker means refreshes never execute.

### FPS OAuth/OIDC flow (`services/fpsAuth.service.js`)
1. `POST /api/fps/connect/start` requires Bearer auth, generates state/nonce/PKCE, stores the flow in `connectFlowStore.service.js` (in-memory `Map`), returns the FPS authorization URL.
2. FPS redirects to `GET /api/fps/connect/callback`. The handler is unauthenticated (FPS controls the redirect); it consumes the flow via `state`, exchanges code for tokens using a JWT `client_assertion` (built from `backend/keys/fps-private.pem` — git-ignored), validates the ID token against FPS JWKS (`fpsOidcValidation.service.js`), then redirects the browser to `${FRONTEND_URL}/connect/success|error`.
3. Tokens are encrypted with AES-256-GCM (`utils/tokenCrypto.js`, key derived from `TOKEN_ENCRYPTION_KEY`) and upserted in `mandants`. Every exchange/refresh writes to `token_events` for audit.

Two consequences worth knowing:
- The connect-flow store is **in-memory only** — restarting the API between `/connect/start` and the callback breaks the flow, and the backend cannot be horizontally scaled without externalizing this map.
- `FPS_ENV` switches the auth/token/JWKS endpoints between `test` and `prod` (see `config/fps.config.js`). The shared demo client `TestFineapi` is rejected unless the redirect URI matches the official callback — use your own registered client for localhost.

### Auth model
Accountants are seeded on bootstrap when `ACCOUNTANT_DEMO_ID` is set (see `repositories/accountant.repository.js#ensureDemoAccount`). Sessions are stateless JWTs signed with `AUTH_JWT_SECRET` (falls back to `TOKEN_ENCRYPTION_KEY`); `requireAuth` middleware verifies the token and loads the accountant, attaching `req.auth = { accountantId, email, fullName }`. All mandant queries scope by `req.auth.accountantId`.

### Frontend ↔ backend
`frontend/src/api.js` is the only HTTP layer. `VITE_API_BASE_URL` may be empty (same-origin, e.g. when the backend serves `frontend/dist`) or a full origin during local dev. `App.jsx` gates all routes behind `isAuthenticated` derived from `/api/auth/me`. Some endpoints (`/api/alerts`, `/api/fps/signals`) are not implemented server-side — `api.js` falls back to mandant-derived stub data, so changes to the dashboard/alerts views need to either add real endpoints or update the fallback shape.

## Required environment

Backend `.env` (loaded from `backend/.env` by `config/env.js`):
- `DATABASE_URL`, `REDIS_URL`, `PORT` (default 4000)
- `TOKEN_ENCRYPTION_KEY` (≥32 chars, used for AES-GCM and as JWT fallback)
- `AUTH_JWT_SECRET` (preferred), `AUTH_TOKEN_TTL_SECONDS`, `AUTH_BCRYPT_ROUNDS`, `AUTH_TOKEN_ISSUER`
- `ACCOUNTANT_DEMO_ID`, `AUTH_DEMO_EMAIL`, `AUTH_DEMO_PASSWORD`, `AUTH_DEMO_FULL_NAME` (demo seed)
- `FPS_ENV` (`test`|`prod`), `FPS_CLIENT_ID`, `FPS_REDIRECT_URI`, `FPS_SCOPE`, `FPS_KEY_ID`, `FPS_PRIVATE_KEY_PEM` (escaped `\n` ok — normalized in config), `FPS_CLAIMS_ECB_FIELD`, `FPS_EXPECTED_ISSUER`
- `FRONTEND_URL` (used to redirect after the FPS callback)

Frontend `.env`: `VITE_API_BASE_URL` (omit/empty for same-origin).

`buildAuthorizationUrl` rejects placeholder values containing `your-`, `replace_with`, `changeme`, `example`, or the literal PEM template — set real values before testing the FPS flow.

## Internationalisation (i18n)

Le SaaS cible la Belgique : trois langues officielles à supporter à terme — FR / NL / DE.
- UI actuellement FR uniquement, à étendre via `react-i18next`
- Stocker la langue préférée par accountant (colonne à ajouter)
- Les messages d'erreur business renvoyés par MyMinfin/Intervat sont déjà multilingues (fr/nl/de/en) — afficher la version correspondant à la langue de l'utilisateur
