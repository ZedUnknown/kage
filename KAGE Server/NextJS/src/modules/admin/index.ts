import type { ActionsApi } from "@/modules/actions";
import type { AuditLog } from "@/modules/audit";
import type { DevicesApi } from "@/modules/devices";
import type { IdentityApi } from "@/modules/identity";
import { AdminService } from "./application/AdminService";

export type { Overview } from "./application/AdminService";
export type AdminApi = AdminService;

export function createAdminModule(deps: {
  siteId: string;
  devices: DevicesApi;
  actions: ActionsApi;
  audit: AuditLog;
  identity: IdentityApi;
}): AdminApi {
  return new AdminService(deps.siteId, deps.devices, deps.actions, deps.audit, deps.identity);
}
