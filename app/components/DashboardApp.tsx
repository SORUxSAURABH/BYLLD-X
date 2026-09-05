"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useAuth, type AuthUser } from "../../lib/hooks/useAuth";
import { usePresence } from "../../lib/hooks/usePresence";
import { createClient } from "../../lib/supabase/browser";
import { hasSupabaseConfig } from "../../lib/supabase/config";
import ProfileEditor from "./ProfileEditor";
import InboxView from "./InboxView";
import IdeasView from "./IdeasView";
import RazorpayCheckout from "./RazorpayCheckout";

type Role = "founder" | "investor";
type View = "overview" | "discover" | "ideas" | "network" | "inbox" | "subscription" | "profile";

const founders = [
  ["SM", "Sara Menon", "Climate systems founder", "Mumbai, India", "A carbon-aware treasury layer for fast-growing Indian businesses.", "₹2L–₹5L"],
  ["RV", "Rohan Verma", "Industrial robotics founder", "Pune, India", "Adaptive cobots that make advanced automation accessible to MSMEs.", "₹5L–₹10L"],
  ["AK", "Aisha Khan", "Healthtech founder", "Hyderabad, India", "Reliable diagnostics at the edge for clinics beyond major cities.", "₹50k–₹3L"],
  ["NM", "Nikhil Mehra", "Enterprise AI founder", "Bengaluru, India", "Secure, auditable copilots for regulated operations teams.", "₹4L–₹8L"],
  ["PD", "Pooja Desai", "Consumer care founder", "Ahmedabad, India", "A modern care network designed for India’s working families.", "₹80k–₹2.5L"],
  ["JT", "Jayant Taneja", "Agritech founder", "Jaipur, India", "Crop intelligence that works for small and marginal farms.", "₹20k–₹1L"],
];
const investors = [
  ["NK", "Neha Kapoor", "Early Stage Partner", "Mumbai, India", "Backing technical founders building cross-border infrastructure.", "₹2L–₹8L"],
  ["AS", "Ananya Shah", "Seed Investor", "Bengaluru, India", "Seed capital and operational depth for full-stack platforms in India.", "₹1L–₹5L"],
  ["RK", "Rajesh Kumar", "Growth Angel", "Delhi NCR, India", "Operator-led capital for founders with clear product-market pull.", "₹50k–₹2L"],
  ["VM", "Vikram Malhotra", "Micro VC Fund", "Chennai, India", "Early conviction in resilient software and deep technical moats.", "₹2.5L–₹10L"],
  ["SB", "Siddharth Bose", "Angel Syndicate", "Kolkata, India", "Founder-led syndicate for the next generation of consumer brands.", "₹50k–₹3L"],
  ["TP", "Tara Patel", "Venture Partner", "Ahmedabad, India", "Early-stage partnerships at the intersection of software and industry.", "₹1L–₹6L"],
];

const glyphs: Record<View, string> = { overview: "◫", discover: "⌕", ideas: "◇", network: "◎", inbox: "□", subscription: "✦", profile: "○" };

function Avatar({ initials, tone = 0 }: { initials: string; tone?: number }) { return <div className={`avatar tone-${tone % 3}`}>{initials}</div>; }

