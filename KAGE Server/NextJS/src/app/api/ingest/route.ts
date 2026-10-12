import { z } from "zod";
import { getContainer } from "@/container";
import { badRequest } from "@/http/errors";
import { readJson } from "@/http/body";
import { requireIngestKey } from "@/http/guards";
import { route } from "@/http/route";

export const dynamic = "force-dynamic";

// Broker webhook (EMQX/HiveMQ rule) or simulator:
//   { topic: "kage/<site>/chair/<id>/state", payload: { occupied, boot, seq } }
//   { topic: "kage/<site>/chair/<id>/status", payload: "online" | "offline" }
const Body = z.object({ topic: z.string(), payload: z.unknown() });

const State = z.object({
  occupied: z.boolean(),
  boot: z.string().optional(),
  seq: z.number().int().optional(),
});

const TOPIC = /^kage\/[^/]+\/chair\/([^/]+)\/(state|status)$/;

export const POST = route(async (req) => {
  requireIngestKey(req);
  const body = await readJson(req, Body);

  const m = TOPIC.exec(body.topic);
  if (!m) throw badRequest("unsupported_topic");
  const [, chairId, kind] = m;

  // Webhooks often deliver the payload as a JSON string.
  let payload = body.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      /* plain string such as "online" */
    }
  }

  const { actions, devices } = getContainer();

  if (kind === "state") {
    const state = State.safeParse(payload);
    if (!state.success) throw badRequest("bad_payload");
    return Response.json({ result: await actions.onChairState({ chairId, ...state.data }) });
  }

  const status = typeof payload === "string" ? payload : (payload as { status?: string })?.status;
  if (status !== "online" && status !== "offline") throw badRequest("bad_payload");
  await devices.setChairOnline(chairId, status === "online");
  return Response.json({ result: status });
});
