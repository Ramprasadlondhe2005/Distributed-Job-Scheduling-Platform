import express from "express";
import { Prisma } from "@prisma/client";
import { sendValidationError } from "./http.js";
import type { JobRouteDependencies } from "./route-types.js";
import { createProjectSchema, paginationSchema, parseId, updateProjectSchema } from "./validation.js";

export function getOrganizationId(req: express.Request): string {
  const orgId = req.header("x-organization-id");
  if (!orgId) {
    throw new Error("Missing x-organization-id header");
  }
  return orgId;
}

export function registerProjectRoutes(app: express.Express, deps: JobRouteDependencies) {
  const { prisma } = deps;

  app.post("/projects", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const data = createProjectSchema.parse(req.body);

      const project = await prisma.project.create({
        data: {
          organizationId,
          name: data.name,
          description: data.description,
        },
      });

      res.status(201).json(project);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res.status(409).json({ error: "Project name already exists in this organization" });
        return;
      }
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/projects", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const pagination = paginationSchema.parse(req.query);

      const where = { organizationId };
      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: pagination.limit,
          skip: pagination.offset,
        }),
        prisma.project.count({ where }),
      ]);

      res.json({ data: projects, page: { ...pagination, total } });
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.get("/projects/:id", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);

      const project = await prisma.project.findUnique({
        where: { id },
      });

      if (!project || project.organizationId !== organizationId) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      res.json(project);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.patch("/projects/:id", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);
      const data = updateProjectSchema.parse(req.body);

      const existing = await prisma.project.findUnique({
        where: { id },
      });

      if (!existing || existing.organizationId !== organizationId) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const project = await prisma.project.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
        },
      });

      res.json(project);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res.status(409).json({ error: "Project name already exists in this organization" });
        return;
      }
      if (!sendValidationError(res, error)) next(error);
    }
  });

  app.delete("/projects/:id", async (req, res, next) => {
    try {
      const organizationId = getOrganizationId(req);
      const id = parseId(req.params.id);

      const existing = await prisma.project.findUnique({
        where: { id },
      });

      if (!existing || existing.organizationId !== organizationId) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const activeJobsCount = await prisma.job.count({
        where: { queue: { projectId: id }, status: { not: "DELETED" } },
      });

      if (activeJobsCount > 0) {
        res.status(409).json({ error: "Cannot delete project with active or paused jobs" });
        return;
      }

      const queues = await prisma.queue.findMany({ where: { projectId: id }, select: { id: true } });
      const queueIds = queues.map(q => q.id);

      if (queueIds.length > 0) {
        // Hard-delete any soft-deleted jobs to satisfy FK constraints
        await prisma.job.deleteMany({
          where: { queueId: { in: queueIds }, status: "DELETED" },
        });
      }

      const project = await prisma.project.delete({
        where: { id },
      });

      res.json(project);
    } catch (error) {
      if (!sendValidationError(res, error)) next(error);
    }
  });
}
