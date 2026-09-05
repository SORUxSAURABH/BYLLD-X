import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(req: NextRequest) {
  let body: { role?: string; orderId?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const role = body.role === "investor" ? "investor" : "founder";
  const amountInr = role === "investor" ? 310 : 240;
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + 30);
  const invoiceNumber = `BYLLD-${Date.now().toString().slice(-6)}`;

  if (user) {
    // 1. Activate subscription in Supabase
    try {
      await supabase.rpc("activate_subscription", {
        p_user_id: user.id,
        p_starts_at: now.toISOString(),
        p_ends_at: endsAt.toISOString(),
      });
    } catch {
      try {
        await supabase.from("subscriptions").insert({
          user_id: user.id,
          tier: "premium",
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
        });
      } catch (err) {
        console.error("Failed to insert subscription record:", err);
      }
    }

    // 2. Insert mock payment record
    try {
      await supabase.from("payments").insert({
        user_id: user.id,
        provider: "mock",
        provider_payment_id: body.orderId || `mock_pay_${Date.now()}`,
        amount_inr: amountInr,
        status: "successful",
      });
    } catch (err) {
      console.error("Failed to insert payment record:", err);
    }

    return NextResponse.json({
      success: true,
      activated: true,
      role,
      amountInr,
      invoiceNumber,
      startsAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
    });
  }

  // Preview mode (unauthenticated)
  return NextResponse.json({
    success: true,
    mock: true,
    role,
    amountInr,
    invoiceNumber,
    startsAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
  });
}
