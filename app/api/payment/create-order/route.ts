import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

function mockOrder(role: "founder" | "investor", email = "member@bylldx.in") {
  const amountInr = role === "investor" ? 310 : 240;
  return NextResponse.json({
    mock: true,
    orderId: `mock_order_${Date.now()}`,
    amount: amountInr * 100,
    currency: "INR",
    keyId: "rzp_test_mock",
    userName: email.split("@")[0] || "Member",
    userEmail: email,
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("ends_at")
    .eq("user_id", user.id)
    .eq("tier", "premium")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ isPremium: Boolean(subscription), endsAt: subscription?.ends_at ?? null });
}

/**
 * Creates a Razorpay order for the authenticated account. The registered database
 * role determines the monthly amount: Founder ₹240, Investor ₹310.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const hasAnyRazorpayKey = Boolean(keyId || keySecret);
  const isRazorpayConfigured = Boolean(keyId && keySecret);

  if (hasAnyRazorpayKey && !isRazorpayConfigured) {
    return NextResponse.json({ error: "Both Razorpay credentials must be configured" }, { status: 503 });
  }

  // Visitor previews can exercise mock checkout only. Live orders always require
  // an authenticated database account.
  if (authError || !user) {
    if (process.env.NODE_ENV !== "production" && !isRazorpayConfigured) {
      const previewRole = req.headers.get("x-mock-role") === "investor" ? "investor" : "founder";
      return mockOrder(previewRole);
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: account, error: accountError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (accountError || (account?.role !== "founder" && account?.role !== "investor")) {
    return NextResponse.json({ error: "Member account not found" }, { status: 404 });
  }

  const role = account.role;
  const amountInr = role === "investor" ? 310 : 240;
  const amountPaise = amountInr * 100;

  const now = new Date().toISOString();
  const { data: activeSubscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("ends_at")
    .eq("user_id", user.id)
    .eq("tier", "premium")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) {
    return NextResponse.json({ error: subscriptionError.message }, { status: 500 });
  }
  if (activeSubscription) {
    return NextResponse.json(
      { error: `Premium is already active until ${new Date(activeSubscription.ends_at).toLocaleDateString("en-IN")}` },
      { status: 409 },
    );
  }

  if (!isRazorpayConfigured) {
    return NextResponse.json({ error: "Live Razorpay credentials are not configured" }, { status: 503 });
  }

  const { default: Razorpay } = await import("razorpay");
  const razorpay = new Razorpay({ key_id: keyId!, key_secret: keySecret! });
  const idempotencyKey = `bylldx_${user.id}_${crypto.randomUUID()}`;

  let order: { id: string; amount: number; currency: string };
  try {
    order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: idempotencyKey.slice(0, 40),
      notes: { platform: "BYLLD X", user_id: user.id, role },
    }) as { id: string; amount: number; currency: string };
  } catch (error) {
    console.error("Razorpay order creation failed:", error);
    return NextResponse.json({ error: "Could not create payment order with Razorpay. Try again." }, { status: 502 });
  }

  const { error: ledgerError } = await supabase.rpc("insert_payment", {
    p_user_id: user.id,
    p_provider: "razorpay",
    p_provider_payment_id: order.id,
    p_amount_inr: amountInr,
    p_idempotency_key: idempotencyKey,
  });
  if (ledgerError) {
    console.error("Payment ledger creation failed:", ledgerError.message);
    return NextResponse.json({ error: "Could not prepare payment securely. Please try again." }, { status: 500 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    mock: false,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId,
    userName: profile?.full_name ?? user.email ?? "Member",
    userEmail: user.email ?? "",
  });
}
