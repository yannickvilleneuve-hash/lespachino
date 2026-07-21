/**
 * The public origin that platform crawlers will hit.
 *
 * Every feed embeds absolute `/vehicule/<unit>` URLs. If this resolves to
 * localhost or a tailnet name, Meta fetches the feed fine and then fails every
 * item on an unreachable landing page — a failure that surfaces days later in
 * Commerce Manager, not here. So: explicit env wins, request headers are the
 * fallback, and `trimTrailingSlash` keeps us from emitting `//vehicule/x`.
 */

export function trimTrailingSlash(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export interface RequestOrigin {
  forwardedHost: string | null;
  forwardedProto: string | null;
  host: string | null;
}

/**
 * Pure: resolve the feed origin from config, falling back to request headers.
 * Behind Cloudflare the client-facing host is `x-forwarded-host`; `host` is the
 * tunnel's view of the origin and would leak an internal name into the feed.
 */
export function resolveFeedOrigin(
  configured: string | undefined,
  req: RequestOrigin,
): string {
  const explicit = configured?.trim();
  if (explicit) return trimTrailingSlash(explicit);

  const host = req.forwardedHost?.trim() || req.host?.trim();
  if (!host) {
    throw new Error(
      "cannot resolve feed origin: set FEED_ORIGIN or NEXT_PUBLIC_SITE_URL",
    );
  }
  const proto = req.forwardedProto?.trim() || "https";
  return trimTrailingSlash(`${proto}://${host}`);
}
