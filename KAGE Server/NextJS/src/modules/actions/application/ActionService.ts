import type { AuditLog } from "@/modules/audit";
import type { DevicesApi, PcPolicy } from "@/modules/devices";
import type { CommandPublisher } from "@/modules/messaging";
import type { Clock } from "@/shared/clock";
import type { Executor, UnitOfWork } from "@/shared/db";
import {
  Command,
  Policy,
  buildCommand,
  decideChairEvent,
  decideExtension,
} from "../domain/machine";
import { autoMessage, forcedMessage } from "../domain/messages";
import type { ActionRecord } from "../domain/types";
import type { ActionRepository } from "./ports";

/** Pending actions stay readable this long past their deadline (clock skew). */
const EXPIRY_MARGIN_MS = 60_000;

const EXTENSION_MINUTES = [1, 2, 5, 10];

export type ChairStateEvent = {
  chairId: string;
  occupied: boolean;
  /** Per-boot random id + counter: detects stale/duplicate deliveries. */
  boot?: string;
  seq?: number;
};

export type ChairEventOutcome =
  | "unknown_chair"
  | "stale"
  | "unassigned"
  | "created"
  | "cancelled"
  | "ignored"
  | `ignored:${string}`;

export type PcState = {
  serverNow: string;
  policy: Pick<Policy, "actionType" | "graceSeconds" | "countdownSeconds">;
  /** Current pending action as a start command, or null. Forced wins over auto. */
  action: Command | null;
};

export type ExtendInput = { pcId: string; actionId: number; minutes: number; requestId: string };
export type ExtendResult =
  | { ok: true; command: Command }
  | { ok: false; reason: string; command: Command | null };

export type ForceOutcome = "forced" | "already_forced" | "unknown_pc";
export type CancelForceOutcome = "cancelled" | "none_pending" | "unknown_pc";

/** Public contract of the Actions module. */
export interface ActionsApi {
  onChairState(event: ChairStateEvent): Promise<ChairEventOutcome>;
  getPcState(pcId: string): Promise<PcState | null>;
  extend(input: ExtendInput): Promise<ExtendResult>;
  force(input: { pcId: string; type: "lock" | "logout" }): Promise<ForceOutcome>;
  cancelForce(pcId: string): Promise<CancelForceOutcome>;
  listPending(): Promise<ActionRecord[]>;
}

type Outbound = { pcId: string; command: Command };

const toPolicy = (p: PcPolicy): Policy => ({ ...p, allowedExtensionMinutes: EXTENSION_MINUTES });

export class ActionService implements ActionsApi {
  constructor(
    private readonly deps: {
      uow: UnitOfWork;
      db: Executor;
      repo: ActionRepository;
      devices: DevicesApi;
      audit: AuditLog;
      publisher: CommandPublisher;
      clock: Clock;
    },
  ) {}

  // ---- chair events ------------------------------------------------------

  async onChairState(ev: ChairStateEvent): Promise<ChairEventOutcome> {
    const { uow, repo, devices, audit, clock } = this.deps;
    const now = clock.now();
    const out: Outbound[] = [];

    const outcome = await uow.run(async (tx): Promise<ChairEventOutcome> => {
      const reading = await devices.recordChairReading({ ...ev, at: now }, tx);
      if (reading.kind === "unknown_chair") return "unknown_chair";
      if (reading.kind === "stale") return "stale";
      if (!reading.pcId) return "unassigned";

      const pcId = reading.pcId;
      const pcPolicy = await devices.getPcPolicy(pcId, tx);
      if (!pcPolicy) return "ignored";
      const policy = toPolicy(pcPolicy);

      await this.expireStale(tx, pcId, now);
      const pending = await repo.findPending(tx, pcId);

      const decision = decideChairEvent({
        occupied: ev.occupied,
        prevOccupied: reading.prevOccupied,
        hasAssignment: true,
        hasPendingAuto: !!pending.auto,
        hasPendingForced: !!pending.forced,
        policy,
        now,
      });

      if (decision.kind === "create") {
        const row = await repo.insert(tx, {
          pcId,
          chairId: ev.chairId,
          kind: "auto",
          type: policy.actionType,
          warnAt: decision.warnAt,
          deadline: decision.deadline,
          message: autoMessage(policy.actionType),
        });
        await audit.record(
          { actor: `chair:${ev.chairId}`, event: "auto_action_created", pcId, detail: `A${row.id}` },
          tx,
        );
        out.push({ pcId, command: buildCommand(row, policy, false, row.message, now) });
        return "created";
      }

      if (decision.kind === "cancel" && pending.auto) {
        const row = await repo.update(tx, pending.auto.id, {
          status: "cancelled",
          version: pending.auto.version + 1,
          updatedAt: now,
        });
        await audit.record(
          { actor: `chair:${ev.chairId}`, event: "auto_action_cancelled", pcId, detail: `A${row.id}` },
          tx,
        );
        out.push({ pcId, command: buildCommand(row, policy, true, "", now) });
        return "cancelled";
      }

      return decision.kind === "ignore" ? `ignored:${decision.reason}` : "ignored";
    });

    await this.flush(out);
    return outcome;
  }

  // ---- PC state / resync -------------------------------------------------

  async getPcState(pcId: string): Promise<PcState | null> {
    const { uow, repo, devices, clock } = this.deps;
    const now = clock.now();

    return uow.run(async (tx) => {
      const pcPolicy = await devices.getPcPolicy(pcId, tx);
      if (!pcPolicy) return null;
      const policy = toPolicy(pcPolicy);

      await devices.touchPc(pcId, now, tx);
      await this.expireStale(tx, pcId, now);
      const { auto, forced } = await repo.findPending(tx, pcId);
      const row = forced ?? auto;

      return {
        serverNow: now.toISOString(),
        policy: {
          actionType: policy.actionType,
          graceSeconds: policy.graceSeconds,
          countdownSeconds: policy.countdownSeconds,
        },
        action: row ? buildCommand(row, policy, false, row.message, now) : null,
      };
    });
  }

