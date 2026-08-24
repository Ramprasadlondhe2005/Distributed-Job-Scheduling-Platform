# API Documentation

Base URL: `http://localhost:3000`

All authenticated requests require either:
- `Authorization: Bearer <JWT_TOKEN>` header
- `x-api-key: <API_KEY>` header

---

## Authentication

### POST /auth/register
Create a new user account. Returns the user object (not logged in automatically).

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "password": "securepassword"
}
```
**Response `201`:**
```json
{
  "token": "eyJ...",
  "user": { "id": "uuid", "email": "user@example.com", "name": "John Doe", "role": "VIEWER" }
}
```

---

### POST /auth/login
Authenticate and receive a JWT token.

**Request Body:**
```json
{ "email": "user@example.com", "password": "securepassword" }
```
**Response `200`:**
```json
{
  "token": "eyJ...",
  "user": { "id": "uuid", "email": "user@example.com", "role": "ADMIN" }
}
```

---

### GET /auth/me
Get the currently authenticated user. Requires auth.

**Response `200`:**
```json
{ "user": { "id": "uuid", "email": "...", "role": "ADMIN" } }
```

---

## Projects

### GET /api/projects
List all projects in your organization. Requires auth.

**Query Params:** `limit` (default: 20), `offset` (default: 0)

**Response `200`:**
```json
{
  "data": [{ "id": "uuid", "name": "payments", "organizationId": "uuid", "createdAt": "..." }],
  "page": { "limit": 20, "offset": 0, "total": 5 }
}
```

---

### POST /api/projects
Create a new project. Requires ADMIN.

**Request Body:**
```json
{ "name": "payments", "description": "Payment processing jobs" }
```
**Response `201`:** Project object.

---

### GET /api/projects/:id
Get a single project by ID.

---

### PATCH /api/projects/:id
Update a project. Requires ADMIN.

**Request Body:** `{ "name": "...", "description": "..." }`

---

### DELETE /api/projects/:id
Delete a project. Requires ADMIN.

---

## Queues

### GET /api/projects/:id/queues
List all queues for a project.

**Response `200`:**
```json
{
  "data": [{
    "id": "uuid", "name": "default", "priority": 0,
    "concurrencyLimit": 5, "status": "ACTIVE", "projectId": "uuid"
  }],
  "page": { "limit": 20, "offset": 0, "total": 1 }
}
```

---

### POST /api/projects/:id/queues
Create a new queue. Requires ADMIN.

**Request Body:**
```json
{
  "name": "high-priority",
  "priority": 10,
  "concurrencyLimit": 3
}
```
**Response `201`:** Queue object.

---

### GET /api/queues/:id
Get a single queue by ID.

---

### PATCH /api/queues/:id
Update queue configuration. Requires ADMIN.

**Request Body:**
```json
{ "name": "...", "priority": 5, "concurrencyLimit": 10 }
```

---

### DELETE /api/queues/:id
Delete a queue (must have no active jobs). Requires ADMIN.

---

### POST /api/queues/:id/pause
Pause a queue (stops new executions from being dispatched). Requires ADMIN.

---

### POST /api/queues/:id/resume
Resume a paused queue. Requires ADMIN.

---

### GET /api/queues/:id/stats
Get execution statistics for a queue.

**Response `200`:**
```json
{
  "PENDING": 2, "QUEUED": 1, "RUNNING": 0,
  "SUCCEEDED": 45, "FAILED": 3, "RETRY_SCHEDULED": 1,
  "STALLED": 0, "CANCELED": 0
}
```

---

## Jobs

### GET /api/jobs
List jobs. Requires auth.

**Query Params:** `limit`, `offset`, `status` (ACTIVE|PAUSED|DELETED), `queueId`

**Response `200`:**
```json
{
  "data": [{
    "id": "uuid", "name": "Ping example", "type": "ONE_TIME",
    "status": "ACTIVE", "method": "GET", "url": "https://...",
    "maxAttempts": 3, "backoffType": "EXPONENTIAL",
    "retryInitialDelayMs": 1000, "retryMaxDelayMs": 30000,
    "runAt": "2026-08-23T15:00:00Z", "queueId": "uuid"
  }],
  "page": { "limit": 20, "offset": 0, "total": 10 }
}
```

---

### POST /api/jobs
Create a one-time or recurring job. Requires ADMIN.

**One-time job:**
```json
{
  "name": "Send invoice email",
  "type": "ONE_TIME",
  "method": "POST",
  "url": "https://api.example.com/send-email",
  "queueId": "uuid",
  "runAt": "2026-09-01T10:00:00Z",
  "headers": { "x-api-key": "secret" },
  "body": { "to": "user@example.com" },
  "maxAttempts": 3,
  "retryInitialDelayMs": 1000,
  "retryMaxDelayMs": 30000,
  "backoffType": "EXPONENTIAL",
  "timeoutMs": 10000
}
```

**Recurring job:**
```json
{
  "name": "Daily report",
  "type": "RECURRING",
  "method": "GET",
  "url": "https://api.example.com/generate-report",
  "queueId": "uuid",
  "schedule": {
    "cronExpression": "0 9 * * *",
    "timezone": "Asia/Kolkata",
    "nextRunAt": "2026-08-24T03:30:00Z"
  }
}
```

**Response `201`:** Job object.

---

### GET /api/jobs/:id
Get a single job with its schedule if recurring.

---

### PATCH /api/jobs/:id
Update a job. Requires ADMIN.

**Request Body:** Any subset of job fields.

---

### DELETE /api/jobs/:id
Soft-delete a job (marks status as DELETED). Requires ADMIN.

---

### POST /api/jobs/:id/run
Trigger an immediate manual execution of a job. Requires ADMIN.

**Response `201`:** Execution object.

---

### POST /api/jobs/:id/pause
Pause a job (stops future scheduling). Requires ADMIN.

---

### POST /api/jobs/:id/resume
Resume a paused job. Requires ADMIN.

---

### POST /api/queues/:id/jobs/batch
Create multiple jobs in a single atomic transaction. Requires ADMIN.

**Request Body:**
```json
{
  "jobs": [
    { "name": "Job 1", "type": "ONE_TIME", "method": "GET", "url": "https://...", "runAt": "2026-09-01T10:00:00Z" },
    { "name": "Job 2", "type": "ONE_TIME", "method": "POST", "url": "https://...", "runAt": "2026-09-01T11:00:00Z" }
  ]
}
```

**Response `201`:**
```json
{ "created": 2, "jobIds": ["uuid1", "uuid2"] }
```

---

## Executions

### GET /api/executions
List executions. Requires auth.

**Query Params:** `limit`, `offset`, `status`

**Response `200`:**
```json
{
  "data": [{
    "id": "uuid", "jobId": "uuid", "status": "SUCCEEDED",
    "attemptCount": 1, "scheduledFor": "...", "startedAt": "...",
    "finishedAt": "...", "attempts": []
  }],
  "page": { "limit": 20, "offset": 0, "total": 100 }
}
```

---

### GET /api/executions/:id
Get a single execution with all attempt history.

---

### POST /api/executions/:id/cancel
Cancel a pending or queued execution. Requires ADMIN.

---

### POST /api/executions/:id/retry
Manually retry a failed or canceled execution. Requires ADMIN.

---

## Workers

### GET /api/workers
List registered workers and their status. Requires auth.

**Response `200`:**
```json
{
  "data": [{
    "id": "uuid", "serviceInstanceId": "worker-abc123",
    "status": "IDLE", "lastHeartbeatAt": "...",
    "activeExecutionCount": 0
  }]
}
```

---

## Dead Letter Queue

### GET /api/dead-letter
List dead-letter messages. Requires ADMIN.

**Response `200`:**
```json
{
  "data": [{
    "id": "uuid", "reason": "MAX_ATTEMPTS_EXHAUSTED",
    "sourceQueue": "execution.ready", "error": "Connection timeout",
    "executionId": "uuid", "createdAt": "..."
  }],
  "summary": { "active": 5 },
  "page": { "limit": 20, "offset": 0, "total": 5 }
}
```

---

### POST /api/dead-letter/:id/requeue
Requeue a dead-letter message for retry. Requires ADMIN.

---

### DELETE /api/dead-letter/:id
Discard a dead-letter message. Requires ADMIN.

---

## Metrics & Monitoring

### GET /api/metrics/overview
Get platform-wide execution metrics. Requires auth.

**Response `200`:**
```json
{
  "totalJobs": 42, "activeJobs": 30,
  "totalExecutions": 500, "runningExecutions": 2,
  "succeededExecutions": 450, "failedExecutions": 10,
  "pendingExecutions": 38, "activeWorkers": 3
}
```

---

### GET /health
API gateway liveness check.

**Response `200`:** `{ "status": "ok" }`

---

### GET /health/services
Aggregated health of all downstream services.

**Response `200`:**
```json
{
  "job-service": { "statusCode": 200, "status": "ok" },
  "execution-service": { "statusCode": 200, "status": "ok" },
  "scheduler-service": { "statusCode": 200, "status": "ok" },
  "worker-service": { "statusCode": 200, "status": "ok" }
}
```

---

### POST /api/schedule/run
Manually trigger a scheduler cycle. Requires ADMIN.

---

### POST /api/recover/stalled
Manually trigger stalled execution recovery. Requires ADMIN.

---

## Audit Events

### GET /api/audit-events
List audit events. Requires auth.

**Query Params:** `limit`, `offset`, `actorId`, `resourceType`, `resourceId`, `from`, `to`

---

## Internal Admin Routes

> These routes require an ADMIN JWT (not API key).

### POST /internal/api-keys
Create an API key.

**Request Body:** `{ "name": "my-key" }`

**Response `201`:** `{ "id": "uuid", "name": "my-key", "apiKey": "djsp_..." }`

> ⚠️ The `apiKey` value is only returned once at creation time.

---

### GET /internal/api-keys
List all API keys (hashed, no plain value).

---

### DELETE /internal/api-keys/:id
Revoke an API key.

---

### GET /internal/users
List all users in the organization.

---

### PATCH /internal/users/:id/role
Update a user's role.

**Request Body:** `{ "role": "ADMIN" }` or `{ "role": "VIEWER" }`

---

## Error Format

All errors follow this format:

```json
{ "error": "Human readable message" }
```

Validation errors include issues:

```json
{
  "error": "Validation failed",
  "issues": [
    { "code": "invalid_type", "path": ["queueId"], "message": "Required" }
  ]
}
```

## Common HTTP Status Codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request / Validation Error |
| 401 | Unauthorized (no/invalid auth) |
| 403 | Forbidden (wrong role) |
| 404 | Not Found |
| 409 | Conflict (duplicate name, etc.) |
| 422 | Unprocessable Entity |
| 500 | Internal Server Error |
