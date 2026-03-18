# TweetQuote Architecture

## Monorepo Layout

```text
apps/
  api/        Fastify API for auth, quota, quote fetch, translation and export jobs
  web/        Next.js marketing site and editor
  extension/  MV3 extension with content script, background worker and internal panel
packages/
  domain/     Shared schemas and domain factories
  editor-core/ Shared document editing commands and draft helpers
  render-core/ Shared preview summary and render-facing selectors
  sdk/        Shared API client and extension bridge types
  ui/         Shared UI primitives and quote preview renderer
  config/     Runtime config and feature flags
  telemetry/  Minimal logging and performance hooks
```

## Core Contracts

- `QuoteDocument`: shared quote-chain document shape for API, web and extension.
- `QuoteNode`: normalized tweet node with author, content and translation artifact.
- `RenderSpec`: rendering preferences such as language, annotations and export scale.
- `QuotaSnapshot`: anonymous/free/pro quota contract.
- `ExtensionBridgeMessage`: panel/content/background message contract.

## Compatibility

The new API exposes both:

- `api/v1/*`: new SaaS-oriented endpoints.
- `api/*`: legacy compatibility endpoints for existing migration paths.

This allows the old prototype and the new stack to coexist during cutover.

## Persistence

- API persistence now uses `Prisma + SQLite` for local-first development.
- Anonymous sessions and rolling quota usage are stored in SQLite instead of JSON files.
- Draft documents are stored through Prisma `Document` records.
- This keeps the migration path open for a future switch from SQLite to Postgres without changing the API contract.

## Quota System

Anonymous trial quota supports **per-device overrides** on top of the global defaults (`dailyTrialLimit`, `weeklyTrialLimit` in `env.ts`).

### Data Model

`AnonymousSession` carries three optional override fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dailyLimit` | `Int?` | `null` (uses global) | Per-device daily limit override |
| `weeklyLimit` | `Int?` | `null` (uses global) | Per-device weekly limit override |
| `bonusCredits` | `Int` | `0` | Extra credits beyond window limits |
| `note` | `String` | `""` | Admin-facing memo (e.g. "春节活动赠送") |

### Resolution Logic

1. Effective daily/weekly limits = per-device value if set, otherwise global default.
2. If daily or weekly window is exhausted, bonus credits act as overflow — `bonusRemaining = bonusCredits - weeklyUsed`.
3. `requiresUpgrade` is `true` only when **both** window limits and bonus are exhausted.

### Admin API

All admin endpoints require `x-admin-token` header (or `Authorization: Bearer <token>`) matching the `ADMIN_TOKEN` env var.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/admin/session/:deviceId` | GET | Get session detail + current quota |
| `/api/v1/admin/quota/override` | POST | Set per-device quota overrides |
| `/api/v1/admin/session/:deviceId/usage` | DELETE | Clear all usage events for a device |
