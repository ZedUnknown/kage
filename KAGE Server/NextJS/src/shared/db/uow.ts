import type { Db, Executor } from "./client";

/**
 * Runs a block of work in one database transaction. Application services
 * use this so they never touch the database driver directly.
 */
export interface UnitOfWork {
  run<T>(work: (tx: Executor) => Promise<T>): Promise<T>;
}

export function createUnitOfWork(db: Db): UnitOfWork {
  return { run: (work) => db.transaction((tx) => work(tx)) };
}
