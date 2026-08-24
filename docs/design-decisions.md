# Design Decisions

This document explains the major architectural trade-offs and design choices made in the Distributed Job Scheduling Platform.

---

## 1. Microservices vs Monolith

**Decision:** Microservices architecture with 5 independent services.

**Trade-offs:**
- ✅ Each service can be scaled independently (e.g., scale worker-service without touching api-gateway)
- ✅ Failure isolation — a crashed worker-service does not take down the API
- ✅ Services can be deployed and updated independently
- ❌ More operational complexity (more containers, more network hops)
- ❌ Higher latency for inter-service calls vs in-process function calls

**Why chosen:** The job scheduling domain naturally decomposes into separate concerns — scheduling (finding due jobs), execution (running them), and the API layer (serving user requests). These have very different scaling characteristics.

---

## 2. RabbitMQ for Job Queue vs Redis Streams vs Database Polling

**Decision:** RabbitMQ (`execution.ready` queue) for distributing execution tasks to workers.

**Trade-offs vs alternatives:**

| Option | Pros | Cons |
|---|---|---|
| **RabbitMQ** (chosen) | True message broker, dead-letter exchange built-in, consumer acknowledgment, management UI | Extra infrastructure dependency |
| **Redis Streams** | Simpler stack, consumer groups | Less mature dead-letter support, Redis memory-bound |
| **DB polling only** | No extra infra | High DB load, polling latency, thundering herd |

**Why RabbitMQ:** The platform needed reliable message delivery with acknowledgment semantics and a built-in dead-letter mechanism. RabbitMQ's management UI also aids debugging.

---

## 3. PostgreSQL Advisory Lock for Scheduler Coordination

**Decision:** Use `pg_try_advisory_xact_lock` for distributed scheduler coordination.

**Problem:** With multiple scheduler instances running, the same due job could be scheduled multiple times (duplicate executions).

**Alternatives considered:**
- **Redis distributed lock (Redlock):** Adds Redis as a dependency for a feature already solvable with Postgres
- **Leader election:** More complex to implement and operate
- **Single scheduler instance:** Single point of failure

**Why advisory locks:** Already have PostgreSQL in the stack. Advisory locks are transaction-scoped (automatically released on transaction end), lightweight, and non-blocking (we use `pg_try_advisory_xact_lock` which returns false instead of blocking). The scheduler simply skips a polling round if it can't acquire the lock.

---

## 4. Atomic Job Claiming (Preventing Duplicate Execution)

**Decision:** Use `updateMany` with `lockedByWorkerId = null` guard in a single database operation.

```sql
UPDATE executions
SET status = 'RUNNING', lockedByWorkerId = $workerId
WHERE id = $executionId
  AND status IN ('QUEUED', 'RETRY_SCHEDULED')
  AND lockedByWorkerId IS NULL
```

**Why:** PostgreSQL row-level locking ensures only one worker can successfully update a row. If `count === 0`, the claim failed (another worker got it first). This avoids optimistic locking conflicts and explicit `SELECT FOR UPDATE` patterns.

---

## 5. Dead Letter Queue: PostgreSQL Table vs RabbitMQ DLQ Only

**Decision:** Store dead-letter records in a PostgreSQL table in addition to RabbitMQ's native DLQ.

**Why:** RabbitMQ queues are not designed as queryable audit stores. Inspecting, filtering, paginating, and requeueing dead-letter messages requires a proper relational store. The dashboard uses the PostgreSQL dead-letter table for all inspection and management operations.

---

## 6. Backoff Strategy Implementation

**Decision:** Support three backoff types — `FIXED`, `EXPONENTIAL`, and `LINEAR`.

```
FIXED:       delay = retryInitialDelayMs
EXPONENTIAL: delay = retryInitialDelayMs * 2^(attempt-1), capped at retryMaxDelayMs
LINEAR:      delay = retryInitialDelayMs * attempt, capped at retryMaxDelayMs
```

**Why configurable per job:** Different job types have different failure characteristics. A webhook delivery may want exponential backoff to avoid hammering a down server. A health check may want fixed delay for predictable retry timing.

---

## 7. Multi-Tenancy: Organization → Project → Queue → Job

**Decision:** Hierarchical multi-tenant model with Organization as the top-level tenant boundary.

**Why this hierarchy:**
- **Organization** — top-level tenant. All data is scoped to an org.
- **Project** — logical grouping of queues (e.g., "payments" project, "notifications" project).
- **Queue** — unit of concurrency control and priority. Queue configuration (concurrency limit, priority, pause/resume) applies to all jobs in it.
- **Job** — individual task definition with its own retry policy.

**JWT carries `organizationId`** — the API gateway injects `x-organization-id` header to all downstream services, ensuring every database query is automatically scoped to the calling organization.

---

## 8. Heartbeat for Stalled Execution Detection

**Decision:** Workers send periodic heartbeats while executing a job. A background recovery process detects executions whose heartbeat has gone stale.

**Why:** In a distributed system, a worker process can crash, be OOM-killed, or lose network connectivity mid-execution. Without heartbeats, these executions would be stuck in `RUNNING` forever. The heartbeat pattern allows the system to detect and recover these stalled executions automatically.

**Configuration:**
- `EXECUTION_STALLED_AFTER_MS` — how long without a heartbeat before an execution is considered stalled
- `EXECUTION_RECOVERY_INTERVAL_MS` — how often recovery runs

---

## 9. JWT + API Key Dual Authentication

**Decision:** Support both JWT tokens (for dashboard users) and API keys (for developer/service access).

**JWT:** Short-lived (8h), carries `organizationId` and `role`. Used by the React dashboard.

**API Key:** Long-lived, hashed before storage (plain value only returned at creation time). Intended for programmatic access. API keys do not carry a role — they get VIEWER-equivalent access to non-admin routes.

**Why two methods:** Dashboard users need session-based auth with role awareness. Service-to-service or developer API access needs a stable credential that doesn't expire on page close.

---

## 10. Queue Concurrency Limits via Scheduler (Not Worker)

**Decision:** Enforce queue concurrency limits in the **scheduler** dispatch logic, not in the workers.

**Why scheduler-side enforcement:**
- Workers are stateless consumers — they process whatever message arrives
- Enforcing at the message-dispatch level prevents over-queuing in the first place
- Simpler worker code — no need for distributed semaphores

**How it works:** Before publishing executions to RabbitMQ, the scheduler counts currently `QUEUED + RUNNING` executions per queue and only dispatches executions from queues that are below their `concurrencyLimit`.

---

## Known Limitations

1. **No workflow dependencies** — jobs cannot be chained (Job B starts only when Job A succeeds)
2. **No queue sharding** — all queues share a single RabbitMQ queue; high-throughput scenarios may need per-queue topics
3. **No WebSocket live updates** — dashboard uses on-demand refresh rather than push updates
4. **API Keys not org-scoped** — API keys currently apply platform-wide; future work should scope them to an organization
5. **Single RabbitMQ queue** — `execution.ready` is a shared queue; priority is enforced by the scheduler dispatcher, not by RabbitMQ message priority
