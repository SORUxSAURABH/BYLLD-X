import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/payment/verify
 * Verifies Razorpay payment signature and activates 30-day Premium membership.
 */
export async function POST(req: NextRequest) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return NextResponse.json({ error: "Razorpay secret key not configured" }, { status: 500 });
  }

  let body: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    role?: "founder" | "investor";
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, role } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json(
      { error: "Missing required payment verification parameters" },
      { status: 400 }
    );
  }

  // 1. Verify HMAC-SHA256 signature
  const text = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(text)
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(razorpay_signature, "utf8");

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // 2. Identify authenticated user
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
  }

  const amountInr = role === "investor" ? 310 : 240;
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const invoiceNumber = `BYLLD-${Math.floor(100000 + Math.random() * 900000)}`;

  // 3. Upsert 30-day Premium subscription in Supabase
  try {
    await supabase.from("subscriptions").upsert(
      {
        user_id: user.id,
        tier: "premium",
        starts_at: now.toISOString(),
        ends_at: thirtyDaysLater.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Record in payments table
    await supabase.from("payments").insert({
      user_id: user.id,
      amount_inr: amountInr,
      provider: "razorpay",
      provider_payment_id: razorpay_payment_id,
      status: "successful",
      paid_at: now.toISOString(),
    });
  } catch (dbError) {
    console.warn("Database subscription update notice:", dbError);
  }

  return NextResponse.json({
    success: true,
    verified: true,
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    invoiceNumber,
    startsAt: now.toISOString(),
    endsAt: thirtyDaysLater.toISOString(),
    role: role ?? "founder",
  });
}
