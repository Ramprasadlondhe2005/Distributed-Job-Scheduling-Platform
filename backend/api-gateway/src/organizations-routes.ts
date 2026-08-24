import express from "express";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "./auth/auth.js";
import { sendZodError, hasPrismaCode } from "./auth/auth-route-utils.js";

const createOrganizationSchema = z.object({
  orgName: z.string().min(1).max(120),
  orgSlug: z.string().min(1).max(120),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(120),
  adminPassword: z.string().min(8).max(200),
});

type OrganizationRoutesDependencies = {
  prisma: PrismaClient;
  requireJwt: express.RequestHandler;
};

export function registerOrganizationRoutes(app: express.Express, deps: OrganizationRoutesDependencies) {
  const { prisma, requireJwt } = deps;

  app.post("/organizations", async (req, res, next) => {
    try {
      const data = createOrganizationSchema.parse(req.body);

      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: data.orgName,
            slug: data.orgSlug,
          },
        });

        const user = await tx.user.create({
          data: {
            email: data.adminEmail,
            name: data.adminName,
            passwordHash: await hashPassword(data.adminPassword),
            role: "ADMIN",
            organizationId: org.id,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            organizationId: true,
            createdAt: true,
          }
        });

        return { org, user };
      });

      res.status(201).json(result);
    } catch (error) {
      if (sendZodError(res, error)) return;

      if (hasPrismaCode(error, "P2002")) {
        res.status(409).json({ error: "Organization slug or User email already exists" });
        return;
      }

      next(error);
    }
  });

  app.get("/organizations/me", requireJwt, async (req, res, next) => {
    try {
      const user = res.locals.user as { organizationId: string };
      const org = await prisma.organization.findUnique({
        where: { id: user.organizationId },
      });

      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }

      res.json(org);
    } catch (error) {
      next(error);
    }
  });
}
