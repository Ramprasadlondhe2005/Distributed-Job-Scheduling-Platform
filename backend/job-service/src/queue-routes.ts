import express from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { sendValidationError } from "./http.js";
import type { JobRouteDependencies } from "./route-types.js";
import { createQueueSchema, paginationSchema, parseId, updateQueueSchema, createJobBatchSchema } from "./validation.js";
import { getOrganizationId } from "./project-routes.js";

export function registerQueueRoutes(app: express.Express, deps: JobRouteDependencies) {
  const { prisma } = deps;

  // Internal helper to verify organization access to a project
  async function verifyProjectAccess(projectId: string, organizationId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.organizationId !== organizationId) {
      return false;
    }
    return true;
  }

  // Internal helper to verify organization access to a queue
  async function verifyQueueAccess(queueId: string, organizationId: string) {
    const queue = await prisma.queue.findUnique({
      where: { id: queueId },
      include: { project: true },
    });
    if (!queue || queue.project.organizationId !== organizationId) {
      return null;
    }
    return queue;
  }

  app.post("/projects/:projectId/queues", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const projectId = parseId(req.params.projectId);
      const data = createQueueSchema.parse(req.body);

      if (!(await verifyProjectAccess(projectId, organizationId))) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const queue = await prisma.queue.create({
        data: {
          projectId,
          name: data.name,
          priority: data.priority,
          concurrencyLimit: data.concurrencyLimit,
        },
      });

      res.status(201).json(queue);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Queue name already exists in this project" });
        return;
      }
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/projects/:projectId/queues", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const projectId = parseId(req.params.projectId);
      const pagination = paginationSchema.parse(req.query);

      if (!(await verifyProjectAccess(projectId, organizationId))) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const where = { projectId };
      const [queues, total] = await Promise.all([
        prisma.queue.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: pagination.limit,
          skip: pagination.offset,
        }),
        prisma.queue.count({ where }),
      ]);

      res.json({ data: queues, page: { ...pagination, total } });
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/queues/:id", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);

      const queue = await verifyQueueAccess(id, organizationId);
      if (!queue) {
        res.status(404).json({ error: "Queue not found" });
        return;
      }

      // We remove the nested project object from the response to match schema
      const { project, ...queueData } = queue;
      res.json(queueData);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.patch("/queues/:id", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);
      const data = updateQueueSchema.parse(req.body);

      const queue = await verifyQueueAccess(id, organizationId);
      if (!queue) {
        res.status(404).json({ error: "Queue not found" });
        return;
      }

      const updated = await prisma.queue.update({
        where: { id },
        data: {
          name: data.name,
          priority: data.priority,
          concurrencyLimit: data.concurrencyLimit,
        },
      });

      res.json(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({ error: "Queue name already exists in this project" });
        return;
      }
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.post("/queues/:id/pause", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);

      const queue = await verifyQueueAccess(id, organizationId);
      if (!queue) {
        res.status(404).json({ error: "Queue not found" });
        return;
      }

      const updated = await prisma.queue.update({
        where: { id },
        data: { status: "PAUSED" },
      });

      res.json(updated);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.post("/queues/:id/resume", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);

      const queue = await verifyQueueAccess(id, organizationId);
      if (!queue) {
        res.status(404).json({ error: "Queue not found" });
        return;
      }

      const updated = await prisma.queue.update({
        where: { id },
        data: { status: "ACTIVE" },
      });

      res.json(updated);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.delete("/queues/:id", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);

      const queue = await verifyQueueAccess(id, organizationId);
      if (!queue) {
        res.status(404).json({ error: "Queue not found" });
        return;
      }

      const activeJobsCount = await prisma.job.count({
        where: { queueId: id, status: { not: "DELETED" } },
      });

      if (activeJobsCount > 0) {
        res.status(409).json({ error: "Cannot delete queue with active or paused jobs" });
        return;
      }

      // Hard-delete any soft-deleted jobs to satisfy FK constraints
      await prisma.job.deleteMany({
        where: { queueId: id, status: "DELETED" },
      });

      const deleted = await prisma.queue.delete({
        where: { id },
      });

      res.json(deleted);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/queues/:id/stats", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);

      const queue = await verifyQueueAccess(id, organizationId);
      if (!queue) {
        res.status(404).json({ error: "Queue not found" });
        return;
      }

      // Get execution counts by status for this queue
      // Join via job to get execution count
      const result = await prisma.$queryRaw<{ status: string, count: bigint }[]>`
        SELECT e.status, COUNT(*) as count
        FROM "executions" e
        JOIN "jobs" j ON e."jobId" = j.id
        WHERE j."queueId" = ${id}
        GROUP BY e.status
      `;

      const stats: Record<string, number> = {
        PENDING: 0,
        QUEUED: 0,
        RUNNING: 0,
        SUCCEEDED: 0,
        FAILED: 0,
        RETRY_SCHEDULED: 0,
        STALLED: 0,
        CANCELED: 0,
      };

      for (const row of result) {
        stats[row.status] = Number(row.count);
      }

      res.json(stats);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.post("/queues/:queueId/jobs/batch", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const queueId = parseId(req.params.queueId);
      const { jobs } = createJobBatchSchema.parse(req.body);

      const queue = await verifyQueueAccess(queueId, organizationId);
      if (!queue) {
        res.status(403).json({ error: "Queue not found or access denied" });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const jobIds: string[] = [];
        for (const jobData of jobs) {
          const job = await tx.job.create({
            data: {
              queueId: queueId,
              name: jobData.name,
              type: jobData.type,
              method: jobData.method,
              url: jobData.url,
              headers: jobData.headers,
              body: jobData.body,
              timeoutMs: jobData.timeoutMs,
              maxAttempts: jobData.maxAttempts,
              backoffType: jobData.backoffType,
              retryInitialDelayMs: jobData.retryInitialDelayMs,
              retryMaxDelayMs: jobData.retryMaxDelayMs,
              runAt: jobData.runAt,
              schedule: jobData.schedule
                ? {
                    create: {
                      cronExpression: jobData.schedule.cronExpression,
                      timezone: jobData.schedule.timezone,
                      nextRunAt: jobData.schedule.nextRunAt,
                    },
                  }
                : undefined,
            },
          });
          jobIds.push(job.id);
        }
        return { created: jobIds.length, jobIds };
      });

      res.status(201).json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(422).json({ error: "Validation failed", issues: error.issues });
        return;
      }
      if (!sendValidationError(res, error)) next(error);
    }
  });
}
