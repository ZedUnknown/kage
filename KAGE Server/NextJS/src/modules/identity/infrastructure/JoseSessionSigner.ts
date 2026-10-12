import { SignJWT, jwtVerify } from "jose";
import type { SessionClaims, SessionSigner } from "../application/ports";

export class JoseSessionSigner implements SessionSigner {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  sign(claims: SessionClaims, ttlSeconds: number) {
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.key);
  }

  async verify(token: string): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key);
      return payload.role === "admin" ? { role: "admin" } : null;
    } catch {
      return null;
    }
  }
}
