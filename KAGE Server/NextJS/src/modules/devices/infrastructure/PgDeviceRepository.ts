import { eq } from "drizzle-orm";
import { schema, type Executor } from "@/shared/db";
import type { DeviceRepository } from "../application/ports";
import type {
  ChairRecord,
  ChairSummary,
  PcPolicy,
  PcSummary,
  PolicyActionType,
  RegisterPcInput,
  UpsertChairInput,
} from "../domain/types";

const { pcs, chairs } = schema;

const policyColumns = {
  actionType: pcs.actionType,
  graceSeconds: pcs.graceSeconds,
  countdownSeconds: pcs.countdownSeconds,
  maxExtensions: pcs.maxExtensions,
  maxExtendSeconds: pcs.maxExtendSeconds,
};

type PolicyRow = { actionType: string } & Omit<PcPolicy, "actionType">;
const toPolicy = (r: PolicyRow): PcPolicy => ({
  ...r,
  actionType: r.actionType as PolicyActionType,
});

export class PgDeviceRepository implements DeviceRepository {
  async registerPc(x: Executor, input: RegisterPcInput) {
    await x
      .insert(pcs)
      .values({ id: input.id, name: input.name, siteId: input.siteId, tokenHash: input.tokenHash })
      .onConflictDoUpdate({
        target: pcs.id,
        set: { name: input.name, tokenHash: input.tokenHash },
      });
  }

  async upsertChair(x: Executor, input: UpsertChairInput) {
    await x
      .insert(chairs)
      .values(input)
      .onConflictDoUpdate({ target: chairs.id, set: { pcId: input.pcId } });
  }

  async updatePolicy(x: Executor, pcId: string, patch: Partial<PcPolicy>) {
    // Undefined fields are skipped by drizzle, so partial patches are safe.
    await x.update(pcs).set(patch).where(eq(pcs.id, pcId));
  }

  async findPolicy(x: Executor, pcId: string) {
    const [row] = await x.select(policyColumns).from(pcs).where(eq(pcs.id, pcId));
    return row ? toPolicy(row) : null;
  }

  async findTokenHash(x: Executor, pcId: string) {
    const [row] = await x.select({ h: pcs.tokenHash }).from(pcs).where(eq(pcs.id, pcId));
    return row?.h ?? null;
  }

  async touchPc(x: Executor, pcId: string, at: Date) {
    await x.update(pcs).set({ lastSeenAt: at }).where(eq(pcs.id, pcId));
  }

  async findChairForUpdate(x: Executor, chairId: string): Promise<ChairRecord | null> {
    const [row] = await x
      .select({
        id: chairs.id,
        pcId: chairs.pcId,
        occupied: chairs.occupied,
        lastBoot: chairs.lastBoot,
        lastSeq: chairs.lastSeq,
      })
      .from(chairs)
      .where(eq(chairs.id, chairId))
      .for("update");
    return row ?? null;
  }

  async saveChairReading(
    x: Executor,
    chairId: string,
    r: { occupied: boolean; boot: string | null; seq: number | null; at: Date },
  ) {
    await x
      .update(chairs)
      .set({
        occupied: r.occupied,
        online: true,
        lastBoot: r.boot,
        lastSeq: r.seq,
        lastEventAt: r.at,
      })
      .where(eq(chairs.id, chairId));
  }

  async setChairOnline(x: Executor, chairId: string, online: boolean) {
    await x.update(chairs).set({ online }).where(eq(chairs.id, chairId));
  }

  async listPcs(x: Executor): Promise<PcSummary[]> {
    const rows = await x
      .select({
        id: pcs.id,
        name: pcs.name,
        siteId: pcs.siteId,
        lastSeenAt: pcs.lastSeenAt,
        ...policyColumns,
      })
      .from(pcs);
    return rows.map((r) => ({ ...toPolicy(r), id: r.id, name: r.name, siteId: r.siteId, lastSeenAt: r.lastSeenAt }));
  }

  async listChairs(x: Executor): Promise<ChairSummary[]> {
    return x
      .select({
        id: chairs.id,
        siteId: chairs.siteId,
        pcId: chairs.pcId,
        occupied: chairs.occupied,
        online: chairs.online,
        lastEventAt: chairs.lastEventAt,
      })
      .from(chairs);
  }
}
