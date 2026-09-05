import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/**
 * GET /api/profile
 * Returns the signed-in user's profile + role-specific data.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Base profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // Role record
  const { data: userRecord } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = userRecord?.role ?? "founder";

  // Role-specific profile
  const table = role === "investor" ? "investor_profiles" : "founder_profiles";
  const { data: roleProfile } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", user.id)
    .single();

  // Generate photo URL if photo_path exists
  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(profile.photo_path);
    photoUrl = urlData?.publicUrl ?? null;
  }

  return NextResponse.json({
    profile: profile ?? null,
    roleProfile: roleProfile ?? null,
    role,
    photoUrl,
  });
}

/**
 * PATCH /api/profile
 * Upserts profile data for the signed-in user.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    full_name, headline, bio, location, website_url, is_discoverable,
    photo_path,
    // founder-specific
    founder_role, years_experience, prior_startups,
    // investor-specific
    investor_type, min_investment_inr, max_investment_inr, investment_thesis,
  } = body;

  // Calculate completion percent
  const filled = [full_name, headline, bio, location].filter(Boolean).length;
  const completion_percent = Math.round((filled / 4) * 100);

  // Upsert base profile
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      user_id: user.id,
      full_name: full_name || user.user_metadata?.full_name || "Member",
      headline: headline ?? null,
      bio: bio ?? null,
      location: location ?? null,
      website_url: website_url ?? null,
      is_discoverable: is_discoverable ?? true,
      completion_percent,
      ...(photo_path ? { photo_path } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  // Fetch role to decide which sub-table to upsert
  const { data: userRecord } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = userRecord?.role ?? "founder";

  if (role === "founder") {
    await supabase.from("founder_profiles").upsert({
      user_id: user.id,
      founder_role: founder_role ?? null,
      years_experience: years_experience ?? null,
      prior_startups: prior_startups ?? 0,
    }, { onConflict: "user_id" });
  } else {
    await supabase.from("investor_profiles").upsert({
      user_id: user.id,
      investor_type: investor_type ?? null,
      min_investment_inr: min_investment_inr ?? null,
      max_investment_inr: max_investment_inr ?? null,
      investment_thesis: investment_thesis ?? null,
    }, { onConflict: "user_id" });
  }

  return NextResponse.json({ success: true, completion_percent });
}
