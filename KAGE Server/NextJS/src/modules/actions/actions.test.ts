import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "@/testing/harness";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  t = await createTestApp();
});

beforeEach(async () => {
  await t.reset();
  await t.seedBasic();
});

const chair = (occupied: boolean, extra: { boot?: string; seq?: number } = {}, at?: number) => {
  if (at !== undefined) t.clock.at(at);
  return t.app.actions.onChairState({ chairId: "c1", occupied, ...extra });
};

const stateAt = (seconds: number, pcId = "pc1") => {
  t.clock.at(seconds);
  return t.app.actions.getPcState(pcId);
};

describe("automation flow", () => {
  it("creates one action on leaving, ignores repeats, cancels on return", async () => {
    expect(await chair(true, {}, 0)).toMatch(/ignored/);
    expect(await chair(false, {}, 1)).toBe("created");
    expect(await chair(false, {}, 2)).toMatch(/repeat/);

    const s = await stateAt(3);
    expect(s?.action?.type).toBe("auto_lock");
    expect(s?.action?.actionId).toBeDefined();

    expect(await chair(true, {}, 4)).toBe("cancelled");
    expect((await stateAt(5))?.action).toBeNull();
    expect(t.publisher.types).toEqual(["auto_lock", "cancel_auto_lock"]);
  });

  it("sends commands to the PC assigned to the chair", async () => {
    await chair(false, {}, 1);
    expect(t.publisher.sent.map((s) => s.pcId)).toEqual(["pc1"]);
  });

  it("drops stale or duplicate deliveries from the same boot", async () => {
    await chair(true, { boot: "b1", seq: 5 }, 0);
    expect(await chair(false, { boot: "b1", seq: 4 }, 1)).toBe("stale");
    expect(await chair(false, { boot: "b1", seq: 5 }, 1)).toBe("stale");
    // A reboot resets the counter and must still be accepted.
    expect(await chair(false, { boot: "b2", seq: 1 }, 2)).toBe("created");
  });

  it("ignores unknown and unassigned chairs", async () => {
    expect(await t.app.actions.onChairState({ chairId: "nope", occupied: false })).toBe("unknown_chair");
    await t.app.admin.assignChair({ id: "c2", pcId: null });
    expect(await t.app.actions.onChairState({ chairId: "c2", occupied: false })).toBe("unassigned");
  });

  it("does not publish anything for ignored events", async () => {
    await chair(true, {}, 0);
    await chair(false, {}, 1);
    t.publisher.clear();
    await chair(false, {}, 2); // repeat
    expect(t.publisher.sent).toEqual([]);
  });
});

describe("extensions", () => {
  async function startAction() {
    await chair(true, {}, 0);
    await chair(false, {}, 1);
    return (await stateAt(2))!.action!;
  }

  const extend = (actionId: number, minutes: number, requestId: string, at: number, pcId = "pc1") => {
    t.clock.at(at);
    return t.app.actions.extend({ pcId, actionId, minutes, requestId });
  };

  it("keeps the same action id, bumps version and replaces the deadline", async () => {
    const a = await startAction();
    const r = await extend(a.actionId, 5, "req-00001", 3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command.actionId).toBe(a.actionId);
      expect(r.command.version).toBe(a.version + 1);
      expect(Date.parse(r.command.deadline)).toBe(t.clock.now().getTime() + 300_000);
    }
  });

  it("is idempotent for the same requestId", async () => {
    const a = await startAction();
    await extend(a.actionId, 5, "req-00002", 3);
    const again = await extend(a.actionId, 5, "req-00002", 4);
    expect(again.ok).toBe(true);
    expect((await stateAt(5))?.action?.version).toBe(a.version + 1); // not bumped twice
  });

  it("enforces the extension count", async () => {
    const a = await startAction();
    for (let i = 0; i < 3; i++) {
      expect((await extend(a.actionId, 1, `req-ok-${i}-xx`, 3 + i)).ok).toBe(true);
    }
    expect(await extend(a.actionId, 1, "req-over-xx", 10)).toMatchObject({
      ok: false,
      reason: "too_many_extensions",
    });
  });

  it("rejects another PC's action", async () => {
    const a = await startAction();
    await t.app.admin.registerPc({ id: "pc2", name: "PC 2" });
    expect(await extend(a.actionId, 1, "req-cross-xx", 3, "pc2")).toMatchObject({
      ok: false,
      reason: "unknown_action",
    });
  });

  it("publishes the updated command once, only when granted", async () => {
    const a = await startAction();
    t.publisher.clear();
    await extend(a.actionId, 7, "req-bad-0001", 3); // not an allowed duration
    expect(t.publisher.sent).toEqual([]);
    await extend(a.actionId, 5, "req-good-001", 4);
    expect(t.publisher.types).toEqual(["auto_lock"]);
  });
});

describe("forced actions", () => {
  it("are not cancelled by the chair and have an explicit cancel", async () => {
    t.clock.at(0);
    expect(await t.app.actions.force({ pcId: "pc1", type: "logout" })).toBe("forced");
    expect(await t.app.actions.force({ pcId: "pc1", type: "logout" })).toBe("already_forced");

    await chair(false, {}, 2);
    await chair(true, {}, 3);
    expect((await stateAt(4))?.action?.type).toBe("force_logout");

    t.clock.at(5);
    expect(await t.app.actions.cancelForce("pc1")).toBe("cancelled");
    expect((await stateAt(6))?.action).toBeNull();
    expect(t.publisher.types).toEqual(["force_logout", "cancel_force_logout"]);
  });

  it("supersedes a pending auto action", async () => {
    await chair(false, {}, 0);
    t.clock.at(1);
    await t.app.actions.force({ pcId: "pc1", type: "lock" });
    expect(t.publisher.types).toEqual(["auto_lock", "cancel_auto_lock", "force_lock"]);
  });

  it("reports unknown PCs", async () => {
    expect(await t.app.actions.force({ pcId: "nope", type: "lock" })).toBe("unknown_pc");
    expect(await t.app.actions.cancelForce("nope")).toBe("unknown_pc");
  });
});

describe("expiry", () => {
  it("drops a pending action well past its deadline so it cannot block new ones", async () => {
    await chair(false, {}, 0); // deadline at 10s
    expect((await stateAt(30))?.action).not.toBeNull(); // inside the skew margin
    expect((await stateAt(200))?.action).toBeNull(); // expired

    expect(await chair(true, {}, 201)).toMatch(/ignored/);
    expect(await chair(false, {}, 202)).toBe("created");
  });
});

describe("resync", () => {
  it("returns null for unknown PCs and records contact for known ones", async () => {
    expect(await stateAt(1, "nope")).toBeNull();
    await stateAt(2);
    const { pcs } = await t.app.devices.snapshot();
    expect(pcs.find((p) => p.id === "pc1")?.lastSeenAt).toEqual(t.clock.now());
  });
});
