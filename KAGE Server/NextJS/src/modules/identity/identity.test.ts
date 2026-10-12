import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_CONFIG, createTestApp } from "@/testing/harness";

let t: Awaited<ReturnType<typeof createTestApp>>;

beforeAll(async () => {
  t = await createTestApp();
});

beforeEach(() => t.reset());

describe("PC tokens", () => {
  it("accepts the issued token and nothing else", async () => {
    const { pcToken } = await t.seedBasic();
    const { identity } = t.app;
    expect(await identity.authenticatePc("pc1", pcToken)).toBe(true);
    expect(await identity.authenticatePc("pc1", "wrong")).toBe(false);
    expect(await identity.authenticatePc("pc1", null)).toBe(false);
    expect(await identity.authenticatePc("other-pc", pcToken)).toBe(false);
  });

  it("stores only a hash, and re-registering rotates the token", async () => {
    const { pcToken } = await t.seedBasic();
    expect(await t.app.devices.getPcTokenHash("pc1")).not.toBe(pcToken);

    const rotated = await t.app.admin.registerPc({ id: "pc1", name: "PC 1" });
    expect(await t.app.identity.authenticatePc("pc1", pcToken)).toBe(false);
    expect(await t.app.identity.authenticatePc("pc1", rotated.token)).toBe(true);
  });
});

describe("admin session", () => {
  it("issues a session for the right password only", async () => {
    expect(await t.app.identity.loginAdmin("nope")).toBeNull();
    const session = await t.app.identity.loginAdmin(TEST_CONFIG.adminPassword);
    expect(session).toBeTruthy();
    expect(await t.app.identity.verifyAdminSession(session)).toBe(true);
    expect(await t.app.identity.verifyAdminSession("garbage")).toBe(false);
    expect(await t.app.identity.verifyAdminSession(null)).toBe(false);
  });
});

describe("ingest key", () => {
  it("matches the configured key", () => {
    expect(t.app.identity.verifyIngestKey(TEST_CONFIG.ingestKey)).toBe(true);
    expect(t.app.identity.verifyIngestKey("x")).toBe(false);
    expect(t.app.identity.verifyIngestKey(null)).toBe(false);
  });
});
