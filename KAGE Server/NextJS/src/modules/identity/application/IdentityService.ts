import type { DevicesApi } from "@/modules/devices";
import { newToken, safeEqual, sha256 } from "../domain/crypto";
import type { SessionSigner } from "./ports";

const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * Public contract of the Identity module. It deals in raw credential strings;
 * reading them from HTTP headers or cookies is the HTTP layer's job.
 */
export interface IdentityApi {
  /** Shared secret used by the broker webhook, bridge or simulator. */
  verifyIngestKey(given: string | null): boolean;
  /** Bearer token issued to one PC at registration. */
  authenticatePc(pcId: string, bearerToken: string | null): Promise<boolean>;
  /** The token is shown once; only its hash should be stored. */
  issuePcCredentials(): { token: string; tokenHash: string };
  /** Returns a session token, or null when the password is wrong. */
  loginAdmin(password: string): Promise<string | null>;
  verifyAdminSession(sessionToken: string | null): Promise<boolean>;
  readonly sessionCookie: { name: string; maxAgeSeconds: number };
}

export class IdentityService implements IdentityApi {
  readonly sessionCookie = { name: "kage_admin", maxAgeSeconds: SESSION_TTL_SECONDS };

  constructor(
    private readonly secrets: { ingestKey: string; adminPassword: string },
    private readonly devices: Pick<DevicesApi, "getPcTokenHash">,
    private readonly signer: SessionSigner,
  ) {}

  verifyIngestKey(given: string | null) {
    return !!given && safeEqual(given, this.secrets.ingestKey);
  }

  async authenticatePc(pcId: string, bearerToken: string | null) {
    if (!pcId || !bearerToken) return false;
    const hash = await this.devices.getPcTokenHash(pcId);
    return !!hash && safeEqual(sha256(bearerToken), hash);
  }

  issuePcCredentials() {
    const token = newToken();
    return { token, tokenHash: sha256(token) };
  }

  async loginAdmin(password: string) {
    if (!safeEqual(password, this.secrets.adminPassword)) return null;
    return this.signer.sign({ role: "admin" }, SESSION_TTL_SECONDS);
  }

  async verifyAdminSession(sessionToken: string | null) {
    if (!sessionToken) return false;
    return (await this.signer.verify(sessionToken))?.role === "admin";
  }
}
