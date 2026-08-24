import express from "express";
import { sendValidationError } from "./http.js";
import type { JobRouteDependencies } from "./route-types.js";
import { createJobSchema, jobStatusSchema, paginationSchema, parseId } from "./validation.js";
import { getOrganizationId } from "./project-routes.js";

export function registerJobReadRoutes(app: express.Express, deps: JobRouteDependencies) {
  const { prisma } = deps;

  app.get("/health", (_req, res) => {
    res.json({ service: "job-service", status: "ok" });
  });

  app.post("/jobs", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const data = createJobSchema.parse(req.body);

      const queue = await prisma.queue.findUnique({
        where: { id: data.queueId },
        include: { project: true }
      });

      if (!queue || queue.project.organizationId !== organizationId) {
        res.status(403).json({ error: "Queue not found or access denied" });
        return;
      }

      const job = await prisma.job.create({
        data: {
          queueId: data.queueId,
          name: data.name,
          type: data.type,
          method: data.method,
          url: data.url,
          headers: data.headers,
          body: data.body,
          timeoutMs: data.timeoutMs,
          maxAttempts: data.maxAttempts,
          backoffType: data.backoffType,
          retryInitialDelayMs: data.retryInitialDelayMs,
          retryMaxDelayMs: data.retryMaxDelayMs,
          runAt: data.runAt,
          schedule: data.schedule
            ? {
                create: {
                  cronExpression: data.schedule.cronExpression,
                  timezone: data.schedule.timezone,
                  nextRunAt: data.schedule.nextRunAt,
                },
              }
            : undefined,
        },
        include: { schedule: true },
      });

      res.status(201).json(job);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/jobs", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const status = req.query.status ? jobStatusSchema.parse(req.query.status) : undefined;
      const queueId = req.query.queueId ? parseId(req.query.queueId as string) : undefined;
      const pagination = paginationSchema.parse(req.query);

      const where = {
        status,
        queueId,
        queue: { project: { organizationId } },
      };

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          include: { schedule: true },
          orderBy: { createdAt: "desc" },
          take: pagination.limit,
          skip: pagination.offset,
        }),
        prisma.job.count({ where }),
      ]);

      res.json({ data: jobs, page: { ...pagination, total } });
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/jobs/:id", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);
      const job = await prisma.job.findUnique({
        where: { id },
        include: { schedule: true, queue: { include: { project: true } } },
      });

      if (!job || job.queue.project.organizationId !== organizationId) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      res.json(job);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });
}
