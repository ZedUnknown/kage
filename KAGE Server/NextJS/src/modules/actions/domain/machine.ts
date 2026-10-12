// Pure KAGE decision logic. No I/O, no clock reads: everything is passed in,
// so it can be tested and reused behind any transport (HTTP, MQTT, ...).

export type ActionType = "lock" | "logout";
export type ActionKind = "auto" | "forced";
export type ActionStatus = "pending" | "cancelled" | "expired";

export type Policy = {
  actionType: ActionType;
  /** Absence time before the warning overlay appears. */
  graceSeconds: number;
  /** Time the overlay counts down before the Windows action runs. */
  countdownSeconds: number;
  maxExtensions: number;
  maxExtendSeconds: number;
  allowedExtensionMinutes: number[];
};

export const DEFAULT_POLICY: Policy = {
  actionType: "lock",
  graceSeconds: 5,
  countdownSeconds: 30,
  maxExtensions: 3,
  maxExtendSeconds: 15 * 60,
  allowedExtensionMinutes: [1, 2, 5, 10],
};

export type ActionSnapshot = {
  id: number;
  kind: ActionKind;
  type: ActionType;
  status: ActionStatus;
  version: number;
  warnAt: Date;
  deadline: Date;
  extensionsUsed: number;
  extendedSeconds: number;
};

// ---- Chair events -------------------------------------------------------

export type ChairDecision =
  | { kind: "ignore"; reason: string }
  | { kind: "create"; warnAt: Date; deadline: Date }
  | { kind: "cancel" };

export function decideChairEvent(input: {
  occupied: boolean;
  /** Last known occupancy before this event; null if never reported. */
  prevOccupied: boolean | null;
  hasAssignment: boolean;
  hasPendingAuto: boolean;
  hasPendingForced: boolean;
  policy: Policy;
  now: Date;
}): ChairDecision {
  if (!input.hasAssignment) return { kind: "ignore", reason: "unassigned" };

  if (input.occupied) {
    // Returning cancels a pending automatic action only. Forced ones stay.
    return input.hasPendingAuto
      ? { kind: "cancel" }
      : { kind: "ignore", reason: "no pending auto action" };
  }

  // Unoccupied: only a real transition starts an action; repeats do nothing.
  if (input.prevOccupied === false) return { kind: "ignore", reason: "repeat" };
  if (input.hasPendingAuto) return { kind: "ignore", reason: "already pending" };
  if (input.hasPendingForced) return { kind: "ignore", reason: "forced pending" };

  const warnAt = new Date(input.now.getTime() + input.policy.graceSeconds * 1000);
  const deadline = new Date(warnAt.getTime() + input.policy.countdownSeconds * 1000);
  return { kind: "create", warnAt, deadline };
}

// ---- Extensions ---------------------------------------------------------

export type ExtensionDecision =
  | { ok: true; deadline: Date; extensionsUsed: number; extendedSeconds: number }
  | { ok: false; reason: ExtensionRefusal };

export type ExtensionRefusal =
  | "not_extendable"
  | "not_allowed_minutes"
  | "too_many_extensions"
  | "extension_cap_reached"
  | "expired";

export function decideExtension(input: {
  action: ActionSnapshot;
  policy: Policy;
  minutes: number;
  now: Date;
}): ExtensionDecision {
  const { action, policy, minutes, now } = input;
  if (action.kind !== "auto" || action.status !== "pending") {
    return { ok: false, reason: "not_extendable" };
  }
  if (now >= action.deadline) return { ok: false, reason: "expired" };
  if (!policy.allowedExtensionMinutes.includes(minutes)) {
    return { ok: false, reason: "not_allowed_minutes" };
  }
  if (action.extensionsUsed >= policy.maxExtensions) {
    return { ok: false, reason: "too_many_extensions" };
  }
  const extra = minutes * 60;
  if (action.extendedSeconds + extra > policy.maxExtendSeconds) {
    return { ok: false, reason: "extension_cap_reached" };
  }
  // The new deadline replaces the old one (same action_id, no second timer).
  return {
    ok: true,
    deadline: new Date(now.getTime() + extra * 1000),
    extensionsUsed: action.extensionsUsed + 1,
    extendedSeconds: action.extendedSeconds + extra,
  };
}

/** Extension options the client may offer right now. */
export function allowedExtensions(action: ActionSnapshot, policy: Policy): number[] {
  if (action.kind !== "auto" || action.status !== "pending") return [];
  if (action.extensionsUsed >= policy.maxExtensions) return [];
  return policy.allowedExtensionMinutes.filter(
    (m) => action.extendedSeconds + m * 60 <= policy.maxExtendSeconds,
  );
}

// ---- Commands sent to PCs ----------------------------------------------

export type CommandType =
  | "auto_lock"
  | "auto_logout"
  | "cancel_auto_lock"
  | "cancel_auto_logout"
  | "force_lock"
  | "force_logout"
  | "cancel_force_lock"
  | "cancel_force_logout";

export function commandType(
  kind: ActionKind,
  type: ActionType,
  cancel: boolean,
): CommandType {
  const prefix = kind === "auto" ? "auto" : "force";
  return `${cancel ? "cancel_" : ""}${prefix}_${type}` as CommandType;
}

export type Command = {
  type: CommandType;
  actionId: number;
  version: number;
  warnAt: string;
  deadline: string;
  /** Lets the client compute a clock offset instead of trusting its own clock. */
  serverNow: string;
  message: string;
  allowedExtensions: number[];
};

export function buildCommand(
  action: ActionSnapshot,
  policy: Policy,
  cancel: boolean,
  message: string,
  now: Date,
): Command {
  return {
    type: commandType(action.kind, action.type, cancel),
    actionId: action.id,
    version: action.version,
    warnAt: action.warnAt.toISOString(),
    deadline: action.deadline.toISOString(),
    serverNow: now.toISOString(),
    message,
    allowedExtensions: cancel ? [] : allowedExtensions(action, policy),
  };
}