export default function DashboardApp() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Keep presence active when authenticated
  usePresence(user?.id ?? null);

  // Role: URL param takes precedence (allows switching/previewing roles), fallback to user DB role or founder default
  const urlRole = params.get("role");
  const role: Role = (urlRole === "investor" || urlRole === "founder")
    ? urlRole
    : (user?.role === "investor" ? "investor" : "founder");
  const view = (["overview","discover","ideas","network","inbox","subscription","profile"].includes(params.get("view") || "") ? params.get("view") : "overview") as View;
  const [saved, setSaved] = useState<string[]>(["Neha Kapoor"]);
  const [toast, setToast] = useState("");
  const base = `/dashboard?role=${role}`;
  const nav: [View,string][] = [
    ["overview","Dashboard"], ["discover", role === "founder" ? "Discover Investors" : "Recommended Founders"],
    ...(role === "founder" ? [["ideas","My Ideas"] as [View,string]] : []),
    ["network","Network"], ["inbox","My Inbox"], ["subscription","Subscription"], ["profile","Profile"]
  ];
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2500); };

  // Shared network state persisted across views (initialized with SSR-safe defaults)
  const [connectedList, setConnectedList] = useState<string[][]>(() =>
    role === "founder" ? investors.slice(0, 3) : founders.slice(0, 3)
  );
  const [receivedList, setReceivedList] = useState<string[][]>(() =>
    role === "founder" ? investors.slice(3, 5) : founders.slice(3, 5)
  );
  const [sentList, setSentList] = useState<string[][]>(() =>
    role === "founder" ? [investors[5]] : [founders[5]]
  );
  const [mockPremium, setMockPremium] = useState<boolean>(false);
  const [localName, setLocalName] = useState<string | null>(null);
  const [isForceFree, setIsForceFree] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);
  const [broadcast, setBroadcast] = useState<{ message: string; type: string } | null>(null);
  const [dismissedBroadcast, setDismissedBroadcast] = useState<boolean>(false);

  // Quick Search & Notification states
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const notifRef = useRef<HTMLDivElement>(null);
  const [notifOpen, setNotifOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState(() => [
    {
      id: "n1",
      title: role === "founder" ? "New Connection Request" : "New Investment Application",
      desc: role === "founder"
        ? "Neha Kapoor (Angel Partner) wants to connect with your startup."
        : "VoltFleet Energy submitted their pitch deck to your mandate.",
      time: "8m ago",
      read: false,
      view: "network" as View,
      icon: "🤝",
    },
    {
      id: "n2",
      title: "New Message in My Inbox",
      desc: role === "founder"
        ? "Rajesh Kumar: 'Reviewed your deck! When are you free for a demo?'"
        : "Sara Menon: 'Shared our updated Q2 revenue and cohort retention.'",
      time: "35m ago",
      read: false,
      view: "inbox" as View,
      icon: "💬",
    },
    {
      id: "n3",
      title: "Discovery Impression Pulse",
      desc: role === "founder"
        ? "Your startup showcase was recommended to 18 accredited investors."
        : "4 new verified seed-stage startups match your sector thesis.",
      time: "2h ago",
      read: false,
      view: "discover" as View,
      icon: "⚡",
    },
    {
      id: "n4",
      title: "Profile Privacy & Verified Badge",
      desc: role === "founder"
        ? "Your pitch deck encryption and NDA watermark are active."
        : "Your verified investor check credentials have been confirmed.",
      time: "1d ago",
      read: true,
      view: "profile" as View,
      icon: "🛡️",
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    notify("All notifications marked as read ✓");
  }

  function handleNotificationClick(item: (typeof notifications)[0]) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
    setNotifOpen(false);
    router.push(`${base}&view=${item.view}`);
  }

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [notifOpen]);

  // Secret admin shortcut listener (Ctrl+Shift+A or Cmd+Shift+A), Search shortcut (Cmd+K) & broadcast fetching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        router.push("/admin");
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    fetch("/api/broadcast")
      .then((r) => r.json())
      .then((d) => {
        if (d.broadcast) setBroadcast(d.broadcast);
      })
      .catch(() => {});

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  // Safely rehydrate client-persisted state on mount (prevents SSR hydration mismatch)
  useEffect(() => {
    setMounted(true);
    try {
      const storedConnected = localStorage.getItem(`bylldx_${role}_connected`);
      if (storedConnected) {
        setConnectedList(JSON.parse(storedConnected));
      } else {
        setConnectedList(role === "founder" ? investors.slice(0, 3) : founders.slice(0, 3));
      }

      const storedReceived = localStorage.getItem(`bylldx_${role}_received`);
      if (storedReceived) {
        setReceivedList(JSON.parse(storedReceived));
      } else {
        setReceivedList(role === "founder" ? investors.slice(3, 5) : founders.slice(3, 5));
      }

      const storedSent = localStorage.getItem(`bylldx_${role}_sent`);
      if (storedSent) {
        setSentList(JSON.parse(storedSent));
      } else {
        setSentList(role === "founder" ? [investors[5]] : [founders[5]]);
      }

      const storedPrem = localStorage.getItem("bylldx_mock_premium");
      const expiry = localStorage.getItem("bylldx_mock_premium_expiry");
      if (storedPrem === "true" && expiry && Number(expiry) > Date.now()) {
        setMockPremium(true);
      }

      const saved = localStorage.getItem(`bylld_profile_${role}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.full_name) setLocalName(parsed.full_name);
      } else {
        setLocalName(null);
      }
      setIsForceFree(!!localStorage.getItem("bylldx_force_free"));
    } catch {}
  }, [role]);

  function handleSendRequest(person: string[]) {
    if (sentList.some((p) => p[1] === person[1])) {
      notify(`Connection request to ${person[1]} is already pending`);
      return;
    }
    if (connectedList.some((p) => p[1] === person[1])) {
      notify(`You are already connected with ${person[1]}`);
      return;
    }
    const nextSent = [person, ...sentList];
    setSentList(nextSent);
    if (typeof window !== "undefined") {
      localStorage.setItem(`bylldx_${role}_sent`, JSON.stringify(nextSent));
    }
    notify(`Connection request sent to ${person[1]}! You can track it under Network → Sent.`);
  }

  function handleAcceptRequest(person: string[]) {
    const nextReceived = receivedList.filter((p) => p[1] !== person[1]);
    const nextConnected = [person, ...connectedList];
    setReceivedList(nextReceived);
    setConnectedList(nextConnected);
    if (typeof window !== "undefined") {
      localStorage.setItem(`bylldx_${role}_received`, JSON.stringify(nextReceived));
      localStorage.setItem(`bylldx_${role}_connected`, JSON.stringify(nextConnected));
    }
    notify(`Connected with ${person[1]}! Conversation thread is ready in My Inbox.`);
  }

  function handleDeclineRequest(name: string) {
    const nextReceived = receivedList.filter((p) => p[1] !== name);
    setReceivedList(nextReceived);
    if (typeof window !== "undefined") {
      localStorage.setItem(`bylldx_${role}_received`, JSON.stringify(nextReceived));
    }
    notify(`Declined request from ${name}`);
  }

  async function handleSignOut() {
    try {
      if (hasSupabaseConfig()) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
    } catch {}
    try {
      localStorage.removeItem("bylld_user_role");
      localStorage.removeItem("bylld_auth_user");
    } catch {}
    window.location.href = "/signin";
  }

  // Show a minimal loading shell until client mounted and auth resolves
  if (!mounted || authLoading) {
    return (
      <div className="app-body" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>Loading BYLLD X…</span>
      </div>
    );
  }

  const displayName = (user && user.role === role ? user.fullName : (localName || (role === "founder" ? "Arjun Mehta" : "Neha Kapoor")));
  const displayInitials = (user && user.role === role ? user.initials : null) ?? (displayName ? displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : (role === "founder" ? "AM" : "NK"));

  const isPremium = (user && user.role === role)
    ? user.isPremium
    : (mockPremium || (role === "investor" && !isForceFree));

  return <div className="app-body">
    <div className="app-frame">
      <aside className="app-sidebar">
        <Link href={base} className="wordmark">BYLLD <b>X</b></Link>
        <nav className="app-nav" aria-label={`${role} navigation`}>{nav.map(([id,label]) => <Link className={view===id?"active":""} href={`${base}&view=${id}`} key={id}><span className="nav-glyph">{glyphs[id]}</span>{label}</Link>)}</nav>
        <div className="app-sidebar-bottom">
          <div className="profile-chip">
            <Avatar initials={displayInitials}/>
            <div>
              <strong>{displayName}</strong>
              <small>{role === "founder" ? "Founder" : "Investor"} · {isPremium ? "Premium" : "Free"}</small>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              marginTop: 10,
              width: "100%",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#dc2626",
              borderRadius: 8,
              padding: "7px 12px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
            title="Log out of account"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <Link
              href="/admin"
              style={{ fontSize: 10, color: "var(--muted)", textDecoration: "none", opacity: 0.55 }}
              title="Master Console (Ctrl+Shift+A)"
            >
              BYLLD X · v1.0 🔒
            </Link>
          </div>
        </div>
      </aside>
      <main className="app-main">
        <header className="app-topbar">
          <h1>{nav.find(([id])=>id===view)?.[1]}</h1>
          <div className="app-topbar-actions">
            {/* Quick Search Button */}
            <button
              className="icon-button"
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Search directory (⌘K)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            {/* Notification Button with Interactive Dropdown */}
            <div style={{ position: "relative" }} ref={notifRef}>
              <button
                className="icon-button"
                aria-label="Notifications"
                onClick={() => setNotifOpen((prev) => !prev)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative",
                  background: notifOpen ? "rgba(12, 85, 237, 0.12)" : undefined,
                  borderColor: notifOpen ? "rgba(12, 85, 237, 0.35)" : undefined,
                  color: notifOpen ? "#0c55ed" : undefined,
                  transition: "all 0.15s ease",
                }}
                title="Notifications"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: 3,
                      right: 3,
                      minWidth: 15,
                      height: 15,
                      padding: "0 3px",
                      borderRadius: 10,
                      background: "#ef4444",
                      color: "#ffffff",
                      fontSize: 8,
                      fontWeight: 900,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid #ffffff",
                      boxShadow: "0 2px 5px rgba(239, 68, 68, 0.4)",
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Menu */}
              {notifOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    width: 330,
                    background: "rgba(255, 255, 255, 0.98)",
                    backdropFilter: "blur(20px)",
                    borderRadius: 16,
                    border: "1px solid rgba(8, 60, 145, 0.14)",
                    boxShadow: "0 14px 40px rgba(6, 20, 61, 0.18)",
                    zIndex: 1200,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      borderBottom: "1px solid rgba(8, 60, 145, 0.08)",
                      background: "rgba(248, 251, 255, 0.85)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <strong style={{ fontSize: 13, color: "var(--navy)" }}>Notifications</strong>
                      {unreadCount > 0 && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: 6,
                            background: "#eef4ff",
                            color: "#0c55ed",
                            border: "1px solid rgba(12, 85, 237, 0.2)",
                          }}
                        >
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        style={{
                          background: "none",
                          border: "none",
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#0c55ed",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: 350, overflowY: "auto", padding: "6px" }}>
                    {notifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          cursor: "pointer",
                          marginBottom: 4,
                          background: item.read ? "transparent" : "rgba(12, 85, 237, 0.04)",
                          border: item.read ? "1px solid transparent" : "1px solid rgba(12, 85, 237, 0.12)",
                          transition: "background 0.15s ease",
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                        }}
                      >
                        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>{item.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <strong style={{ fontSize: 11, color: "var(--navy)", fontWeight: item.read ? 600 : 800 }}>
                              {item.title}
                            </strong>
                            <small style={{ fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap" }}>{item.time}</small>
                          </div>
                          <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
                            {item.desc}
                          </p>
                        </div>
                        {!item.read && (
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#0c55ed",
                              marginTop: 6,
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      padding: "8px 14px",
                      textAlign: "center",
                      borderTop: "1px solid rgba(8, 60, 145, 0.08)",
                      background: "rgba(248, 251, 255, 0.8)",
                    }}
                  >
                    <small style={{ fontSize: 10, color: "var(--muted)" }}>
                      Activity synced across all connected members
                    </small>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleSignOut}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                color: "#dc2626",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.22)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Log out of BYLLD X"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Log out
            </button>
          </div>
        </header>
        <div className="app-content">
          {broadcast && !dismissedBroadcast && (
            <div
              style={{
                marginBottom: 16,
                padding: "11px 18px",
                borderRadius: 12,
                background:
                  broadcast.type === "success"
                    ? "rgba(16, 185, 129, 0.12)"
                    : broadcast.type === "warning"
                    ? "rgba(245, 158, 11, 0.12)"
                    : broadcast.type === "alert"
                    ? "rgba(244, 63, 94, 0.12)"
                    : "rgba(12, 85, 237, 0.12)",
                border:
                  broadcast.type === "success"
                    ? "1px solid rgba(16, 185, 129, 0.3)"
                    : broadcast.type === "warning"
                    ? "1px solid rgba(245, 158, 11, 0.3)"
                    : broadcast.type === "alert"
                    ? "1px solid rgba(244, 63, 94, 0.3)"
                    : "1px solid rgba(12, 85, 237, 0.25)",
                color: "var(--navy)",
                fontSize: 12,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              }}
            >
              <span>{broadcast.message}</span>
              <button
                onClick={() => setDismissedBroadcast(true)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 13,
                  color: "var(--muted)",
                  cursor: "pointer",
                  padding: "2px 6px",
                  fontWeight: 700,
                }}
                title="Dismiss banner"
              >
                ✕
              </button>
            </div>
          )}
          {view === "overview" && <Overview role={role} base={base} displayName={displayName} authUser={user} isPremium={isPremium}/>} 
          {view === "discover" && (
            <Discover
              role={role}
              saved={saved}
              setSaved={setSaved}
              notify={notify}
              sentList={sentList}
              connectedList={connectedList}
              onSendRequest={handleSendRequest}
            />
          )} 
          {view === "ideas" && <IdeasView authUser={user} notify={notify}/>} 
          {view === "network" && (
            <Network
              role={role}
              notify={notify}
              connectedList={connectedList}
              receivedList={receivedList}
              sentList={sentList}
              onAccept={handleAcceptRequest}
              onDecline={handleDeclineRequest}
            />
          )} 
          {view === "inbox" && <InboxView role={role} authUser={user} connectedPeers={connectedList} />} 
          {view === "subscription" && (
            <Subscription
              role={role}
              isPremium={isPremium}
              notify={notify}
              onUpgrade={() => {
                setMockPremium(true);
                notify("Premium activated! Enjoy unlimited access.");
              }}
              onResetFree={() => {
                if (typeof window !== "undefined") {
                  localStorage.removeItem("bylldx_mock_premium");
                  localStorage.removeItem("bylldx_mock_premium_expiry");
                  localStorage.setItem("bylldx_force_free", "true");
                }
                setMockPremium(false);
                notify("Switched to Free Tier for testing.");
              }}
            />
          )} 
          {view === "profile" && (
            <ProfileEditor
              role={role}
              authUser={user}
              notify={notify}
              onProfileUpdate={(name) => setLocalName(name)}
            />
          )} 
        </div>
      </main>
    </div>
    {toast && <div role="status" style={{position:"fixed",right:22,bottom:24,zIndex:90,background:"#061b4e",color:"white",padding:"13px 18px",borderRadius:11,fontSize:11,boxShadow:"0 15px 40px rgba(0,30,90,.25)"}}>{toast}</div>}

    {/* QUICK SEARCH COMMAND PALETTE MODAL */}
    {searchOpen && (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(6, 20, 61, 0.55)",
          backdropFilter: "blur(8px)",
          zIndex: 9999,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: "12vh",
          paddingLeft: 16,
          paddingRight: 16,
        }}
        onClick={() => setSearchOpen(false)}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 580,
            background: "#ffffff",
            borderRadius: 18,
            border: "1px solid rgba(8, 60, 145, 0.16)",
            boxShadow: "0 24px 60px rgba(6, 20, 61, 0.28)",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Input Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 20px",
              borderBottom: "1px solid rgba(8, 60, 145, 0.1)",
              background: "#ffffff",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0c55ed" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearchOpen(false);
                  router.push(`${base}&view=discover`);
                }
              }}
              placeholder="Search startups, investors, sectors, or jump to view…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--navy)",
                background: "transparent",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontSize: 14,
                  padding: "2px 6px",
                }}
              >
                ✕
              </button>
            )}
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                padding: "3px 7px",
                borderRadius: 6,
                background: "#f1f5f9",
                color: "#64748b",
                border: "1px solid #e2e8f0",
              }}
            >
              ESC
            </span>
          </div>

          {/* Results Content */}
          <div style={{ maxHeight: 380, overflowY: "auto", padding: "12px 14px" }}>
            {/* Category: Views */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase", display: "block", padding: "2px 8px 6px" }}>
                Jump to Section
              </span>
              <div style={{ display: "grid", gap: 3 }}>
                {nav
                  .filter(([_, label]) => label.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(([vKey, label]) => (
                    <div
                      key={vKey}
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(`${base}&view=${vKey}`);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        borderRadius: 9,
                        cursor: "pointer",
                        transition: "background 0.12s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 18, textAlign: "center", color: "#0c55ed", fontWeight: 800 }}>
                          {glyphs[vKey]}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>{label}</span>
                      </div>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>View →</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Category: Members & Deals */}
            <div>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: "var(--muted)", textTransform: "uppercase", display: "block", padding: "2px 8px 6px" }}>
                {role === "founder" ? "Investors Matching Search" : "Startups Matching Search"}
              </span>
              <div style={{ display: "grid", gap: 4 }}>
                {(role === "founder" ? investors : founders)
                  .filter(
                    (m) =>
                      !searchQuery.trim() ||
                      m[1].toLowerCase().includes(searchQuery.toLowerCase()) ||
                      m[2].toLowerCase().includes(searchQuery.toLowerCase()) ||
                      m[3].toLowerCase().includes(searchQuery.toLowerCase()) ||
                      m[4].toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .slice(0, 5)
                  .map((m) => (
                    <div
                      key={m[1]}
                      onClick={() => {
                        setSearchOpen(false);
                        router.push(`${base}&view=discover`);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "9px 12px",
                        borderRadius: 10,
                        cursor: "pointer",
                        border: "1px solid #f1f5f9",
                        transition: "background 0.12s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar initials={m[0]} />
                        <div>
                          <strong style={{ fontSize: 12, color: "var(--navy)", display: "block" }}>{m[1]}</strong>
                          <small style={{ fontSize: 10, color: "var(--muted)" }}>
                            {m[2]} · {m[3]}
                          </small>
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--blue)" }}>{m[5]}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 16px",
              background: "#f8fafc",
              borderTop: "1px solid rgba(8, 60, 145, 0.08)",
              fontSize: 10,
              color: "var(--muted)",
            }}
          >
            <span>Press <b>↵</b> to search all discover feeds</span>
            <span><b>ESC</b> to close</span>
          </div>
        </div>
      </div>
    )}
  </div>;
}

function Overview({role,base,displayName,authUser,isPremium}:{role:Role;base:string;displayName:string;authUser:AuthUser|null;isPremium:boolean}) {
  const founder = role === "founder";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const completion = authUser ? authUser.completionPercent : (founder ? 78 : 100);

  return <>
    <div className="app-welcome"><div><span className="eyebrow" suppressHydrationWarning>{today}</span><h2>Good morning, {(displayName ?? (founder ? "Arjun" : "Neha")).split(" ")[0]}.</h2><p>{founder?"Your profile is visible. Publish your first idea to start connecting.":"Three new founders match your active investment interests."}</p></div><Link className="button button-small" href={`${base}&view=${founder?"ideas":"discover"}`}>{founder?"Publish an idea":"Explore founders"} →</Link></div>
    <div className="stat-grid">
      <article className="stat-card glass"><span>Profile completeness</span><strong>{completion}%</strong><small>{completion === 100 ? "Profile 100% complete" : `${100 - completion}% essentials remaining`}</small><div className="progress-bar"><span style={{width:`${completion}%`}}/></div></article>
      <article className="stat-card glass"><span>Weekly views left</span><strong>{isPremium ? "∞" : "5"}</strong><small>{isPremium ? "Unlimited with Premium" : "Resets Monday"}</small></article>
      <article className="stat-card glass"><span>Requests left</span><strong>{isPremium ? "∞" : "7"}</strong><small>{isPremium ? "Unlimited with Premium" : "Resets Monday"}</small></article>
      <article className="stat-card glass"><span>Subscription</span><strong>{isPremium ? "Premium" : "Free"}</strong><small>{isPremium ? "Active subscription" : "Upgrade when ready"}</small></article>
    </div>
    <h3 className="app-section-title">Your network at a glance</h3>
    <div className="app-grid"><section className="panel glass"><div className="panel-head"><h3>Connection requests</h3><Link href={`${base}&view=network`}>VIEW ALL →</Link></div><div className="action-list">{(founder?[["NK","Neha Kapoor","VC Investor · Mumbai"],["AS","Ananya Shah","Angel Investor · Bengaluru"]]:[["SM","Sara Menon","Climate founder · Mumbai"],["RV","Rohan Verma","Robotics founder · Pune"]]).map((p,i)=><div className="action-row" key={p[1]}><Avatar initials={p[0]} tone={i}/><div><strong>{p[1]}</strong><small>{p[2]}</small></div><div className="row-actions"><Link href={`${base}&view=network`} className="button button-small" style={{ textDecoration: "none" }}>Review</Link></div></div>)}</div></section><aside className="usage-card"><span className="status-badge gold">✦ PREMIUM</span><h3>{isPremium ? "Your access is active" : "Move without weekly limits"}</h3><p>{isPremium ? "You can open profiles, send requests and message every connection without limits." : "Unlock unlimited discovery, requests, five active ideas and the ability to send messages."}</p><Link className="button" href={`${base}&view=subscription`}>{isPremium ? "Manage access" : "See Premium"}</Link></aside></div>
    <div className="stat-grid" style={{marginTop:12}}><article className="stat-card glass"><span>Pending requests</span><strong>2</strong><small>Awaiting your review</small></article><article className="stat-card glass"><span>Active connections</span><strong>{founder?"4":"18"}</strong><small>Mutual, unlocked profiles</small></article><article className="stat-card glass"><span>Saved profiles</span><strong>{founder?"6":"24"}</strong><small>Organized for later</small></article><article className="stat-card glass"><span>{founder?"Active ideas":"Protected ideas"}</span><strong>{founder?"Active slots":"Protected ideas"}</strong><small>{founder ? (isPremium ? "Up to 5 ideas" : "Up to 3 ideas") : "Unlocked by connections"}</small></article></div>
  </>;
}

function Discover({
  role,
  saved,
  setSaved,
  notify,
  sentList,
  connectedList,
  onSendRequest,
}: {
  role: Role;
  saved: string[];
  setSaved: (v: string[]) => void;
  notify: (s: string) => void;
  sentList: string[][];
  connectedList: string[][];
  onSendRequest: (person: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("All");
  const [activeProfile, setActiveProfile] = useState<string[] | null>(null);
  const [dbList, setDbList] = useState<string[][]>([]);

  useEffect(() => {
    fetch(`/api/discover?role=${role}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.realUsers && d.realUsers.length > 0) {
          setDbList(d.realUsers);
        }
      })
      .catch(() => {});
  }, [role]);

  const seedList = role === "founder" ? investors : founders;
  // Combine real database members with seed members (deduplicating by name)
  const rawList = dbList.length > 0
    ? [...dbList, ...seedList.filter((s) => !dbList.some((d) => d[1] === s[1]))]
    : seedList;

  const list = rawList.filter((p) => {
    const matchesSearch = !search.trim() || p.some((field) => field.toLowerCase().includes(search.toLowerCase()));
    const matchesTag = tag === "All" || p[4].toLowerCase().includes(tag.toLowerCase()) || p[2].toLowerCase().includes(tag.toLowerCase());
    return matchesSearch && matchesTag;
  });

  const categories = ["All", "AI", "Climate", "Fintech", "Health", "SaaS", "Robotics"];

  return (
    <>
      <div className="app-welcome">
        <div>
          <span className="eyebrow">General discovery</span>
          <h2>{role === "founder" ? "Discover investors" : "Recommended founders"}</h2>
          <p>Search by name, industry, niche, keyword, location or investment range (₹20k–₹10L).</p>
        </div>
      </div>
      <div className="app-discover-toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <input
          className="app-search"
          aria-label="Search profiles"
          placeholder="⌕  Search names, niches or keywords…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 240px" }}
        />
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setTag(cat)}
              className={tag === cat ? "filter-button active" : "filter-button"}
              style={{
                fontSize: 11,
                padding: "6px 12px",
                borderRadius: 20,
                background: tag === cat ? "var(--accent, #0c55ed)" : "rgba(255,255,255,0.05)",
                color: tag === cat ? "#fff" : "inherit",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <section className="panel glass" style={{ padding: 40, textAlign: "center", marginTop: 20 }}>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No profiles match &ldquo;{search}&rdquo; in category {tag}.</p>
          <button className="button button-small" onClick={() => { setSearch(""); setTag("All"); }}>
            Clear filters
          </button>
        </section>
      ) : (
        <div className="app-profile-grid">
          {list.map((p, i) => {
            const isSaved = saved.includes(p[1]);
            const isConnected = connectedList.some((c) => c[1] === p[1]);
            const isSent = sentList.some((s) => s[1] === p[1]);

            return (
              <article className="app-profile-card glass" key={p[1]}>
                <div className="person-row">
                  <Avatar initials={p[0]} tone={i} />
                  <div>
                    <strong>{p[1]}</strong>
                    <a>{p[2]}</a>
                    <small>{p[3]}</small>
                  </div>
                </div>
                <div className="chips">
                  <i>{i % 2 ? "SaaS" : "AI"}</i>
                  <i>{i % 3 ? "India" : "Climate"}</i>
                  <i>Pre-seed</i>
                </div>
                <p>{p[4]}</p>
                <div className="fund-range">
                  <small>{role === "founder" ? "Target investment range" : "Funding requested"}</small>
                  <strong style={{ color: "var(--navy)" }}>{p[5]}</strong>
                </div>
                <div className="card-actions">
                  <button
                    onClick={() => {
                      setSaved(isSaved ? saved.filter((x) => x !== p[1]) : [...saved, p[1]]);
                      notify(isSaved ? `Removed ${p[1]} from Saved` : `Saved ${p[1]} to your bookmarks`);
                    }}
                  >
                    {isSaved ? "★ Saved" : "☆ Save"}
                  </button>
                  {isConnected ? (
                    <Link
                      href={`/dashboard?role=${role}&view=inbox&peer=${encodeURIComponent(p[1])}`}
                      className="primary"
                      style={{
                        textDecoration: "none",
                        fontSize: 10,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 9,
                        background: "linear-gradient(135deg, #115cf1, #0745cb)",
                        border: "1px solid rgba(255, 255, 255, 0.35)",
                        color: "#ffffff",
                        boxShadow: "0 2px 8px rgba(8, 70, 205, 0.22)",
                      }}
                    >
                      Message →
                    </Link>
                  ) : isSent ? (
                    <button style={{ opacity: 0.65, cursor: "not-allowed", fontSize: 11 }} disabled>
                      ✓ Sent
                    </button>
                  ) : (
                    <button className="primary" onClick={() => setActiveProfile(p)}>
                      Open profile
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Profile Detail Preview Modal */}
      {activeProfile && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(3, 7, 26, 0.85)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveProfile(null);
          }}
        >
          <div
            className="glass"
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#08102b",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <Avatar initials={activeProfile[0]} tone={1} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 20, color: "#ffffff", fontWeight: 800 }}>{activeProfile[1]}</h3>
                  <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>{activeProfile[2]} · {activeProfile[3]}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveProfile(null)}
                className="icon-button"
                style={{
                  fontSize: 16,
                  cursor: "pointer",
                  color: "#ffffff",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                ✕
              </button>
            </div>
            <div className="chips" style={{ marginBottom: 14 }}>
              <i style={{ background: "rgba(255,255,255,0.1)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.2)" }}>Verified Member</i>
              <i style={{ background: "rgba(255,255,255,0.1)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.2)" }}>{role === "founder" ? "Active Investor" : "Active Founder"}</i>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#e2e8f0", marginBottom: 16 }}>
              {activeProfile[4]}
            </p>
            <div className="fund-range" style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 }}>
              <small style={{ display: "block", color: "#94a3b8", fontSize: 11, marginBottom: 4 }}>
                {role === "founder" ? "Target Check Size (Range)" : "Funding Goal"}
              </small>
              <strong style={{ fontSize: 20, color: "#38bdf8", fontWeight: 800 }}>{activeProfile[5]}</strong>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  const name = activeProfile[1];
                  const isSaved = saved.includes(name);
                  setSaved(isSaved ? saved.filter((x) => x !== name) : [...saved, name]);
                  notify(isSaved ? `Removed ${name}` : `Saved ${name}`);
                }}
                style={{
                  padding: "9px 16px",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#ffffff",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saved.includes(activeProfile[1]) ? "★ Saved" : "☆ Save profile"}
              </button>
              {connectedList.some((c) => c[1] === activeProfile[1]) ? (
                <Link
                  href={`/dashboard?role=${role}&view=inbox&peer=${encodeURIComponent(activeProfile[1])}`}
                  className="button button-small primary"
                  style={{
                    textDecoration: "none",
                    background: "linear-gradient(135deg, #115cf1, #0745cb)",
                    color: "#ffffff",
                    border: "1px solid rgba(255, 255, 255, 0.35)",
                    fontWeight: 700,
                    boxShadow: "0 4px 14px rgba(8, 70, 205, 0.25)",
                  }}
                  onClick={() => setActiveProfile(null)}
                >
                  Message in Inbox →
                </Link>
              ) : sentList.some((s) => s[1] === activeProfile[1]) ? (
                <button
                  className="button button-small"
                  disabled
                  style={{ opacity: 0.65, cursor: "not-allowed", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}
                >
                  ✓ Request Pending
                </button>
              ) : (
                <button
                  className="button button-small"
                  onClick={() => {
                    onSendRequest(activeProfile);
                    setActiveProfile(null);
                  }}
                >
                  Send connection request →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Network({
  role,
  notify,
  connectedList,
  receivedList,
  sentList,
  onAccept,
  onDecline,
}: {
  role: Role;
  notify: (s: string) => void;
  connectedList: string[][];
  receivedList: string[][];
  sentList: string[][];
  onAccept: (person: string[]) => void;
  onDecline: (name: string) => void;
}) {
  const [tab, setTab] = useState<"connected" | "received" | "sent">("connected");

  return (
    <>
      <div className="app-welcome">
        <div>
          <span className="eyebrow">Relationship management</span>
          <h2>Your Network</h2>
          <p>Connections, received requests, and sent requests remain organized.</p>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === "connected" ? "active" : ""} onClick={() => setTab("connected")}>
          Connected · {connectedList.length}
        </button>
        <button className={tab === "received" ? "active" : ""} onClick={() => setTab("received")}>
          Received · {receivedList.length}
        </button>
        <button className={tab === "sent" ? "active" : ""} onClick={() => setTab("sent")}>
          Sent · {sentList.length}
        </button>
      </div>

      <section className="panel glass">
        {tab === "connected" && (
          connectedList.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No active connections yet. Accept received requests to connect.
            </div>
          ) : (
            <div className="action-list">
              {connectedList.map((p, i) => (
                <div className="action-row" key={p[1]}>
                  <Avatar initials={p[0]} tone={i} />
                  <div>
                    <strong>{p[1]}</strong>
                    <small>{p[2]} · {p[3]}</small>
                  </div>
                  <div className="row-actions">
                    <button
                      onClick={() => notify(`Viewing ${p[1]}'s profile overview`)}
                      style={{
                        height: 32,
                        padding: "0 14px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "rgba(255, 255, 255, 0.8)",
                        border: "1px solid rgba(12, 85, 237, 0.2)",
                        color: "var(--blue, #0c55ed)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 3px rgba(12, 85, 237, 0.06)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Profile
                    </button>
                    <Link
                      href={`/dashboard?role=${role}&view=inbox&peer=${encodeURIComponent(p[1])}`}
                      style={{
                        textDecoration: "none",
                        height: 32,
                        padding: "0 14px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "linear-gradient(135deg, #115cf1, #0745cb)",
                        border: "1px solid rgba(255, 255, 255, 0.35)",
                        color: "#ffffff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        boxShadow: "0 2px 8px rgba(8, 70, 205, 0.24)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Message →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "received" && (
          receivedList.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No pending connection requests.
            </div>
          ) : (
            <div className="action-list">
              {receivedList.map((p, i) => (
                <div className="action-row" key={p[1]}>
                  <Avatar initials={p[0]} tone={i + 1} />
                  <div>
                    <strong>{p[1]}</strong>
                    <small>{p[2]} · Requested recently</small>
                  </div>
                  <div className="row-actions">
                    <button
                      onClick={() => onDecline(p[1])}
                      style={{
                        height: 32,
                        padding: "0 14px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        color: "#ef4444",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => onAccept(p)}
                      style={{
                        height: 32,
                        padding: "0 14px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        background: "linear-gradient(135deg, #115cf1, #0745cb)",
                        border: "1px solid rgba(255, 255, 255, 0.35)",
                        color: "#ffffff",
                        cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(8, 70, 205, 0.24)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === "sent" && (
          sentList.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
              No sent requests. Explore Discover to connect with investors and founders.
            </div>
          ) : (
            <div className="action-list">
              {sentList.map((p, i) => (
                <div className="action-row" key={p[1]}>
                  <Avatar initials={p[0]} tone={i + 2} />
                  <div>
                    <strong>{p[1]}</strong>
                    <small>{p[2]} · {p[3]}</small>
                  </div>
                  <div className="row-actions">
                    <span style={{ fontSize: 11, color: "#38bdf8", padding: "5px 10px", background: "rgba(56,189,248,0.1)", borderRadius: 6, fontWeight: 600 }}>
                      Pending review
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </section>
    </>
  );
}


function Subscription({
  role,
  isPremium,
  notify,
  onUpgrade,
  onResetFree,
}: {
  role: Role;
  isPremium: boolean;
  notify: (s: string) => void;
  onUpgrade: () => void;
  onResetFree: () => void;
}) {
  const price = role === "founder" ? 240 : 310;

  function handleDownloadReceipt() {
    const invNo = `BYLLD-${Math.floor(100000 + Math.random() * 900000)}`;
    const dateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const expiryStr = new Date(Date.now() + 30 * 86400000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const receiptHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payment Receipt - ${invNo}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #06143d; background: #f8fbff; line-height: 1.6; }
    .receipt { max-width: 580px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 16px; padding: 36px; background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.06); }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0c55ed; padding-bottom: 20px; margin-bottom: 24px; }
    .logo { font-size: 26px; font-weight: 900; letter-spacing: -1.2px; }
    .logo b { color: #0c55ed; }
    .badge { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; padding: 5px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; }
    .row { display: flex; justify-content: space-between; margin: 12px 0; font-size: 13px; color: #334155; }
    .row strong { color: #0f172a; }
    .total { border-top: 2px solid #e2e8f0; margin-top: 24px; padding-top: 18px; font-size: 18px; font-weight: 900; color: #0f172a; }
    .footer { margin-top: 36px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 20px; }
    @media print { body { background: #fff; padding: 0; } .receipt { border: 0; box-shadow: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="logo">BYLLD<b>X</b></div>
      <span class="badge">PAID · SUCCESSFUL</span>
    </div>
    <div class="row"><strong>Receipt / Invoice:</strong><span>${invNo}</span></div>
    <div class="row"><strong>Payment Date:</strong><span>${dateStr}</span></div>
    <div class="row"><strong>Plan Purchased:</strong><span>${role === "founder" ? "Founder Premium" : "Investor Premium"} (1 Month)</span></div>
    <div class="row"><strong>Billing Terms:</strong><span>Manual monthly access (No auto-renewal)</span></div>
    <div class="row"><strong>Access Valid Until:</strong><span>${expiryStr}</span></div>
    <div class="row"><strong>Payment Method:</strong><span>Razorpay / Mock Checkout</span></div>
    <div class="row total">
      <span>Total Paid:</span>
      <span style="color: #0c55ed;">₹${price}.00</span>
    </div>
    <div class="footer">
      BYLLD X · Confidential matching & communication layer · Verified payment receipt
    </div>
  </div>
  <script>setTimeout(() => window.print(), 300);</script>
</body>
</html>`;

    const blob = new Blob([receiptHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `Receipt-${invNo}.html`;
      a.click();
    }
  }

  if (isPremium) {
    return (
      <>
        <div className="app-welcome">
          <div>
            <span className="eyebrow">Manual monthly access</span>
            <h2>Subscription Management</h2>
            <p>Your {role === "founder" ? "Founder" : "Investor"} Premium access is active.</p>
          </div>
        </div>

        <div className="role-pricing" style={{ gridTemplateColumns: "minmax(0,650px)" }}>
          <article className="pricing-card glass featured" style={{ borderColor: "#22c55e", background: "rgba(34,197,94,0.03)" }}>
            <div className="premium-badge" style={{ background: "#dcfce7", color: "#15803d", borderColor: "#86efac" }}>
              ✦ ACTIVE ACCESS
            </div>
            <div>
              <span style={{ color: "#22c55e" }}>{role.toUpperCase()} PREMIUM</span>
              <h3 style={{ fontSize: 36, margin: "10px 0" }}>
                Active
                <small style={{ fontSize: 13, display: "block", color: "var(--muted)", fontWeight: 500, marginTop: 4 }}>
                  30 days full access · No auto-renewal
                </small>
              </h3>
              <p>All weekly discovery and request limits are lifted. You have full communication privileges.</p>
            </div>
            <ul>
              <li>Unlimited profile opens (weekly limits lifted)</li>
              <li>Unlimited connection requests</li>
              <li>Up to 5 active ideas & niches</li>
              <li>Direct 1-on-1 messaging unlocked</li>
              <li>Verified payment receipt available</li>
            </ul>

            <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="button button-small"
                onClick={handleDownloadReceipt}
                style={{ background: "var(--blue, #0c55ed)", color: "#fff", cursor: "pointer" }}
              >
                📄 Download Receipt
              </button>
              <button
                onClick={onResetFree}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(8,60,145,0.2)",
                  color: "var(--muted)",
                  borderRadius: 9,
                  padding: "10px 14px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Test Free Tier Limits ↺
              </button>
            </div>
          </article>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="app-welcome">
        <div>
          <span className="eyebrow">Manual monthly access</span>
          <h2>Premium for {role === "founder" ? "Founders" : "Investors"}</h2>
          <p>No auto-renewal. No free trial. No hidden payment flow.</p>
        </div>
      </div>
      <div className="role-pricing" style={{ gridTemplateColumns: "minmax(0,650px)" }}>
        <article className="pricing-card glass featured">
          <div className="premium-badge">✦ PREMIUM</div>
          <div>
            <span>{role.toUpperCase()} ACCESS</span>
            <h3><sup>₹</sup>{price}<small>/ one month</small></h3>
            <p>Benefits remain active for one purchased month. Repurchase manually when you need more time.</p>
          </div>
          <ul>
            <li>Unlimited profile opens</li>
            <li>Unlimited connection requests</li>
            <li>Five active niches {role === "founder" ? "and ideas" : ""}</li>
            <li>Send messages to connections</li>
            <li>Downloadable test receipt</li>
          </ul>
          <div style={{ marginTop: 24 }}>
            <RazorpayCheckout role={role} onSuccess={onUpgrade} />
          </div>
        </article>
      </div>
      <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 18, maxWidth: 650, lineHeight: 1.6 }}>
        Payments are powered by Razorpay (UPI, cards, net banking). When no merchant credentials are configured, the checkout gracefully provides a test confirmation without charging real funds.
      </p>
    </>
  );
}

