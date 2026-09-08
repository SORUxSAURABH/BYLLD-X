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
  isPremium = false,
}: {
  role: Role;
  authUser: AuthUser | null;
  connectedPeers?: string[][];
  isPremium?: boolean;
}) {
  const searchParams = useSearchParams();
  const targetPeer = searchParams.get("peer");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"messages" | "notifications">("messages");

  /* ── Load conversations directly from Supabase ── */
  useEffect(() => {
    if (!authUser) {
      setConversations([]);
      setSelected(null);
      setLoading(false);
      return;
    }

    const loadConversations = () => {
      fetch("/api/conversations")
        .then((r) => r.json())
        .then(({ conversations: convs }) => {
          const list: Conversation[] = convs ?? [];
          setConversations(list);
          if (list.length > 0) {
            setSelected((prev) => {
              if (prev) {
                const match = list.find((c) => c.conversationId === prev.conversationId);
                if (match) return match;
              }
              if (targetPeer) {
                const found = list.find((c) => c.peerName.toLowerCase() === targetPeer.toLowerCase());
                return found ?? list[0];
              }
              return list[0];
            });
          } else {
            setSelected(null);
          }
          setLoading(false);
        })
        .catch(() => {
          setConversations([]);
          setSelected(null);
          setLoading(false);
        });
    };

    loadConversations();
  }, [authUser, role, connectedPeers, targetPeer]);

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

  const canMessage = Boolean(authUser?.isPremium || isPremium);

  /* ── No auth / loading ── */
  if (loading) {
    return <div style={{ padding: 40, color: "var(--muted)", fontSize: 13 }}>Loading inbox…</div>;
  }

  /* ── Empty state (no connections yet) ── */
  if (conversations.length === 0) {
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
              isPremium={canMessage}
              peerName={selected.peerName}
              peerInitials={selected.peerInitials}
              peerOnline={selected.peerOnline}
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
