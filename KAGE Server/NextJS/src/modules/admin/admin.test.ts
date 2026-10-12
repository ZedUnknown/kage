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

describe("overview", () => {
  it("combines devices, pending actions and the activity log", async () => {
    await t.app.actions.onChairState({ chairId: "c1", occupied: false });
    const o = await t.app.admin.overview();

    expect(o.pcs.map((p) => p.id)).toEqual(["pc1"]);
    expect(o.chairs[0]).toMatchObject({ id: "c1", pcId: "pc1", occupied: false, online: true });
    expect(o.pending).toHaveLength(1);
    expect(o.log[0]).toMatchObject({ event: "auto_action_created", pcId: "pc1" });
  });

  it("never exposes token hashes", async () => {
    const o = await t.app.admin.overview();
    expect(JSON.stringify(o)).not.toContain("tokenHash");
  });
});

describe("device management", () => {
  it("updates only the policy fields provided", async () => {
    await t.app.admin.updatePolicy("pc1", { countdownSeconds: 45 });
    const policy = await t.app.devices.getPcPolicy("pc1");
    expect(policy).toMatchObject({ countdownSeconds: 45, graceSeconds: 0, actionType: "lock" });
  });

  it("reassigns and unassigns chairs", async () => {
    await t.app.admin.registerPc({ id: "pc2", name: "PC 2" });
    await t.app.admin.assignChair({ id: "c1", pcId: "pc2" });
    expect(await t.app.actions.onChairState({ chairId: "c1", occupied: false })).toBe("created");
    expect(t.publisher.sent[0].pcId).toBe("pc2");

    await t.app.admin.assignChair({ id: "c1", pcId: null });
    expect((await t.app.devices.snapshot()).chairs[0].pcId).toBeNull();
  });
});
