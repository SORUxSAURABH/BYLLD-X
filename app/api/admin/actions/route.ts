import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { adminStore } from "../../../../lib/adminStore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get("x-admin-key");
  const expectedKey = process.env.ADMIN_SECRET_KEY;

  if (!expectedKey) {
    return NextResponse.json({ error: "Admin access is not configured" }, { status: 503 });
  }

  if (!adminKey || adminKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized access: invalid admin master key" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Admin database access is not configured" }, { status: 503 });
  }

  let body: {
    action: string;
    userId?: string;
    role?: "founder" | "investor";
    accountStatus?: "active" | "suspended" | "banned";
    ideaId?: string;
    broadcast?: {
      message: string;
      type?: "info" | "warning" | "success" | "alert";
      active?: boolean;
    };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, userId, role, accountStatus, ideaId, broadcast } = body;

  try {
    // 1. Toggle Premium
    if (action === "toggle_premium" && userId) {
      const mockUser = adminStore.mockUsers.find((u) => u.id === userId);
      let newPremiumState = true;
      if (mockUser) {
        mockUser.isPremium = !mockUser.isPremium;
        newPremiumState = mockUser.isPremium;
      }

      const now = new Date();
      const endsAt = new Date(now);
      endsAt.setDate(endsAt.getDate() + 30);
      const { error } = newPremiumState
        ? await supabase.from("subscriptions").insert({
            user_id: userId,
            tier: "premium",
            starts_at: now.toISOString(),
            ends_at: endsAt.toISOString(),
          })
        : await supabase.from("subscriptions").delete().eq("user_id", userId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Premium status updated to ${newPremiumState ? "Active" : "Free"}`,
        isPremium: newPremiumState,
      });
    }

    // 2. Toggle Role
    if (action === "toggle_role" && userId && role) {
      const mockUser = adminStore.mockUsers.find((u) => u.id === userId);
      if (mockUser) {
        mockUser.role = role;
      }
      const { error } = await supabase.from("users").update({ role }).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        success: true,
        message: `User role flipped to ${role}`,
        role,
      });
    }

    // 3. Set Account Status (Active, Suspended, Banned)
    if (action === "set_account_status" && userId && accountStatus) {
      const mockUser = adminStore.mockUsers.find((u) => u.id === userId);
      if (mockUser) {
        mockUser.accountStatus = accountStatus;
      }
      const { error } = await supabase.from("users").update({ account_status: accountStatus }).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        success: true,
        message: `Account status set to ${accountStatus}`,
        accountStatus,
      });
    }

    // 4. Toggle Featured Idea
    if (action === "toggle_featured_idea" && ideaId) {
      const exists = adminStore.featuredIdeaIds.includes(ideaId);
      if (exists) {
        adminStore.featuredIdeaIds = adminStore.featuredIdeaIds.filter((id) => id !== ideaId);
      } else {
        adminStore.featuredIdeaIds.push(ideaId);
      }

      return NextResponse.json({
        success: true,
        isFeatured: !exists,
        message: !exists ? "Idea marked as Featured on Discover ⭐" : "Idea unfeatured",
      });
    }

    // 5. Set Global Broadcast Banner
    if (action === "set_broadcast" && broadcast) {
      if (!broadcast.message || !broadcast.message.trim()) {
        adminStore.broadcast = null;
        return NextResponse.json({ success: true, message: "Broadcast banner cleared" });
      }

      adminStore.broadcast = {
        id: `bc-${Date.now()}`,
        message: broadcast.message.trim(),
        type: broadcast.type || "info",
        active: broadcast.active ?? true,
        createdAt: new Date().toISOString(),
      };

      return NextResponse.json({
        success: true,
        message: "Live broadcast banner updated!",
        broadcast: adminStore.broadcast,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
