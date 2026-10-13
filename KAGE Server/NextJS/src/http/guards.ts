import { getContainer } from "@/container";
import { unauthorized } from "./errors";

function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

function cookie(req: Request, name: string): string | null {
  const found = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="));
  return found ? found.slice(name.length + 1) : null;
}

/** Broker webhook, bridge or simulator: x-ingest-key (or a bearer token). */
export function requireIngestKey(req: Request): void {
  const given = req.headers.get("x-ingest-key") ?? bearer(req);
  if (!getContainer().identity.verifyIngestKey(given)) throw unauthorized();
}

/** A KAGE Client acting for the given PC: Authorization: Bearer <pc token>. */
export async function requirePc(req: Request, pcId: string): Promise<void> {
  if (!(await getContainer().identity.authenticatePc(pcId, bearer(req)))) throw unauthorized();
}

/** The admin console: signed session cookie. */
export async function requireAdmin(req: Request): Promise<void> {
  const { identity } = getContainer();
  if (!(await identity.verifyAdminSession(cookie(req, identity.sessionCookie.name)))) {
    throw unauthorized();
  }
}
