import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./lib/supabase/config";

/**
 * Next.js 16 Proxy (formerly middleware).
 * Runs on every matched request to:
 *  1. Forward any incoming OAuth ?code=... to /api/auth/callback.
 *  2. Refresh the Supabase auth session so cookies stay valid.
 *  3. Redirect unauthenticated visitors away from /dashboard.
 *  4. Redirect authenticated visitors away from /signin and /join.
 */
export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // If an OAuth code lands on root or any other page, redirect to the callback handler
  const code = searchParams.get("code");
  if (code && pathname !== "/api/auth/callback") {
    const callbackUrl = new URL("/api/auth/callback", request.url);
    searchParams.forEach((value, key) => {
      callbackUrl.searchParams.set(key, value);
    });
    return NextResponse.redirect(callbackUrl);
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const { url, publishableKey: key } = getSupabaseConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refresh session — this keeps the access token alive automatically
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect /dashboard — unauthenticated users go to /signin (allow preview mode when ?role is present)
  if (pathname.startsWith("/dashboard") && !user) {
    if (request.nextUrl.searchParams.has("role")) {
      return response;
    }
    const loginUrl = new URL("/signin", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect already-logged-in users away from auth pages
  if ((pathname === "/signin" || pathname === "/join") && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static  (static assets)
     * - _next/image   (image optimisation)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot)$).*)",
  ],
};
