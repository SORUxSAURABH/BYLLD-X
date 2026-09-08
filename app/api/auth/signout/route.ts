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
  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.delete("bylld_role");
  return res;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const origin = getPublicOrigin(request);
  const res = NextResponse.redirect(new URL("/join", origin));
  res.cookies.delete("bylld_role");
  return res;
}
