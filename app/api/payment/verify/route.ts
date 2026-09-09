import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/payment/verify
 * Verifies the checkout signature. Entitlement activation is performed only by
 * the independently signed Razorpay webhook.
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
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

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

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "razorpay")
    .eq("provider_payment_id", razorpay_order_id)
    .maybeSingle();
  if (paymentError) {
    console.error("Payment lookup failed:", paymentError.message);
    return NextResponse.json({ error: "Could not verify the payment order" }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ error: "Payment order was not found for this account" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    verified: true,
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    fulfillment: "pending_webhook",
  });
}
