import express from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { sendValidationError } from "./http.js";
import { createExecutionSchema, executionStatusSchema, paginationSchema, parseId } from "./validation.js";
import { getOrganizationId } from "./http.js";

type ReadRouteDependencies = {
  prisma: PrismaClient;
};

export function registerExecutionReadRoutes(app: express.Express, deps: ReadRouteDependencies) {
  const { prisma } = deps;

  app.get("/health", (_req, res) => {
    res.json({ service: "execution-service", status: "ok" });
  });

  app.post("/executions", async (req, res, next) => {
    try {
      const data = createExecutionSchema.parse(req.body);

      const execution = await prisma.execution.create({
        data: {
          jobId: data.jobId,
          scheduledFor: data.scheduledFor,
          nextAttemptAt: data.scheduledFor,
        },
        include: { job: true, attempts: true },
      });

      res.status(201).json(execution);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/executions", async (req, res, next) => {
    try {
      const status = req.query.status ? executionStatusSchema.parse(req.query.status) : undefined;
      const jobId = req.query.jobId ? parseId(String(req.query.jobId)) : undefined;
      const pagination = paginationSchema.parse(req.query);

      const organizationId = getOrganizationId(req);
      const where: Prisma.ExecutionWhereInput = {
        status,
        jobId,
        job: { queue: { project: { organizationId } } },
      };
      const [executions, total] = await Promise.all([
        prisma.execution.findMany({
          where,
          include: { job: true, attempts: true },
          orderBy: { createdAt: "desc" },
          take: pagination.limit,
          skip: pagination.offset,
        }),
        prisma.execution.count({ where }),
      ]);

      res.json({ data: executions, page: { ...pagination, total } });
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/executions/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const organizationId = getOrganizationId(req);
      const execution = await prisma.execution.findFirst({
        where: {
          id,
          job: { queue: { project: { organizationId } } },
        },
        include: { job: true, attempts: true },
      });

      if (!execution) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      res.json(execution);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/workers", async (req, res, next) => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const [workers, total] = await Promise.all([
        prisma.worker.findMany({
          orderBy: { lastHeartbeatAt: "desc" },
          take: pagination.limit,
          skip: pagination.offset,
        }),
        prisma.worker.count(),
      ]);

      res.json({ data: workers, page: { ...pagination, total } });
    } catch (error) {
      next(error);
    }
  });

  app.get("/dead-letter", async (req, res, next) => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const organizationId = getOrganizationId(req);
      const activeWhere: Prisma.DeadLetterMessageWhereInput = {
        requeuedAt: null,
        discardedAt: null,
        execution: { job: { queue: { project: { organizationId } } } },
      };

      const [messages, total, oldestActive] = await Promise.all([
        prisma.deadLetterMessage.findMany({
          where: activeWhere,
          include: {
            execution: {
              select: {
                id: true,
                jobId: true,
                status: true,
                attemptCount: true,
                job: {
                  select: {
                    id: true,
                    status: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: pagination.limit,
          skip: pagination.offset,
        }),
        prisma.deadLetterMessage.count({ where: activeWhere }),
        prisma.deadLetterMessage.findFirst({
          where: activeWhere,
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);

      res.json({
        data: messages,
        summary: {
          active: total,
          oldestCreatedAt: oldestActive?.createdAt ?? null,
        },
        page: { ...pagination, total },
      });
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/metrics/overview", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const jobScope = { queue: { project: { organizationId } } };
      const execScope = { job: jobScope };

      const [
        totalJobs,
        activeJobs,
        pausedJobs,
        runningExecutions,
        queuedExecutions,
        retryScheduledExecutions,
        failedExecutions,
        succeededExecutions,
        activeWorkers,
        deadLetters,
      ] = await Promise.all([
        prisma.job.count({ where: { ...jobScope, status: { not: "DELETED" } } }),
        prisma.job.count({ where: { ...jobScope, status: "ACTIVE" } }),
        prisma.job.count({ where: { ...jobScope, status: "PAUSED" } }),
        prisma.execution.count({ where: { ...execScope, status: "RUNNING" } }),
        prisma.execution.count({ where: { ...execScope, status: "QUEUED" } }),
        prisma.execution.count({ where: { ...execScope, status: "RETRY_SCHEDULED" } }),
        prisma.execution.count({ where: { ...execScope, status: "FAILED" } }),
        prisma.execution.count({ where: { ...execScope, status: "SUCCEEDED" } }),
        prisma.worker.count({ where: { status: { in: ["IDLE", "BUSY"] } } }),
        prisma.deadLetterMessage.count({ where: { requeuedAt: null, discardedAt: null, execution: execScope } }),
      ]);

      res.json({
        jobs: {
          total: totalJobs,
          active: activeJobs,
          paused: pausedJobs,
        },
        executions: {
          running: runningExecutions,
          queued: queuedExecutions,
          retryScheduled: retryScheduledExecutions,
          failed: failedExecutions,
          succeeded: succeededExecutions,
        },
        workers: {
          active: activeWorkers,
        },
        deadLetters: {
          active: deadLetters,
        },
      });
    } catch (error) {
      next(error);
    }
  });
}
