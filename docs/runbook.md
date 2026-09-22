# Operations runbook

## Primary signals

Monitor these as rates, latency distributions, and oldest-age gauges where applicable:

- oldest unpublished outbox row;
- outbox publish failures and attempt count;
- BullMQ waiting, active, delayed, stalled, and failed jobs;
- command age by `pending`, `completed`, and `failed` status;
- worker processing outcome and duration;
- PostgreSQL pool saturation, transaction latency, lock waits, and disk capacity;
- Redis availability, memory policy, evictions, and persistence health.

The repository exports process and application counters at `/metrics`. Queue and database infrastructure metrics should come from their respective exporters or managed services.

## Readiness and liveness

- Liveness answers whether the process event loop can serve HTTP. Do not restart a process solely because a dependency has a short outage.
- API readiness requires PostgreSQL because command acceptance depends on it.
- Worker readiness requires PostgreSQL and an initialized BullMQ worker.
- Remove an instance from traffic before graceful shutdown. The application closes workers, queue events, and database pools through Nest lifecycle hooks.

## Incident: outbox age is increasing

1. Check Redis connectivity and authentication from worker instances.
2. Check relay logs for publish errors and PostgreSQL statement timeouts.
3. Compare pending row growth with relay batch size and polling interval.
4. Confirm `locked_until` leases are advancing rather than stuck far in the future.
5. Restore the dependency or scale relay capacity only after measuring Redis and PostgreSQL headroom.

Do not mark rows published manually unless the corresponding BullMQ job is confirmed and the worker path is idempotent.

## Incident: stalled or retried jobs

1. Identify the BullMQ job ID, command ID, and operation key from structured logs.
2. Read the command and ledger rows before retrying.
3. If the command is complete, a later execution should return the stored result.
4. If a ledger row exists while its command is not complete, treat it as an invariant violation and investigate transaction boundaries before replay.
5. Look for event-loop blocking, termination, lock-renewal failures, database timeouts, and downstream latency.

## Replay policy

Replay the original command with the original operation key. Never invent a new key merely to force progress. A new key represents a new business operation and can legitimately produce another effect.

For terminal failures, record who approved the replay, why the prior attempt is safe, the original identifiers, and the observed result.

## Database recovery

Backups are incomplete until restore is tested. A recovery plan must preserve `credit_commands`, `outbox_messages`, and `credit_ledger` consistently. After a point-in-time restore, reconcile commands, ledger entries, and queue state before resuming workers. Republishing may cause extra executions, which the durable operation key is designed to absorb.

## Deployment sequence

1. Apply backward-compatible migrations.
2. Deploy API and worker versions that can operate with both old and new schema during rollout.
3. Observe readiness, error rate, outbox age, and queue age.
4. Remove compatibility fields only in a later deployment.
5. Roll back application code only when it remains compatible with the migrated schema.
