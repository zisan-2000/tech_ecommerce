import "server-only";

export function isAuthorizedBusinessCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  return bearer === secret || request.headers.get("x-cron-secret") === secret;
}

