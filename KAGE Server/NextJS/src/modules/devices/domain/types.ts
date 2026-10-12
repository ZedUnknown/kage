export type PolicyActionType = "lock" | "logout";

/** Per-PC rules that decide what happens when a seat is left empty. */
export type PcPolicy = {
  actionType: PolicyActionType;
  graceSeconds: number;
  countdownSeconds: number;
  maxExtensions: number;
  maxExtendSeconds: number;
};

export type PcSummary = PcPolicy & {
  id: string;
  name: string;
  siteId: string;
  lastSeenAt: Date | null;
};

export type ChairSummary = {
  id: string;
  siteId: string;
  pcId: string | null;
  occupied: boolean | null;
  online: boolean;
  lastEventAt: Date | null;
};

export type RegisterPcInput = { id: string; name: string; siteId: string; tokenHash: string };
export type UpsertChairInput = { id: string; siteId: string; pcId: string | null };

export type ChairReadingInput = {
  chairId: string;
  occupied: boolean;
  /** Random id per device boot; with seq it identifies duplicate deliveries. */
  boot?: string;
  seq?: number;
  at: Date;
};

export type ChairReadingResult =
  | { kind: "unknown_chair" }
  | { kind: "stale" }
  | { kind: "recorded"; pcId: string | null; prevOccupied: boolean | null };

/** Stored chair fields needed to judge a new reading. */
export type ChairRecord = {
  id: string;
  pcId: string | null;
  occupied: boolean | null;
  lastBoot: string | null;
  lastSeq: number | null;
};
