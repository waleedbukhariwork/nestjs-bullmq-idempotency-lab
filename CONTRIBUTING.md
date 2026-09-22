# Contributing

This repository is a focused reliability reference, so changes should preserve a small and explainable system boundary.

## Development workflow

1. Use Node.js 24.19 and npm 11 or newer.
2. Copy `.env.example` to `.env`.
3. Start PostgreSQL and Redis with `npm run infra:up`.
4. Install with `npm ci` and run `npm run verify`.
5. Before opening a pull request, run `npm run verify:integration` against disposable local data.

## Change requirements

- Add or update a test for changed behavior.
- Keep business idempotency in PostgreSQL. Do not treat a Redis lock or a BullMQ job ID as the final correctness boundary.
- Add an architecture decision record when changing a major boundary, persistence model, or delivery guarantee.
- Do not include credentials, production data, generated output, or local environment files.
- Prefer a narrow commit with a clear reason over unrelated cleanup.

## Commit and pull request guidance

Use imperative commit subjects, describe the failure mode being addressed, and state how it was verified. A pull request should explain any migration or rollback consequence.
