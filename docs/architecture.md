# Architecture

## Design target

The system handles a command whose transport can be retried while its business effect must happen once. It avoids coupling HTTP request success to Redis availability and does not depend on a short-lived lock for correctness.

## Write path

1. The API validates the body and `Idempotency-Key`.
2. It hashes the business payload in canonical field order.
3. One PostgreSQL transaction inserts `credit_commands` and `outbox_messages`.
4. A repeated operation key with the same hash returns the existing command.
5. A repeated operation key with a different hash returns `409 Conflict`.

The outbox closes the failure window between committing business intent and publishing to the queue. If Redis is unavailable, the API can still commit the command and the relay can publish it later.

## Relay path

The relay claims due outbox rows with `FOR UPDATE SKIP LOCKED`, changes them to `publishing`, and gives each a bounded lease. Multiple relay instances can therefore share work without holding a database transaction open during Redis I/O.

Publishing uses a deterministic BullMQ job ID derived from the operation key. Successful rows become `published`; failed rows return to `pending` with bounded exponential delay. A process that dies after publishing but before updating PostgreSQL may publish again after the lease expires. That is expected and safe because the consumer remains idempotent.

## Processing path

The worker opens a PostgreSQL transaction and locks the command row. It then:

1. returns the stored result if the command is already complete;
2. inserts a ledger row with a unique `operation_key`;
3. updates the account balance and version;
4. stores the result and completes the command;
5. commits all changes together.

The unique ledger key is the final guard. BullMQ job IDs reduce duplicate queue records but are intentionally not treated as permanent business history.

## Consistency guarantees

| Boundary          | Guarantee                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| API acceptance    | Command and outbox are committed together or neither is committed      |
| Queue publication | At least once; duplicate publication is possible                       |
| Worker execution  | At least once; retries and stalled recovery can re-enter the processor |
| Credit effect     | At most once for one operation key within PostgreSQL                   |
| Client retry      | Same key and same payload resolves to the original command             |

## Scaling model

- API instances are stateless.
- Worker instances share BullMQ work and database invariants.
- Relay instances share outbox rows through row locking and leases.
- Database pool size, worker concurrency, and relay batch size are independent controls.
- Queue depth is not permission to exceed downstream capacity; tune concurrency from measured database and dependency limits.

## Data ownership

PostgreSQL is the source of truth for intent, status, result, ledger history, and account state. Redis contains replaceable delivery state. Losing Redis can delay work or require republishing unpublished/reconcilable commands, but must not erase accepted business intent.
