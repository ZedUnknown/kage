import { z } from "zod";
import { getContainer } from "@/container";
import { readJson } from "@/http/body";
import { clearSessionCookieHeader, sessionCookieHeader } from "@/http/cookies";
import { unauthorized } from "@/http/errors";
import { route } from "@/http/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { password } = await readJson(req, z.object({ password: z.string() }));
  const session = await getContainer().identity.loginAdmin(password);
  if (!session) throw unauthorized();
  return Response.json({ ok: true }, { headers: { "set-cookie": sessionCookieHeader(session) } });
});

export const DELETE = route(async () =>
  Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookieHeader() } }),
);
