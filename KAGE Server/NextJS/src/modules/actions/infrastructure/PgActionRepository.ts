import { and, eq, lt } from "drizzle-orm";
import { schema, type Executor } from "@/shared/db";
import type { ActionRepository } from "../application/ports";
import type { ActionKind, ActionStatus, ActionType } from "../domain/machine";
import type {
  ActionPatch,
  ActionRecord,
  ExtensionRequestRecord,
  NewAction,
  PendingActions,
} from "../domain/types";

const { actions, extensionRequests } = schema;

type Row = typeof actions.$inferSelect;

const toRecord = (r: Row): ActionRecord => ({
  id: r.id,
  pcId: r.pcId,
  kind: r.kind as ActionKind,
  type: r.type as ActionType,
  status: r.status as ActionStatus,
  version: r.version,
  warnAt: r.warnAt,
  deadline: r.deadline,
  message: r.message,
  extensionsUsed: r.extensionsUsed,
  extendedSeconds: r.extendedSeconds,
});

export class PgActionRepository implements ActionRepository {
  async expireStale(x: Executor, pcId: string, cutoff: Date, now: Date) {
    await x
      .update(actions)
      .set({ status: "expired", updatedAt: now })
      .where(and(eq(actions.pcId, pcId), eq(actions.status, "pending"), lt(actions.deadline, cutoff)));
  }

  async findPending(x: Executor, pcId: string): Promise<PendingActions> {
    const rows = await x
      .select()
      .from(actions)
      .where(and(eq(actions.pcId, pcId), eq(actions.status, "pending")));
    return {
      auto: rows.filter((r) => r.kind === "auto").map(toRecord)[0],
      forced: rows.filter((r) => r.kind === "forced").map(toRecord)[0],
    };
  }

  async insert(x: Executor, a: NewAction) {
    const [row] = await x.insert(actions).values(a).returning();
    return toRecord(row);
  }

  async update(x: Executor, actionId: number, patch: ActionPatch) {
    const [row] = await x.update(actions).set(patch).where(eq(actions.id, actionId)).returning();
    return toRecord(row);
  }

  async findForUpdate(x: Executor, actionId: number, pcId: string) {
    const [row] = await x
      .select()
      .from(actions)
      .where(and(eq(actions.id, actionId), eq(actions.pcId, pcId)))
      .for("update");
    return row ? toRecord(row) : null;
  }

  async findExtensionRequest(x: Executor, requestId: string): Promise<ExtensionRequestRecord | null> {
    const [row] = await x
      .select()
      .from(extensionRequests)
      .where(eq(extensionRequests.requestId, requestId));
    return row ?? null;
  }

  async insertExtensionRequest(x: Executor, r: ExtensionRequestRecord) {
    await x.insert(extensionRequests).values(r);
  }

  async listPending(x: Executor) {
    const rows = await x.select().from(actions).where(eq(actions.status, "pending"));
    return rows.map(toRecord);
  }
}
