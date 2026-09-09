import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { sanitizePublicText } from "../../../lib/contactFilter";

export const dynamic = "force-dynamic";

function initialsFor(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BX";
}

function formatINR(amount: number | null | undefined) {
  if (!amount) return "Not specified";
  if (amount >= 10_000_000) return `₹${Number((amount / 10_000_000).toFixed(1))}Cr`;
  if (amount >= 100_000) return `₹${Number((amount / 100_000).toFixed(1))}L`;
  return `₹${Number((amount / 1_000).toFixed(1))}k`;
}

function currentWeekStart() {
  const date = new Date();
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized", realUsers: [] }, { status: 401 });
  }

  const { data: account, error: accountError } = await supabase
    .from("users")
    .select("role, onboarding_completed_at")
    .eq("id", user.id)
    .single();
  if (accountError || !account?.onboarding_completed_at) {
    return NextResponse.json({ error: "Complete onboarding first", realUsers: [] }, { status: 403 });
  }

  const now = new Date().toISOString();
  const [subscriptionResult, usageResult] = await Promise.all([
    supabase.from("subscriptions").select("id").eq("user_id", user.id).eq("tier", "premium").lte("starts_at", now).gt("ends_at", now).limit(1).maybeSingle(),
    supabase.from("weekly_usage").select("unique_profile_views").eq("user_id", user.id).eq("week_start", currentWeekStart()).maybeSingle(),
  ]);
  const isPremium = Boolean(subscriptionResult.data);
  const viewsRemaining = isPremium ? null : Math.max(0, 7 - (usageResult.data?.unique_profile_views ?? 0));
  let items: string[][] = [];

  // The authenticated account determines what it can discover. Never trust a
  // query parameter to change an account's role or data access.
  const targetRole = account.role;

  if (targetRole === "founder") {
    let investorQuery = supabase
      .from("investor_profiles")
      .select("user_id, investor_type, firm_name, investment_thesis, sectors_of_interest, typical_check_size_inr")
      .limit(30);
    if (account.role === "investor") {
      investorQuery = investorQuery.neq("user_id", user.id);
    }
    const { data: roleProfiles, error } = await investorQuery;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (roleProfiles ?? []).map((item) => item.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase.from("profiles").select("user_id, full_name, headline, bio, location").in("user_id", ids).eq("is_discoverable", true)
      : { data: [], error: null };
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    items = (roleProfiles ?? []).flatMap((investor) => {
      const profile = profileMap.get(investor.user_id);
      if (!profile) return [];
      const name = profile.full_name;
      const description = sanitizePublicText(investor.investment_thesis || profile.bio || "Investment profile");
      const focus = investor.sectors_of_interest ? `${description} Focus: ${sanitizePublicText(investor.sectors_of_interest)}` : description;
      return [[
        initialsFor(name),
        name,
        investor.firm_name || investor.investor_type || profile.headline || "Investor",
        profile.location || "India",
        focus,
        formatINR(investor.typical_check_size_inr),
        investor.user_id,
      ]];
    });
  } else {
    let founderQuery = supabase
      .from("founder_profiles")
      .select("user_id, founder_role, startup_name, industry, startup_stage, startup_pitch")
      .limit(30);
    if (account.role === "investor") {
      founderQuery = founderQuery.neq("user_id", user.id);
    }
    const [{ data: founderProfiles, error }, { data: ideas, error: ideasError }] = await Promise.all([
      founderQuery,
      supabase.from("ideas").select("founder_id, teaser, funding_requested_inr, is_primary, created_at").eq("status", "active").order("is_primary", { ascending: false }).order("created_at", { ascending: false }).limit(60),
    ]);
    if (error || ideasError) return NextResponse.json({ error: error?.message || ideasError?.message }, { status: 500 });

    const ids = (founderProfiles ?? []).map((item) => item.user_id);
    const { data: profiles, error: profileError } = ids.length
      ? await supabase.from("profiles").select("user_id, full_name, headline, bio, location").in("user_id", ids).eq("is_discoverable", true)
      : { data: [], error: null };
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    const ideaMap = new Map<string, NonNullable<typeof ideas>[number]>();
    for (const idea of ideas ?? []) {
      if (!ideaMap.has(idea.founder_id)) ideaMap.set(idea.founder_id, idea);
    }

    items = (founderProfiles ?? []).flatMap((founder) => {
      const profile = profileMap.get(founder.user_id);
      if (!profile) return [];
      const idea = ideaMap.get(founder.user_id);
      const name = profile.full_name;
      return [[
        initialsFor(name),
        name,
        founder.startup_name || founder.founder_role || profile.headline || "Founder",
        profile.location || "India",
        sanitizePublicText(idea?.teaser || founder.startup_pitch || profile.bio || "Founder profile"),
        formatINR(idea?.funding_requested_inr),
        founder.user_id,
      ]];
    });
  }

  return NextResponse.json({ realUsers: items, isPremium, viewsRemaining });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let profileId = "";
  try {
    const body = await req.json();
    profileId = typeof body.profileId === "string" ? body.profileId : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!profileId) {
    return NextResponse.json({ error: "Profile ID is required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("record_profile_view", { p_viewed_user_id: profileId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.allowed) {
    return NextResponse.json({ error: "Free accounts can open up to 7 profiles per week.", ...data }, { status: 403 });
  }
  return NextResponse.json(data);
}
