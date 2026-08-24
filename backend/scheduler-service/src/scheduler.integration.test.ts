import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { createScheduler } from "./scheduler.js";

const prisma = new PrismaClient();

async function checkDbAvailable(t: any): Promise<boolean> {
  try {
    await prisma.$connect();
    return true;
  } catch {
    t.skip("Database server not reachable at localhost:5432");
    return false;
  }
}

test("Queues dispatch in priority order", async (t) => {
  if (!(await checkDbAvailable(t))) return;
  await prisma.execution.deleteMany({});
  await prisma.execution.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.worker.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  const org = await prisma.organization.create({
    data: { name: "Test Org", slug: "test-org-priority" },
  });
  const proj = await prisma.project.create({
    data: { name: "Test Proj", organizationId: org.id },
  });

  const queueA = await prisma.queue.create({
    data: { name: "Queue A", projectId: proj.id, priority: 0 },
  });
  const queueB = await prisma.queue.create({
    data: { name: "Queue B", projectId: proj.id, priority: 10 },
  });

  const jobA = await prisma.job.create({
    data: {
      queueId: queueA.id,
      name: "Job A",
      type: "ONE_TIME",
      method: "GET",
      url: "http://example.com",
      status: "ACTIVE",
    },
  });

  const jobB = await prisma.job.create({
    data: {
      queueId: queueB.id,
      name: "Job B",
      type: "ONE_TIME",
      method: "GET",
      url: "http://example.com",
      status: "ACTIVE",
    },
  });

  // Create pending executions for both
  await prisma.execution.create({
    data: {
      jobId: jobA.id,
      status: "PENDING",
      scheduledFor: new Date(Date.now() - 10000), // Due in the past
      nextAttemptAt: new Date(Date.now() - 10000),
    },
  });

  await prisma.execution.create({
    data: {
      jobId: jobB.id,
      status: "PENDING",
      scheduledFor: new Date(Date.now() - 10000), // Due in the past
      nextAttemptAt: new Date(Date.now() - 10000),
    },
  });

  const publishedIds: string[] = [];
  const scheduler = createScheduler({
    prisma,
    batchSize: 10,
    publishExecution: async (execId) => {
      const exec = await prisma.execution.findUnique({ where: { id: execId }, include: { job: true } });
      if (exec) publishedIds.push(exec.job.queueId);
    },
    acquireLock: async () => true,
  });

  await scheduler.runSchedulerOnce(new Date());

  // Both should be published, but B (priority 10) must be published before A (priority 0)
  assert.equal(publishedIds.length, 2);
  assert.equal(publishedIds[0], queueB.id);
  assert.equal(publishedIds[1], queueA.id);
});

test("Queue concurrency limits are respected", async (t) => {
  if (!(await checkDbAvailable(t))) return;
  await prisma.job.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  const org = await prisma.organization.create({
    data: { name: "Test Org", slug: "test-org-concurrency" },
  });
  const proj = await prisma.project.create({
    data: { name: "Test Proj", organizationId: org.id },
  });

  const queue = await prisma.queue.create({
    data: { name: "Queue Concurrency", projectId: proj.id, concurrencyLimit: 2 },
  });

  const job = await prisma.job.create({
    data: {
      queueId: queue.id,
      name: "Job C",
      type: "ONE_TIME",
      method: "GET",
      url: "http://example.com",
      status: "ACTIVE",
    },
  });

  // Create 3 PENDING executions
  for (let i = 0; i < 3; i++) {
    await prisma.execution.create({
      data: {
        jobId: job.id,
        status: "PENDING",
        scheduledFor: new Date(Date.now() - 10000),
        nextAttemptAt: new Date(Date.now() - 10000),
      },
    });
  }

  const worker = await prisma.worker.create({
    data: { id: "test-worker", status: "IDLE", serviceInstanceId: "test-instance" },
  });

  // Create 1 RUNNING execution to simulate active work
  await prisma.execution.create({
    data: {
      jobId: job.id,
      status: "RUNNING",
      scheduledFor: new Date(Date.now() - 20000),
      startedAt: new Date(Date.now() - 5000),
      lockedByWorkerId: worker.id,
    },
  });

  // The queue has concurrency limit 2, and 1 execution is RUNNING.
  // There are 3 PENDING executions.
  // Only 1 PENDING execution should be dispatched to reach the concurrency limit of 2 (1 RUNNING + 1 dispatching = 2).
  
  let publishedCount = 0;
  const scheduler = createScheduler({
    prisma,
    batchSize: 10,
    publishExecution: async () => {
      publishedCount += 1;
    },
    acquireLock: async () => true,
  });

  await scheduler.runSchedulerOnce(new Date());

  assert.equal(publishedCount, 1);
});

test("Paused queues are skipped", async (t) => {
  if (!(await checkDbAvailable(t))) return;
  await prisma.job.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  const org = await prisma.organization.create({
    data: { name: "Test Org", slug: "test-org-pause" },
  });
  const proj = await prisma.project.create({
    data: { name: "Test Proj", organizationId: org.id },
  });

  const queue = await prisma.queue.create({
    data: { name: "Queue Paused", projectId: proj.id, status: "PAUSED" },
  });

  const job = await prisma.job.create({
    data: {
      queueId: queue.id,
      name: "Job Paused",
      type: "ONE_TIME",
      method: "GET",
      url: "http://example.com",
      status: "ACTIVE",
    },
  });

  await prisma.execution.create({
    data: {
      jobId: job.id,
      status: "PENDING",
      scheduledFor: new Date(Date.now() - 10000),
      nextAttemptAt: new Date(Date.now() - 10000),
    },
  });

  let publishedCount = 0;
  const scheduler = createScheduler({
    prisma,
    batchSize: 10,
    publishExecution: async () => {
      publishedCount += 1;
    },
    acquireLock: async () => true,
  });

  // Paused queue should skip job
  await scheduler.runSchedulerOnce(new Date());
  assert.equal(publishedCount, 0);

  // Resume queue
  await prisma.queue.update({
    where: { id: queue.id },
    data: { status: "ACTIVE" },
  });

  // Now it should be dispatched
  await scheduler.runSchedulerOnce(new Date());
  assert.equal(publishedCount, 1);
});
