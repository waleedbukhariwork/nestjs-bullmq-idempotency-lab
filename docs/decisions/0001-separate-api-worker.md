# ADR 0001: Run API and worker as separate processes

- Status: Accepted
- Date: 2026-09-22

## Context

HTTP traffic and background processing have different scaling, failure, and shutdown characteristics. Running both roles in one process couples API availability to job load and makes capacity controls ambiguous.

## Decision

Maintain one repository and shared domain libraries, but compile two NestJS applications: `api` and `worker`. Each has its own port, readiness check, process lifecycle, and deployment command.

## Consequences

- API and worker capacity can be tuned independently.
- A worker crash does not terminate an API process.
- Deployments must run and observe two process types.
- Shared modules must remain free of process-specific startup behavior.
