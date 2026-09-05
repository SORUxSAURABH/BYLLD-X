import { NextResponse } from "next/server";
import { adminStore } from "../../../lib/adminStore";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    broadcast: adminStore.broadcast?.active ? adminStore.broadcast : null,
  });
}
