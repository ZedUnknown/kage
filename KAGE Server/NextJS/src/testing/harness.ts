import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { buildContainer } from "@/container";
import type { CommandPublisher } from "@/modules/messaging";
import type { AppConfig } from "@/shared/config";
import { schema, type Db } from "@/shared/db";
import type { Clock } from "@/shared/clock";

export const T0 = new Date("2026-01-01T10:00:00Z");

export class FakeClock implements Clock {
  private current = T0;
  now() {
    return this.current;
  }
  /** Moves the clock to T0 plus the given number of seconds. */
  at(seconds: number) {
    this.current = new Date(T0.getTime() + seconds * 1000);
    return this.current;
  }
}

export class RecordingPublisher implements CommandPublisher {
  readonly sent: { pcId: string; message: { type: string } & Record<string, unknown> }[] = [];
  async publish(pcId: string, message: unknown) {
    this.sent.push({ pcId, message: message as { type: string } });
  }
  get types() {
    return this.sent.map((s) => s.message.type);
  }
  clear() {
    this.sent.length = 0;
  }
}

export const TEST_CONFIG: AppConfig = {
  databaseUrl: "",
  ingestKey: "test-ingest-key",
  adminPassword: "test-admin-password",
  sessionSecret: "s".repeat(40),
  siteId: "lab1",
  secureCookies: false,
};

/** One in-process Postgres per test file; call reset() in beforeEach. */
export async function createTestApp() {
  const pg = new PGlite();
  const dir = join(process.cwd(), "drizzle");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(join(dir, file), "utf8").split("--> statement-breakpoint")) {
      await pg.exec(statement);
    }
  }

  const db = drizzle(pg, { schema }) as unknown as Db;
  const clock = new FakeClock();
  const publisher = new RecordingPublisher();
  const app = buildContainer(TEST_CONFIG, db, { clock, publisher });

  async function reset() {
    await pg.exec(
      "TRUNCATE actions, extension_requests, audit_log, chairs, pcs RESTART IDENTITY CASCADE",
    );
    clock.at(0);
    publisher.clear();
  }

  /** Registers pc1 and chair c1, with a short countdown and no grace period. */
  async function seedBasic() {
    const { token } = await app.admin.registerPc({ id: "pc1", name: "PC 1" });
    await app.admin.assignChair({ id: "c1", pcId: "pc1" });
    await app.admin.updatePolicy("pc1", { graceSeconds: 0, countdownSeconds: 10 });
    return { pcToken: token };
  }

  return { app, clock, publisher, reset, seedBasic };
}
