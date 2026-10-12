import { getContainer } from "@/container";
import { HttpError } from "@/http/errors";
import { requirePc } from "@/http/guards";
import { route } from "@/http/route";

export const dynamic = "force-dynamic";

// GET /api/state?pc=<id>   Authorization: Bearer <pc token>
// Source of truth for a PC: call on start, on every reconnect, and periodically.
export const GET = route(async (req) => {
  const pcId = new URL(req.url).searchParams.get("pc") ?? "";
  await requirePc(req, pcId);

  const state = await getContainer().actions.getPcState(pcId);
  if (!state) throw new HttpError(404, "unknown_pc");
  return Response.json(state, { headers: { "cache-control": "no-store" } });
});
