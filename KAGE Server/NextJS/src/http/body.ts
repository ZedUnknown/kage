import type { ZodType } from "zod";
import { badRequest } from "./errors";

/** Parses and validates a JSON body, or throws a 400. */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw badRequest();
  return parsed.data;
}
