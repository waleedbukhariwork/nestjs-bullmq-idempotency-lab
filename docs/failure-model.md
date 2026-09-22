# Failure model

## Assumptions

- Processes can stop at any instruction boundary.
- Networks can time out after the remote operation succeeded.
- BullMQ can redeliver work after an exception or a lost lock.
- Producers can submit semantically identical work more than once.
- PostgreSQL transactions and uniqueness constraints are the available durable atomic boundary.

## Failure windows

| Window                                                  | Observable outcome                                    | Recovery                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| API dies before commit                                  | No command exists                                     | Client retries with the same key                                                |
| API dies after commit before response                   | Command and outbox exist                              | Client retry returns the existing command                                       |
| Redis is unavailable                                    | Outbox remains pending                                | Relay retries with backoff                                                      |
| Relay dies before publish                               | Lease expires                                         | Another relay claims the row                                                    |
| Relay dies after publish before marking published       | Message may be published again                        | Deterministic job ID reduces duplicates; worker idempotency remains final guard |
| Worker throws before commit                             | No business effect                                    | BullMQ retries                                                                  |
| Worker dies after an external, non-transactional effect | Effect may have happened while the job is redelivered | Downstream idempotency key or reconciliation is required                        |
| Worker re-enters after committed database effect        | Command is already complete                           | Stored result is returned without a second effect                               |

## Why queue-level deduplication is insufficient

A deterministic job ID handles one duplicate-enqueue shape within the retention lifetime of the job. It does not prove that an external effect failed, survive arbitrary cleanup forever, or combine the effect with business state atomically. The database operation key models the business fact directly and has an explicit lifecycle.

## External side effects

This repository keeps the ledger and balance in PostgreSQL so they can share one transaction. Email, payment, webhook, and third-party API calls cannot join that transaction. For those systems, pass the same business operation key to a downstream API that supports idempotency. If it does not, persist an attempt state, capture the provider response identifier, and build reconciliation before calling the workflow reliable.

## Poison messages

BullMQ retries are bounded. A production deployment should subscribe to exhausted failures, mark the command failed only under an explicit domain policy, preserve diagnostic context without secrets, and provide an operator-controlled replay that reuses the original operation key. Blindly creating a new key bypasses the safety invariant.
