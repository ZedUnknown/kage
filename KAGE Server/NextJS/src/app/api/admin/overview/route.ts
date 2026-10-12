import { getContainer } from "@/container";
import { requireAdmin } from "@/http/guards";
import { route } from "@/http/route";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAdmin(req);
  return Response.json(await getContainer().admin.overview(), {
    headers: { "cache-control": "no-store" },
  });
});
