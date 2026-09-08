import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/**
 * GET /api/profile?role=investor|founder
 * Returns the signed-in user's profile + role-specific data.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Base profile (use maybeSingle so missing rows don't cause an error)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Role record
  const { data: userRecord } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (userRecord?.role !== "founder" && userRecord?.role !== "investor") {
    return NextResponse.json({ error: "Member account not found" }, { status: 404 });
  }
  const activeRole = userRecord.role;

  // Role-specific profile
  const table = activeRole === "investor" ? "investor_profiles" : "founder_profiles";
  const { data: roleProfileData } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Retrieve extra metadata persisted on auth user metadata
  const userMeta = user.user_metadata || {};
  const investorMandate = userMeta.investor_mandate || {};
  const founderShowcase = userMeta.founder_showcase || {};

  let roleProfile: Record<string, any> | null = roleProfileData ? { ...roleProfileData } : null;

  if (activeRole === "investor") {
    roleProfile = {
      ...(roleProfile || {}),
      investor_type: roleProfile?.investor_type ?? investorMandate.investor_type ?? null,
      min_investment_inr: roleProfile?.min_investment_inr ?? investorMandate.min_investment_inr ?? null,
      max_investment_inr: roleProfile?.max_investment_inr ?? investorMandate.max_investment_inr ?? null,
      investment_thesis: roleProfile?.investment_thesis ?? investorMandate.investment_thesis ?? null,
      // Extra mandate fields persisted in user_metadata
      firm_name: roleProfile?.firm_name ?? investorMandate.firm_name ?? null,
      deals_per_year: investorMandate.deals_per_year ?? null,
      target_stages: investorMandate.target_stages ?? [],
      target_sectors: roleProfile?.sectors_of_interest
        ? String(roleProfile.sectors_of_interest).split(",").map((item) => item.trim()).filter(Boolean)
        : (investorMandate.target_sectors ?? []),
      value_add_tags: investorMandate.value_add_tags ?? [],
    };
  } else {
    roleProfile = {
      ...(roleProfile || {}),
      founder_role: roleProfile?.founder_role ?? founderShowcase.founder_role ?? null,
      years_experience: roleProfile?.years_experience ?? founderShowcase.years_experience ?? null,
      prior_startups: roleProfile?.prior_startups ?? founderShowcase.prior_startups ?? 0,
      // Extra showcase fields persisted in user_metadata
      startup_name: roleProfile?.startup_name ?? founderShowcase.startup_name ?? null,
      startup_stage: roleProfile?.startup_stage ?? founderShowcase.startup_stage ?? null,
      startup_sector: roleProfile?.industry ?? founderShowcase.startup_sector ?? null,
      traction_metric: founderShowcase.traction_metric ?? null,
      pitch_deck_url: founderShowcase.pitch_deck_url ?? null,
      team_size: founderShowcase.team_size ?? null,
      funding_goal_inr: founderShowcase.funding_goal_inr ?? null,
      equity_offered: founderShowcase.equity_offered ?? null,
    };
  }

  // Generate photo URL if photo_path exists
  let photoUrl: string | null = null;
  if (profile?.photo_path) {
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(profile.photo_path);
    photoUrl = urlData?.publicUrl ?? null;
  }

  return NextResponse.json({
    profile: profile ?? (user.user_metadata?.full_name ? { full_name: user.user_metadata.full_name, completion_percent: 25 } : null),
    roleProfile,
    role: activeRole,
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
    startup_name, startup_stage, startup_sector, traction_metric,
    pitch_deck_url, team_size, funding_goal_inr, equity_offered,
    // investor-specific
    firm_name, investor_type, min_investment_inr, max_investment_inr,
    deals_per_year, target_stages, target_sectors, value_add_tags,
    investment_thesis,
  } = body;

  // Determine role
  const { data: userRecord } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (userRecord?.role !== "founder" && userRecord?.role !== "investor") {
    return NextResponse.json({ error: "Member account not found" }, { status: 404 });
  }
  const role = userRecord.role;

  // Calculate completion percent
  const filled = [full_name, headline, bio, location].filter(Boolean).length;
  const extra = role === "founder"
    ? (startup_name ? 1 : 0) + (funding_goal_inr ? 1 : 0)
    : (investor_type ? 1 : 0) + (min_investment_inr ? 1 : 0);
  const completion_percent = Math.min(100, Math.round(((filled + extra) / 6) * 100));

  // Upsert base profile
  const resolvedFullName = full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Member";
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      user_id: user.id,
      full_name: resolvedFullName,
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

  // Update role-specific DB tables and Auth metadata
  if (role === "founder") {
    const startupStageMap: Record<string, string> = {
      "Idea / Pre-MVP": "idea",
      "MVP Live": "mvp",
      "Pre-seed": "early_revenue",
      "Seed": "early_revenue",
      "Pre-Series A": "early_revenue",
      "Growth / Scaling": "scaling",
    };
    await supabase.from("founder_profiles").upsert({
      user_id: user.id,
      founder_role: founder_role ?? null,
      years_experience: years_experience ? Number(years_experience) : null,
      prior_startups: Number(prior_startups) || 0,
      startup_name: startup_name ?? null,
      industry: startup_sector ?? null,
      startup_stage: startup_stage ? (startupStageMap[startup_stage] ?? startup_stage) : null,
      startup_pitch: headline ?? null,
    }, { onConflict: "user_id" });

    // Persist extra founder showcase fields in user_metadata
    try {
      await supabase.auth.updateUser({
        data: {
          role: "founder",
          full_name: resolvedFullName,
          founder_showcase: {
            founder_role,
            years_experience,
            prior_startups,
            startup_name,
            startup_stage,
            startup_sector,
            traction_metric,
            pitch_deck_url,
            team_size,
            funding_goal_inr,
            equity_offered,
          },
        },
      });
    } catch {}
  } else {
    await supabase.from("investor_profiles").upsert({
      user_id: user.id,
      investor_type: investor_type ?? null,
      min_investment_inr: min_investment_inr ? Number(min_investment_inr) : null,
      max_investment_inr: max_investment_inr ? Number(max_investment_inr) : null,
      investment_thesis: investment_thesis ?? null,
      firm_name: firm_name ?? null,
      sectors_of_interest: Array.isArray(target_sectors) ? target_sectors.join(", ") : null,
      typical_check_size_inr: min_investment_inr ? Number(min_investment_inr) : (max_investment_inr ? Number(max_investment_inr) : null),
    }, { onConflict: "user_id" });

    // Persist all mandate fields in user_metadata so firm_name, stages, sectors, tags, deals are NEVER lost
    try {
      await supabase.auth.updateUser({
        data: {
          role: "investor",
          full_name: resolvedFullName,
          investor_mandate: {
            firm_name,
            investor_type,
            min_investment_inr,
            max_investment_inr,
            deals_per_year,
            target_stages,
            target_sectors,
            value_add_tags,
            investment_thesis,
          },
        },
      });
    } catch {}
  }

  return NextResponse.json({ success: true, completion_percent });
}
