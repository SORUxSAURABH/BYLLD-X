import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

/**
 * Sign-out route — clears the Supabase session cookie and redirects home.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const origin = request.nextUrl?.origin || process.env.NEXT_PUBLIC_SITE_URL || "https://bylldx.in";
  return NextResponse.redirect(new URL("/", origin));
}
