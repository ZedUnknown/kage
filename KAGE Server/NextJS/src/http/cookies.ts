import { getContainer } from "@/container";

export function sessionCookieHeader(sessionToken: string): string {
  const { identity, config } = getContainer();
  const { name, maxAgeSeconds } = identity.sessionCookie;
  const secure = config.secureCookies ? "; Secure" : "";
  return `${name}=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const { name } = getContainer().identity.sessionCookie;
  return `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
