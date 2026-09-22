# ADR 0002: Use a transactional outbox and durable operation key

- Status: Accepted
- Date: 2026-09-22

## Context

Writing business state and publishing directly to Redis creates a dual-write failure window. BullMQ retries and stalled-job recovery also mean a processor can run more than once. Queue locks and job IDs do not permanently encode whether a business effect occurred.

## Decision

Commit the command and outbox record in one PostgreSQL transaction. Publish asynchronously with leased outbox claims. Use a deterministic BullMQ job ID as an optimization and enforce the business operation key with a unique ledger constraint in the same transaction as the protected effect.

## Consequences

- Accepted intent survives Redis outages.
- Publication and execution remain at least once.
- Duplicate processor entry is safe for the modeled database effect.
- Operations must monitor outbox lag and provide reconciliation.
- Non-transactional external effects require downstream idempotency or a separate reconciliation design.
