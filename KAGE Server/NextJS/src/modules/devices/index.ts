// Public surface of the Devices module. Nothing else in here may be imported
// from outside the module (enforced by `npm run check:boundaries`).
import type { Executor } from "@/shared/db";
import { DeviceService, type DevicesApi } from "./application/DeviceService";
import { PgDeviceRepository } from "./infrastructure/PgDeviceRepository";

export type { DevicesApi } from "./application/DeviceService";
export type {
  ChairReadingInput,
  ChairReadingResult,
  ChairSummary,
  PcPolicy,
  PcSummary,
  PolicyActionType,
  RegisterPcInput,
  UpsertChairInput,
} from "./domain/types";

export function createDevicesModule(deps: { db: Executor }): DevicesApi {
  return new DeviceService(new PgDeviceRepository(), deps.db);
}
