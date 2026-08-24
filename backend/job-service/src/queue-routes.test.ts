import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { registerQueueRoutes } from "./queue-routes.js";
import { registerProjectRoutes } from "./project-routes.js";

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

const app = express();
app.use(express.json());

// Mock middleware to inject x-organization-id
app.use((req, res, next) => {
  if (req.headers["x-test-org-id"]) {
    req.headers["x-organization-id"] = req.headers["x-test-org-id"];
  }
  next();
});

registerProjectRoutes(app, { prisma });
registerQueueRoutes(app, { prisma });

test("Queue CRUD and scoping", async (t) => {
  if (!(await checkDbAvailable(t))) return;
  await prisma.job.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  // Create Organizations A and B directly in DB for the test
  const orgA = await prisma.organization.create({
    data: { name: "Org A", slug: "org-a-test" }
  });
  const orgB = await prisma.organization.create({
    data: { name: "Org B", slug: "org-b-test" }
  });

  // Create Project in Org A
  const resCreateProject = await request(app)
    .post("/projects")
    .set("x-test-org-id", orgA.id)
    .send({ name: "Project A" });
  
  assert.equal(resCreateProject.status, 201);
  const projectId = resCreateProject.body.id;

  // 1. Create a queue in Project A using Org A
  const resCreateQueue = await request(app)
    .post(`/projects/${projectId}/queues`)
    .set("x-test-org-id", orgA.id)
    .send({ name: "High Priority", priority: 10, concurrencyLimit: 20 });
  assert.equal(resCreateQueue.status, 201);
  const queueId = resCreateQueue.body.id;
  assert.equal(resCreateQueue.body.priority, 10);
  assert.equal(resCreateQueue.body.concurrencyLimit, 20);
  assert.equal(resCreateQueue.body.status, "ACTIVE");

  // 2. Org B cannot read Project A's queues
  const resListQueuesOrgB = await request(app)
    .get(`/projects/${projectId}/queues`)
    .set("x-test-org-id", orgB.id);
  assert.equal(resListQueuesOrgB.status, 404);

  // 3. Org B cannot read Queue
  const resReadQueueOrgB = await request(app)
    .get(`/queues/${queueId}`)
    .set("x-test-org-id", orgB.id);
  assert.equal(resReadQueueOrgB.status, 404);

  // 4. Pause queue
  const resPauseQueue = await request(app)
    .post(`/queues/${queueId}/pause`)
    .set("x-test-org-id", orgA.id);
  assert.equal(resPauseQueue.status, 200);
  assert.equal(resPauseQueue.body.status, "PAUSED");

  // 5. Update queue priority
  const resUpdateQueue = await request(app)
    .patch(`/queues/${queueId}`)
    .set("x-test-org-id", orgA.id)
    .send({ priority: 15 });
  assert.equal(resUpdateQueue.status, 200);
  assert.equal(resUpdateQueue.body.priority, 15);

  // 6. Delete queue
  const resDeleteQueue = await request(app)
    .delete(`/queues/${queueId}`)
    .set("x-test-org-id", orgA.id);
  assert.equal(resDeleteQueue.status, 200);
});

test("Batch job creation", async (t) => {
  if (!(await checkDbAvailable(t))) return;
  await prisma.job.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  const orgA = await prisma.organization.create({
    data: { name: "Org A", slug: "org-a-batch-test" }
  });
  
  const project = await prisma.project.create({
    data: { organizationId: orgA.id, name: "Project Batch" }
  });
  
  const queue = await prisma.queue.create({
    data: { projectId: project.id, name: "Queue Batch" }
  });

  // 1. Valid batch
  const validBatchReq = await request(app)
    .post(`/queues/${queue.id}/jobs/batch`)
    .set("x-test-org-id", orgA.id)
    .send({
      jobs: [
        { name: "job1", type: "ONE_TIME", method: "GET", url: "http://test1", runAt: new Date().toISOString() },
        { name: "job2", type: "ONE_TIME", method: "GET", url: "http://test2", runAt: new Date().toISOString() }
      ]
    });
  
  assert.equal(validBatchReq.status, 201);
  assert.equal(validBatchReq.body.created, 2);
  assert.equal(validBatchReq.body.jobIds.length, 2);
  
  // 2. Oversized batch rejected
  const oversizedJobs = Array.from({ length: 501 }).map((_, i) => ({
    name: `job${i}`, type: "ONE_TIME", method: "GET", url: "http://test", runAt: new Date().toISOString()
  }));
  const oversizedBatchReq = await request(app)
    .post(`/queues/${queue.id}/jobs/batch`)
    .set("x-test-org-id", orgA.id)
    .send({ jobs: oversizedJobs });
  
  assert.equal(oversizedBatchReq.status, 422); // Validation error
  
  // 3. One invalid job rejects all with zero DB writes
  const initialJobCount = await prisma.job.count();
  const invalidBatchReq = await request(app)
    .post(`/queues/${queue.id}/jobs/batch`)
    .set("x-test-org-id", orgA.id)
    .send({
      jobs: [
        { name: "valid", type: "ONE_TIME", method: "GET", url: "http://test1", runAt: new Date().toISOString() },
        { name: "invalid-missing-url", type: "ONE_TIME", method: "GET" } // invalid
      ]
    });
  
  assert.equal(invalidBatchReq.status, 422);
  const finalJobCount = await prisma.job.count();
  assert.equal(initialJobCount, finalJobCount, "Zero DB writes should occur");
});
