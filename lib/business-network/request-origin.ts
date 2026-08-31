export function isTrustedBusinessMutationOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin")?.trim();
  if (origin) {
    try {
      return origin === new URL(request.url).origin;
    } catch {
      return false;
    }
  }

  // Browser credentialed mutations must prove their origin. Non-browser jobs
  // without cookies remain usable, while authenticated cookie requests fail
  // closed when both Origin and trustworthy Fetch Metadata are absent.
  if (fetchSite === "same-origin") return true;
  return !request.headers.has("cookie");
}
