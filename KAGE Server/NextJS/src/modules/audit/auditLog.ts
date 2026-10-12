import type { Executor } from "@/shared/db";

export type AuditEntry = {
  /** admin | pc:<id> | chair:<id> | system */
  actor: string;
  event: string;
  pcId?: string | null;
  detail?: string | null;
};

export type AuditRecord = {
  id: number;
  at: Date;
  actor: string;
  event: string;
  pcId: string | null;
  detail: string | null;
};

/** Public contract of the Audit module. */
export interface AuditLog {
  /** Pass the caller's transaction so the entry commits with the change. */
  record(entry: AuditEntry, x?: Executor): Promise<void>;
  recent(limit: number, x?: Executor): Promise<AuditRecord[]>;
}
