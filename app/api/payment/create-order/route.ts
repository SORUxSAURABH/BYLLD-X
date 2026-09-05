import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

/**
 * POST /api/payment/create-order
 *
 * Creates a Razorpay order for the authenticated user.
 * Amount is determined server-side from the user's role — never trusted from client.
 *
 * Setup required:
 *  - npm install razorpay
 *  - Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env.local
 *  - Set PAYMENT_PROVIDER=razorpay in .env.local
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // 1. Auth check
  const { data: { user }, error: sessionError } = await supabase.auth.getUser();

  // 2. Check if Razorpay is configured
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (sessionError || !user) {
    if (!keyId || !keySecret || process.env.PAYMENT_PROVIDER === "mock") {
      const mockRole = req.headers.get("x-mock-role") === "investor" ? "investor" : "founder";
      const mockAmount = mockRole === "investor" ? 310 : 240;
      return NextResponse.json({
        mock: true,
        orderId: `mock_order_${Date.now()}`,
        amount: mockAmount * 100, // Razorpay uses paise
        currency: "INR",
        keyId: "rzp_test_mock",
        userName: "Member",
        userEmail: "member@bylldx.in",
      });
    }
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!keyId || !keySecret) {
    // Return mock order for preview/development
    const mockAmount = req.headers.get("x-mock-role") === "investor" ? 310 : 240;
    return NextResponse.json({
      mock: true,
      orderId: `mock_order_${Date.now()}`,
      amount: mockAmount * 100, // Razorpay uses paise
      currency: "INR",
      keyId: "rzp_test_mock",
      userName: user.email ?? "User",
      userEmail: user.email ?? "",
    });
  }

  // 3. Get user role to determine price
  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (userError || !userRecord) {
    return NextResponse.json({ error: "User record not found" }, { status: 404 });
  }

  const amountInr = userRecord.role === "investor" ? 310 : 240;
  const amountPaise = amountInr * 100;

  // 4. Check for existing active subscription
  const now = new Date().toISOString();
  const { data: activeSub } = await supabase
    .from("subscriptions")
    .select("ends_at")
    .eq("user_id", user.id)
    .eq("tier", "premium")
    .gt("ends_at", now)
    .single();

  if (activeSub) {
    return NextResponse.json(
      { error: `You already have an active Premium subscription until ${new Date(activeSub.ends_at).toLocaleDateString("en-IN")}` },
      { status: 409 }
    );
  }

  // Dynamic import of razorpay
  let Razorpay: any;
  try {
    const mod = await import("razorpay");
    Razorpay = mod.default ?? mod;
  } catch {
    return NextResponse.json({ error: "Payment provider not installed. Run: npm install razorpay" }, { status: 500 });
  }

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const idempotencyKey = `bylldx_${user.id}_${Date.now()}`;

  let order: { id: string; amount: number; currency: string };
  try {
    order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: idempotencyKey,
      notes: {
        user_id: user.id,
        role: userRecord.role,
        platform: "BYLLD X",
      },
    }) as { id: string; amount: number; currency: string };
  } catch (e) {
    console.error("Razorpay order creation failed:", e);
    return NextResponse.json({ error: "Could not create payment order. Try again." }, { status: 500 });
  }

  // 6. Store pending payment record
  await supabase.rpc("insert_payment", {
    p_user_id: user.id,
    p_provider: "razorpay",
    p_provider_payment_id: order.id,
    p_amount_inr: amountInr,
    p_idempotency_key: idempotencyKey,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId,
    userName: profile?.full_name ?? user.email ?? "User",
    userEmail: user.email ?? "",
  });
}
