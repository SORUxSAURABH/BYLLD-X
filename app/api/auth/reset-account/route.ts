import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/reset-account
 * Account deletion must never be triggered by a GET request. This legacy test
 * endpoint is intentionally disabled until a re-authenticated deletion flow is built.
 */
export async function GET() {
  return NextResponse.json({ error: "This endpoint is no longer available" }, { status: 410 });
}
