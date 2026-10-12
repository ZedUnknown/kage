import type { Executor } from "@/shared/db";
import { isStaleReading } from "../domain/chairReading";
import type {
  ChairReadingInput,
  ChairReadingResult,
  ChairSummary,
  PcPolicy,
  PcSummary,
  RegisterPcInput,
  UpsertChairInput,
} from "../domain/types";
import type { DeviceRepository } from "./ports";

/**
 * Public contract of the Devices module. Every method takes an optional
 * executor so a caller can include it in its own transaction.
 */
export interface DevicesApi {
  registerPc(input: RegisterPcInput, x?: Executor): Promise<void>;
  upsertChair(input: UpsertChairInput, x?: Executor): Promise<void>;
  updatePolicy(pcId: string, patch: Partial<PcPolicy>, x?: Executor): Promise<void>;
  /** null when the PC does not exist. */
  getPcPolicy(pcId: string, x?: Executor): Promise<PcPolicy | null>;
  getPcTokenHash(pcId: string, x?: Executor): Promise<string | null>;
  touchPc(pcId: string, at: Date, x?: Executor): Promise<void>;
  /** Must run inside a transaction: it relies on a row lock. */
  recordChairReading(input: ChairReadingInput, x: Executor): Promise<ChairReadingResult>;
  setChairOnline(chairId: string, online: boolean, x?: Executor): Promise<void>;
  snapshot(x?: Executor): Promise<{ pcs: PcSummary[]; chairs: ChairSummary[] }>;
}

export class DeviceService implements DevicesApi {
  constructor(
    private readonly repo: DeviceRepository,
    private readonly db: Executor,
  ) {}

  registerPc(input: RegisterPcInput, x: Executor = this.db) {
    return this.repo.registerPc(x, input);
  }

  upsertChair(input: UpsertChairInput, x: Executor = this.db) {
    return this.repo.upsertChair(x, input);
  }

  updatePolicy(pcId: string, patch: Partial<PcPolicy>, x: Executor = this.db) {
    return this.repo.updatePolicy(x, pcId, patch);
  }

  getPcPolicy(pcId: string, x: Executor = this.db) {
    return this.repo.findPolicy(x, pcId);
  }

  getPcTokenHash(pcId: string, x: Executor = this.db) {
    return this.repo.findTokenHash(x, pcId);
  }

  touchPc(pcId: string, at: Date, x: Executor = this.db) {
    return this.repo.touchPc(x, pcId, at);
  }

  async recordChairReading(input: ChairReadingInput, x: Executor): Promise<ChairReadingResult> {
    const chair = await this.repo.findChairForUpdate(x, input.chairId);
    if (!chair) return { kind: "unknown_chair" };
    if (isStaleReading(chair, input)) return { kind: "stale" };

    await this.repo.saveChairReading(x, chair.id, {
      occupied: input.occupied,
      // Keep the last known boot/seq when a reading doesn't carry them.
      boot: input.boot ?? chair.lastBoot,
      seq: input.seq ?? chair.lastSeq,
      at: input.at,
    });
    return { kind: "recorded", pcId: chair.pcId, prevOccupied: chair.occupied };
  }

  setChairOnline(chairId: string, online: boolean, x: Executor = this.db) {
    return this.repo.setChairOnline(x, chairId, online);
  }

  async snapshot(x: Executor = this.db) {
    const [pcs, chairs] = await Promise.all([this.repo.listPcs(x), this.repo.listChairs(x)]);
    return { pcs, chairs };
  }
}
