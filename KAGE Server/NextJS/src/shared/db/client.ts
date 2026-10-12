import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Anything repositories can run queries on: the database itself, or a
 * transaction handed out by a UnitOfWork. Both extend PgDatabase.
 */
export type Executor = PgDatabase<PgQueryResultHKT, typeof schema>;

// Reuse one pool across hot reloads / warm serverless invocations.
const g = globalThis as unknown as { __kagePool?: Pool };

export function createDb(databaseUrl: string): Db {
  if (!g.__kagePool) {
    g.__kagePool = new Pool({ connectionString: databaseUrl, max: 5 });
  }
  return drizzle(g.__kagePool, { schema });
}

export { schema };
