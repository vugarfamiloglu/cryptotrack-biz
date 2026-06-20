import type { Request, Response, NextFunction } from "express";
import * as cookie from "cookie";
import db from "./db.js";
import { COOKIE, verifySession } from "./auth.js";

export type Role = "owner" | "manager" | "analyst" | "viewer";
export interface Ctx {
  user: { id: string; name: string; email: string };
  orgId: string;
  role: Role;
}
export const getCtx = (req: Request): Ctx => (req as any).ctx;

// Loads the user + their (single) org membership; rejects if unauthenticated.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = cookie.parse(req.headers.cookie ?? "")[COOKIE];
  const uid = token ? await verifySession(token) : null;
  if (!uid) return res.status(401).json({ error: { code: "unauthorized", message: "Sign in required" } });

  const user = db.prepare("SELECT id, name, email FROM users WHERE id=? AND status='active'").get(uid) as any;
  if (!user) return res.status(401).json({ error: { code: "unauthorized", message: "Session invalid" } });
  const m = db.prepare("SELECT org_id, role FROM memberships WHERE user_id=? LIMIT 1").get(uid) as any;
  if (!m) return res.status(403).json({ error: { code: "no_org", message: "No organization" } });

  (req as any).ctx = { user, orgId: m.org_id, role: m.role } as Ctx;
  next();
}

const RANK: Record<Role, number> = { viewer: 1, analyst: 2, manager: 3, owner: 4 };
export function requireRole(min: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { role } = getCtx(req);
    if (RANK[role] < RANK[min]) return res.status(403).json({ error: { code: "forbidden", message: "Insufficient role" } });
    next();
  };
}
