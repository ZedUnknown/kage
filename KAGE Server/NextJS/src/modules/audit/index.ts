import type { Executor } from "@/shared/db";
import type { AuditLog } from "./auditLog";
import { PgAuditLog } from "./infrastructure/PgAuditLog";

export type { AuditEntry, AuditLog, AuditRecord } from "./auditLog";

export function createAuditModule(deps: { db: Executor }): AuditLog {
  return new PgAuditLog(deps.db);
}
