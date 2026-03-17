# TweetQuote V2 Cutover Checklist

## Core Path Validation

- Anonymous session can be created from web and extension.
- Quote fetch succeeds on a real `x.com/.../status/...` URL.
- Manual editing works without reloading the full page.
- Google translation works for a single node.
- AI translation works when `.env.local` contains OpenAI-compatible config.
- Draft save returns a persisted `QuoteDocument`.
- SQLite contains persisted anonymous sessions and documents during local development.
- Export job creation returns a stable job id.

## Observability

- `GET /api/v1/health` returns service health.
- `GET /api/v1/runtime` returns feature flags and support URL.
- API errors are normalized through one error handler.
- Build pipeline runs `npm run typecheck` and `npm run build`.

## Rollout Strategy

1. Keep the legacy root app available while V2 ships under `apps/web`.
2. Route internal users to V2 first.
3. Validate fetch success rate, translation success rate and export job creation.
4. Switch extension users to the bundled internal panel.
5. Remove legacy iframe coupling only after the new panel is stable.
