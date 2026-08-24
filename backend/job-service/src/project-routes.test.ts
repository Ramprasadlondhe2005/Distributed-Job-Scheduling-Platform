import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { registerProjectRoutes } from "./project-routes.js";
import { registerJobReadRoutes } from "./read-routes.js";
import { registerJobCommandRoutes } from "./command-routes.js";

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
registerJobReadRoutes(app, { prisma });
registerJobCommandRoutes(app, { prisma });
import { registerQueueRoutes } from "./queue-routes.js";
registerQueueRoutes(app, { prisma });

test("Project CRUD and Cross-org scoping", async (t) => {
  if (!(await checkDbAvailable(t))) return;
  await prisma.job.deleteMany({});
  await prisma.queue.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  // Create Organizations A and B directly in DB for the test
  const orgA = await prisma.organization.create({
    data: { name: "Org A", slug: "org-a-project-test" }
  });
  const orgB = await prisma.organization.create({
    data: { name: "Org B", slug: "org-b-project-test" }
  });

  // 1. Create a project in Org A
  const resCreateProject = await request(app)
    .post("/projects")
    .set("x-test-org-id", orgA.id)
    .send({ name: "Project A", description: "Test project for Org A" });
  
  assert.equal(resCreateProject.status, 201);
  const projectId = resCreateProject.body.id;

  // 2. Org B cannot read Project A
  const resReadProjectOrgB = await request(app)
    .get(`/projects/${projectId}`)
    .set("x-test-org-id", orgB.id);
  assert.equal(resReadProjectOrgB.status, 404);

  // 3. Org A can read Project A
  const resReadProjectOrgA = await request(app)
    .get(`/projects/${projectId}`)
    .set("x-test-org-id", orgA.id);
  assert.equal(resReadProjectOrgA.status, 200);
  assert.equal(resReadProjectOrgA.body.name, "Project A");

  // 4a. Create a Queue in Project A using Org A
  const resCreateQueue = await request(app)
    .post(`/projects/${projectId}/queues`)
    .set("x-test-org-id", orgA.id)
    .send({ name: "Default Queue" });
  assert.equal(resCreateQueue.status, 201);
  const queueId = resCreateQueue.body.id;

  // 4. Create a Job in Queue using Org A
  const resCreateJobOrgA = await request(app)
    .post("/jobs")
    .set("x-test-org-id", orgA.id)
    .send({
      queueId,
      name: "Job A",
      type: "ONE_TIME",
      method: "GET",
      url: "http://example.com",
      runAt: new Date().toISOString()
    });
  assert.equal(resCreateJobOrgA.status, 201);
  const jobId = resCreateJobOrgA.body.id;

  // 5. Try creating a Job in Queue using Org B (Cross-org job creation denial)
  const resCreateJobOrgB = await request(app)
    .post("/jobs")
    .set("x-test-org-id", orgB.id)
    .send({
      queueId, // Queue belongs to A
      name: "Job B",
      type: "ONE_TIME",
      method: "GET",
      url: "http://example.com",
      runAt: new Date().toISOString()
    });
  assert.equal(resCreateJobOrgB.status, 403);

  // 6. Org B cannot run Job A
  const resRunJobOrgB = await request(app)
    .post(`/jobs/${jobId}/run`)
    .set("x-test-org-id", orgB.id);
  assert.equal(resRunJobOrgB.status, 404);

  // 7. Delete Project A should be blocked because it has active jobs
  const resDeleteProjectBlocked = await request(app)
    .delete(`/projects/${projectId}`)
    .set("x-test-org-id", orgA.id);
  assert.equal(resDeleteProjectBlocked.status, 409);

  // 8. Delete Job A
  const resDeleteJob = await request(app)
    .delete(`/jobs/${jobId}`)
    .set("x-test-org-id", orgA.id);
  assert.equal(resDeleteJob.status, 200);

  // 9. Now we can delete Project A
  const resDeleteProject = await request(app)
    .delete(`/projects/${projectId}`)
    .set("x-test-org-id", orgA.id);
  assert.equal(resDeleteProject.status, 200);
});
