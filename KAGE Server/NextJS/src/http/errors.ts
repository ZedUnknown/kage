/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export const unauthorized = () => new HttpError(401, "unauthorized");
export const badRequest = (code = "bad_request") => new HttpError(400, code);
