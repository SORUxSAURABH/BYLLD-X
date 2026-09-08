"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "../../lib/supabase/browser";
import { hasSupabaseConfig } from "../../lib/supabase/config";
import { detectContactInfo } from "../../lib/contactFilter";

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface ChatProps {
  conversationId: string | null;
  currentUserId: string | null;
  isPremium: boolean;
  peerName: string;
  peerInitials: string;
  peerOnline?: boolean;
}

const supabaseReady = hasSupabaseConfig();

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function RealtimeChat({
  conversationId,
  currentUserId,
  isPremium,
  peerName,
  peerInitials,
  peerOnline = false,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(peerOnline);
  const [chatError, setChatError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Keep online state in sync with peerOnline prop ── */
  useEffect(() => {
    setOnline(peerOnline);
  }, [peerOnline]);

  /* ── Scroll to bottom on new messages ── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Load initial messages + subscribe to real-time updates ── */
  useEffect(() => {
    if (!currentUserId || !supabaseReady || !conversationId) {
      setMessages([]);
      return;
    }

    const supabase = createClient();

    // Fetch existing messages
    supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          setChatError("Could not load messages.");
        } else {
          setMessages((data as Message[]) ?? []);
        }
      });

    // Real-time subscription for new messages
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  /* ── Send a message ── */
  const sendMessage = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending || !isPremium) return;

    setSending(true);
    setChatError("");

    // Enforce privacy: block phone numbers, emails, and external social media links
    const contactCheck = detectContactInfo(body);
    if (contactCheck.hasContactInfo) {
      setChatError(contactCheck.reason || "Sharing external contact details (phone, email, socials) is not permitted. Please keep communications on BYLLD X.");
      setSending(false);
      return;
    }

    if (!currentUserId) {
      setChatError("Please sign in to send messages.");
      setSending(false);
      return;
    }

    if (!supabaseReady || !conversationId) {
      setChatError("Messaging is unavailable until Supabase is configured.");
      setSending(false);
      return;
    }

    // Real DB mode — send through server action
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, body }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setChatError(json.error ?? "Failed to send message.");
      } else {
        setDraft("");
        inputRef.current?.focus();
      }
    } catch {
      setChatError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }, [draft, sending, isPremium, conversationId, currentUserId]);

  /* ── Enter key to send ── */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  /* ── Render ── */
  return (
    <div className="chat" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Chat header */}
      <header className="chat-head">
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div className="avatar tone-0">{peerInitials}</div>
          {online && (
            <span
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#22c55e",
                border: "2px solid var(--surface, #08102b)",
              }}
            />
          )}
        </div>
        <div>
          <strong>{peerName}</strong>
          <span className="online" style={{ color: online ? "#22c55e" : "#94a3b8" }}>
            {online ? "● Online now" : "○ Offline"}
          </span>
        </div>
      </header>

      {/* Safety & Contact Privacy Banner */}
      <div
        style={{
          padding: "7px 14px",
          background: "rgba(12, 85, 237, 0.07)",
          borderBottom: "1px solid rgba(12, 85, 237, 0.12)",
          fontSize: 11,
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          textAlign: "center",
        }}
      >
        <span>🔒 Contact details are kept private. Conversations must remain inside BYLLD X.</span>
      </div>

      {/* Messages */}
      <div
        className="messages"
        style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`message${isMine ? " mine" : ""}`}
              style={{
                alignSelf: isMine ? "flex-end" : "flex-start",
                maxWidth: "72%",
                background: isMine ? "var(--accent, #0c55ed)" : "rgba(255,255,255,0.07)",
                color: isMine ? "#fff" : "inherit",
                borderRadius: isMine ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                padding: "9px 13px",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {msg.body}
              <small style={{ display: "block", opacity: 0.6, fontSize: 10, marginTop: 4, textAlign: isMine ? "right" : "left" }}>
                {formatTime(msg.created_at)}
              </small>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Error feedback */}
      {chatError && (
        <p style={{ color: "#e53935", fontSize: 12, padding: "4px 16px", margin: 0 }}>{chatError}</p>
      )}

      {/* Input area */}
      {isPremium ? (
        <div
          className="chat-input-row"
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 14px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <input
            ref={inputRef}
            id="chat-message-input"
            className="app-search"
            style={{ flex: 1, margin: 0 }}
            type="text"
            placeholder="Write a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            maxLength={5000}
            autoComplete="off"
          />
          <button
            id="btn-send-message"
            className="button button-small"
            onClick={sendMessage}
            disabled={!draft.trim() || sending}
            style={{ flexShrink: 0 }}
          >
            {sending ? "…" : "Send →"}
          </button>
        </div>
      ) : (
        <div
          className="chat-lock"
          style={{
            padding: "14px 16px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(12,85,237,0.06)",
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            <b>Upgrade to Premium to message connections</b>
          </p>
          <a href="?view=subscription" className="button button-small">
            Upgrade to Premium →
          </a>
        </div>
      )}
    </div>
  );
}
