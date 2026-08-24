import { test } from "node:test";
import assert from "node:assert";
import { PrismaClient } from "@prisma/client";
import { createWorkerRuntime, ExecutionAlreadyClaimedError } from "./worker.js";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

test("concurrency: exactly one worker should successfully claim the execution", async () => {
  // Create a dummy organization, project, job, and execution to test with
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: "Test Org", slug: randomUUID() },
  });
  
  const project = await prisma.project.create({
    data: { id: randomUUID(), name: "Test Project", organizationId: org.id },
  });
  
  const queue = await prisma.queue.create({
    data: { id: randomUUID(), name: "Test Queue", projectId: project.id },
  });
  
  const job = await prisma.job.create({
    data: {
      id: randomUUID(),
      queueId: queue.id,
      type: "ONE_TIME",
      name: "Concurrency Test Job",
      url: "http://localhost/test",
      method: "GET",
      status: "ACTIVE",
    },
  });

  const execution = await prisma.execution.create({
    data: {
      id: randomUUID(),
      jobId: job.id,
      status: "QUEUED",
      attemptCount: 0,
      scheduledFor: new Date(),
    },
  });

  const worker1 = createWorkerRuntime({ prisma, serviceInstanceId: "worker-1", responsePreviewLimit: 4000 });
  const worker2 = createWorkerRuntime({ prisma, serviceInstanceId: "worker-2", responsePreviewLimit: 4000 });

  await worker1.registerWorker();
  await worker2.registerWorker();

  let claim1Succeeded = false;
  let claim2Succeeded = false;

  try {
    const results = await Promise.allSettled([
      worker1.executeJob(execution.id).then(() => { claim1Succeeded = true; }),
      worker2.executeJob(execution.id).then(() => { claim2Succeeded = true; })
    ]);

    const successes = [claim1Succeeded, claim2Succeeded].filter(Boolean).length;
    const errors = results.filter(r => r.status === 'rejected');

    console.log(`Successes: ${successes}, Errors: ${errors.length}`);
    if (errors.length > 0) {
      console.log(`Error reason:`, (errors[0] as PromiseRejectedResult).reason);
    }

    assert.strictEqual(successes, 1, "Exactly one claim should succeed");
    assert.strictEqual(errors.length, 1, "Exactly one claim should fail with an error");
    
    const errorResult = errors[0] as PromiseRejectedResult;
    assert.ok(errorResult.reason instanceof ExecutionAlreadyClaimedError, "Error should be ExecutionAlreadyClaimedError");
    
  } finally {
    // Cleanup
    await worker1.markWorkerOffline();
    await worker2.markWorkerOffline();
    await prisma.executionAttempt.deleteMany({ where: { executionId: execution.id } }).catch(() => {});
    await prisma.deadLetterMessage.deleteMany({ where: { executionId: execution.id } }).catch(() => {});
    await prisma.execution.delete({ where: { id: execution.id } }).catch(() => {});
    await prisma.job.delete({ where: { id: job.id } }).catch(() => {});
    await prisma.queue.delete({ where: { id: queue.id } }).catch(() => {});
    await prisma.project.delete({ where: { id: project.id } }).catch(() => {});
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
