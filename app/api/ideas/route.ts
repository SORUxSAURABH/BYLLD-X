import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../../lib/supabase/server";

type IdeaStatus = "draft" | "active" | "inactive" | "removed";

interface CreateIdeaBody {
  title: string;
  teaser: string;
  funding_requested_inr: number;
  startup_stage: string;
  status?: IdeaStatus;
  is_primary?: boolean;
  problem?: string;
  proposed_solution?: string;
  supporting_details?: string;
}

async function getFounderTier(supabase: SupabaseClient, userId: string) {
  const { data: account, error: accountError } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (accountError || account?.role !== "founder") return null;

  const now = new Date().toISOString();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("tier", "premium")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .limit(1)
    .maybeSingle();

  const isPremium = Boolean(subscription);
  return { isPremium, maxActiveIdeas: isPremium ? 5 : 3 };
}

async function hasActiveSlot(
  supabase: SupabaseClient,
  userId: string,
  maxActiveIdeas: number,
  excludedIdeaId?: string,
) {
  let query = supabase
    .from("ideas")
    .select("id", { count: "exact", head: true })
    .eq("founder_id", userId)
    .eq("status", "active");
  if (excludedIdeaId) query = query.neq("id", excludedIdeaId);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return (count ?? 0) < maxActiveIdeas;
}

