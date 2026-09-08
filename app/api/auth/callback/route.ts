import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicOrigin } from "../../../../lib/origin";

/**
 * Exchanges a Supabase PKCE code, preserves the initial account role for new
 * Google users, and routes incomplete profiles through onboarding.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const queryOrigin = searchParams.get("origin");
  const origin = queryOrigin && (
    queryOrigin.startsWith("http://localhost") ||
    queryOrigin.startsWith("http://127.0.0.1")
  )
    ? queryOrigin
    : getPublicOrigin(request);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/dashboard";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/signin?error=auth_failed", origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/signin?error=auth_failed", origin));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/signin?error=auth_failed", origin));
  }

  const roleFromQuery = searchParams.get("role");
  const roleFromCookie = request.cookies.get("bylld_role")?.value;
  const requestedRole = roleFromQuery === "investor" || roleFromQuery === "founder"
    ? roleFromQuery
    : roleFromCookie === "investor" || roleFromCookie === "founder"
      ? roleFromCookie
      : null;

  // Retrieve user record from public.users
  const { data: existingUserRecord } = await supabase
    .from("users")
    .select("id, role, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  let finalRole: "founder" | "investor" = requestedRole === "investor" ? "investor" : "founder";
  let isNewUser = true;

  const fullName = (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split("@")[0] ||
    "Member"
  );

  if (!existingUserRecord) {
    // If public.users row doesn't exist yet, insert it immediately with the requested role
    await supabase.from("users").insert({
      id: user.id,
      email: user.email,
      role: finalRole,
      full_name: fullName,
    });
    isNewUser = true;
  } else {
    isNewUser = !existingUserRecord.onboarding_completed_at;
    if (!isNewUser) {
      // Once onboarding is completed, respect their persisted role
      finalRole = existingUserRecord.role === "investor" ? "investor" : "founder";
    } else if (requestedRole && requestedRole !== existingUserRecord.role) {
      // User is still new, allow them to adopt their selected role
      try {
        await supabase
          .from("users")
          .update({ role: requestedRole, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        finalRole = requestedRole;
      } catch {
        finalRole = requestedRole;
      }
    } else {
      finalRole = existingUserRecord.role === "investor" ? "investor" : "founder";
    }
  }

  // Ensure a minimal profile exists so Discover & Profile queries never throw 404
  try {
    await supabase.from("profiles").upsert(
      { user_id: user.id, full_name: fullName },
      { onConflict: "user_id" }
    );
  } catch {}

  const redirectTarget = isNewUser
    ? `/onboarding?role=${finalRole}`
    : next.startsWith("/dashboard")
      ? `${next}${next.includes("?") ? "&" : "?"}role=${finalRole}`
      : next;

  const response = NextResponse.redirect(new URL(redirectTarget, origin));
  response.cookies.set("bylld_role", finalRole, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
  });
  return response;
}
