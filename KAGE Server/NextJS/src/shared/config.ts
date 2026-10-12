import { z } from "zod";

// `FOO=` in an env file arrives as "", which should mean "not set".
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optional = z.preprocess(blankToUndefined, z.string().optional());

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  INGEST_KEY: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  SITE_ID: z.preprocess(blankToUndefined, z.string().default("lab1")),
  MQTT_URL: optional,
  MQTT_USERNAME: optional,
  MQTT_PASSWORD: optional,
  NODE_ENV: z.string().optional(),
});

export type AppConfig = {
  databaseUrl: string;
  ingestKey: string;
  adminPassword: string;
  sessionSecret: string;
  siteId: string;
  mqtt?: { url: string; username?: string; password?: string };
  secureCookies: boolean;
};

export class ConfigError extends Error {}

/** Validates the environment once, with every problem reported together. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Invalid environment. ${problems.join("; ")}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    ingestKey: e.INGEST_KEY,
    adminPassword: e.ADMIN_PASSWORD,
    sessionSecret: e.SESSION_SECRET,
    siteId: e.SITE_ID,
    mqtt: e.MQTT_URL
      ? { url: e.MQTT_URL, username: e.MQTT_USERNAME, password: e.MQTT_PASSWORD }
      : undefined,
    secureCookies: e.NODE_ENV === "production",
  };
}
