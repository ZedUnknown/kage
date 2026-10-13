import type { DevicesApi } from "@/modules/devices";
import { IdentityService, type IdentityApi } from "./application/IdentityService";
import { JoseSessionSigner } from "./infrastructure/JoseSessionSigner";

export type { IdentityApi } from "./application/IdentityService";

export function createIdentityModule(deps: {
  ingestKey: string;
  adminPassword: string;
  sessionSecret: string;
  devices: Pick<DevicesApi, "getPcTokenHash">;
}): IdentityApi {
  return new IdentityService(
    { ingestKey: deps.ingestKey, adminPassword: deps.adminPassword },
    deps.devices,
    new JoseSessionSigner(deps.sessionSecret),
  );
}
