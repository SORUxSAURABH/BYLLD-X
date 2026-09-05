import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

/**
 * GET /api/conversations
 * Returns all conversations for the signed-in user, with peer profile info and last message preview.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Load all conversations the user participates in via their connections
  const { data: convs, error } = await supabase
    .from("conversations")
    .select(`
      id,
      connection_id,
      created_at,
      connections!inner (
        id,
        user_low_id,
        user_high_id,
        disconnected_at
      )
    `)
    .or(
      `connections.user_low_id.eq.${user.id},connections.user_high_id.eq.${user.id}`
    )
    .is("connections.disconnected_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!convs || convs.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  // For each conversation, get peer's profile + last message
  const enriched = await Promise.all(
    convs.map(async (rawConv) => {
      const conv = rawConv as unknown as {
        id: string;
        connection_id: string;
        created_at: string;
        connections: { user_low_id: string; user_high_id: string; disconnected_at: string | null } | { user_low_id: string; user_high_id: string; disconnected_at: string | null }[];
      };
      const conn = Array.isArray(conv.connections) ? conv.connections[0] : conv.connections;
      if (!conn) return null;
      const peerId = conn.user_low_id === user.id ? conn.user_high_id : conn.user_low_id;

      // Peer profile
      const { data: peer } = await supabase
        .from("profiles")
        .select("full_name, photo_path, completion_percent")
        .eq("user_id", peerId)
        .single();

      // Last message preview
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("body, sender_id, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Peer online status (verified online only if is_online is true AND heartbeated within 90 seconds)
      const { data: presence } = await supabase
        .from("presence")
        .select("is_online, last_seen_at")
        .eq("user_id", peerId)
        .single();

      const isOnlineNow = Boolean(
        presence?.is_online &&
        presence?.last_seen_at &&
        Date.now() - new Date(presence.last_seen_at).getTime() < 90000
      );

      // Build initials from name
      const name = peer?.full_name ?? "Member";
      const initials = name.split(" ").filter(Boolean).slice(0, 2).map((w: string) => w[0].toUpperCase()).join("");

      // Photo URL
      let photoUrl: string | null = null;
      if (peer?.photo_path) {
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(peer.photo_path);
        photoUrl = urlData?.publicUrl ?? null;
      }

      return {
        conversationId: conv.id,
        peerId,
        peerName: name,
        peerInitials: initials,
        peerOnline: isOnlineNow,
        photoUrl,
        lastMessage: lastMsg?.body ?? null,
        lastMessageMine: lastMsg?.sender_id === user.id,
        updatedAt: lastMsg?.created_at ?? conv.created_at,
      };
    })
  );

  return NextResponse.json({ conversations: enriched.filter((c): c is NonNullable<typeof c> => c !== null) });
}
