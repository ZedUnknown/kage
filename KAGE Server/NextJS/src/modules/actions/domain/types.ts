import type { ActionKind, ActionSnapshot, ActionStatus, ActionType } from "./machine";

/** A stored action: the snapshot the state machine reasons about, plus identity. */
export type ActionRecord = ActionSnapshot & {
  pcId: string;
  message: string;
};

export type NewAction = {
  pcId: string;
  chairId: string | null;
  kind: ActionKind;
  type: ActionType;
  warnAt: Date;
  deadline: Date;
  message: string;
  createdBy?: string;
};

export type ActionPatch = {
  updatedAt: Date;
  status?: ActionStatus;
  version?: number;
  deadline?: Date;
  extensionsUsed?: number;
  extendedSeconds?: number;
};

export type ExtensionRequestRecord = {
  requestId: string;
  actionId: number;
  minutes: number;
  ok: boolean;
  reason: string | null;
};

/** Pending actions for one PC, split by family. */
export type PendingActions = { auto?: ActionRecord; forced?: ActionRecord };
