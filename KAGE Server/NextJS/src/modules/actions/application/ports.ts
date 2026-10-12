import type { Executor } from "@/shared/db";
import type {
  ActionPatch,
  ActionRecord,
  ExtensionRequestRecord,
  NewAction,
  PendingActions,
} from "../domain/types";

/** Storage port for actions and extension requests. Implemented in infrastructure/. */
export interface ActionRepository {
  /** Marks pending actions whose deadline is before `cutoff` as expired. */
  expireStale(x: Executor, pcId: string, cutoff: Date, now: Date): Promise<void>;
  findPending(x: Executor, pcId: string): Promise<PendingActions>;
  insert(x: Executor, action: NewAction): Promise<ActionRecord>;
  update(x: Executor, actionId: number, patch: ActionPatch): Promise<ActionRecord>;
  /** Locks the row (FOR UPDATE). Only returns actions that belong to `pcId`. */
  findForUpdate(x: Executor, actionId: number, pcId: string): Promise<ActionRecord | null>;
  findExtensionRequest(x: Executor, requestId: string): Promise<ExtensionRequestRecord | null>;
  insertExtensionRequest(x: Executor, record: ExtensionRequestRecord): Promise<void>;
  listPending(x: Executor): Promise<ActionRecord[]>;
}
