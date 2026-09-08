import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { detectContactInfo } from "../../../../lib/contactFilter";

/**
 * POST /api/messages/send
 *
 * Server-side message insertion that enforces:
 *  1. Authenticated session
 *  2. Active connection between sender and receiver
 *  3. Sender has Premium subscription
 *  4. No block in either direction
 *  5. Message body length 1–5000 chars
 *  6. No direct contact details (phone, email, socials) to prevent platform disintermediation
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // 1. Verify session
  const { data: { user }, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 2. Parse body
  let conversationId: string, body: string;
  try {
    const json = await req.json();
    conversationId = json.conversationId;
    body = String(json.body ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!conversationId || !body || body.length > 5000) {
    return NextResponse.json({ error: "conversationId and body (1–5000 chars) are required" }, { status: 400 });
  }

  // Enforce privacy: block direct phone numbers, email addresses, and social handles
  const contactCheck = detectContactInfo(body);
  if (contactCheck.hasContactInfo) {
    return NextResponse.json(
      { error: contactCheck.reason || "Sharing external contact details (phone numbers, emails, social handles) is strictly prohibited. Please continue your conversation inside BYLLD X." },
      { status: 400 }
    );
  }

  // 3. Check conversation exists and sender is a participant
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("id, connection_id, connections!inner(user_low_id, user_high_id, disconnected_at)")
    .eq("id", conversationId)
    .single();

  if (convError || !conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const rawConn = (conv as unknown as { connections: { user_low_id: string; user_high_id: string; disconnected_at: string | null } | { user_low_id: string; user_high_id: string; disconnected_at: string | null }[] }).connections;
  const conn = Array.isArray(rawConn) ? rawConn[0] : rawConn;
  if (!conn) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }
  const isParticipant = conn.user_low_id === user.id || conn.user_high_id === user.id;
  if (!isParticipant) {
    return NextResponse.json({ error: "Not a participant in this conversation" }, { status: 403 });
  }
  if (conn.disconnected_at) {
    return NextResponse.json({ error: "Connection is no longer active" }, { status: 403 });
  }

  // 4. Verify Premium subscription (sender must have active premium)
  const now = new Date().toISOString();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("tier", "premium")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "Premium subscription required to send messages" }, { status: 403 });
  }

  // 5. Check for blocks
  const peerId = conn.user_low_id === user.id ? conn.user_high_id : conn.user_low_id;
  const { count: blockCount } = await supabase
    .from("blocks")
    .select("blocker_id", { count: "exact", head: true })
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${peerId}),and(blocker_id.eq.${peerId},blocked_id.eq.${user.id})`);

  if ((blockCount ?? 0) > 0) {
    return NextResponse.json({ error: "Cannot send messages to this user" }, { status: 403 });
  }

  // 6. Insert message using service-role via RPC (bypasses row-level revoke)
  // We use the server-side client which has the session, but since INSERT is revoked
  // for `authenticated` on messages, we call an RPC function that runs as SECURITY DEFINER.
  // For now, we use the Supabase service-role key if available (server-side only).
  const { error: insertError } = await supabase.rpc("insert_message", {
    p_conversation_id: conversationId,
    p_sender_id: user.id,
    p_body: body,
  });

  if (insertError) {
    console.error("Message insert error:", insertError);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
