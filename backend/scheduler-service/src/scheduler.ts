import { Prisma, PrismaClient } from "@prisma/client";
import { nextCronRun } from "./cron.js";
import type { SchedulerStats } from "./stats.js";

const schedulerAdvisoryLockId = 4_219_001;

type PublishExecution = (executionId: string) => Promise<void>;
type SchedulerDb = PrismaClient | Prisma.TransactionClient;
type SchedulerPlan = SchedulerStats & {
  executionIds: string[];
};

type SchedulerDependencies = {
  prisma: PrismaClient;
  batchSize: number;
  publishExecution: PublishExecution;
  lockId?: number;
  acquireLock?: () => Promise<boolean>;
  releaseLock?: () => Promise<void>;
};

export function createScheduler(deps: SchedulerDependencies) {
  const {
    prisma,
    batchSize,
    publishExecution,
    lockId = schedulerAdvisoryLockId,
  } = deps;

  async function acquireSchedulerLock(db: SchedulerDb) {
    if (deps.acquireLock) {
      return deps.acquireLock();
    }

    const rows = await db.$queryRaw<
      Array<{ locked: boolean }>
    >`select pg_try_advisory_xact_lock(${lockId}) as locked`;
    return rows[0]?.locked === true;
  }

  async function releaseSchedulerLock() {
    if (deps.releaseLock) {
      await deps.releaseLock();
    }
  }

  async function publishQueuedExecution(executionId: string) {
    await publishExecution(executionId);

    await prisma.execution.updateMany({
      where: {
        id: executionId,
        status: { in: ["PENDING", "RETRY_SCHEDULED", "STALLED"] },
      },
      data: {
        status: "QUEUED",
      },
    });
  }

  async function scheduleDueOneTimeJobs(db: SchedulerDb, now: Date) {
    const jobs = await db.job.findMany({
      where: {
        type: "ONE_TIME",
        status: "ACTIVE",
        runAt: { lte: now },
        executions: { none: {} },
      },
      take: batchSize,
      orderBy: { runAt: "asc" },
    });

    const executionIds: string[] = [];

    for (const job of jobs) {
      const execution = await db.execution.create({
        data: {
          jobId: job.id,
          status: "PENDING",
          scheduledFor: job.runAt ?? now,
          nextAttemptAt: job.runAt ?? now,
        },
      });

      executionIds.push(execution.id);
    }

    return executionIds;
  }

  async function scheduleDueRecurringJobs(db: SchedulerDb, now: Date) {
    const schedules = await db.jobSchedule.findMany({
      where: {
        nextRunAt: { lte: now },
        job: { status: "ACTIVE", type: "RECURRING" },
      },
      include: { job: true },
      take: batchSize,
      orderBy: { nextRunAt: "asc" },
    });

    const executionIds: string[] = [];

    for (const schedule of schedules) {
      const lockedSchedule = await db.jobSchedule.findUnique({
        where: { id: schedule.id },
      });

      if (!lockedSchedule || lockedSchedule.nextRunAt > now) {
        continue;
      }

      const execution = await db.execution.create({
        data: {
          jobId: schedule.jobId,
          status: "PENDING",
          scheduledFor: lockedSchedule.nextRunAt,
          nextAttemptAt: lockedSchedule.nextRunAt,
        },
      });

      await db.jobSchedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: lockedSchedule.nextRunAt,
          nextRunAt: nextCronRun(
            lockedSchedule.cronExpression,
            lockedSchedule.timezone,
            now,
          ),
        },
      });

      executionIds.push(execution.id);
    }

    return executionIds;
  }

  async function getDispatchableExecutions(db: SchedulerDb, now: Date, limit: number) {
    const queues = await db.queue.findMany({
      where: { status: 'ACTIVE' }
    });
    const queueLimits = new Map(queues.map(q => [q.id, q.concurrencyLimit]));
    
    if (queues.length === 0) return { executionIds: [], retries: 0, pending: 0 };

    const activeCountsRaw = await db.$queryRaw<{ queueId: string, count: bigint }[]>`
      SELECT j."queueId", COUNT(*) as count
      FROM "executions" e
      JOIN "jobs" j ON e."jobId" = j.id
      WHERE e.status IN ('QUEUED', 'RUNNING')
      GROUP BY j."queueId"
    `;
    const activeCounts = new Map<string, number>();
    for (const row of activeCountsRaw) {
      activeCounts.set(row.queueId, Number(row.count));
    }

    const candidates = await db.$queryRaw<{ id: string, queueId: string, status: string }[]>`
      SELECT e.id, j."queueId", e.status
      FROM "executions" e
      JOIN "jobs" j ON e."jobId" = j.id
      JOIN "queues" q ON j."queueId" = q.id
      WHERE e.status IN ('PENDING', 'RETRY_SCHEDULED', 'STALLED')
        AND e."nextAttemptAt" <= ${now}
        AND j.status = 'ACTIVE'
        AND q.status = 'ACTIVE'
      ORDER BY q.priority DESC, e."nextAttemptAt" ASC
      LIMIT ${limit * 5}
    `;

    const dispatchableIds: string[] = [];
    let retries = 0;
    let pending = 0;

    for (const candidate of candidates) {
      if (dispatchableIds.length >= limit) break;

      const qLimit = queueLimits.get(candidate.queueId) ?? 0;
      const currentActive = activeCounts.get(candidate.queueId) ?? 0;

      if (currentActive < qLimit) {
        dispatchableIds.push(candidate.id);
        activeCounts.set(candidate.queueId, currentActive + 1);
        if (candidate.status === 'RETRY_SCHEDULED' || candidate.status === 'STALLED') {
          retries++;
        } else {
          pending++;
        }
      }
    }

    return { executionIds: dispatchableIds, retries, pending };
  }

  async function runSchedulerOnce(now = new Date()): Promise<SchedulerStats> {
    const plan = await prisma.$transaction(async (tx): Promise<SchedulerPlan> => {
      const lockAcquired = await acquireSchedulerLock(tx);

      if (!lockAcquired) {
        return {
          lockAcquired,
          skipped: true,
          oneTimeQueued: 0,
          recurringQueued: 0,
          retriesQueued: 0,
          pendingQueued: 0,
          executionIds: [],
        };
      }

      try {
        const oneTimeIds = await scheduleDueOneTimeJobs(tx, now);
        const recurringIds = await scheduleDueRecurringJobs(tx, now);

        const dispatch = await getDispatchableExecutions(tx, now, batchSize);

        return {
          lockAcquired,
          skipped: false,
          oneTimeQueued: oneTimeIds.length,
          recurringQueued: recurringIds.length,
          retriesQueued: dispatch.retries,
          pendingQueued: dispatch.pending,
          executionIds: dispatch.executionIds,
        };
      } finally {
        await releaseSchedulerLock();
      }
    });

    for (const executionId of plan.executionIds) {
      await publishQueuedExecution(executionId);
    }

    const { executionIds: _executionIds, ...stats } = plan;
    return stats;
  }

  return { runSchedulerOnce };
}
