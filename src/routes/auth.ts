import { Router } from "express";
import db from "../db.js";
import { COOKIE, signSession, checkPassword } from "../auth.js";
import { requireAuth } from "../context.js";
import { writeAudit } from "../audit.js";
import { logInfo, logWarn } from "../logbus.js";

const router = Router();
const COOKIE_MAX = 60 * 60 * 24 * 7; // 7 days

function sessionView(userId: string) {
  const user = db.prepare("SELECT id, email, name, status FROM users WHERE id=?").get(userId) as any;
  const m = db.prepare("SELECT org_id, role FROM memberships WHERE user_id=? LIMIT 1").get(userId) as any;
  const org = m ? db.prepare("SELECT id, name, base_currency, cost_basis_method FROM organizations WHERE id=?").get(m.org_id) : null;
  return { user: { id: user.id, email: user.email, name: user.name }, org, role: m?.role ?? "viewer" };
}

router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(String(email).toLowerCase().trim()) as any;
  if (!user || user.status !== "active" || !(await checkPassword(password, user.password_hash))) {
    logWarn("auth", `Failed login for ${email}`);
    return res.status(401).json({ error: "Invalid credentials." });
  }
  db.prepare("UPDATE users SET last_login_at=datetime('now') WHERE id=?").run(user.id);
  const token = await signSession(user.id);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: COOKIE_MAX * 1000 });
  const view = sessionView(user.id);
  if (view.org) writeAudit({ orgId: view.org.id, actorId: user.id, actorName: user.name, actorRole: view.role, action: "auth.login", entity: "user", entityId: user.id, ip: req.ip });
  logInfo("auth", `${user.name} signed in`);
  res.json(view);
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  const ctx = (req as any).ctx;
  res.json(sessionView(ctx.user.id));
});

export default router;
