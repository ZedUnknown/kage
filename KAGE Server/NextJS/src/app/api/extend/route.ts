import { z } from "zod";
import { getContainer } from "@/container";
import { readJson } from "@/http/body";
import { requirePc } from "@/http/guards";
import { route } from "@/http/route";

export const dynamic = "force-dynamic";

const Body = z.object({
  pcId: z.string().min(1),
  actionId: z.number().int(),
  minutes: z.number().int(),
  /** Client-generated id (e.g. a UUID). Retrying with the same id is safe. */
  requestId: z.string().min(8).max(100),
});

export const POST = route(async (req) => {
  const body = await readJson(req, Body);
  await requirePc(req, body.pcId);

  const result = await getContainer().actions.extend(body);
  return Response.json(result, { status: result.ok ? 200 : 409 });
});
