CREATE TABLE "actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"pc_id" text NOT NULL,
	"chair_id" text,
	"kind" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"warn_at" timestamp with time zone NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"extensions_used" integer DEFAULT 0 NOT NULL,
	"extended_seconds" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"event" text NOT NULL,
	"pc_id" text,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "chairs" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"pc_id" text,
	"occupied" boolean,
	"online" boolean DEFAULT false NOT NULL,
	"last_boot" text,
	"last_seq" integer,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_requests" (
	"request_id" text PRIMARY KEY NOT NULL,
	"action_id" integer NOT NULL,
	"minutes" integer NOT NULL,
	"ok" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pcs" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"action_type" text DEFAULT 'lock' NOT NULL,
	"grace_seconds" integer DEFAULT 5 NOT NULL,
	"countdown_seconds" integer DEFAULT 30 NOT NULL,
	"max_extensions" integer DEFAULT 3 NOT NULL,
	"max_extend_seconds" integer DEFAULT 900 NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_pc_id_pcs_id_fk" FOREIGN KEY ("pc_id") REFERENCES "public"."pcs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chairs" ADD CONSTRAINT "chairs_pc_id_pcs_id_fk" FOREIGN KEY ("pc_id") REFERENCES "public"."pcs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actions_one_pending_per_kind" ON "actions" USING btree ("pc_id","kind") WHERE "actions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "actions_pc_status" ON "actions" USING btree ("pc_id","status");