  // ---- extensions --------------------------------------------------------

  async extend(input: ExtendInput): Promise<ExtendResult> {
    const { uow, repo, devices, audit, clock } = this.deps;
    const now = clock.now();
    const out: Outbound[] = [];

    const result = await uow.run(async (tx): Promise<ExtendResult> => {
      const pcPolicy = await devices.getPcPolicy(input.pcId, tx);
      if (!pcPolicy) return { ok: false, reason: "unknown_pc", command: null };
      const policy = toPolicy(pcPolicy);

      const row = await repo.findForUpdate(tx, input.actionId, input.pcId);
      if (!row) return { ok: false, reason: "unknown_action", command: null };

      const current = (r: ActionRecord) =>
        r.status === "pending" ? buildCommand(r, policy, false, r.message, now) : null;

      // Idempotency: a retry with the same requestId replays the stored outcome.
      const prior = await repo.findExtensionRequest(tx, input.requestId);
      if (prior) {
        return prior.ok
          ? { ok: true, command: current(row)! }
          : { ok: false, reason: prior.reason ?? "refused", command: current(row) };
      }

      const decision = decideExtension({ action: row, policy, minutes: input.minutes, now });
      await repo.insertExtensionRequest(tx, {
        requestId: input.requestId,
        actionId: row.id,
        minutes: input.minutes,
        ok: decision.ok,
        reason: decision.ok ? null : decision.reason,
      });

      if (!decision.ok) {
        await audit.record(
          { actor: `pc:${input.pcId}`, event: "extension_refused", pcId: input.pcId, detail: `A${row.id} ${decision.reason}` },
          tx,
        );
        return { ok: false, reason: decision.reason, command: current(row) };
      }

      const updated = await repo.update(tx, row.id, {
        deadline: decision.deadline,
        extensionsUsed: decision.extensionsUsed,
        extendedSeconds: decision.extendedSeconds,
        version: row.version + 1,
        updatedAt: now,
      });
      await audit.record(
        { actor: `pc:${input.pcId}`, event: "extension_granted", pcId: input.pcId, detail: `A${row.id} +${input.minutes}m` },
        tx,
      );
      const command = buildCommand(updated, policy, false, updated.message, now);
      out.push({ pcId: input.pcId, command });
      return { ok: true, command };
    });

    await this.flush(out);
    return result;
  }

  // ---- forced actions ----------------------------------------------------

  async force(input: { pcId: string; type: "lock" | "logout" }): Promise<ForceOutcome> {
    const { uow, repo, devices, audit, clock } = this.deps;
    const now = clock.now();
    const out: Outbound[] = [];

    const outcome = await uow.run(async (tx): Promise<ForceOutcome> => {
      const pcPolicy = await devices.getPcPolicy(input.pcId, tx);
      if (!pcPolicy) return "unknown_pc";
      const policy = toPolicy(pcPolicy);

      await this.expireStale(tx, input.pcId, now);
      const { auto, forced } = await repo.findPending(tx, input.pcId);
      if (forced) return "already_forced";

      // A forced action supersedes a pending automatic one.
      if (auto) {
        const cancelled = await repo.update(tx, auto.id, {
          status: "cancelled",
          version: auto.version + 1,
          updatedAt: now,
        });
        out.push({ pcId: input.pcId, command: buildCommand(cancelled, policy, true, "", now) });
      }

      const row = await repo.insert(tx, {
        pcId: input.pcId,
        chairId: null,
        kind: "forced",
        type: input.type,
        warnAt: now,
        deadline: now,
        message: forcedMessage(input.type),
        createdBy: "admin",
      });
      await audit.record(
        { actor: "admin", event: "force_action", pcId: input.pcId, detail: `A${row.id} ${input.type}` },
        tx,
      );
      out.push({ pcId: input.pcId, command: buildCommand(row, policy, false, row.message, now) });
      return "forced";
    });

    await this.flush(out);
    return outcome;
  }

  async cancelForce(pcId: string): Promise<CancelForceOutcome> {
    const { uow, repo, devices, audit, clock } = this.deps;
    const now = clock.now();
    const out: Outbound[] = [];

    const outcome = await uow.run(async (tx): Promise<CancelForceOutcome> => {
      const pcPolicy = await devices.getPcPolicy(pcId, tx);
      if (!pcPolicy) return "unknown_pc";

      const { forced } = await repo.findPending(tx, pcId);
      if (!forced) return "none_pending";

      const row = await repo.update(tx, forced.id, {
        status: "cancelled",
        version: forced.version + 1,
        updatedAt: now,
      });
      await audit.record({ actor: "admin", event: "force_cancelled", pcId, detail: `A${row.id}` }, tx);
      out.push({ pcId, command: buildCommand(row, toPolicy(pcPolicy), true, "", now) });
      return "cancelled";
    });

    await this.flush(out);
    return outcome;
  }

  // ---- reads -------------------------------------------------------------

  listPending(): Promise<ActionRecord[]> {
    return this.deps.repo.listPending(this.deps.db);
  }

  // ---- helpers -----------------------------------------------------------

  /** Long-past pending actions must never block a new absence. */
  private expireStale(tx: Executor, pcId: string, now: Date) {
    return this.deps.repo.expireStale(tx, pcId, new Date(now.getTime() - EXPIRY_MARGIN_MS), now);
  }

  /** Publish only after the transaction has committed. */
  private async flush(out: Outbound[]) {
    for (const o of out) await this.deps.publisher.publish(o.pcId, o.command);
  }
}
