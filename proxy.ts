import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./lib/supabase/config";
import { getPublicOrigin } from "./lib/origin";

/**
 * Next.js 16 Proxy (formerly middleware).
 * Runs on every matched request to:
 *  1. Forward any incoming OAuth ?code=... to /api/auth/callback.
 *  2. Refresh the Supabase auth session so cookies stay valid.
 *  3. Redirect unauthenticated visitors away from /dashboard.
 *  4. Redirect authenticated visitors away from /signin and /join.
 */
export async function proxy(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const { pathname, searchParams } = request.nextUrl;

  // If an OAuth code lands on root or any other page, redirect to the callback handler
  const code = searchParams.get("code");
  if (code && pathname !== "/api/auth/callback") {
    const callbackUrl = new URL("/api/auth/callback", origin);
    searchParams.forEach((value, key) => {
      callbackUrl.searchParams.set(key, value);
    });
    return NextResponse.redirect(callbackUrl);
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });
  const redirectWithSessionCookies = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

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

  // Protect member setup and dashboard routes. A role query keeps the explicit
  // unauthenticated product preview available on /dashboard only.
  if ((pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding")) && !user) {
    if (request.nextUrl.searchParams.has("role")) {
      if (pathname.startsWith("/dashboard")) return response;
    }
    const loginUrl = new URL("/signin", origin);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return redirectWithSessionCookies(loginUrl);
  }

  if (user && (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding")
  )) {
    if (pathname.startsWith("/dashboard") && (request.nextUrl.searchParams.has("role") || request.nextUrl.searchParams.get("demo") === "true")) {
      return response;
    }

    const { data: account } = await supabase
      .from("users")
      .select("role, onboarding_completed_at")
      .eq("id", user.id)
      .maybeSingle();
    const role = account?.role === "investor" ? "investor" : "founder";
    const onboardingComplete = Boolean(account?.onboarding_completed_at);

    if (!onboardingComplete && pathname.startsWith("/dashboard")) {
      return redirectWithSessionCookies(new URL(`/onboarding?role=${role}`, origin));
    }
    if (
      !onboardingComplete
      && pathname.startsWith("/onboarding")
      && request.nextUrl.searchParams.get("role") !== role
    ) {
      return redirectWithSessionCookies(new URL(`/onboarding?role=${role}`, origin));
    }
    if (onboardingComplete && pathname.startsWith("/onboarding")) {
      return redirectWithSessionCookies(new URL(`/dashboard?role=${role}`, origin));
    }
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
