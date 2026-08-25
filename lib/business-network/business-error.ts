export class BusinessNetworkError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404 | 409 | 422 | 429 | 502 | 503,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BusinessNetworkError";
  }
}
