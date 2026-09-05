import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { getPublicOrigin } from "../../../../lib/origin";

/**
 * Sign-out route — clears the Supabase session cookie and redirects home.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const origin = getPublicOrigin(request);
  return NextResponse.redirect(new URL("/", origin));
}
