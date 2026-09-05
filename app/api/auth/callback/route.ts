import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

/**
 * OAuth callback handler for Google sign-in via Supabase.
 * Supabase redirects here after the user authorises the provider.
 * We exchange the code for a session and redirect to the dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where to send the user after login (passed through state)
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Determine the user's role so we can redirect correctly
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const roleFromQuery = searchParams.get("role") as "founder" | "investor" | null;
        const roleFromCookie = request.cookies.get("bylld_role")?.value as "founder" | "investor" | null;
        const requestedRole = (roleFromQuery === "investor" || roleFromCookie === "investor")
          ? "investor"
          : (roleFromQuery === "founder" || roleFromCookie === "founder")
          ? "founder"
          : null;

        const { data: userRecord } = await supabase
          .from("users")
          .select("id, role, full_name")
          .eq("id", user.id)
          .maybeSingle();

        let finalRole: "founder" | "investor" = "founder";

        if (!userRecord) {
          finalRole = requestedRole || "founder";
          const fullName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split("@")[0] ||
            (finalRole === "founder" ? "Founder" : "Investor");

          try {
            await supabase.from("users").insert({
              id: user.id,
              email: user.email,
              full_name: fullName,
              role: finalRole,
              account_status: "active",
            });
          } catch {}

          try {
            await supabase.from("profiles").upsert({
              user_id: user.id,
              full_name: fullName,
              is_discoverable: true,
              completion_percent: 50,
            });
          } catch {}
        } else {
          if (requestedRole && requestedRole !== userRecord.role) {
            finalRole = requestedRole;
            try {
              await supabase.from("users").update({ role: finalRole }).eq("id", user.id);
            } catch {}
          } else {
            finalRole = (userRecord.role as "founder" | "investor") || requestedRole || "founder";
          }
        }

        const redirectTarget = next.startsWith("/dashboard")
          ? `${next}${next.includes("?") ? "&" : "?"}role=${finalRole}`
          : next;

        const response = NextResponse.redirect(new URL(redirectTarget, origin));
        response.cookies.set("bylld_role", finalRole, { path: "/", maxAge: 60 * 60 * 24 * 30 });
        return response;
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Something went wrong — go back to sign-in with an error flag
  return NextResponse.redirect(new URL("/signin?error=auth_failed", origin));
}
