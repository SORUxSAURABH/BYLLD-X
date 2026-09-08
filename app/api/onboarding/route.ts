import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { sanitizePublicText } from "../../../lib/contactFilter";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding
 * Saves onboarding answers for a new user.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const value = (input: unknown) => typeof input === "string" ? input.trim() : "";
  const fullName = value(body.full_name);
  const phone = value(body.phone);
  const location = value(body.location);

  if (fullName.length < 2 || fullName.length > 120) {
    return NextResponse.json({ error: "Full name must be between 2 and 120 characters." }, { status: 400 });
  }
  if (phone.length < 6 || phone.length > 32) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  if (location.length < 2 || location.length > 160) {
    return NextResponse.json({ error: "Enter your city or location." }, { status: 400 });
  }

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, role, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  const requestedRole = (body.role === "investor" || body.role === "founder") ? body.role : null;
  const role: "founder" | "investor" = requestedRole || (userRecord?.role === "investor" ? "investor" : "founder");
  let headline: string;
  let bio: string;

  if (role === "founder") {
    const startupName = value(body.startup_name);
    const industry = value(body.industry);
    const startupStage = value(body.startup_stage);
    const startupPitch = sanitizePublicText(value(body.startup_pitch));

    if (startupName.length < 2 || industry.length < 2 || startupPitch.length < 10) {
      return NextResponse.json({ error: "Complete all founder profile fields." }, { status: 400 });
    }
    if (!["idea", "mvp", "early_revenue", "scaling"].includes(startupStage)) {
      return NextResponse.json({ error: "Choose a valid startup stage." }, { status: 400 });
    }

    const { error } = await supabase.from("founder_profiles").upsert({
      user_id: user.id,
      founder_role: industry,
      startup_name: startupName,
      industry,
      startup_stage: startupStage,
      startup_pitch: startupPitch,
    }, { onConflict: "user_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    headline = `Founder at ${startupName}`;
    bio = startupPitch;
  } else {
    const firmName = value(body.firm_name);
    const thesis = sanitizePublicText(value(body.investment_thesis));
    const sectors = sanitizePublicText(value(body.sectors_of_interest));
    const typicalCheck = Number(body.typical_check_size);

    if (firmName.length < 2 || thesis.length < 10 || sectors.length < 2) {
      return NextResponse.json({ error: "Complete all investor profile fields." }, { status: 400 });
    }
    if (!Number.isFinite(typicalCheck) || typicalCheck < 1 || typicalCheck > 1_000_000_000) {
      return NextResponse.json({ error: "Enter a valid typical check size." }, { status: 400 });
    }

    const roundedCheck = Math.round(typicalCheck);
    const { error } = await supabase.from("investor_profiles").upsert({
      user_id: user.id,
      investor_type: firmName.toLowerCase().includes("fund") ? "Fund" : "Angel Investor",
      firm_name: firmName,
      investment_thesis: thesis,
      sectors_of_interest: sectors,
      typical_check_size_inr: roundedCheck,
      min_investment_inr: roundedCheck,
      max_investment_inr: roundedCheck,
    }, { onConflict: "user_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    headline = `Investor at ${firmName}`;
    bio = `${thesis} Sectors: ${sectors}`;
  }

  const now = new Date().toISOString();
  const { error: profileError } = await supabase.from("profiles").upsert({
    user_id: user.id,
    full_name: fullName,
    headline,
    bio,
    location,
    phone,
    is_discoverable: true,
    completion_percent: 100,
    updated_at: now,
  }, { onConflict: "user_id" });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: completionError } = await supabase
    .from("users")
    .upsert({
      id: user.id,
      email: user.email,
      role,
      full_name: fullName,
      onboarding_completed_at: now,
      updated_at: now,
    }, { onConflict: "id" });

  if (completionError) {
    return NextResponse.json({ error: completionError.message }, { status: 500 });
  }

  await supabase.auth.updateUser({ data: { full_name: fullName, name: fullName } });
  return NextResponse.json({ success: true, role });
}
