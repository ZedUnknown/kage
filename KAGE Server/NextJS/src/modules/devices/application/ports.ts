import type { Executor } from "@/shared/db";
import type {
  ChairRecord,
  ChairSummary,
  PcPolicy,
  PcSummary,
  RegisterPcInput,
  UpsertChairInput,
} from "../domain/types";

/** Storage port for PCs and chairs. Implemented in infrastructure/. */
export interface DeviceRepository {
  registerPc(x: Executor, input: RegisterPcInput): Promise<void>;
  upsertChair(x: Executor, input: UpsertChairInput): Promise<void>;
  updatePolicy(x: Executor, pcId: string, patch: Partial<PcPolicy>): Promise<void>;
  findPolicy(x: Executor, pcId: string): Promise<PcPolicy | null>;
  findTokenHash(x: Executor, pcId: string): Promise<string | null>;
  touchPc(x: Executor, pcId: string, at: Date): Promise<void>;
  /** Locks the row (FOR UPDATE) so concurrent readings are applied in order. */
  findChairForUpdate(x: Executor, chairId: string): Promise<ChairRecord | null>;
  saveChairReading(
    x: Executor,
    chairId: string,
    reading: { occupied: boolean; boot: string | null; seq: number | null; at: Date },
  ): Promise<void>;
  setChairOnline(x: Executor, chairId: string, online: boolean): Promise<void>;
  listPcs(x: Executor): Promise<PcSummary[]>;
  listChairs(x: Executor): Promise<ChairSummary[]>;
}
