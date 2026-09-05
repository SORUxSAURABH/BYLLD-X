"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createClient } from "../../lib/supabase/browser";
import { hasSupabaseConfig } from "../../lib/supabase/config";

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
  peerId?: string;
}

const supabaseReady = hasSupabaseConfig();

// Mock messages for preview mode (no Supabase configured)
const MOCK_MESSAGES: Message[] = [
  {
    id: "m1",
    sender_id: "peer",
    body: "Thanks for connecting. I reviewed the public overview and would love to understand the current pilot.",
    created_at: new Date(Date.now() - 90 * 60000).toISOString(),
  },
  {
    id: "m2",
    sender_id: "self",
    body: "Great to meet you. The pilot has been live across three sites for six weeks.",
    created_at: new Date(Date.now() - 83 * 60000).toISOString(),
  },
  {
    id: "m3",
    sender_id: "peer",
    body: "That is useful context. Could we set up a short call next Tuesday?",
    created_at: new Date(Date.now() - 62 * 60000).toISOString(),
  },
];

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
    if (!supabaseReady || !conversationId) {
      // Preview/mock mode — use hardcoded messages
      setMessages(MOCK_MESSAGES);
      setOnline(peerOnline);
      return;
    }

    if (conversationId.startsWith("conv-")) {
      // Peer conversation from accepted connections
      setOnline(peerOnline);
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(`bylldx_chat_${conversationId}`);
        if (saved) {
          try {
            setMessages(JSON.parse(saved));
            return;
          } catch {}
        }
      }
      const initial: Message[] = [
        {
          id: `${conversationId}-init-1`,
          sender_id: "peer",
          body: `Hi! Glad to connect on BYLLD X. I went through your profile overview and would love to hear more about what you're working on.`,
          created_at: new Date(Date.now() - 25 * 60000).toISOString(),
        },
      ];
      setMessages(initial);
      if (typeof window !== "undefined") {
        localStorage.setItem(`bylldx_chat_${conversationId}`, JSON.stringify(initial));
      }
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
  }, [conversationId]);

  /* ── Send a message ── */
  const sendMessage = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setChatError("");

    if (!supabaseReady || !conversationId || conversationId.startsWith("conv-")) {
      // Local/peer conversation — append locally, persist, and simulate reply
      const userMsg: Message = {
        id: `msg-${Date.now()}`,
        sender_id: currentUserId ?? "self",
        body,
        created_at: new Date().toISOString(),
      };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      if (typeof window !== "undefined") {
        localStorage.setItem(`bylldx_chat_${conversationId}`, JSON.stringify(nextMessages));
      }
      setDraft("");
      setSending(false);
      inputRef.current?.focus();

      // Simulate a realistic reply from peer
      setTimeout(() => {
        const replies = [
          `Thanks for the note! I've reviewed your profile and idea teaser. Let's set up a quick 15-minute call this week.`,
          `Great point! What does your current traction and customer retention look like?`,
          `Sounds very interesting. I'd love to review your full problem/solution deck. Could you share more details?`,
          `Thanks for reaching out! Let me review this with my partners and follow up shortly.`,
        ];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        const peerReply: Message = {
          id: `reply-${Date.now()}`,
          sender_id: "peer",
          body: reply,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => {
          const updated = [...prev, peerReply];
          if (typeof window !== "undefined") {
            localStorage.setItem(`bylldx_chat_${conversationId}`, JSON.stringify(updated));
          }
          return updated;
        });
      }, 1400);
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
  }, [draft, sending, conversationId, currentUserId, messages]);

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

      {/* Messages */}
      <div
        className="messages"
        style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        {messages.map((msg) => {
          const isMine = supabaseReady
            ? msg.sender_id === currentUserId
            : msg.sender_id === "self";
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
      {isPremium || (conversationId && conversationId.startsWith("conv-")) ? (
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
            <b>Read-only on Free.</b> Upgrade to Premium to send messages. Your conversation stays visible.
          </p>
          <a href="?view=subscription" className="button button-small">
            Upgrade to Premium →
          </a>
        </div>
      )}
    </div>
  );
}
