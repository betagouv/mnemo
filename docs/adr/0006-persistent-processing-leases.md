# ADR 0006: Lease persistent processing jobs through PostgreSQL

- Status: accepted
- Date: 2026-09-09

## Context

IFC parsing and point-cloud conversion can outlive an HTTP request and a worker process. Multiple worker replicas must not process the same asset concurrently, while a crashed worker must not leave an asset blocked forever.

## Decision

Persist one typed processing job per asset and processor in PostgreSQL. Confirming an object-storage upload changes the asset state and inserts its job in one database transaction.

Workers claim only job types for which they have a registered handler. Claims use a bounded lease and PostgreSQL `FOR UPDATE SKIP LOCKED`, increment the attempt count, and identify the owning worker. Completion and failure updates require the same lease owner. Retriable failures return to the queue with exponential backoff; exhausted or expired jobs mark their asset as failed.

Processing handlers own vendor-specific work. The generic worker knows nothing about IFC-Lite, point-cloud converters, or derived artifact formats.

## Consequences

- Worker replicas can poll the same queue without coordinating in memory.
- A restart cannot lose queued work, and an expired lease can be reclaimed.
- Unsupported job types remain queued instead of being consumed by a placeholder.
- Processors must be idempotent because a crash can happen after an external side effect but before database completion.
