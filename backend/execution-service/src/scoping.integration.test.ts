import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { registerExecutionReadRoutes } from "./read-routes.js";
import { registerExecutionCommandRoutes } from "./command-routes.js";

const prisma = new PrismaClient();

async function createTestApp() {
  const app = express();
  app.use(express.json());
  
  registerExecutionReadRoutes(app, { prisma });
  registerExecutionCommandRoutes(app, { 
    prisma, 
    recoverStalledExecutions: async () => ({ recovered: 0 }) 
  });
  
  // Custom error handler for testing
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("TEST SERVER ERROR:", err);
    res.status(err.status || 500).json({ error: err.message });
  });

  return app;
}

test("Cross-tenant Data Access Scoping for executions", async () => {
  await prisma.deadLetterMessage.deleteMany({});
  await prisma.executionAttempt.deleteMany({});
  await prisma.execution.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.worker.deleteMany({});
  await prisma.organization.deleteMany({});

  const orgA = await prisma.organization.create({
    data: { name: "Org A", slug: "org-a-scoping" },
  });
  const orgB = await prisma.organization.create({
    data: { name: "Org B", slug: "org-b-scoping" },
  });

  const projA = await prisma.project.create({
    data: { name: "Proj A", organizationId: orgA.id },
  });
  const projB = await prisma.project.create({
    data: { name: "Proj B", organizationId: orgB.id },
  });

  const queueA = await prisma.queue.create({
    data: { name: "Queue A", projectId: projA.id },
  });
  const queueB = await prisma.queue.create({
    data: { name: "Queue B", projectId: projB.id },
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

  const execA = await prisma.execution.create({
    data: {
      jobId: jobA.id,
      status: "PENDING",
      scheduledFor: new Date(),
    },
  });

  const execB = await prisma.execution.create({
    data: {
      jobId: jobB.id,
      status: "FAILED",
      scheduledFor: new Date(),
    },
  });

  const dlA = await prisma.deadLetterMessage.create({
    data: {
      executionId: execA.id,
      reason: "MAX_ATTEMPTS_EXHAUSTED",
      sourceQueue: "test",
      payload: {},
    },
  });

  const dlB = await prisma.deadLetterMessage.create({
    data: {
      executionId: execB.id,
      reason: "MAX_ATTEMPTS_EXHAUSTED",
      sourceQueue: "test",
      payload: {},
    },
  });

  const workerA = await prisma.worker.create({
    data: { id: "worker-A", status: "IDLE", serviceInstanceId: "test-instance-a" },
  });
  const workerB = await prisma.worker.create({
    data: { id: "worker-B", status: "IDLE", serviceInstanceId: "test-instance-b" },
  });

  const app = await createTestApp();

  // Test 1: GET /executions
  const listA = await request(app)
    .get("/executions")
    .set("x-organization-id", orgA.id)
    .expect(200);
  assert.equal(listA.body.data.length, 1);
  assert.equal(listA.body.data[0].id, execA.id);

  // Test 2: GET /executions/:id
  await request(app)
    .get(`/executions/${execA.id}`)
    .set("x-organization-id", orgA.id)
    .expect(200);

  await request(app)
    .get(`/executions/${execB.id}`) // execB belongs to orgB
    .set("x-organization-id", orgA.id)
    .expect(404);

  // Test 3: GET /workers (workers are global, so all are returned)
  const workersA = await request(app)
    .get("/workers")
    .set("x-organization-id", orgA.id)
    .expect(200);
  assert.equal(workersA.body.data.length, 2);

  // Test 4: GET /dead-letter
  const dlsA = await request(app)
    .get("/dead-letter")
    .set("x-organization-id", orgA.id)
    .expect(200);
  assert.equal(dlsA.body.data.length, 1);
  assert.equal(dlsA.body.data[0].id, dlA.id);

  // Test 5: GET /metrics/overview
  const metricsA = await request(app)
    .get("/metrics/overview")
    .set("x-organization-id", orgA.id)
    .expect(200);
  assert.equal(metricsA.body.jobs.total, 1);
  assert.equal(metricsA.body.executions.failed, 0); // execB is failed but belongs to OrgB
  assert.equal(metricsA.body.workers.active, 2); // workers are global
  assert.equal(metricsA.body.deadLetters.active, 1);

  // Test 6: POST /executions/:id/cancel
  await request(app)
    .post(`/executions/${execB.id}/cancel`)
    .set("x-organization-id", orgA.id)
    .expect(404);

  // Test 7: POST /executions/:id/retry
  await request(app)
    .post(`/executions/${execB.id}/retry`)
    .set("x-organization-id", orgA.id)
    .expect(404);

  // Test 8: POST /dead-letter/:id/requeue
  await request(app)
    .post(`/dead-letter/${dlB.id}/requeue`)
    .set("x-organization-id", orgA.id)
    .expect(404);

  // Test 9: DELETE /dead-letter/:id
  await request(app)
    .delete(`/dead-letter/${dlB.id}`)
    .set("x-organization-id", orgA.id)
    .expect(404);
});
