import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicOrigin } from "../../../../lib/origin";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/reset-account
 * Completely deletes the logged-in user's test records (profiles, founder/investor data)
 * and signs out, allowing them to test brand new sign-ups from a clean slate.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    try {
      await supabase.from("founder_profiles").delete().eq("user_id", user.id);
      await supabase.from("investor_profiles").delete().eq("user_id", user.id);
      await supabase.from("profiles").delete().eq("user_id", user.id);
      await supabase.from("users").delete().eq("id", user.id);
    } catch {}
  }

  await supabase.auth.signOut();
  const origin = getPublicOrigin(request);
  const res = NextResponse.redirect(new URL("/join", origin));
  res.cookies.delete("bylld_role");
  return res;
}
