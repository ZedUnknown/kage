import { desc } from "drizzle-orm";
import { schema, type Executor } from "@/shared/db";
import type { AuditEntry, AuditLog, AuditRecord } from "../auditLog";

const { auditLog } = schema;

export class PgAuditLog implements AuditLog {
  constructor(private readonly db: Executor) {}

  async record(entry: AuditEntry, x: Executor = this.db) {
    await x.insert(auditLog).values({
      actor: entry.actor,
      event: entry.event,
      pcId: entry.pcId ?? null,
      detail: entry.detail ?? null,
    });
  }

  async recent(limit: number, x: Executor = this.db): Promise<AuditRecord[]> {
    return x.select().from(auditLog).orderBy(desc(auditLog.id)).limit(limit);
  }
}
