import type { ActionRecord, ActionsApi, CancelForceOutcome, ForceOutcome } from "@/modules/actions";
import type { AuditLog, AuditRecord } from "@/modules/audit";
import type { ChairSummary, DevicesApi, PcPolicy, PcSummary } from "@/modules/devices";
import type { IdentityApi } from "@/modules/identity";

export type Overview = {
  pcs: PcSummary[];
  chairs: ChairSummary[];
  pending: ActionRecord[];
  log: AuditRecord[];
};

const ACTIVITY_LIMIT = 50;

/**
 * Use cases for the admin console. It composes the other modules through
 * their public APIs and owns no tables of its own.
 */
export class AdminService {
  constructor(
    private readonly siteId: string,
    private readonly devices: DevicesApi,
    private readonly actions: ActionsApi,
    private readonly audit: AuditLog,
    private readonly identity: IdentityApi,
  ) {}

  async overview(): Promise<Overview> {
    const [snapshot, pending, log] = await Promise.all([
      this.devices.snapshot(),
      this.actions.listPending(),
      this.audit.recent(ACTIVITY_LIMIT),
    ]);
    return { pcs: snapshot.pcs, chairs: snapshot.chairs, pending, log };
  }

  /** Re-registering an existing PC rotates its token. The token is returned once. */
  async registerPc(input: { id: string; name: string }): Promise<{ pcId: string; token: string }> {
    const { token, tokenHash } = this.identity.issuePcCredentials();
    await this.devices.registerPc({ ...input, siteId: this.siteId, tokenHash });
    return { pcId: input.id, token };
  }

  assignChair(input: { id: string; pcId: string | null }) {
    return this.devices.upsertChair({ ...input, siteId: this.siteId });
  }

  updatePolicy(pcId: string, patch: Partial<PcPolicy>) {
    return this.devices.updatePolicy(pcId, patch);
  }

  force(pcId: string, type: "lock" | "logout"): Promise<ForceOutcome> {
    return this.actions.force({ pcId, type });
  }

  cancelForce(pcId: string): Promise<CancelForceOutcome> {
    return this.actions.cancelForce(pcId);
  }
}
