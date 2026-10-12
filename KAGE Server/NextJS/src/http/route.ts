import { HttpError } from "./errors";

type Handler = (req: Request) => Promise<Response>;

/**
 * Wraps a route handler so error handling lives in one place: HttpError maps
 * to its status, anything unexpected is logged and returned as a plain 500.
 */
export function route(handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.code }, { status: e.status });
      console.error("[api]", req.method, new URL(req.url).pathname, e);
      return Response.json({ error: "internal" }, { status: 500 });
    }
  };
}
