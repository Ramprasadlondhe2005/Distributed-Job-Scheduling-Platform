# Entity Relationship Diagram

This document describes the database schema and entity relationships for the Distributed Job Scheduling Platform.

## Visual ER Diagram

![Platform ER Diagram](./er-diagram.png)

---

## Mermaid ER Diagram

```mermaid
erDiagram
    AuditEvent {
        uuid id PK
        string actorType
        uuid actorId
        string action
        string resourceType
        uuid resourceId
    }

    ApiKey {
        uuid id PK
        string name
        string keyHash UK
    }

    Organization {
        uuid id PK
        string name
        string slug UK
    }

    User {
        uuid id PK
        uuid organizationId FK
        string email UK
        enum role
    }

    Project {
        uuid id PK
        uuid organizationId FK
        string name
    }

    Queue {
        uuid id PK
        uuid projectId FK
        string name
        int priority
        int concurrencyLimit
        enum status
    }

    Job {
        uuid id PK
        uuid queueId FK
        string name
        enum type
        enum status
        enum method
        string url
        datetime runAt
    }

    JobSchedule {
        uuid id PK
        uuid jobId FK
        string cronExpression
        string timezone
        datetime nextRunAt
    }

    Worker {
        uuid id PK
        string serviceInstanceId UK
        enum status
        int activeExecutionCount
        datetime lastHeartbeatAt
    }

    Execution {
        uuid id PK
        uuid jobId FK
        uuid lockedByWorkerId FK
        enum status
        int attemptCount
        datetime scheduledFor
        datetime nextAttemptAt
    }

    DeadLetterMessage {
        uuid id PK
        uuid executionId FK
        string reason
        string sourceQueue
    }

    ExecutionAttempt {
        uuid id PK
        uuid executionId FK
        uuid workerId FK
        int attemptNumber
        enum status
        int httpStatusCode
        int durationMs
    }

    Organization ||--o{ User : "has users"
    Organization ||--o{ Project : "owns projects"
    Project ||--o{ Queue : "contains queues"
    Queue ||--o{ Job : "schedules jobs"
    Job ||--o| JobSchedule : "has schedule"
    Job ||--o{ Execution : "triggers executions"
    Worker ||--o{ Execution : "locks executions"
    Execution ||--o{ DeadLetterMessage : "moves to DLQ"
    Execution ||--o{ ExecutionAttempt : "logs attempts"
    Worker ||--o{ ExecutionAttempt : "executes attempts"
```

---

## Key Design Decisions

### Primary Keys & Identifiers
All primary keys use **UUID v4** strings, preventing ID enumeration attacks and ensuring safe distributed ID generation.

### Foreign Keys & Relationships
| Parent Entity | Child Entity | Relationship Type | Cascading Behavior |
|---|---|---|---|
| Organization | User | 1 : N | Restrict |
| Organization | Project | 1 : N | Cascade |
| Project | Queue | 1 : N | Cascade |
| Queue | Job | 1 : N | Cascade |
| Job | JobSchedule | 1 : 1 | Cascade |
| Job | Execution | 1 : N | Cascade |
| Execution | ExecutionAttempt | 1 : N | Cascade |
| Execution | DeadLetterMessage | 1 : N | SetNull |
| Worker | Execution | 1 : N | SetNull |
| Worker | ExecutionAttempt | 1 : N | SetNull |
