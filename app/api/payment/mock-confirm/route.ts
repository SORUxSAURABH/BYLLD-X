import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Mock checkout is disabled in production" }, { status: 404 });
  }

  let body: { role?: string; orderId?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json({ error: "Mock checkout is disabled when Razorpay is configured" }, { status: 403 });
  }

  if (!body.orderId?.startsWith("mock_order_")) {
    return NextResponse.json({ error: "Invalid mock order" }, { status: 400 });
  }

  const { data: account } = user
    ? await supabase.from("users").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const role = account?.role === "investor" || (!user && body.role === "investor") ? "investor" : "founder";
  const amountInr = role === "investor" ? 310 : 240;
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + 30);
  const invoiceNumber = `BYLLD-${Date.now().toString().slice(-6)}`;

  // Mock access is intentionally device-local. Production Premium remains backed
  // exclusively by a verified payment and subscription record.
  return NextResponse.json({
    success: true,
    mock: true,
    activated: true,
    role,
    amountInr,
    invoiceNumber,
    startsAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
  });
}
