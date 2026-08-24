import express from "express";
import { routeParam } from "./auth/auth.js";
import type { AuditInput, GatewayServices, ServiceTarget } from "./types.js";

type ForwardRequest = (
  req: express.Request,
  res: express.Response,
  target: ServiceTarget,
  path: string,
  audit?: AuditInput,
) => Promise<void>;

type ProxyRouteDependencies = {
  services: GatewayServices;
  requireAdminUser: express.RequestHandler;
  forwardRequest: ForwardRequest;
};

const allowedJobActions = new Set(["run", "pause", "resume"]);
const allowedExecutionActions = new Set(["cancel", "retry"]);

export function isAllowedJobAction(action: string | undefined) {
  return Boolean(action && allowedJobActions.has(action));
}

export function isAllowedExecutionAction(action: string | undefined) {
  return Boolean(action && allowedExecutionActions.has(action));
}

export function registerProxyRoutes(app: express.Express, deps: ProxyRouteDependencies) {
  const { forwardRequest, requireAdminUser, services } = deps;

  app.get("/api/projects", (req, res) => {
    void forwardRequest(req, res, services.job, "/projects");
  });

  app.post("/api/projects", requireAdminUser, (req, res) => {
    void forwardRequest(req, res, services.job, "/projects", {
      action: "project.create",
      resourceType: "project",
      metadata: { name: req.body?.name },
    });
  });

  app.get("/api/projects/:id", (req, res) => {
    void forwardRequest(req, res, services.job, `/projects/${req.params.id}`);
  });

  app.patch("/api/projects/:id", requireAdminUser, (req, res) => {
    const projectId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/projects/${req.params.id}`, {
      action: "project.update",
      resourceType: "project",
      resourceId: projectId,
    });
  });

  app.delete("/api/projects/:id", requireAdminUser, (req, res) => {
    const projectId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/projects/${req.params.id}`, {
      action: "project.delete",
      resourceType: "project",
      resourceId: projectId,
    });
  });

  app.get("/api/projects/:id/queues", (req, res) => {
    void forwardRequest(req, res, services.job, `/projects/${req.params.id}/queues`);
  });

  app.post("/api/projects/:id/queues", requireAdminUser, (req, res) => {
    const projectId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/projects/${req.params.id}/queues`, {
      action: "queue.create",
      resourceType: "queue",
      metadata: { name: req.body?.name, projectId },
    });
  });

  app.get("/api/queues/:id", (req, res) => {
    void forwardRequest(req, res, services.job, `/queues/${req.params.id}`);
  });

  app.patch("/api/queues/:id", requireAdminUser, (req, res) => {
    const queueId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/queues/${req.params.id}`, {
      action: "queue.update",
      resourceType: "queue",
      resourceId: queueId,
    });
  });

  app.delete("/api/queues/:id", requireAdminUser, (req, res) => {
    const queueId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/queues/${req.params.id}`, {
      action: "queue.delete",
      resourceType: "queue",
      resourceId: queueId,
    });
  });

  app.post("/api/queues/:id/pause", requireAdminUser, (req, res) => {
    const queueId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/queues/${req.params.id}/pause`, {
      action: "queue.pause",
      resourceType: "queue",
      resourceId: queueId,
    });
  });

  app.post("/api/queues/:id/resume", requireAdminUser, (req, res) => {
    const queueId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/queues/${req.params.id}/resume`, {
      action: "queue.resume",
      resourceType: "queue",
      resourceId: queueId,
    });
  });

  app.get("/api/queues/:id/stats", (req, res) => {
    void forwardRequest(req, res, services.job, `/queues/${req.params.id}/stats`);
  });

  app.get("/api/jobs", (req, res) => {
    void forwardRequest(req, res, services.job, "/jobs");
  });

  app.post("/api/jobs", requireAdminUser, (req, res) => {
    void forwardRequest(req, res, services.job, "/jobs", {
      action: "job.create",
      resourceType: "job",
      metadata: { name: req.body?.name, type: req.body?.type },
    });
  });

  app.post("/api/queues/:id/jobs/batch", requireAdminUser, (req, res) => {
    const queueId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/queues/${req.params.id}/jobs/batch`, {
      action: "job.batch_create",
      resourceType: "job",
      metadata: { queueId, count: req.body?.jobs?.length },
    });
  });

  app.get("/api/jobs/:id", (req, res) => {
    void forwardRequest(req, res, services.job, `/jobs/${req.params.id}`);
  });

  app.patch("/api/jobs/:id", requireAdminUser, (req, res) => {
    const jobId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/jobs/${req.params.id}`, {
      action: "job.update",
      resourceType: "job",
      resourceId: jobId,
    });
  });

  app.delete("/api/jobs/:id", requireAdminUser, (req, res) => {
    const jobId = routeParam(req.params.id);
    void forwardRequest(req, res, services.job, `/jobs/${req.params.id}`, {
      action: "job.delete",
      resourceType: "job",
      resourceId: jobId,
    });
  });

  app.post("/api/jobs/:id/:action", requireAdminUser, (req, res) => {
    const jobId = routeParam(req.params.id);
    const action = routeParam(req.params.action);

    if (!isAllowedJobAction(action)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    void forwardRequest(req, res, services.job, `/jobs/${req.params.id}/${req.params.action}`, {
      action: `job.${action}`,
      resourceType: "job",
      resourceId: jobId,
    });
  });

  app.get("/api/executions", (req, res) => {
    void forwardRequest(req, res, services.execution, "/executions");
  });

  app.post("/api/executions", requireAdminUser, (req, res) => {
    void forwardRequest(req, res, services.execution, "/executions", {
      action: "execution.create",
      resourceType: "execution",
      metadata: { jobId: req.body?.jobId },
    });
  });

  app.get("/api/executions/:id", (req, res) => {
    void forwardRequest(req, res, services.execution, `/executions/${req.params.id}`);
  });

  app.post("/api/executions/:id/:action", requireAdminUser, (req, res) => {
    const executionId = routeParam(req.params.id);
    const action = routeParam(req.params.action);

    if (!isAllowedExecutionAction(action)) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    void forwardRequest(req, res, services.execution, `/executions/${req.params.id}/${req.params.action}`, {
      action: `execution.${action}`,
      resourceType: "execution",
      resourceId: executionId,
    });
  });

  app.get("/api/workers", (req, res) => {
    void forwardRequest(req, res, services.execution, "/workers");
  });

  app.get("/api/dead-letter", requireAdminUser, (req, res) => {
    void forwardRequest(req, res, services.execution, "/dead-letter");
  });

  app.post("/api/dead-letter/:id/requeue", requireAdminUser, (req, res) => {
    const messageId = routeParam(req.params.id);
    void forwardRequest(req, res, services.execution, `/dead-letter/${req.params.id}/requeue`, {
      action: "dead_letter.requeue",
      resourceType: "dead_letter_message",
      resourceId: messageId,
    });
  });

  app.delete("/api/dead-letter/:id", requireAdminUser, (req, res) => {
    const messageId = routeParam(req.params.id);
    void forwardRequest(req, res, services.execution, `/dead-letter/${req.params.id}`, {
      action: "dead_letter.discard",
      resourceType: "dead_letter_message",
      resourceId: messageId,
    });
  });

  app.get("/api/metrics/overview", (req, res) => {
    void forwardRequest(req, res, services.execution, "/metrics/overview");
  });

  app.post("/api/schedule/run", requireAdminUser, (req, res) => {
    void forwardRequest(req, res, services.scheduler, "/schedule/run", {
      action: "scheduler.run",
      resourceType: "scheduler",
    });
  });

  app.post("/api/recover/stalled", requireAdminUser, (req, res) => {
    void forwardRequest(req, res, services.execution, "/recover/stalled", {
      action: "execution.recover_stalled",
      resourceType: "execution",
    });
  });
}
