import type { AuditLog } from "@/modules/audit";
import type { DevicesApi } from "@/modules/devices";
import type { CommandPublisher } from "@/modules/messaging";
import type { Clock } from "@/shared/clock";
import type { Executor, UnitOfWork } from "@/shared/db";
import { ActionService, type ActionsApi } from "./application/ActionService";
import { PgActionRepository } from "./infrastructure/PgActionRepository";

export type {
  ActionsApi,
  CancelForceOutcome,
  ChairEventOutcome,
  ChairStateEvent,
  ExtendInput,
  ExtendResult,
  ForceOutcome,
  PcState,
} from "./application/ActionService";
export type { Command, CommandType } from "./domain/machine";
export type { ActionRecord } from "./domain/types";

export function createActionsModule(deps: {
  db: Executor;
  uow: UnitOfWork;
  devices: DevicesApi;
  audit: AuditLog;
  publisher: CommandPublisher;
  clock: Clock;
}): ActionsApi {
  return new ActionService({ ...deps, repo: new PgActionRepository() });
}
