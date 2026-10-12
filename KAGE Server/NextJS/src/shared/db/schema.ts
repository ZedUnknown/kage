import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const pcs = pgTable("pcs", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  name: text("name").notNull(),
  /** sha256 of the PC token; the token itself is shown once at registration. */
  tokenHash: text("token_hash").notNull(),
  // Per-PC policy (see core/machine.ts Policy)
  actionType: text("action_type").notNull().default("lock"),
  graceSeconds: integer("grace_seconds").notNull().default(5),
  countdownSeconds: integer("countdown_seconds").notNull().default(30),
  maxExtensions: integer("max_extensions").notNull().default(3),
  maxExtendSeconds: integer("max_extend_seconds").notNull().default(900),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chairs = pgTable("chairs", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull(),
  pcId: text("pc_id").references(() => pcs.id, { onDelete: "set null" }),
  occupied: boolean("occupied"),
  online: boolean("online").notNull().default(false),
  lastBoot: text("last_boot"),
  lastSeq: integer("last_seq"),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const actions = pgTable(
  "actions",
  {
    id: serial("id").primaryKey(),
    pcId: text("pc_id").notNull().references(() => pcs.id, { onDelete: "cascade" }),
    chairId: text("chair_id"),
    kind: text("kind").notNull(), // auto | forced
    type: text("type").notNull(), // lock | logout
    status: text("status").notNull().default("pending"), // pending | cancelled | expired
    version: integer("version").notNull().default(1),
    warnAt: timestamp("warn_at", { withTimezone: true }).notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    message: text("message").notNull().default(""),
    extensionsUsed: integer("extensions_used").notNull().default(0),
    extendedSeconds: integer("extended_seconds").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one pending action per PC per kind: backstop for races.
    uniqueIndex("actions_one_pending_per_kind")
      .on(t.pcId, t.kind)
      .where(sql`${t.status} = 'pending'`),
    index("actions_pc_status").on(t.pcId, t.status),
  ],
);

/** Makes POST /extend idempotent: same requestId returns the same result. */
export const extensionRequests = pgTable("extension_requests", {
  requestId: text("request_id").primaryKey(),
  actionId: integer("action_id").notNull(),
  minutes: integer("minutes").notNull(),
  ok: boolean("ok").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actor: text("actor").notNull(), // admin | pc:<id> | chair:<id> | system
  event: text("event").notNull(),
  pcId: text("pc_id"),
  detail: text("detail"),
});
