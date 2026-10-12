// Composition root: the only place that knows how modules are wired together.
// Plain constructor injection, no DI framework.
import { createActionsModule } from "@/modules/actions";
import { createAdminModule } from "@/modules/admin";
import { createAuditModule } from "@/modules/audit";
import { createDevicesModule } from "@/modules/devices";
import { createIdentityModule } from "@/modules/identity";
import { createMessagingModule, type CommandPublisher } from "@/modules/messaging";
import { systemClock, type Clock } from "@/shared/clock";
import { loadConfig, type AppConfig } from "@/shared/config";
import { createDb, createUnitOfWork, type Db } from "@/shared/db";

export type Overrides = {
  /** Tests substitute these; production uses the defaults. */
  clock?: Clock;
  publisher?: CommandPublisher;
};

export function buildContainer(config: AppConfig, db: Db, overrides: Overrides = {}) {
  const clock = overrides.clock ?? systemClock;
  const uow = createUnitOfWork(db);

  const devices = createDevicesModule({ db });
  const audit = createAuditModule({ db });
  const publisher =
    overrides.publisher ?? createMessagingModule({ siteId: config.siteId, mqtt: config.mqtt });
  const actions = createActionsModule({ db, uow, devices, audit, publisher, clock });
  const identity = createIdentityModule({
    ingestKey: config.ingestKey,
    adminPassword: config.adminPassword,
    sessionSecret: config.sessionSecret,
    devices,
  });
  const admin = createAdminModule({ siteId: config.siteId, devices, actions, audit, identity });

  return { config, devices, actions, identity, admin };
}

export type Container = ReturnType<typeof buildContainer>;

// Built once per server process (and kept across dev hot reloads).
const g = globalThis as unknown as { __kageContainer?: Container };

export function getContainer(): Container {
  if (!g.__kageContainer) {
    const config = loadConfig();
    g.__kageContainer = buildContainer(config, createDb(config.databaseUrl));
  }
  return g.__kageContainer;
}
