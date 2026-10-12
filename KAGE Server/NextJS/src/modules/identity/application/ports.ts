export type SessionClaims = { role: "admin" };

/** Signs and verifies admin session tokens. Implemented in infrastructure/. */
export interface SessionSigner {
  sign(claims: SessionClaims, ttlSeconds: number): Promise<string>;
  verify(token: string): Promise<SessionClaims | null>;
}
