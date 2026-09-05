import type { NextRequest } from "next/server";

/**
 * Resolves the true public origin of the site, preventing internal
 * server bind addresses (like 0.0.0.0) from leaking into browser redirects.
 */
export function getPublicOrigin(request?: NextRequest | Request): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    if (!window.location.origin.includes("0.0.0.0")) {
      return window.location.origin;
    }
  }

  if (request) {
    const headers = "headers" in request ? request.headers : null;
    if (headers) {
      const forwardedHost = headers.get("x-forwarded-host");
      const host = forwardedHost || headers.get("host");
      const proto = headers.get("x-forwarded-proto") || "https";

      if (host && !host.includes("0.0.0.0")) {
        return `${proto}://${host}`;
      }
    }

    try {
      const url = new URL(request.url);
      if (url.origin && !url.origin.includes("0.0.0.0")) {
        return url.origin;
      }
    } catch {}
  }

  if (process.env.NEXT_PUBLIC_SITE_URL && !process.env.NEXT_PUBLIC_SITE_URL.includes("0.0.0.0")) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  return "https://bylldx.in";
}
