import db from "./db.js";
import { newId } from "./ids.js";

const stmt = db.prepare(`INSERT INTO audit_logs (id, org_id, actor_id, actor_name, actor_role, action, entity, entity_id, detail, ip)
  VALUES (@id,@org_id,@actor_id,@actor_name,@actor_role,@action,@entity,@entity_id,@detail,@ip)`);

export function writeAudit(e: {
  orgId: string; actorId?: string; actorName?: string; actorRole?: string;
  action: string; entity?: string; entityId?: string; detail?: string; ip?: string;
}): void {
  stmt.run({
    id: newId(), org_id: e.orgId, actor_id: e.actorId ?? null, actor_name: e.actorName ?? "",
    actor_role: e.actorRole ?? "", action: e.action, entity: e.entity ?? "", entity_id: e.entityId ?? "",
    detail: e.detail ?? "", ip: e.ip ?? "",
  });
}
