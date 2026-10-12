import { z } from "zod";
import { getContainer } from "@/container";
import { readJson } from "@/http/body";
import { requireAdmin } from "@/http/guards";
import { route } from "@/http/route";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("force"), pcId: z.string(), type: z.enum(["lock", "logout"]) }),
  z.object({ op: z.literal("cancel"), pcId: z.string() }),
]);

export const POST = route(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req, Body);
  const { admin } = getContainer();

  const result =
    body.op === "force" ? await admin.force(body.pcId, body.type) : await admin.cancelForce(body.pcId);
  return Response.json({ result }, { status: result === "unknown_pc" ? 404 : 200 });
});
