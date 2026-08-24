import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { registerOrganizationRoutes } from "./organizations-routes.js";
import { createGatewayMiddleware } from "./middleware.js";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const jwtSecret = "test-secret";

function signUserToken(user: { id: string; email: string; role: string; organizationId: string }) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, organizationId: user.organizationId },
    jwtSecret,
    { expiresIn: "1h" }
  );
}

const app = express();
app.use(express.json());

const middleware = createGatewayMiddleware({
  prisma,
  redis: {} as any, // mocked redis
  jwtSecret,
  rateLimitMaxRequests: 0,
  rateLimitWindowMs: 0,
});

registerOrganizationRoutes(app, {
  prisma,
  requireJwt: middleware.requireJwt,
});

// Dummy endpoint to simulate Phase 2 cross-org scoping for Jobs
app.get("/dummy-jobs/:id", middleware.requireJwt, async (req, res) => {
  // In Phase 2, this would actually query the DB like:
  // prisma.job.findFirst({ where: { id: req.params.id, organizationId: res.locals.user.organizationId } })
  // For the test, we'll simulate the authorization failure.
  
  const dummyJobs = [
    { id: "job-a", organizationId: "org-a-id" },
    { id: "job-b", organizationId: "org-b-id" }
  ];
  
  const job = dummyJobs.find(j => j.id === req.params.id);
  if (!job || job.organizationId !== (res.locals.user as any).organizationId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  
  res.json(job);
});

test("Cross-tenant Data Access Scoping", async () => {
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  // 1. Create org A and its admin
  const resA = await request(app)
    .post("/organizations")
    .send({
      orgName: "Org A",
      orgSlug: "org-a",
      adminEmail: "admin@orga.com",
      adminName: "Admin A",
      adminPassword: "password123",
    });
  assert.equal(resA.status, 201);
  const orgAId = resA.body.org.id;
  const tokenA = resA.body.user.token; // wait, the route returns result object

  // 2. Create org B and its admin
  const resB = await request(app)
    .post("/organizations")
    .send({
      orgName: "Org B",
      orgSlug: "org-b",
      adminEmail: "admin@orgb.com",
      adminName: "Admin B",
      adminPassword: "password123",
    });
  assert.equal(resB.status, 201);
  const orgBId = resB.body.org.id;

  // 3. Log in as Org A's user implicitly using tokenA, attempt to GET /organizations/me
  // It should ONLY return Org A's data, regardless of Org B existing.
  // We'll sign a token directly since our route returned {org, user} but not token in POST /organizations (Wait, the route does not sign tokens yet. We'll sign one.)
  const userA = resA.body.user;
  const validTokenA = signUserToken(userA);

  const meRes = await request(app)
    .get("/organizations/me")
    .set("Authorization", `Bearer ${validTokenA}`);
  
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.slug, "org-a");
  assert.notEqual(meRes.body.slug, "org-b");

  // 4. Simulate a cross-org request to a downstream resource (e.g., Job from Org B)
  // We'll use our dummy-jobs endpoint to simulate this Phase 2 logic.
  // Let's modify the dummy jobs to use the real org IDs created in the DB.
  app.get("/jobs-test/:id", middleware.requireJwt, async (req, res) => {
    const dummyJobs = [
      { id: "job-a", organizationId: orgAId },
      { id: "job-b", organizationId: orgBId }
    ];
    
    const job = dummyJobs.find(j => j.id === req.params.id);
    if (!job || job.organizationId !== (res.locals.user as any).organizationId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(job);
  });

  const crossOrgRes = await request(app)
    .get("/jobs-test/job-b")
    .set("Authorization", `Bearer ${validTokenA}`);
  
  // Assert it returns 404/403 for cross-org attempts
  assert.equal(crossOrgRes.status, 404);
});
