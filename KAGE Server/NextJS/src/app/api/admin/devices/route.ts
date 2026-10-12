import { z } from "zod";
import { getContainer } from "@/container";
import { readJson } from "@/http/body";
import { requireAdmin } from "@/http/guards";
import { route } from "@/http/route";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("op", [
  // Re-registering an existing PC rotates its token.
  z.object({ op: z.literal("register_pc"), id: z.string().min(1), name: z.string().min(1) }),
  // pcId null unassigns the chair.
  z.object({ op: z.literal("upsert_chair"), id: z.string().min(1), pcId: z.string().nullable() }),
  z.object({
    op: z.literal("policy"),
    pcId: z.string(),
    actionType: z.enum(["lock", "logout"]).optional(),
    graceSeconds: z.number().int().min(0).max(600).optional(),
    countdownSeconds: z.number().int().min(5).max(3600).optional(),
    maxExtensions: z.number().int().min(0).max(20).optional(),
    maxExtendSeconds: z.number().int().min(0).max(86400).optional(),
  }),
]);

export const POST = route(async (req) => {
  await requireAdmin(req);
  const body = await readJson(req, Body);
  const { admin } = getContainer();

  switch (body.op) {
    case "register_pc":
      return Response.json(await admin.registerPc({ id: body.id, name: body.name })); // token shown only now
    case "upsert_chair":
      await admin.assignChair({ id: body.id, pcId: body.pcId });
      return Response.json({ ok: true });
    case "policy": {
      const { op, pcId, ...patch } = body;
      void op;
      await admin.updatePolicy(pcId, patch);
      return Response.json({ ok: true });
    }
  }
});
