import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type NetworkRow = {
  peerId: string;
  requestId?: string;
};

function initialsFor(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BX";
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [connectionsResult, requestsResult] = await Promise.all([
    supabase
      .from("connections")
      .select("user_low_id, user_high_id")
      .or(`user_low_id.eq.${user.id},user_high_id.eq.${user.id}`)
      .is("disconnected_at", null),
    supabase
      .from("connection_requests")
      .select("id, sender_id, receiver_id, created_at")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  if (connectionsResult.error || requestsResult.error) {
    return NextResponse.json({ error: connectionsResult.error?.message || requestsResult.error?.message }, { status: 500 });
  }

  const connected: NetworkRow[] = (connectionsResult.data ?? []).map((connection) => ({
    peerId: connection.user_low_id === user.id ? connection.user_high_id : connection.user_low_id,
  }));
  const received: NetworkRow[] = (requestsResult.data ?? [])
    .filter((request) => request.receiver_id === user.id)
    .map((request) => ({ peerId: request.sender_id, requestId: request.id }));
  const sent: NetworkRow[] = (requestsResult.data ?? [])
    .filter((request) => request.sender_id === user.id)
    .map((request) => ({ peerId: request.receiver_id, requestId: request.id }));

  const peerIds = Array.from(new Set([...connected, ...received, ...sent].map((row) => row.peerId)));
  const { data: profiles, error: profilesError } = peerIds.length
    ? await supabase.from("profiles").select("user_id, full_name, headline, bio, location").in("user_id", peerIds)
    : { data: [], error: null };
  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
  const serialize = (rows: NetworkRow[]) => rows.flatMap((row) => {
    const profile = profileMap.get(row.peerId);
    if (!profile) return [];
    return [[
      initialsFor(profile.full_name),
      profile.full_name,
      profile.headline || "BYLLD X member",
      profile.location || "India",
      profile.bio || "Registered BYLLD X profile",
      "",
      row.peerId,
      row.requestId || "",
    ]];
  });

  return NextResponse.json({
    connected: serialize(connected),
    received: serialize(received),
    sent: serialize(sent),
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let receiverId = "";
  try {
    const body = await req.json();
    receiverId = typeof body.receiverId === "string" ? body.receiverId : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!receiverId) {
    return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("send_connection_request", { p_receiver_id: receiverId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, requestId: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let requestId = "";
  let action = "";
  try {
    const body = await req.json();
    requestId = typeof body.requestId === "string" ? body.requestId : "";
    action = typeof body.action === "string" ? body.action : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!requestId || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "A valid request and action are required" }, { status: 400 });
  }

  const { error } = await supabase.rpc("respond_connection_request", {
    p_request_id: requestId,
    p_accept: action === "accept",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