/**
 * GET /api/ideas
 * Returns ideas belonging to the authenticated founder, along with details and tier limits.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tier = await getFounderTier(supabase, user.id);
  if (!tier) {
    return NextResponse.json({ error: "Founder account required" }, { status: 403 });
  }

  // Fetch ideas for this founder
  const { data: ideas, error } = await supabase
    .from("ideas")
    .select(`
      id,
      founder_id,
      title,
      teaser,
      funding_requested_inr,
      startup_stage,
      status,
      is_primary,
      created_at,
      updated_at,
      idea_details (
        full_description,
        problem,
        proposed_solution,
        supporting_details
      )
    `)
    .eq("founder_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check user subscription tier
  const { isPremium, maxActiveIdeas } = tier;
  const activeCount = (ideas ?? []).filter((i) => i.status === "active").length;

  return NextResponse.json({
    ideas: (ideas ?? []).map((i) => {
      const details = Array.isArray(i.idea_details) ? i.idea_details[0] : i.idea_details;
      return {
        id: i.id,
        title: i.title,
        teaser: i.teaser,
        funding_requested_inr: i.funding_requested_inr,
        startup_stage: i.startup_stage,
        status: i.status,
        is_primary: i.is_primary,
        created_at: i.created_at,
        updated_at: i.updated_at,
        problem: details?.problem ?? "",
        proposed_solution: details?.proposed_solution ?? "",
        supporting_details: details?.supporting_details ?? "",
      };
    }),
    isPremium,
    maxActiveIdeas,
    activeCount,
  });
}

/**
 * POST /api/ideas
 * Creates a new idea and its associated details record.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tier = await getFounderTier(supabase, user.id);
  if (!tier) {
    return NextResponse.json({ error: "Founder account required" }, { status: 403 });
  }

  let body: CreateIdeaBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    title,
    teaser,
    funding_requested_inr = 0,
    startup_stage = "mvp",
    status = "active",
    is_primary = false,
    problem = "",
    proposed_solution = "",
    supporting_details = "",
  } = body;

  if (!(["draft", "active", "inactive", "removed"] as IdeaStatus[]).includes(status)) {
    return NextResponse.json({ error: "Invalid idea status" }, { status: 400 });
  }

  // Validation according to schema constraints
  if (!title || title.trim().length < 2 || title.trim().length > 120) {
    return NextResponse.json({ error: "Title must be between 2 and 120 characters" }, { status: 400 });
  }

  if (!teaser || teaser.trim().length < 20 || teaser.trim().length > 420) {
    return NextResponse.json({ error: "Teaser must be between 20 and 420 characters" }, { status: 400 });
  }

  const fundingNum = Number(funding_requested_inr) || 0;
  if (fundingNum < 20000 || fundingNum > 1000000) {
    return NextResponse.json(
      { error: "Funding requested must be between ₹20,000 (20k) and ₹10,00,000 (10 Lakhs)" },
      { status: 400 }
    );
  }

  // Check active limit
  if (status === "active") {
    if (!(await hasActiveSlot(supabase, user.id, tier.maxActiveIdeas))) {
      return NextResponse.json(
        { error: `Active idea limit reached (${tier.maxActiveIdeas}). Hide an existing idea or upgrade to Premium.` },
        { status: 400 }
      );
    }
  }

  // If new idea is primary, unset is_primary on any existing primary ideas
  if (is_primary && status === "active") {
    await supabase
      .from("ideas")
      .update({ is_primary: false })
      .eq("founder_id", user.id)
      .eq("is_primary", true);
  }

  // Insert into ideas
  const { data: newIdea, error: ideaError } = await supabase
    .from("ideas")
    .insert({
      founder_id: user.id,
      title: title.trim(),
      teaser: teaser.trim(),
      funding_requested_inr: Number(funding_requested_inr) || 0,
      startup_stage,
      status,
      is_primary: Boolean(is_primary && status === "active"),
    })
    .select()
    .single();

  if (ideaError || !newIdea) {
    return NextResponse.json({ error: ideaError?.message ?? "Failed to create idea" }, { status: 500 });
  }

  // Insert into idea_details
  const { error: detailsError } = await supabase
    .from("idea_details")
    .insert({
      idea_id: newIdea.id,
      founder_id: user.id,
      full_description: `${title}: ${teaser}`,
      problem: problem.trim() || teaser.trim(),
      proposed_solution: proposed_solution.trim() || teaser.trim(),
      supporting_details: supporting_details.trim() || null,
    });

  if (detailsError) {
    console.error("Error creating idea details:", detailsError);
  }

  return NextResponse.json({ idea: newIdea }, { status: 201 });
}

/**
 * PATCH /api/ideas
 * Updates an existing idea and its details.
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tier = await getFounderTier(supabase, user.id);
  if (!tier) {
    return NextResponse.json({ error: "Founder account required" }, { status: 403 });
  }

  let body: Partial<CreateIdeaBody> & { id: string; action?: "make_primary" | "toggle_status" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return NextResponse.json({ error: "Idea ID is required" }, { status: 400 });
  }

  // Ensure idea belongs to user
  const { data: existing, error: fetchError } = await supabase
    .from("ideas")
    .select("id, title, teaser, status, is_primary")
    .eq("id", id)
    .eq("founder_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  // Handle make_primary quick action
  if (body.action === "make_primary") {
    if (existing.status !== "active" && !(await hasActiveSlot(supabase, user.id, tier.maxActiveIdeas, id))) {
      return NextResponse.json(
        { error: `Active idea limit reached (${tier.maxActiveIdeas}). Hide an existing idea or upgrade to Premium.` },
        { status: 400 },
      );
    }
    // Unset all other primary ideas for this founder
    await supabase
      .from("ideas")
      .update({ is_primary: false })
      .eq("founder_id", user.id);

    const { error: updateError } = await supabase
      .from("ideas")
      .update({ is_primary: true, status: "active", updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Idea marked as primary" });
  }

  // Handle toggle_status quick action
  if (body.action === "toggle_status") {
    const nextStatus = existing.status === "active" ? "draft" : "active";
    if (nextStatus === "active") {
      if (!(await hasActiveSlot(supabase, user.id, tier.maxActiveIdeas, id))) {
        return NextResponse.json(
          { error: `Active idea limit reached (${tier.maxActiveIdeas}). Upgrade to Premium for 5 active ideas.` },
          { status: 400 }
        );
      }
    }

    const { error: updateError } = await supabase
      .from("ideas")
      .update({
        status: nextStatus,
        is_primary: nextStatus === "active" ? existing.is_primary : false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: nextStatus });
  }

  // General update
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.title !== undefined) {
    if (body.title.trim().length < 2 || body.title.trim().length > 120) {
      return NextResponse.json({ error: "Title must be between 2 and 120 characters" }, { status: 400 });
    }
    updatePayload.title = body.title.trim();
  }

  if (body.teaser !== undefined) {
    if (body.teaser.trim().length < 20 || body.teaser.trim().length > 420) {
      return NextResponse.json({ error: "Teaser must be between 20 and 420 characters" }, { status: 400 });
    }
    updatePayload.teaser = body.teaser.trim();
  }

  if (body.funding_requested_inr !== undefined) {
    const f = Number(body.funding_requested_inr) || 0;
    if (f < 20000 || f > 1000000) {
      return NextResponse.json(
        { error: "Funding requested must be between ₹20,000 (20k) and ₹10,00,000 (10 Lakhs)" },
        { status: 400 }
      );
    }
    updatePayload.funding_requested_inr = f;
  }

  if (body.startup_stage !== undefined) {
    updatePayload.startup_stage = body.startup_stage;
  }

  if (body.status !== undefined) {
    if (!(["draft", "active", "inactive", "removed"] as IdeaStatus[]).includes(body.status)) {
      return NextResponse.json({ error: "Invalid idea status" }, { status: 400 });
    }
    if (body.status === "active" && existing.status !== "active") {
      if (!(await hasActiveSlot(supabase, user.id, tier.maxActiveIdeas, id))) {
        return NextResponse.json(
          { error: `Active idea limit reached (${tier.maxActiveIdeas}). Hide an existing idea or upgrade to Premium.` },
          { status: 400 },
        );
      }
    }
    updatePayload.status = body.status;
    if (body.status !== "active") updatePayload.is_primary = false;
  }

  if (body.is_primary !== undefined) {
    if (body.is_primary) {
      const resultingStatus = body.status ?? existing.status;
      if (resultingStatus !== "active") {
        return NextResponse.json({ error: "Only a visible idea can be primary" }, { status: 400 });
      }
      await supabase
        .from("ideas")
        .update({ is_primary: false })
        .eq("founder_id", user.id);
    }
    updatePayload.is_primary = body.is_primary;
  }

  const { error: updateIdeaErr } = await supabase
    .from("ideas")
    .update(updatePayload)
    .eq("id", id);

  if (updateIdeaErr) {
    return NextResponse.json({ error: updateIdeaErr.message }, { status: 500 });
  }

  // Upsert details
  if (body.problem !== undefined || body.proposed_solution !== undefined || body.supporting_details !== undefined) {
    await supabase
      .from("idea_details")
      .upsert({
        idea_id: id,
        founder_id: user.id,
        full_description: `${body.title ?? existing.title}: ${body.teaser ?? existing.teaser}`,
        problem: body.problem ?? "",
        proposed_solution: body.proposed_solution ?? "",
        supporting_details: body.supporting_details ?? null,
        updated_at: new Date().toISOString(),
      });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/ideas
 * Deletes an idea (cascade removes details).
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing idea id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("ideas")
    .delete()
    .eq("id", id)
    .eq("founder_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
