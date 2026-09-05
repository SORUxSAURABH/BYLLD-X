"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import RealtimeChat from "./RealtimeChat";
import type { AuthUser } from "../../lib/hooks/useAuth";
import { createClient } from "../../lib/supabase/browser";
import { hasSupabaseConfig } from "../../lib/supabase/config";

type Role = "founder" | "investor";

interface Conversation {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerInitials: string;
  peerOnline: boolean;
  photoUrl: string | null;
  lastMessage: string | null;
  lastMessageMine: boolean;
  updatedAt: string;
}

function Avatar({ initials, photoUrl, tone = 0 }: { initials: string; photoUrl?: string | null; tone?: number }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={initials}
        style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return <div className={`avatar tone-${tone % 3}`}>{initials}</div>;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;
  if (diffH < 24) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function InboxView({
  role,
  authUser,
  connectedPeers = [],
}: {
  role: Role;
  authUser: AuthUser | null;
  connectedPeers?: string[][];
}) {
  const searchParams = useSearchParams();
  const targetPeer = searchParams.get("peer");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"messages" | "notifications">("messages");

  /* ── Load conversations ── */
  useEffect(() => {
    // Build conversations from connected peers
    let peers = connectedPeers;
    if (peers.length === 0 && typeof window !== "undefined") {
      const stored = localStorage.getItem(`bylldx_${role}_connected`);
      if (stored) {
        try {
          peers = JSON.parse(stored);
        } catch {}
      }
    }

    const peerConvs: Conversation[] = peers.map((p) => {
      const convId = `conv-${p[1].toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      let lastMsg = "Connected! Start a conversation.";
      let lastMsgMine = false;
      let updatedAt = new Date().toISOString();
      if (typeof window !== "undefined") {
        const history = localStorage.getItem(`bylldx_chat_${convId}`);
        if (history) {
          try {
            const msgs = JSON.parse(history);
            if (msgs.length > 0) {
              const latest = msgs[msgs.length - 1];
              lastMsg = latest.body;
              lastMsgMine = latest.sender_id === (authUser?.id ?? "self");
              updatedAt = latest.created_at;
            }
          } catch {}
        }
      }
      return {
        conversationId: convId,
        peerId: `peer-${p[1].toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        peerName: p[1],
        peerInitials: p[0],
        peerOnline: false,
        photoUrl: null,
        lastMessage: lastMsg,
        lastMessageMine: lastMsgMine,
        updatedAt,
      };
    });

    if (!authUser) {
      setConversations(peerConvs);
      if (peerConvs.length > 0) {
        if (targetPeer) {
          const found = peerConvs.find((c) => c.peerName.toLowerCase() === targetPeer.toLowerCase());
          setSelected(found ?? peerConvs[0]);
        } else {
          setSelected(peerConvs[0]);
        }
      }
      setLoading(false);
      return;
    }

    fetch("/api/conversations")
      .then((r) => r.json())
      .then(({ conversations: convs }) => {
        const dbList: Conversation[] = convs ?? [];
        const merged = [...dbList];
        for (const pc of peerConvs) {
          if (!merged.some((m) => m.peerName.toLowerCase() === pc.peerName.toLowerCase())) {
            merged.push(pc);
          }
        }
        setConversations(merged);
        if (merged.length > 0) {
          if (targetPeer) {
            const found = merged.find((c) => c.peerName.toLowerCase() === targetPeer.toLowerCase());
            setSelected(found ?? merged[0]);
          } else {
            setSelected(merged[0]);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setConversations(peerConvs);
        if (peerConvs.length > 0) {
          setSelected(peerConvs[0]);
        }
        setLoading(false);
      });
  }, [authUser, connectedPeers, targetPeer, role]);

  /* ── Subscribe to real-time presence changes for real users ── */
  useEffect(() => {
    if (!authUser || !hasSupabaseConfig()) return;
    const supabase = createClient();

    const channel = supabase
      .channel("presence_sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presence",
        },
        (payload) => {
          const row = payload.new as { user_id?: string; is_online?: boolean; last_seen_at?: string } | undefined;
          if (!row?.user_id) return;
          const isOnlineNow = Boolean(
            row.is_online &&
            row.last_seen_at &&
            Date.now() - new Date(row.last_seen_at).getTime() < 90000
          );
          setConversations((prev) =>
            prev.map((c) => (c.peerId === row.user_id ? { ...c, peerOnline: isOnlineNow } : c))
          );
          setSelected((prev) =>
            prev && prev.peerId === row.user_id ? { ...prev, peerOnline: isOnlineNow } : prev
          );
        }
      )
      .subscribe();

    // Re-verify presence status every 30s in case last_seen_at went stale
    const interval = setInterval(() => {
      fetch("/api/conversations")
        .then((r) => r.json())
        .then(({ conversations: convs }) => {
          if (!convs) return;
          setConversations((prev) =>
            prev.map((c) => {
              const match = convs.find((item: Conversation) => item.conversationId === c.conversationId);
              return match ? { ...c, peerOnline: match.peerOnline } : c;
            })
          );
          setSelected((prev) => {
            if (!prev) return prev;
            const match = convs.find((item: Conversation) => item.conversationId === prev.conversationId);
            return match ? { ...prev, peerOnline: match.peerOnline } : prev;
          });
        })
        .catch(() => {});
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [authUser]);

  const isPremium = authUser?.isPremium ?? role === "investor";

  /* ── No auth / loading ── */
  if (loading) {
    return <div style={{ padding: 40, color: "var(--muted)", fontSize: 13 }}>Loading inbox…</div>;
  }

  /* ── Empty state (no connections yet) ── */
  if (!authUser || conversations.length === 0) {
    return (
      <>
        <div className="app-welcome">
          <div>
            <span className="eyebrow">My Inbox</span>
            <h2>Focused conversations</h2>
            <p>Only mutual connections receive a conversation thread.</p>
          </div>
        </div>
        <div className="tabs">
          <button className="active" onClick={() => setActiveTab("messages")}>Messages · 0</button>
          <button onClick={() => setActiveTab("notifications")}>Notifications</button>
        </div>
        <section className="panel glass" style={{ padding: 40, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>
            No conversations yet. Accept a connection request to start messaging.
          </p>
          <Link className="button button-small" href={`/dashboard?role=${role}&view=network`}>
            View connection requests →
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="app-welcome">
        <div>
          <span className="eyebrow">My Inbox</span>
          <h2>Focused conversations</h2>
          <p>Only mutual connections receive a conversation.</p>
        </div>
      </div>

      <div className="tabs">
        <button
          className={activeTab === "messages" ? "active" : ""}
          onClick={() => setActiveTab("messages")}
        >
          Messages · {conversations.length}
        </button>
        <button
          className={activeTab === "notifications" ? "active" : ""}
          onClick={() => setActiveTab("notifications")}
        >
          Notifications
        </button>
      </div>

      {activeTab === "notifications" ? (
        <section className="panel glass" style={{ padding: 32, textAlign: "center" }}>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No new notifications.</p>
        </section>
      ) : (
        <section className="inbox-layout glass">
          {/* Conversation list */}
          <aside className="conversation-list">
            {conversations.map((conv, i) => (
              <div
                key={conv.conversationId}
                className={`conversation${selected?.conversationId === conv.conversationId ? " active" : ""}`}
                onClick={() => setSelected(conv)}
                style={{ cursor: "pointer" }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar initials={conv.peerInitials} photoUrl={conv.photoUrl} tone={i} />
                  {conv.peerOnline && (
                    <span style={{
                      position: "absolute", bottom: 0, right: 0,
                      width: 9, height: 9, borderRadius: "50%",
                      background: "#22c55e", border: "2px solid var(--surface, #08102b)",
                    }} />
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 13 }}>{conv.peerName}</strong>
                  <small style={{
                    display: "block", overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", color: "var(--muted)", fontSize: 11,
                  }}>
                    {conv.lastMessage
                      ? `${conv.lastMessageMine ? "You: " : ""}${conv.lastMessage}`
                      : "Connection accepted"}
                  </small>
                </div>
                {conv.updatedAt && (
                  <small style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>
                    {formatTime(conv.updatedAt)}
                  </small>
                )}
              </div>
            ))}
          </aside>

          {/* Chat panel */}
          {selected ? (
            <RealtimeChat
              conversationId={selected.conversationId}
              currentUserId={authUser?.id ?? null}
              isPremium={isPremium}
              peerName={selected.peerName}
              peerInitials={selected.peerInitials}
              peerOnline={selected.peerOnline}
              peerId={selected.peerId}
            />
          ) : (
            <div className="chat" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ color: "var(--muted)", fontSize: 13 }}>Select a conversation</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
