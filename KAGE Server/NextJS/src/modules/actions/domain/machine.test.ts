import { describe, expect, it } from "vitest";
import {
  ActionSnapshot,
  DEFAULT_POLICY,
  allowedExtensions,
  buildCommand,
  decideChairEvent,
  decideExtension,
} from "./machine";

const now = new Date("2026-01-01T10:00:00Z");
const base = {
  hasAssignment: true,
  hasPendingAuto: false,
  hasPendingForced: false,
  policy: DEFAULT_POLICY,
  now,
};

const action = (over: Partial<ActionSnapshot> = {}): ActionSnapshot => ({
  id: 103,
  kind: "auto",
  type: "lock",
  status: "pending",
  version: 1,
  warnAt: now,
  deadline: new Date(now.getTime() + 10_000),
  extensionsUsed: 0,
  extendedSeconds: 0,
  ...over,
});

describe("decideChairEvent", () => {
  it("creates one action on occupied -> unoccupied", () => {
    const d = decideChairEvent({ ...base, occupied: false, prevOccupied: true });
    expect(d.kind).toBe("create");
    if (d.kind === "create") {
      expect(d.warnAt.getTime() - now.getTime()).toBe(5_000);
      expect(d.deadline.getTime() - d.warnAt.getTime()).toBe(30_000);
    }
  });

  it("treats the first ever empty report as a transition", () => {
    expect(decideChairEvent({ ...base, occupied: false, prevOccupied: null }).kind).toBe("create");
  });

  it("ignores repeated unoccupied readings", () => {
    expect(decideChairEvent({ ...base, occupied: false, prevOccupied: false }).kind).toBe("ignore");
  });

  it("does not create a second action while one is pending", () => {
    expect(
      decideChairEvent({ ...base, occupied: false, prevOccupied: true, hasPendingAuto: true }).kind,
    ).toBe("ignore");
  });

  it("cancels a pending auto action when the user returns", () => {
    expect(
      decideChairEvent({ ...base, occupied: true, prevOccupied: false, hasPendingAuto: true }).kind,
    ).toBe("cancel");
  });

  it("does nothing on return when only a forced action is pending", () => {
    expect(
      decideChairEvent({ ...base, occupied: true, prevOccupied: false, hasPendingForced: true }).kind,
    ).toBe("ignore");
  });

  it("ignores unassigned chairs", () => {
    expect(
      decideChairEvent({ ...base, hasAssignment: false, occupied: false, prevOccupied: true }).kind,
    ).toBe("ignore");
  });
});

describe("decideExtension", () => {
  it("replaces the deadline and keeps the same action", () => {
    const d = decideExtension({ action: action(), policy: DEFAULT_POLICY, minutes: 5, now });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.deadline.getTime()).toBe(now.getTime() + 300_000);
      expect(d.extensionsUsed).toBe(1);
    }
  });

  it("rejects unknown durations", () => {
    const d = decideExtension({ action: action(), policy: DEFAULT_POLICY, minutes: 7, now });
    expect(d).toEqual({ ok: false, reason: "not_allowed_minutes" });
  });

  it("enforces the extension count", () => {
    const d = decideExtension({
      action: action({ extensionsUsed: 3 }),
      policy: DEFAULT_POLICY,
      minutes: 1,
      now,
    });
    expect(d).toEqual({ ok: false, reason: "too_many_extensions" });
  });

  it("enforces the total cap", () => {
    const d = decideExtension({
      action: action({ extendedSeconds: 14 * 60 }),
      policy: DEFAULT_POLICY,
      minutes: 2,
      now,
    });
    expect(d).toEqual({ ok: false, reason: "extension_cap_reached" });
  });

  it("refuses after the deadline and for forced actions", () => {
    const late = new Date(now.getTime() + 11_000);
    expect(decideExtension({ action: action(), policy: DEFAULT_POLICY, minutes: 1, now: late })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(
      decideExtension({ action: action({ kind: "forced" }), policy: DEFAULT_POLICY, minutes: 1, now }),
    ).toEqual({ ok: false, reason: "not_extendable" });
  });
});

describe("commands", () => {
  it("hides options that would exceed the cap", () => {
    expect(allowedExtensions(action({ extendedSeconds: 10 * 60 }), DEFAULT_POLICY)).toEqual([1, 2, 5]);
  });

  it("builds versioned auto and cancel commands", () => {
    const c = buildCommand(action(), DEFAULT_POLICY, false, "Return to your chair", now);
    expect(c.type).toBe("auto_lock");
    expect(c.version).toBe(1);
    const x = buildCommand(action({ type: "logout" }), DEFAULT_POLICY, true, "", now);
    expect(x.type).toBe("cancel_auto_logout");
    expect(x.allowedExtensions).toEqual([]);
  });
});
