import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get("role") === "investor" ? "investor" : "founder";
  // If viewing as founder, discover investors; if viewing as investor, discover founders
  const targetRole = role === "founder" ? "investor" : "founder";

  try {
    const supabase = await createClient();

    // Query real users of targetRole who are active
    const { data: users, error: userError } = await supabase
      .from("users")
      .select("id, role, created_at")
      .eq("role", targetRole)
      .eq("account_status", "active")
      .limit(30);

    if (userError || !users || users.length === 0) {
      return NextResponse.json({ realUsers: [] });
    }

    const userIds = users.map((u) => u.id);

    // Fetch profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, headline, bio, location, photo_path, is_discoverable")
      .in("user_id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    let items: Array<[string, string, string, string, string, string]> = [];

    if (targetRole === "investor") {
      const { data: investorProfiles } = await supabase
        .from("investor_profiles")
        .select("user_id, investor_type, min_investment_inr, max_investment_inr, investment_thesis")
        .in("user_id", userIds);

      const invMap = new Map((investorProfiles || []).map((ip) => [ip.user_id, ip]));

      items = users.map((u) => {
        const prof = profileMap.get(u.id);
        const inv = invMap.get(u.id);
        const fullName = prof?.full_name || "Verified Investor";
        const initials = fullName.split(" ").slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("") || "VI";
        const type = inv?.investor_type || prof?.headline || "Angel Investor";
        const loc = prof?.location || "India";
        const bio = inv?.investment_thesis || prof?.bio || "Backing ambitious early-stage founders building resilient software.";
        const minL = inv?.min_investment_inr ? `₹${(inv.min_investment_inr / 100000).toFixed(0)}L` : "₹50k";
        const maxL = inv?.max_investment_inr ? `₹${(inv.max_investment_inr / 100000).toFixed(0)}L` : "₹10L";
        const ticket = `${minL}–${maxL}`;
        return [initials, fullName, type, loc, bio, ticket];
      });
    } else {
      const { data: founderProfiles } = await supabase
        .from("founder_profiles")
        .select("user_id, founder_role, prior_startups")
        .in("user_id", userIds);

      const { data: ideas } = await supabase
        .from("ideas")
        .select("founder_id, title, teaser, funding_requested_inr, startup_stage")
        .in("founder_id", userIds);

      const founderMap = new Map((founderProfiles || []).map((fp) => [fp.user_id, fp]));
      const ideaMap = new Map((ideas || []).map((i) => [i.founder_id, i]));

      items = users.map((u) => {
        const prof = profileMap.get(u.id);
        const fp = founderMap.get(u.id);
        const idea = ideaMap.get(u.id);
        const fullName = prof?.full_name || "Startup Founder";
        const initials = fullName.split(" ").slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("") || "SF";
        const sector = idea?.startup_stage || fp?.founder_role || "Tech Founder";
        const loc = prof?.location || "India";
        const bio = idea?.teaser || prof?.bio || "Building next-generation solutions for India.";
        const ask = idea?.funding_requested_inr
          ? `₹${(idea.funding_requested_inr / 100000).toFixed(0)}L`
          : "₹50L–₹1Cr";
        return [initials, fullName, sector, loc, bio, ask];
      });
    }

    return NextResponse.json({ realUsers: items });
  } catch (err) {
    return NextResponse.json({ realUsers: [] });
  }
}
