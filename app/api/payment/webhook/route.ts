import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "../../../../lib/supabase/server";

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
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const rawBody = await req.text();

  // 1. Verify signature if secret is configured
  if (webhookSecret) {
    const signature = req.headers.get("x-razorpay-signature") ?? "";
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      console.error("Razorpay webhook: invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
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
          notes: { user_id?: string };
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
    const userId = payment.notes?.user_id;
    if (!userId) {
      console.error("Webhook: missing user_id in payment notes");
      return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
    }

    const amountInr = Math.round(payment.amount / 100);
    if (amountInr !== 240 && amountInr !== 310) {
      console.error("Webhook: unexpected amount", amountInr);
      return NextResponse.json({ error: "Unexpected amount" }, { status: 400 });
    }

    // Use service-role client to write subscription and payment records
    const supabase = await createClient();

    // Mark payment as successful
    await supabase.rpc("confirm_payment", {
      p_provider_payment_id: payment.order_id,
      p_razorpay_payment_id: payment.id,
    });

    // Activate 30-day premium subscription
    const startsAt = new Date();
    const endsAt = new Date(startsAt);
    endsAt.setDate(endsAt.getDate() + 30);

    await supabase.rpc("activate_subscription", {
      p_user_id: userId,
      p_starts_at: startsAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
    });

    console.log(`✓ Subscription activated for user ${userId} until ${endsAt.toISOString()}`);
  }

  return NextResponse.json({ received: true });
}
