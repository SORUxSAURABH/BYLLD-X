import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "../../../../lib/supabase/admin";

/**
 * POST /api/payment/webhook
 *
 * Receives Razorpay webhook events. Verifies the HMAC-SHA256 signature
 * using RAZORPAY_WEBHOOK_SECRET, then activates the user's subscription.
 *
 * Setup in Razorpay Dashboard → Webhooks:
 *   URL: https://<your-domain>/api/payment/webhook
 *   Events: payment.captured
 *   Secret: set RAZORPAY_WEBHOOK_SECRET in .env.local
 */
export async function POST(req: NextRequest) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET;
  const rawBody = await req.text();

  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  // 1. Always verify the raw payload before parsing or performing any writes.
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (
    receivedBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parse event
  let event: {
    event: string;
    payload: {
      payment: {
        entity: {
          id: string;
          order_id: string;
          amount: number;
          status: string;
        };
      };
    };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 3. Handle payment.captured
  if (event.event === "payment.captured") {
    const payment = event.payload.payment.entity;
    if (!payment?.id || !payment.order_id || payment.status !== "captured") {
      return NextResponse.json({ error: "Invalid captured payment" }, { status: 400 });
    }

    const amountInr = Math.round(payment.amount / 100);
    if (amountInr !== 240 && amountInr !== 310) {
      return NextResponse.json({ error: "Unexpected amount" }, { status: 400 });
    }

    let supabase;
    try {
      supabase = createAdminClient();
    } catch {
      return NextResponse.json({ error: "Webhook fulfillment is not configured" }, { status: 503 });
    }

    // The signed order ID is resolved to the pending DB payment. User identity and
    // price are never taken from mutable Razorpay notes.
    const { error } = await supabase.rpc("complete_razorpay_payment", {
      p_order_id: payment.order_id,
      p_payment_id: payment.id,
      p_amount_inr: amountInr,
    });
    if (error) {
      console.error("Razorpay webhook fulfillment failed:", error.message);
      return NextResponse.json({ error: "Could not fulfill payment" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
