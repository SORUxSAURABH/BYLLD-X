"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode, SVGProps } from "react";

type AccountStatus = "active" | "suspended" | "banned";
type UserRole = "founder" | "investor";
type BroadcastType = "info" | "warning" | "success" | "alert";

type Kpis = {
  totalUsers: number;
  foundersCount: number;
  investorsCount: number;
  premiumCount: number;
  activeSubscriptions: number;
  totalIdeas: number;
  totalRevenueInr: number;
  mrrInr: number;
  totalConnections: number;
  totalMessages: number;
};

type Member = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isPremium: boolean;
  accountStatus: AccountStatus;
  createdAt: string;
};

type Idea = {
  id: string;
  title: string;
  founderName: string;
  stage: string;
  targetRaiseInr: number;
  isConfidential: boolean;
  isFeatured: boolean;
  createdAt: string;
};

type Payment = {
  id: string;
  amountInr: number;
  provider: string;
  status: string;
  createdAt: string;
  userEmail: string;
};

type Broadcast = {
  id: string;
  message: string;
  type: BroadcastType;
  active: boolean;
};

type DashboardData = {
  success: true;
  kpis: Kpis;
  users: Member[];
  ideas: Idea[];
  payments: Payment[];
  broadcast: Broadcast;
};

type ActionBody =
  | { action: "toggle_premium"; userId: string }
  | { action: "toggle_role"; userId: string; role: UserRole }
  | {
      action: "set_account_status";
      userId: string;
      accountStatus: AccountStatus;
    }
  | { action: "toggle_featured_idea"; ideaId: string }
  | {
      action: "set_broadcast";
      broadcast: {
        message: string;
        type: BroadcastType;
        active: boolean;
      };
    };

type TabId = "analytics" | "members" | "pitches" | "broadcast" | "payments";

type IconName =
  | "arrow"
  | "broadcast"
  | "card"
  | "chevron"
  | "close"
  | "connection"
  | "crown"
  | "download"
  | "eye"
  | "idea"
  | "key"
  | "lock"
  | "mail"
  | "message"
  | "refresh"
  | "revenue"
  | "search"
  | "spark"
  | "star"
  | "trend"
  | "users";

const DEFAULT_MASTER_KEY = "bylldx-master-2026";
const STORAGE_KEY = "bylldx-admin-key";

const tabs: { id: TabId; label: string; icon: IconName }[] = [
  { id: "analytics", label: "Telemetry", icon: "trend" },
  { id: "members", label: "User Directory", icon: "users" },
  { id: "pitches", label: "Pitch Moderation", icon: "idea" },
  { id: "broadcast", label: "Global Broadcast", icon: "broadcast" },
  { id: "payments", label: "Payment Audit", icon: "card" },
];

const broadcastOptions: {
  type: BroadcastType;
  label: string;
  description: string;
}[] = [
  { type: "info", label: "Information", description: "Product and platform updates" },
  { type: "success", label: "Milestone", description: "Wins and achievements" },
  { type: "warning", label: "Advisory", description: "Important notices" },
  { type: "alert", label: "Critical", description: "Urgent action required" },
];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const integer = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function formatCompactInr(value: number) {
  if (value >= 10_000_000) return `₹${(value / 10_000_000).toFixed(value >= 100_000_000 ? 0 : 1)} Cr`;
  if (value >= 100_000) return `₹${(value / 100_000).toFixed(value >= 1_000_000 ? 0 : 1)} L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return inr.format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-IN", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function initials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "BX";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function titleCase(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const candidate = payload as { message?: unknown; error?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.error === "string") return candidate.error;
  }
  return fallback;
}

async function fetchDashboard(key: string, signal?: AbortSignal) {
  const response = await fetch("/api/admin/stats", {
    method: "GET",
    headers: { "x-admin-key": key },
    cache: "no-store",
    signal,
  });
  const payload = (await response.json().catch(() => null)) as DashboardData | null;
  if (!response.ok || !payload?.success) {
    throw new Error(getErrorMessage(payload, response.status === 401 ? "Invalid master passkey." : "Unable to load the command center."));
  }
  return payload;
}

function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    broadcast: <><path d="M3 11v2"/><path d="M7 8v8"/><path d="M11 5v14"/><path d="M15 8v8"/><path d="M19 11v2"/></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18"/><path d="M7 15h3"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    close: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
    connection: <><circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="m8.6 10.5 6.8-3"/><path d="m8.6 13.5 6.8 3"/></>,
    crown: <><path d="m3 7 4.5 4L12 5l4.5 6L21 7l-2 11H5L3 7Z"/><path d="M5 18h14"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    idea: <><path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.7 14.5A7 7 0 1 1 15.3 14.5C14.5 15.2 14 16 14 18h-4c0-2-.5-2.8-1.3-3.5Z"/></>,
    key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8"/><path d="m15 8 3 3"/><path d="m17 6 2 2"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></>,
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8"/><path d="M8 13h5"/></>,
    refresh: <><path d="M20 7h-5V2"/><path d="M20 7a9 9 0 1 0 1 7"/></>,
    revenue: <><circle cx="12" cy="12" r="9"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M11 7c4 0 4 6 0 6H8l6 5"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    spark: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
    trend: <><path d="M4 18V9"/><path d="M10 18V5"/><path d="M16 18v-7"/><path d="M22 18V3"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/></>,
  };

  return <svg {...common} {...props}>{paths[name]}</svg>;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-mark${compact ? " brand-mark--compact" : ""}`} aria-label="BYLLD X">
      <span>BYLLD</span><b>X</b>
    </div>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return <span className={`spinner${dark ? " spinner--dark" : ""}`} aria-hidden="true" />;
}

function Pill({ tone = "blue", children }: { tone?: "blue" | "green" | "amber" | "red" | "slate"; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

function MetricCard({
  icon,
  label,
  value,
  helper,
  accent = "blue",
  featured = false,
  children,
}: {
  icon: IconName;
  label: string;
  value: string;
  helper: string;
  accent?: "blue" | "emerald" | "violet" | "amber";
  featured?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className={`metric-card metric-card--${accent}${featured ? " metric-card--featured" : ""}`}>
      <div className="metric-card__top">
        <div className="metric-card__icon"><Icon name={icon} /></div>
        <span className="metric-card__signal"><span /> Live</span>
      </div>
      <p className="metric-card__label">{label}</p>
      <strong className="metric-card__value">{value}</strong>
      <p className="metric-card__helper">{helper}</p>
      {children}
    </article>
  );
}

function EmptyState({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><Icon name={icon} /></span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [isBooting, setIsBooting] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [passkey, setPasskey] = useState(DEFAULT_MASTER_KEY);
  const [showPasskey, setShowPasskey] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("analytics");
  const [search, setSearch] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pageError, setPageError] = useState("");
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [broadcastType, setBroadcastType] = useState<BroadcastType>("info");
  const [broadcastActive, setBroadcastActive] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const storedKey = window.localStorage.getItem(STORAGE_KEY);
    if (!storedKey) {
      setIsBooting(false);
      return () => controller.abort();
    }

    fetchDashboard(storedKey, controller.signal)
      .then((payload) => {
        setAdminKey(storedKey);
        setData(payload);
        setLastSyncedAt(new Date());
        setIsAuthenticated(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        window.localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => setIsBooting(false));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!data?.broadcast) return;
    setBroadcastMessage(data.broadcast.message ?? "");
    setBroadcastType(data.broadcast.type ?? "info");
    setBroadcastActive(Boolean(data.broadcast.active));
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const kpis = data?.kpis;
  const premiumConversion = kpis?.totalUsers
    ? (kpis.premiumCount / kpis.totalUsers) * 100
    : 0;
  const founderShare = kpis?.totalUsers
    ? (kpis.foundersCount / kpis.totalUsers) * 100
    : 0;
  const investorShare = kpis?.totalUsers
    ? (kpis.investorsCount / kpis.totalUsers) * 100
    : 0;
  const featuredIdeas = data?.ideas.filter((idea) => idea.isFeatured).length ?? 0;

  const stageDistribution = useMemo(() => {
    const groups = new Map<string, number>();
    for (const idea of data?.ideas ?? []) {
      const label = idea.stage?.trim() || "Unspecified";
      groups.set(label, (groups.get(label) ?? 0) + 1);
    }
    return [...groups.entries()]
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);
  }, [data?.ideas]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.users ?? [];
    return (data?.users ?? []).filter((user) =>
      [user.fullName, user.email, user.role, user.accountStatus]
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [data?.users, search]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = passkey.trim();
    if (!candidate) {
      setAuthError("Enter the master passkey to continue.");
      return;
    }

    setIsAuthenticating(true);
    setAuthError("");
    try {
      const payload = await fetchDashboard(candidate);
      window.localStorage.setItem(STORAGE_KEY, candidate);
      setAdminKey(candidate);
      setData(payload);
      setLastSyncedAt(new Date());
      setIsAuthenticated(true);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Access could not be verified.");
    } finally {
      setIsAuthenticating(false);
    }
  }

  function lockConsole() {
    window.localStorage.removeItem(STORAGE_KEY);
    setAdminKey("");
    setPasskey("");
    setData(null);
    setLastSyncedAt(null);
    setIsAuthenticated(false);
    setActiveTab("analytics");
    setAuthError("");
  }

  async function refreshData(showConfirmation = true) {
    if (!adminKey) return;
    setIsRefreshing(true);
    setPageError("");
    try {
      const payload = await fetchDashboard(adminKey);
      setData(payload);
      setLastSyncedAt(new Date());
      if (showConfirmation) setToast({ message: "Console data is up to date.", tone: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh console data.";
      setPageError(message);
      if (showConfirmation) setToast({ message, tone: "error" });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function executeAction(body: ActionBody, actionKey: string, confirmation: string) {
    if (!adminKey || busyAction) return false;
    setBusyAction(actionKey);
    setPageError("");
    try {
      const response = await fetch("/api/admin/actions", {
        method: "POST",
        headers: {
          "x-admin-key": adminKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "The requested action could not be completed."));
      }
      await refreshData(false);
      setToast({ message: confirmation, tone: "success" });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The requested action could not be completed.";
      setPageError(message);
      setToast({ message, tone: "error" });
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function publishBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = broadcastMessage.trim();
    if (broadcastActive && !message) {
      setToast({ message: "Write an announcement before publishing it.", tone: "error" });
      return;
    }
    const succeeded = await executeAction(
      {
        action: "set_broadcast",
        broadcast: { message, type: broadcastType, active: broadcastActive },
      },
      "broadcast",
      broadcastActive ? "Announcement is live across BYLLD X." : "Global announcement has been taken offline.",
    );
    if (succeeded) {
      setBroadcastMessage(message);
    }
  }

  function downloadReceipt(payment: Payment) {
    const safeId = escapeHtml(payment.id);
    const safeEmail = escapeHtml(payment.userEmail);
    const safeProvider = escapeHtml(titleCase(payment.provider));
    const safeStatus = escapeHtml(titleCase(payment.status));
    const receipt = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BYLLD X Receipt ${safeId}</title><style>
body{margin:0;padding:48px;background:#f8fbff;color:#06143d;font-family:Inter,Arial,sans-serif}.receipt{max-width:680px;margin:auto;background:#fff;border:1px solid #dbe8ff;border-radius:20px;padding:44px;box-shadow:0 18px 55px rgba(12,85,237,.1)}
.brand{font-weight:900;font-size:24px;letter-spacing:-.04em}.brand b{color:#0c55ed}.tag{display:inline-block;margin-top:8px;padding:5px 9px;background:#eef4ff;color:#0c55ed;border-radius:999px;font-size:11px;font-weight:800}.amount{font-size:42px;font-weight:850;margin:34px 0 5px}.muted{color:#64748b}.row{display:flex;justify-content:space-between;gap:24px;padding:15px 0;border-bottom:1px solid #e9eff8}.row span:first-child{color:#64748b}.row strong{text-align:right}.footer{margin-top:30px;padding-top:18px;border-top:1px solid #e9eff8;font-size:12px;color:#64748b}@media print{body{padding:0;background:#fff}.receipt{box-shadow:none;border:0}}</style></head>
<body><main class="receipt"><div class="brand">BYLLD <b>X</b></div><span class="tag">PAYMENT RECEIPT</span><div class="amount">${escapeHtml(inr.format(payment.amountInr))}</div><p class="muted">Transaction confirmed in the BYLLD X payment ledger.</p>
<div class="row"><span>Receipt ID</span><strong>${safeId}</strong></div><div class="row"><span>Account</span><strong>${safeEmail}</strong></div><div class="row"><span>Payment provider</span><strong>${safeProvider}</strong></div><div class="row"><span>Status</span><strong>${safeStatus}</strong></div><div class="row"><span>Processed on</span><strong>${escapeHtml(formatDate(payment.createdAt, true))}</strong></div>
<p class="footer">This computer-generated receipt was issued by BYLLD X and does not require a signature.</p></main></body></html>`;
    const blob = new Blob([receipt], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const safeFilenameId = payment.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12) || "payment";
    anchor.download = `bylldx-receipt-${safeFilenameId}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setToast({ message: "Receipt downloaded.", tone: "success" });
  }

  if (isBooting) {
    return (
      <main className="gate-shell">
        <div className="boot-mark"><BrandMark /><Spinner dark /></div>
        <DashboardStyles />
      </main>
    );
  }

  if (!isAuthenticated || !data || !kpis) {
    return (
      <main className="gate-shell">
        <div className="gate-orb gate-orb--one" />
        <div className="gate-orb gate-orb--two" />
        <section className="gate-card" aria-labelledby="gate-title">
          <div className="gate-card__brand-row">
            <BrandMark />
            <Pill>ADMIN</Pill>
          </div>
          <div className="gate-card__icon"><Icon name="key" /></div>
          <p className="eyebrow">Restricted access</p>
          <h1 id="gate-title">Enter the command center</h1>
          <p className="gate-card__intro">Authenticate with the BYLLD X master passkey to access platform operations.</p>
          <form onSubmit={authenticate} className="gate-form">
            <label htmlFor="master-passkey">Master passkey</label>
            <div className={`passkey-control${authError ? " passkey-control--error" : ""}`}>
              <Icon name="lock" />
              <input
                id="master-passkey"
                type={showPasskey ? "text" : "password"}
                autoComplete="current-password"
                value={passkey}
                onChange={(event) => {
                  setPasskey(event.target.value);
                  if (authError) setAuthError("");
                }}
                aria-invalid={Boolean(authError)}
                aria-describedby={authError ? "passkey-error" : undefined}
                autoFocus
              />
              <button type="button" className="icon-button" onClick={() => setShowPasskey((shown) => !shown)} aria-label={showPasskey ? "Hide passkey" : "Show passkey"}>
                <Icon name={showPasskey ? "close" : "eye"} />
              </button>
            </div>
            {authError && <p className="field-error" id="passkey-error">{authError}</p>}
            <button className="primary-button gate-submit" type="submit" disabled={isAuthenticating}>
              {isAuthenticating ? <><Spinner /> Verifying access</> : <>Unlock console <Icon name="arrow" /></>}
            </button>
          </form>
          <div className="gate-security"><span><Icon name="lock" /></span><p><strong>Secure administrator session</strong><br />Your passkey is retained only in this browser.</p></div>
        </section>
        <p className="gate-footer">BYLLD X · CONFIDENTIAL OPERATIONS</p>
        <DashboardStyles />
      </main>
    );
  }

  return (
    <div className="dashboard-shell">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <header className="topbar">
        <div className="topbar__inner">
          <div className="topbar__brand">
            <BrandMark />
            <span className="confidential-pill"><span /> CONFIDENTIAL CONSOLE</span>
          </div>
          <nav className="quick-links" aria-label="Console quick links">
            <a href="/dashboard?role=founder">Founder View <span aria-hidden="true">↗</span></a>
            <a href="/dashboard?role=investor">Investor View <span aria-hidden="true">↗</span></a>
            <button type="button" onClick={lockConsole}><Icon name="lock" /> Lock Console</button>
          </nav>
        </div>
      </header>

      <main className="dashboard-main">
        <section className="page-heading">
          <div>
            <div className="eyebrow-row"><span className="live-dot" /> Network intelligence · Live</div>
            <h1>Admin Command Center</h1>
            <p>Platform health, member operations and capital activity in one view.</p>
          </div>
          <div className="page-heading__actions">
            <div className="updated-time"><span>Last synchronized</span><strong>{lastSyncedAt ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(lastSyncedAt) : "—"}</strong></div>
            <button className="secondary-button refresh-button" type="button" onClick={() => refreshData()} disabled={isRefreshing}>
              <Icon name="refresh" className={isRefreshing ? "is-spinning" : ""} /> {isRefreshing ? "Syncing" : "Refresh"}
            </button>
          </div>
        </section>

        {pageError && (
          <div className="error-banner" role="alert">
            <span><Icon name="broadcast" /></span><p><strong>Console notice</strong>{pageError}</p>
            <button type="button" onClick={() => setPageError("")} aria-label="Dismiss error"><Icon name="close" /></button>
          </div>
        )}

        <section className="metrics-grid" aria-label="Key platform indicators">
          <MetricCard icon="users" label="Total platform members" value={integer.format(kpis.totalUsers)} helper={`${integer.format(kpis.foundersCount)} founders · ${integer.format(kpis.investorsCount)} investors`}>
            <div className="micro-split" aria-hidden="true"><span style={{ width: `${clampPercent(founderShare)}%` }} /><i style={{ width: `${clampPercent(investorShare)}%` }} /></div>
          </MetricCard>
          <MetricCard icon="revenue" label="Platform revenue" value={formatCompactInr(kpis.totalRevenueInr)} helper={`${formatCompactInr(kpis.mrrInr)} monthly run-rate`} featured>
            <div className="featured-watermark"><Icon name="trend" /></div>
          </MetricCard>
          <MetricCard icon="crown" label="Active premium" value={integer.format(kpis.premiumCount)} helper={`${premiumConversion.toFixed(1)}% member conversion`} accent="emerald">
            <div className="metric-progress"><span style={{ width: `${clampPercent(premiumConversion)}%` }} /></div>
          </MetricCard>
          <MetricCard icon="idea" label="Startup pitches" value={integer.format(kpis.totalIdeas)} helper={`${featuredIdeas} featured on Discover`} accent="violet" />
          <MetricCard icon="connection" label="Network activity" value={formatCompact(kpis.totalConnections)} helper={`${formatCompact(kpis.totalMessages)} messages exchanged`} accent="amber" />
        </section>

        <nav className="tab-list" aria-label="Command center sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? "tab-button tab-button--active" : "tab-button"}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <Icon name={tab.icon} /> {tab.label}
              {tab.id === "broadcast" && data.broadcast?.active && <span className="tab-alert-dot" />}
            </button>
          ))}
        </nav>

        {activeTab === "analytics" && (
          <section className="tab-panel" aria-labelledby="analytics-title">
            <div className="section-heading">
              <div><p className="eyebrow">Platform telemetry</p><h2 id="analytics-title">Network composition</h2></div>
              <Pill tone="green"><span className="pill-dot" /> Live data</Pill>
            </div>
            <div className="analytics-grid">
              <article className="glass-card demographic-card">
                <div className="card-heading"><div><h3>Member demographics</h3><p>Founder-to-investor distribution</p></div><span className="card-icon"><Icon name="users" /></span></div>
                <div className="demographic-total"><strong>{integer.format(kpis.totalUsers)}</strong><span>verified member profiles</span></div>
                <div className="distribution-row">
                  <div className="distribution-row__meta"><span><i className="legend-dot legend-dot--founder" /> Founders</span><strong>{integer.format(kpis.foundersCount)} <small>{founderShare.toFixed(1)}%</small></strong></div>
                  <div className="progress-track"><span className="progress-fill progress-fill--founder" style={{ width: `${clampPercent(founderShare)}%` }} /></div>
                </div>
                <div className="distribution-row">
                  <div className="distribution-row__meta"><span><i className="legend-dot legend-dot--investor" /> Investors</span><strong>{integer.format(kpis.investorsCount)} <small>{investorShare.toFixed(1)}%</small></strong></div>
                  <div className="progress-track"><span className="progress-fill progress-fill--investor" style={{ width: `${clampPercent(investorShare)}%` }} /></div>
                </div>
                <div className="composition-bar" aria-label={`${founderShare.toFixed(1)} percent founders and ${investorShare.toFixed(1)} percent investors`}>
                  <span style={{ width: `${clampPercent(founderShare)}%` }} /><i style={{ width: `${clampPercent(investorShare)}%` }} />
                </div>
              </article>

              <article className="glass-card run-rate-card">
                <div className="card-heading"><div><h3>Revenue run-rate</h3><p>Subscription performance in INR</p></div><span className="card-icon card-icon--green"><Icon name="revenue" /></span></div>
                <div className="revenue-hero"><span>Monthly recurring revenue</span><strong>{inr.format(kpis.mrrInr)}</strong><small>Across {integer.format(kpis.activeSubscriptions)} active subscriptions</small></div>
                <div className="revenue-stats">
                  <div><span>Lifetime revenue</span><strong>{inr.format(kpis.totalRevenueInr)}</strong></div>
                  <div><span>Avg. active plan</span><strong>{inr.format(kpis.activeSubscriptions ? kpis.mrrInr / kpis.activeSubscriptions : 0)}</strong></div>
                </div>
                <div className="run-rate-accent"><Icon name="trend" /><span><strong>{formatCompactInr(kpis.mrrInr * 12)}</strong> projected annual run-rate</span></div>
              </article>

              <article className="glass-card stage-card">
                <div className="card-heading"><div><h3>Pitch stage distribution</h3><p>Active startup pipeline</p></div><span className="card-icon card-icon--violet"><Icon name="idea" /></span></div>
                {stageDistribution.length ? (
                  <div className="stage-list">
                    {stageDistribution.slice(0, 6).map(({ stage, count }, index) => {
                      const percentage = kpis.totalIdeas ? (count / kpis.totalIdeas) * 100 : 0;
                      return (
                        <div className="stage-row" key={stage}>
                          <div className="stage-row__label"><span><i>{String(index + 1).padStart(2, "0")}</i>{titleCase(stage)}</span><strong>{count}</strong></div>
                          <div className="stage-track"><span style={{ width: `${clampPercent(percentage)}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                ) : <EmptyState icon="idea" title="No pitches yet" message="Stage distribution will appear when founders submit ideas." />}
              </article>

              <article className="glass-card pulse-card">
                <div className="card-heading"><div><h3>Network pulse</h3><p>Community interaction volume</p></div><span className="card-icon card-icon--amber"><Icon name="connection" /></span></div>
                <div className="pulse-list">
                  <div><span className="pulse-list__icon"><Icon name="connection" /></span><p><strong>{integer.format(kpis.totalConnections)}</strong><span>Peer connections</span></p></div>
                  <div><span className="pulse-list__icon pulse-list__icon--blue"><Icon name="message" /></span><p><strong>{integer.format(kpis.totalMessages)}</strong><span>Messages exchanged</span></p></div>
                  <div><span className="pulse-list__icon pulse-list__icon--green"><Icon name="crown" /></span><p><strong>{integer.format(kpis.activeSubscriptions)}</strong><span>Active subscriptions</span></p></div>
                </div>
                <div className="engagement-note"><Icon name="spark" /><p><strong>{kpis.totalUsers ? (kpis.totalConnections / kpis.totalUsers).toFixed(1) : "0.0"} connections</strong><span>per platform member</span></p></div>
              </article>
            </div>
          </section>
        )}

        {activeTab === "members" && (
          <section className="tab-panel" aria-labelledby="members-title">
            <div className="section-heading section-heading--actions">
              <div><p className="eyebrow">Identity & access</p><h2 id="members-title">User directory</h2><p>Manage roles, access and premium privileges.</p></div>
              <div className="search-box"><Icon name="search" /><input type="search" placeholder="Search name, email or role…" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search users" />{search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><Icon name="close" /></button>}</div>
            </div>
            <div className="glass-card table-card">
              <div className="table-summary"><span>Showing <strong>{filteredUsers.length}</strong> of {data.users.length} members</span><div><Pill>{kpis.foundersCount} Founders</Pill><Pill tone="slate">{kpis.investorsCount} Investors</Pill></div></div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Member</th><th>Role</th><th>Membership</th><th>Joined</th><th>Account status</th><th><span className="sr-only">Role action</span></th></tr></thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const premiumKey = `premium-${user.id}`;
                      const roleKey = `role-${user.id}`;
                      const statusKey = `status-${user.id}`;
                      return (
                        <tr key={user.id}>
                          <td><div className="member-cell"><span className={`avatar avatar--${user.role}`}>{initials(user.fullName, user.email)}</span><div><strong>{user.fullName || "Unnamed member"}</strong><span>{user.email}</span></div></div></td>
                          <td><Pill tone={user.role === "founder" ? "blue" : "slate"}>{titleCase(user.role)}</Pill></td>
                          <td><button className={user.isPremium ? "premium-toggle premium-toggle--active" : "premium-toggle"} type="button" disabled={Boolean(busyAction)} onClick={() => executeAction({ action: "toggle_premium", userId: user.id }, premiumKey, `${user.fullName || user.email} premium access updated.`)}>{busyAction === premiumKey ? <Spinner dark /> : <Icon name="crown" />} {user.isPremium ? "Premium" : "Standard"}</button></td>
                          <td><span className="date-cell">{formatDate(user.createdAt)}</span></td>
                          <td><div className={`status-select status-select--${user.accountStatus}`}><span /><select value={user.accountStatus} disabled={Boolean(busyAction)} onChange={(event) => executeAction({ action: "set_account_status", userId: user.id, accountStatus: event.target.value as AccountStatus }, statusKey, `${user.fullName || user.email} is now ${event.target.value}.`)} aria-label={`Account status for ${user.fullName || user.email}`}><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select>{busyAction === statusKey ? <Spinner dark /> : <Icon name="chevron" />}</div></td>
                          <td><button className="ghost-action" type="button" disabled={Boolean(busyAction)} onClick={() => executeAction({ action: "toggle_role", userId: user.id, role: user.role === "founder" ? "investor" : "founder" }, roleKey, `${user.fullName || user.email} is now an ${user.role === "founder" ? "investor" : "founder"}.`)}>{busyAction === roleKey ? <Spinner dark /> : <Icon name="refresh" />} Flip role</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!filteredUsers.length && <EmptyState icon="search" title="No matching members" message="Try a name, email address, role or account status." />}
            </div>
          </section>
        )}

        {activeTab === "pitches" && (
          <section className="tab-panel" aria-labelledby="pitches-title">
            <div className="section-heading section-heading--actions">
              <div><p className="eyebrow">Discovery curation</p><h2 id="pitches-title">Startup pitch moderation</h2><p>Review the network pipeline and curate Discover visibility.</p></div>
              <div className="section-stats"><span><strong>{data.ideas.length}</strong>Total pitches</span><span><strong>{featuredIdeas}</strong>Featured</span></div>
            </div>
            {data.ideas.length ? (
              <div className="pitch-grid">
                {data.ideas.map((idea, index) => {
                  const actionKey = `idea-${idea.id}`;
                  return (
                    <article className={`pitch-card${idea.isFeatured ? " pitch-card--featured" : ""}`} key={idea.id}>
                      <div className="pitch-card__top">
                        <span className="pitch-index">{String(index + 1).padStart(2, "0")}</span>
                        <div className="pitch-tags"><Pill>{titleCase(idea.stage || "Unspecified")}</Pill>{idea.isConfidential && <Pill tone="amber"><Icon name="lock" /> Confidential deck</Pill>}</div>
                      </div>
                      <div className="pitch-card__body"><h3>{idea.title}</h3><p>Founded by <strong>{idea.founderName || "Undisclosed founder"}</strong></p></div>
                      <div className="pitch-raise"><span>Target raise</span><strong>{formatCompactInr(idea.targetRaiseInr)}</strong><small>{(idea.targetRaiseInr / 100_000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} Lakhs</small></div>
                      <div className="pitch-card__footer"><span>Submitted {formatDate(idea.createdAt)}</span><button className={idea.isFeatured ? "feature-button feature-button--active" : "feature-button"} type="button" disabled={Boolean(busyAction)} onClick={() => executeAction({ action: "toggle_featured_idea", ideaId: idea.id }, actionKey, idea.isFeatured ? `${idea.title} removed from Discover.` : `${idea.title} is now featured on Discover.`)}>{busyAction === actionKey ? <Spinner dark={!idea.isFeatured} /> : <Icon name="star" />}{idea.isFeatured ? "Featured on Discover" : "Feature on Discover"}</button></div>
                    </article>
                  );
                })}
              </div>
            ) : <div className="glass-card"><EmptyState icon="idea" title="No startup pitches" message="New founder submissions will appear here for moderation." /></div>}
          </section>
        )}

        {activeTab === "broadcast" && (
          <section className="tab-panel" aria-labelledby="broadcast-title">
            <div className="section-heading"><div><p className="eyebrow">Platform-wide communications</p><h2 id="broadcast-title">Global broadcast banner</h2><p>Publish a concise message to every active user dashboard.</p></div>{data.broadcast?.active ? <Pill tone="green"><span className="pill-dot" /> Broadcast live</Pill> : <Pill tone="slate">Offline</Pill>}</div>
            <div className="broadcast-grid">
              <form className="glass-card broadcast-form" onSubmit={publishBroadcast}>
                <div className="form-heading"><span><Icon name="broadcast" /></span><div><h3>Compose announcement</h3><p>Keep operational broadcasts brief and actionable.</p></div></div>
                <label className="form-label" htmlFor="broadcast-message">Announcement text <span>{broadcastMessage.length}/240</span></label>
                <textarea id="broadcast-message" maxLength={240} rows={5} value={broadcastMessage} onChange={(event) => setBroadcastMessage(event.target.value)} placeholder="Share an important network update…" />
                <fieldset><legend>Announcement accent</legend><div className="broadcast-options">{broadcastOptions.map((option) => <label className={`broadcast-option broadcast-option--${option.type}${broadcastType === option.type ? " broadcast-option--selected" : ""}`} key={option.type}><input type="radio" name="broadcast-type" value={option.type} checked={broadcastType === option.type} onChange={() => setBroadcastType(option.type)} /><span className="broadcast-option__swatch" /><span><strong>{option.label}</strong><small>{option.description}</small></span><i /></label>)}</div></fieldset>
                <div className="broadcast-controls"><label className="switch-row"><button className={broadcastActive ? "switch switch--active" : "switch"} type="button" role="switch" aria-checked={broadcastActive} onClick={() => setBroadcastActive((active) => !active)}><span /></button><span><strong>Broadcast active</strong><small>Show this message across user dashboards</small></span></label><button className="primary-button" type="submit" disabled={busyAction === "broadcast"}>{busyAction === "broadcast" ? <><Spinner /> Publishing</> : <><Icon name="broadcast" /> {broadcastActive ? "Publish live" : "Take offline"}</>}</button></div>
              </form>
              <aside className="broadcast-preview-panel">
                <div className="preview-label"><span>Live preview</span><small>User dashboard banner</small></div>
                <div className={`broadcast-preview broadcast-preview--${broadcastType}${!broadcastActive ? " broadcast-preview--inactive" : ""}`}>
                  <span className="broadcast-preview__icon"><Icon name={broadcastType === "success" ? "spark" : broadcastType === "alert" ? "broadcast" : "message"} /></span>
                  <div><span>{broadcastOptions.find((item) => item.type === broadcastType)?.label}</span><p>{broadcastMessage.trim() || "Your announcement preview will appear here."}</p></div>
                  <button type="button" aria-label="Example dismiss button"><Icon name="close" /></button>
                </div>
                <div className="preview-device"><div className="preview-device__nav"><BrandMark compact /><span /><span /><i /></div><div className="preview-device__content"><div className="preview-line preview-line--title" /><div className="preview-line" /><div className="preview-cards"><span /><span /><span /></div><div className="preview-chart"><i /><i /><i /><i /><i /></div></div></div>
                <p className="broadcast-advice"><Icon name="spark" /><span><strong>Executive guidance</strong>Broadcasts are shown only while active. Use Critical sparingly for time-sensitive actions.</span></p>
              </aside>
            </div>
          </section>
        )}

        {activeTab === "payments" && (
          <section className="tab-panel" aria-labelledby="payments-title">
            <div className="section-heading section-heading--actions"><div><p className="eyebrow">Financial operations</p><h2 id="payments-title">Payment audit ledger</h2><p>Immutable view of platform transactions and receipts.</p></div><div className="ledger-total"><span>Gross ledger value</span><strong>{inr.format(data.payments.reduce((sum, payment) => sum + payment.amountInr, 0))}</strong></div></div>
            <div className="glass-card table-card ledger-card">
              <div className="table-summary"><span><strong>{data.payments.length}</strong> recorded transactions</span><Pill tone="green"><span className="pill-dot" /> Ledger connected</Pill></div>
              <div className="table-scroll"><table><thead><tr><th>Transaction</th><th>Member account</th><th>Provider</th><th>Date & time</th><th>Status</th><th className="align-right">Amount</th><th><span className="sr-only">Receipt</span></th></tr></thead><tbody>{data.payments.map((payment) => <tr key={payment.id}><td><span className="transaction-id">#{payment.id.slice(0, 10).toUpperCase()}</span></td><td><div className="email-cell"><span><Icon name="mail" /></span>{payment.userEmail}</div></td><td><Pill tone="slate">{titleCase(payment.provider)}</Pill></td><td><span className="date-cell">{formatDate(payment.createdAt, true)}</span></td><td><Pill tone={payment.status.toLowerCase() === "success" || payment.status.toLowerCase() === "paid" || payment.status.toLowerCase() === "completed" ? "green" : payment.status.toLowerCase() === "failed" ? "red" : "amber"}>{titleCase(payment.status)}</Pill></td><td className="amount-cell">{inr.format(payment.amountInr)}</td><td><button className="receipt-button" type="button" onClick={() => downloadReceipt(payment)} title="Download HTML receipt"><Icon name="download" /> Receipt</button></td></tr>)}</tbody></table></div>
              {!data.payments.length && <EmptyState icon="card" title="No transactions recorded" message="Completed platform payments will be listed here." />}
            </div>
          </section>
        )}
      </main>

      {toast && <div className={`toast toast--${toast.tone}`} role="status"><span>{toast.tone === "success" ? "✓" : "!"}</span>{toast.message}<button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><Icon name="close" /></button></div>}
      <DashboardStyles />
    </div>
  );
}

function DashboardStyles() {
  return (
    <style>{`
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      html { background: #f8fbff; }
      body { margin: 0; background: #f8fbff; color: #06143d; }
      button, input, textarea, select { font: inherit; }
      button, a { -webkit-tap-highlight-color: transparent; }
      button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid rgba(12,85,237,.22); outline-offset: 2px; }
      .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
      .gate-shell, .dashboard-shell { min-height: 100vh; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .gate-shell { position: relative; display: grid; place-items: center; overflow: hidden; padding: 42px 20px; background: radial-gradient(circle at 15% 18%, rgba(12,85,237,.09), transparent 28%), radial-gradient(circle at 88% 76%, rgba(56,189,248,.1), transparent 25%), linear-gradient(145deg,#f8fbff 0%,#fff 52%,#f5f9ff 100%); }
      .gate-shell:before { content: ""; position: absolute; inset: 0; opacity: .42; pointer-events: none; background-image: linear-gradient(rgba(12,85,237,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(12,85,237,.035) 1px,transparent 1px); background-size: 52px 52px; mask-image: linear-gradient(to bottom,black,transparent 82%); }
      .gate-orb { position: absolute; border-radius: 999px; filter: blur(2px); pointer-events: none; }
      .gate-orb--one { width: 330px; height: 330px; left: -170px; top: -120px; border: 1px solid rgba(12,85,237,.12); box-shadow: 0 0 0 70px rgba(12,85,237,.025),0 0 0 140px rgba(12,85,237,.018); }
      .gate-orb--two { width: 260px; height: 260px; right: -100px; bottom: -90px; background: rgba(12,85,237,.035); box-shadow: 0 0 0 65px rgba(12,85,237,.02); }
      .gate-card { position: relative; z-index: 2; width: min(100%, 470px); padding: 36px; border: 1px solid rgba(12,85,237,.13); border-radius: 24px; background: rgba(255,255,255,.91); backdrop-filter: blur(24px); box-shadow: 0 30px 80px rgba(12,85,237,.1),0 3px 12px rgba(6,20,61,.05); }
      .gate-card__brand-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 38px; }
      .brand-mark { display: flex; align-items: baseline; gap: 5px; color: #06143d; font-weight: 900; font-size: 24px; letter-spacing: -.055em; line-height: 1; }
      .brand-mark b { color: #0c55ed; font-size: 28px; font-style: italic; }
      .brand-mark--compact { font-size: 10px; gap: 2px; }
      .brand-mark--compact b { font-size: 12px; }
      .gate-card__icon { display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 22px; border: 1px solid #d0e1fd; border-radius: 15px; color: #0c55ed; background: linear-gradient(145deg,#fff,#edf4ff); box-shadow: 0 8px 20px rgba(12,85,237,.1); }
      .gate-card__icon svg { width: 23px; height: 23px; }
      .eyebrow { margin: 0 0 6px; color: #0c55ed; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .11em; }
      .gate-card h1 { margin: 0; font-size: clamp(30px,5vw,38px); line-height: 1.08; letter-spacing: -.04em; }
      .gate-card__intro { margin: 14px 0 28px; color: #64748b; font-size: 15px; line-height: 1.65; }
      .gate-form label, .form-label, fieldset legend { display: block; margin-bottom: 9px; color: #223258; font-size: 13px; font-weight: 750; }
      .passkey-control { display: flex; align-items: center; height: 52px; padding: 0 8px 0 15px; border: 1px solid #dbe5f3; border-radius: 12px; background: #fff; transition: border-color .2s,box-shadow .2s; }
      .passkey-control:focus-within { border-color: #0c55ed; box-shadow: 0 0 0 4px rgba(12,85,237,.08); }
      .passkey-control--error { border-color: #ef4444; }
      .passkey-control > svg { flex: 0 0 auto; width: 18px; color: #8290a8; }
      .passkey-control input { min-width: 0; flex: 1; height: 100%; border: 0; outline: 0; padding: 0 12px; color: #06143d; background: transparent; font-size: 15px; }
      .icon-button { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 9px; color: #64748b; background: transparent; cursor: pointer; }
      .icon-button:hover { color: #0c55ed; background: #eef4ff; }
      .icon-button svg { width: 17px; height: 17px; }
      .field-error { margin: 8px 0 0; color: #dc2626; font-size: 12px; font-weight: 650; }
      .primary-button { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 43px; padding: 0 17px; border: 1px solid #0c55ed; border-radius: 10px; color: #fff; background: #0c55ed; font-size: 13px; font-weight: 800; cursor: pointer; box-shadow: 0 7px 16px rgba(12,85,237,.18); transition: transform .18s,background .18s,box-shadow .18s; }
      .primary-button:hover:not(:disabled) { background: #0844c4; transform: translateY(-1px); box-shadow: 0 10px 22px rgba(12,85,237,.24); }
      .primary-button:disabled { cursor: not-allowed; opacity: .62; }
      .primary-button svg { width: 17px; height: 17px; }
      .gate-submit { width: 100%; min-height: 50px; margin-top: 18px; }
      .gate-security { display: flex; align-items: center; gap: 12px; margin-top: 25px; padding-top: 22px; border-top: 1px solid #e8eef7; }
      .gate-security > span { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: #059669; background: #ecfdf5; }
      .gate-security svg { width: 16px; }
      .gate-security p { margin: 0; color: #64748b; font-size: 11px; line-height: 1.5; }
      .gate-security strong { color: #344363; font-size: 12px; }
      .gate-footer { position: absolute; z-index: 2; bottom: 22px; margin: 0; color: #94a3b8; font-size: 10px; font-weight: 800; letter-spacing: .18em; }
      .boot-mark { display: flex; align-items: center; gap: 18px; }
      .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .75s linear infinite; }
      .spinner--dark { border-color: rgba(12,85,237,.18); border-top-color: #0c55ed; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .dashboard-shell { position: relative; overflow: hidden; background: radial-gradient(circle at 10% 4%,rgba(12,85,237,.055),transparent 25%),radial-gradient(circle at 93% 32%,rgba(56,189,248,.055),transparent 22%),#f8fbff; }
      .dashboard-shell:before { content: ""; position: fixed; inset: 0; z-index: 0; opacity: .32; pointer-events: none; background-image: linear-gradient(rgba(12,85,237,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(12,85,237,.028) 1px,transparent 1px); background-size: 64px 64px; mask-image: linear-gradient(to bottom,black,transparent 70%); }
      .ambient { position: fixed; z-index: 0; width: 480px; height: 480px; border-radius: 50%; pointer-events: none; filter: blur(40px); }
      .ambient--one { top: -310px; right: 5%; background: rgba(12,85,237,.07); }
      .ambient--two { bottom: -380px; left: -160px; background: rgba(56,189,248,.06); }
      .topbar { position: relative; z-index: 20; border-bottom: 1px solid rgba(12,85,237,.1); background: rgba(255,255,255,.82); backdrop-filter: blur(24px); }
      .topbar__inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; width: min(100% - 48px,1460px); min-height: 74px; margin: 0 auto; }
      .topbar__brand { display: flex; align-items: center; gap: 18px; }
      .confidential-pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; border: 1px solid #d0e1fd; border-radius: 999px; color: #0c55ed; background: #eef4ff; font-size: 10px; font-weight: 800; letter-spacing: .08em; white-space: nowrap; }
      .confidential-pill > span, .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 4px rgba(16,185,129,.11); }
      .quick-links { display: flex; align-items: center; gap: 6px; }
      .quick-links a,.quick-links button { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 12px; border: 0; border-radius: 9px; color: #475569; background: transparent; text-decoration: none; font-size: 12px; font-weight: 700; cursor: pointer; transition: .18s ease; }
      .quick-links a:hover { color: #0c55ed; background: #eef4ff; }
      .quick-links button { margin-left: 5px; border: 1px solid rgba(12,85,237,.17); color: #06143d; background: #fff; }
      .quick-links button:hover { border-color: rgba(12,85,237,.35); box-shadow: 0 5px 14px rgba(12,85,237,.08); }
      .quick-links svg { width: 14px; height: 14px; }
      .dashboard-main { position: relative; z-index: 1; width: min(100% - 48px,1460px); margin: 0 auto; padding: 42px 0 70px; }
      .page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
      .eyebrow-row { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; color: #0c55ed; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .11em; }
      .page-heading h1 { margin: 0; color: #06143d; font-size: clamp(32px,4vw,48px); line-height: 1; font-weight: 850; letter-spacing: -.045em; }
      .page-heading > div > p { margin: 12px 0 0; color: #64748b; font-size: 15px; }
      .page-heading__actions { display: flex; align-items: center; gap: 14px; }
      .updated-time { display: flex; flex-direction: column; align-items: flex-end; padding-right: 14px; border-right: 1px solid #dce6f4; }
      .updated-time span { color: #94a3b8; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
      .updated-time strong { margin-top: 3px; color: #475569; font-size: 12px; }
      .secondary-button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 42px; padding: 0 14px; border: 1px solid rgba(12,85,237,.2); border-radius: 10px; color: #06143d; background: rgba(255,255,255,.9); font-size: 12px; font-weight: 750; cursor: pointer; box-shadow: 0 4px 12px rgba(12,85,237,.04); }
      .secondary-button:hover:not(:disabled) { border-color: rgba(12,85,237,.4); color: #0c55ed; }
      .secondary-button:disabled { opacity: .65; cursor: wait; }
      .secondary-button svg { width: 16px; height: 16px; }
      .is-spinning { animation: spin .8s linear infinite; }
      .error-banner { display: flex; align-items: center; gap: 12px; margin: 0 0 18px; padding: 12px 14px; border: 1px solid #fecaca; border-radius: 13px; color: #991b1b; background: #fff7f7; }
      .error-banner > span { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: #fee2e2; }
      .error-banner svg { width: 16px; }
      .error-banner p { display: flex; flex-direction: column; flex: 1; gap: 2px; margin: 0; font-size: 12px; }
      .error-banner p strong { font-size: 13px; }
      .error-banner button { border: 0; color: #991b1b; background: transparent; cursor: pointer; }
      .metrics-grid { display: grid; grid-template-columns: repeat(12,minmax(0,1fr)); gap: 14px; }
      .metric-card { position: relative; grid-column: span 2; min-height: 200px; overflow: hidden; padding: 20px; border: 1px solid rgba(12,85,237,.12); border-radius: 18px; background: rgba(255,255,255,.88); backdrop-filter: blur(20px); box-shadow: 0 10px 30px rgba(12,85,237,.06),0 2px 8px rgba(0,0,0,.03); }
      .metric-card:first-child,.metric-card:nth-child(2) { grid-column: span 3; }
      .metric-card:after { content: ""; position: absolute; left: 20px; right: 20px; bottom: 0; height: 2px; border-radius: 2px; background: linear-gradient(90deg,#0c55ed,rgba(12,85,237,0)); opacity: .6; }
      .metric-card--emerald:after { background: linear-gradient(90deg,#10b981,transparent); }
      .metric-card--violet:after { background: linear-gradient(90deg,#7c3aed,transparent); }
      .metric-card--amber:after { background: linear-gradient(90deg,#f59e0b,transparent); }
      .metric-card--featured { color: #fff; border-color: transparent; background: linear-gradient(135deg,#0947cc 0%,#0c55ed 100%); box-shadow: 0 18px 42px rgba(12,85,237,.25); }
      .metric-card--featured:after { display: none; }
      .metric-card__top { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; }
      .metric-card__icon { display: grid; place-items: center; width: 39px; height: 39px; border-radius: 11px; color: #0c55ed; background: #eef4ff; }
      .metric-card--emerald .metric-card__icon { color: #059669; background: #ecfdf5; }
      .metric-card--violet .metric-card__icon { color: #7c3aed; background: #f5f3ff; }
      .metric-card--amber .metric-card__icon { color: #d97706; background: #fffbeb; }
      .metric-card--featured .metric-card__icon { color: #fff; background: rgba(255,255,255,.15); }
      .metric-card__icon svg { width: 19px; height: 19px; }
      .metric-card__signal { display: inline-flex; align-items: center; gap: 5px; color: #94a3b8; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; }
      .metric-card__signal span { width: 5px; height: 5px; border-radius: 50%; background: #10b981; }
      .metric-card--featured .metric-card__signal { color: rgba(255,255,255,.7); }
      .metric-card__label { position: relative; z-index: 1; margin: 19px 0 6px; color: #64748b; font-size: 12px; font-weight: 700; }
      .metric-card--featured .metric-card__label { color: rgba(255,255,255,.76); }
      .metric-card__value { position: relative; z-index: 1; display: block; color: #06143d; font-size: clamp(25px,2.2vw,34px); line-height: 1; letter-spacing: -.04em; }
      .metric-card--featured .metric-card__value { color: #fff; }
      .metric-card__helper { position: relative; z-index: 1; margin: 9px 0 0; color: #8290a8; font-size: 11px; line-height: 1.4; }
      .metric-card--featured .metric-card__helper { color: #bfdbfe; }
      .micro-split,.metric-progress { display: flex; height: 4px; margin-top: 15px; overflow: hidden; border-radius: 999px; background: #e9f0fa; }
      .micro-split span { background: #0c55ed; }.micro-split i { background: #8ec5ff; }
      .metric-progress span { border-radius: inherit; background: #10b981; }
      .featured-watermark { position: absolute; right: -14px; bottom: -25px; color: rgba(255,255,255,.09); transform: rotate(-8deg); }
      .featured-watermark svg { width: 105px; height: 105px; stroke-width: 1.2; }
      .tab-list { display: flex; gap: 5px; margin-top: 30px; padding: 5px; overflow-x: auto; border: 1px solid rgba(12,85,237,.11); border-radius: 14px; background: rgba(255,255,255,.75); backdrop-filter: blur(16px); box-shadow: 0 6px 20px rgba(12,85,237,.04); scrollbar-width: none; }
      .tab-list::-webkit-scrollbar { display: none; }
      .tab-button { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex: 1 0 auto; min-width: 145px; height: 43px; padding: 0 16px; border: 0; border-radius: 10px; color: #64748b; background: transparent; font-size: 12px; font-weight: 750; cursor: pointer; transition: .2s ease; }
      .tab-button svg { width: 16px; height: 16px; }
      .tab-button:hover { color: #0c55ed; background: #f4f8ff; }
      .tab-button--active { color: #fff; background: #0c55ed; box-shadow: 0 7px 16px rgba(12,85,237,.2); }
      .tab-button--active:hover { color: #fff; background: #0844c4; }
      .tab-alert-dot { position: absolute; top: 8px; right: 10px; width: 6px; height: 6px; border: 2px solid #fff; border-radius: 50%; background: #10b981; }
      .tab-panel { padding-top: 30px; animation: reveal .32s ease both; }
      @keyframes reveal { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
      .section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 22px; margin-bottom: 20px; }
      .section-heading h2 { margin: 0; color: #06143d; font-size: 25px; line-height: 1.2; letter-spacing: -.035em; }
      .section-heading > div > p:last-child:not(.eyebrow) { margin: 6px 0 0; color: #64748b; font-size: 13px; }
      .section-heading--actions { align-items: flex-end; }
      .pill { display: inline-flex; align-items: center; gap: 5px; width: fit-content; padding: 5px 9px; border: 1px solid #d0e1fd; border-radius: 9999px; color: #0c55ed; background: #eef4ff; font-size: 10px; line-height: 1; font-weight: 800; white-space: nowrap; }
      .pill svg { width: 11px; height: 11px; }
      .pill--green { border-color: #a7f3d0; color: #059669; background: #ecfdf5; }
      .pill--amber { border-color: #fde68a; color: #d97706; background: #fffbeb; }
      .pill--red { border-color: #fecaca; color: #dc2626; background: #fef2f2; }
      .pill--slate { border-color: #e2e8f0; color: #475569; background: #f8fafc; }
      .pill-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
      .glass-card { border: 1px solid rgba(12,85,237,.12); border-radius: 18px; background: rgba(255,255,255,.88); backdrop-filter: blur(20px); box-shadow: 0 10px 30px rgba(12,85,237,.06),0 2px 8px rgba(0,0,0,.03); }
      .analytics-grid { display: grid; grid-template-columns: 1.05fr .95fr; gap: 16px; }
      .analytics-grid > article { min-height: 355px; padding: 24px; }
      .card-heading { display: flex; align-items: center; justify-content: space-between; gap: 15px; }
      .card-heading h3,.form-heading h3 { margin: 0; color: #06143d; font-size: 15px; letter-spacing: -.02em; }
      .card-heading p,.form-heading p { margin: 5px 0 0; color: #8290a8; font-size: 11px; }
      .card-icon { display: grid; place-items: center; width: 37px; height: 37px; border: 1px solid #d0e1fd; border-radius: 11px; color: #0c55ed; background: #eef4ff; }
      .card-icon--green { border-color: #a7f3d0; color: #059669; background: #ecfdf5; }
      .card-icon--violet { border-color: #ddd6fe; color: #7c3aed; background: #f5f3ff; }
      .card-icon--amber { border-color: #fde68a; color: #d97706; background: #fffbeb; }
      .card-icon svg { width: 17px; height: 17px; }
      .demographic-total { display: flex; align-items: baseline; gap: 9px; margin: 27px 0 24px; }
      .demographic-total strong { font-size: 42px; line-height: 1; letter-spacing: -.05em; }
      .demographic-total span { color: #8290a8; font-size: 11px; }
      .distribution-row + .distribution-row { margin-top: 22px; }
      .distribution-row__meta,.stage-row__label { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 9px; }
      .distribution-row__meta > span { display: flex; align-items: center; gap: 8px; color: #475569; font-size: 12px; font-weight: 700; }
      .distribution-row__meta strong { font-size: 13px; }
      .distribution-row__meta small { margin-left: 4px; color: #94a3b8; font-size: 10px; }
      .legend-dot { width: 8px; height: 8px; border-radius: 3px; background: #0c55ed; }.legend-dot--investor { background: #7cc3ff; }
      .progress-track,.stage-track { height: 8px; overflow: hidden; border-radius: 999px; background: #edf2f8; }
      .progress-fill { display: block; height: 100%; border-radius: inherit; transition: width .6s ease; }.progress-fill--founder { background: linear-gradient(90deg,#0947cc,#0c55ed); }.progress-fill--investor { background: linear-gradient(90deg,#38bdf8,#82c8ff); }
      .composition-bar { display: flex; gap: 3px; height: 5px; margin-top: 26px; }.composition-bar span,.composition-bar i { display: block; border-radius: 99px; }.composition-bar span { background:#0c55ed; }.composition-bar i { background:#81c5ff; }
      .revenue-hero { margin-top: 26px; padding: 20px; border: 1px solid #d8e5ff; border-radius: 14px; background: linear-gradient(135deg,#f7faff,#edf4ff); }
      .revenue-hero > span,.revenue-hero small { display: block; color: #64748b; font-size: 11px; }.revenue-hero strong { display: block; margin: 8px 0; color:#0c55ed; font-size: 32px; letter-spacing:-.04em; }.revenue-hero small { color:#8290a8; }
      .revenue-stats { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:15px; }.revenue-stats div { padding:13px 14px; border:1px solid #e5edf7; border-radius:12px; }.revenue-stats span { display:block; margin-bottom:6px; color:#8290a8; font-size:10px; }.revenue-stats strong { font-size:14px; }
      .run-rate-accent { display:flex; align-items:center; gap:10px; margin-top:15px; color:#059669; }.run-rate-accent > svg { width:18px; }.run-rate-accent span { display:flex; flex-direction:column; color:#64748b; font-size:10px; }.run-rate-accent strong { color:#059669; font-size:12px; }
      .stage-list { margin-top:27px; }.stage-row + .stage-row { margin-top:17px; }.stage-row__label span { display:flex; align-items:center; gap:10px; color:#475569; font-size:11px; font-weight:700; }.stage-row__label i { color:#94a3b8; font-size:9px; font-style:normal; }.stage-row__label strong { font-size:12px; }.stage-track { height:5px; }.stage-track span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#6d28d9,#a78bfa); }
      .pulse-list { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:27px; }.pulse-list > div { display:flex; flex-direction:column; gap:13px; padding:15px; border:1px solid #e7edf6; border-radius:13px; background:#fbfdff; }.pulse-list__icon { display:grid; place-items:center; width:30px; height:30px; border-radius:9px; color:#d97706; background:#fffbeb; }.pulse-list__icon--blue { color:#0c55ed; background:#eef4ff; }.pulse-list__icon--green { color:#059669; background:#ecfdf5; }.pulse-list__icon svg { width:15px; }.pulse-list p { margin:0; }.pulse-list strong,.pulse-list span { display:block; }.pulse-list strong { font-size:18px; }.pulse-list p span { margin-top:4px; color:#8290a8; font-size:9px; }
      .engagement-note { display:flex; align-items:center; gap:13px; margin-top:18px; padding:15px; border:1px solid #dce7f7; border-radius:13px; background:linear-gradient(135deg,#f9fbff,#f3f7ff); color:#0c55ed; }.engagement-note svg { width:20px; }.engagement-note p { display:flex; flex-direction:column; margin:0; }.engagement-note strong { font-size:12px; }.engagement-note span { margin-top:2px; color:#8290a8; font-size:10px; }
      .empty-state { display:flex; min-height:235px; flex-direction:column; align-items:center; justify-content:center; padding:30px; text-align:center; }.empty-state__icon { display:grid; place-items:center; width:44px; height:44px; margin-bottom:14px; border-radius:13px; color:#0c55ed; background:#eef4ff; }.empty-state strong { font-size:14px; }.empty-state p { margin:7px 0 0; color:#8290a8; font-size:12px; }
      .search-box { display:flex; align-items:center; width:min(100%,335px); height:43px; padding:0 10px 0 14px; border:1px solid rgba(12,85,237,.17); border-radius:11px; background:#fff; box-shadow:0 4px 14px rgba(12,85,237,.04); }.search-box:focus-within { border-color:#0c55ed; box-shadow:0 0 0 4px rgba(12,85,237,.07); }.search-box > svg { width:16px; color:#8290a8; }.search-box input { min-width:0; flex:1; height:100%; padding:0 10px; border:0; outline:0; color:#06143d; background:transparent; font-size:12px; }.search-box input::placeholder { color:#9aa7ba; }.search-box button { display:grid; place-items:center; width:27px; height:27px; border:0; border-radius:7px; color:#64748b; background:#f3f6fa; cursor:pointer; }.search-box button svg { width:13px; }
      .table-card { overflow:hidden; }.table-summary { display:flex; align-items:center; justify-content:space-between; min-height:58px; padding:0 20px; border-bottom:1px solid #e7edf6; color:#64748b; font-size:11px; }.table-summary > div { display:flex; gap:6px; }.table-scroll { overflow-x:auto; } table { width:100%; min-width:1000px; border-collapse:collapse; } th { height:48px; padding:0 16px; color:#8290a8; background:#f8fbff; font-size:9px; font-weight:800; text-align:left; text-transform:uppercase; letter-spacing:.1em; white-space:nowrap; } th:first-child,td:first-child { padding-left:20px; } th:last-child,td:last-child { padding-right:20px; } td { height:72px; padding:10px 16px; border-top:1px solid #edf1f7; color:#344363; font-size:11px; white-space:nowrap; } tbody tr { transition:background .15s; }.table-card tbody tr:hover { background:#fbfdff; }
      .member-cell { display:flex; align-items:center; gap:11px; }.avatar { display:grid; place-items:center; flex:0 0 auto; width:36px; height:36px; border:1px solid #c7dbff; border-radius:11px; color:#0c55ed; background:#eef4ff; font-size:10px; font-weight:850; }.avatar--investor { border-color:#ddd6fe; color:#6d28d9; background:#f5f3ff; }.member-cell > div { display:flex; flex-direction:column; gap:4px; }.member-cell strong { max-width:190px; overflow:hidden; color:#06143d; font-size:12px; text-overflow:ellipsis; }.member-cell span:not(.avatar) { max-width:220px; overflow:hidden; color:#8290a8; font-size:10px; text-overflow:ellipsis; }
      .premium-toggle,.ghost-action,.receipt-button { display:inline-flex; align-items:center; gap:6px; min-height:31px; padding:0 9px; border:1px solid #e2e8f0; border-radius:8px; color:#64748b; background:#fff; font-size:10px; font-weight:750; cursor:pointer; transition:.15s; }.premium-toggle:hover,.ghost-action:hover,.receipt-button:hover { border-color:#b8cdf3; color:#0c55ed; background:#f8fbff; }.premium-toggle--active { border-color:#fde68a; color:#b77905; background:#fffbeb; }.premium-toggle svg,.ghost-action svg,.receipt-button svg { width:13px; height:13px; }.premium-toggle .spinner,.ghost-action .spinner { width:12px;height:12px; }.premium-toggle:disabled,.ghost-action:disabled { cursor:not-allowed; opacity:.68; }
      .date-cell { color:#64748b; }.status-select { position:relative; display:inline-flex; align-items:center; min-width:116px; height:31px; padding-left:10px; border:1px solid #a7f3d0; border-radius:8px; color:#059669; background:#ecfdf5; }.status-select > span { width:5px; height:5px; border-radius:50%; background:currentColor; }.status-select select { z-index:1; width:100%; height:100%; padding:0 26px 0 7px; border:0; outline:0; color:inherit; appearance:none; background:transparent; font-size:10px; font-weight:800; cursor:pointer; }.status-select > svg,.status-select .spinner { position:absolute; right:8px; width:11px; }.status-select--suspended { border-color:#fde68a;color:#d97706;background:#fffbeb; }.status-select--banned { border-color:#fecaca;color:#dc2626;background:#fef2f2; }
      .section-stats { display:flex; align-items:center; gap:12px; }.section-stats > span { min-width:95px; padding:10px 13px; border:1px solid rgba(12,85,237,.11); border-radius:11px; color:#64748b; background:#fff; font-size:10px; }.section-stats strong { display:block; margin-bottom:3px; color:#06143d; font-size:16px; }
      .pitch-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; }.pitch-card { position:relative; overflow:hidden; padding:22px; border:1px solid rgba(12,85,237,.12); border-radius:18px; background:rgba(255,255,255,.9); box-shadow:0 10px 30px rgba(12,85,237,.06),0 2px 8px rgba(0,0,0,.03); }.pitch-card:before { content:""; position:absolute; left:0; top:20px; bottom:20px; width:3px; border-radius:0 3px 3px 0; background:#d8e4f7; }.pitch-card--featured { border-color:rgba(12,85,237,.28); box-shadow:0 14px 34px rgba(12,85,237,.1); }.pitch-card--featured:before { background:#0c55ed; }.pitch-card__top,.pitch-card__footer { display:flex; align-items:center; justify-content:space-between; gap:12px; }.pitch-index { color:#a3afc1; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10px; font-weight:800; }.pitch-tags { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:6px; }.pitch-card__body { margin:23px 0 21px; }.pitch-card__body h3 { margin:0; color:#06143d; font-size:20px; line-height:1.25; letter-spacing:-.03em; }.pitch-card__body p { margin:7px 0 0; color:#8290a8; font-size:11px; }.pitch-card__body p strong { color:#475569; }.pitch-raise { padding:14px 15px; border:1px solid #e2eaf5; border-radius:12px; background:#f9fbfe; }.pitch-raise span,.pitch-raise small { color:#8290a8; font-size:9px; text-transform:uppercase; letter-spacing:.08em; }.pitch-raise strong { margin:0 7px 0 14px; color:#06143d; font-size:17px; }.pitch-raise small { text-transform:none; letter-spacing:0; }.pitch-card__footer { margin-top:20px; }.pitch-card__footer > span { color:#94a3b8; font-size:9px; }.feature-button { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 11px; border:1px solid rgba(12,85,237,.2); border-radius:9px; color:#0c55ed; background:#fff; font-size:10px; font-weight:800; cursor:pointer; }.feature-button:hover { background:#eef4ff; }.feature-button--active { border-color:#0c55ed; color:#fff; background:#0c55ed; }.feature-button--active:hover { background:#0844c4; }.feature-button:disabled { cursor:not-allowed; opacity:.68; }.feature-button svg { width:13px; }.feature-button--active svg { fill:currentColor; }
      .broadcast-grid { display:grid; grid-template-columns:1.05fr .95fr; gap:16px; }.broadcast-form { padding:25px; }.form-heading { display:flex; align-items:center; gap:12px; margin-bottom:25px; }.form-heading > span { display:grid; place-items:center; width:39px; height:39px; border-radius:11px; color:#0c55ed; background:#eef4ff; }.form-heading svg { width:18px; }.form-label { display:flex; align-items:center; justify-content:space-between; }.form-label span { color:#94a3b8; font-size:9px; font-weight:650; }.broadcast-form textarea { width:100%; min-height:124px; resize:vertical; padding:14px; border:1px solid #dbe5f1; border-radius:11px; outline:0; color:#06143d; background:#fbfdff; font-size:13px; line-height:1.6; transition:.18s; }.broadcast-form textarea:focus { border-color:#0c55ed; background:#fff; box-shadow:0 0 0 4px rgba(12,85,237,.07); }.broadcast-form textarea::placeholder { color:#9aa7ba; }.broadcast-form fieldset { margin:22px 0 0; padding:0; border:0; }.broadcast-options { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }.broadcast-option { position:relative; display:flex; align-items:center; gap:10px; min-height:58px; padding:10px 11px; border:1px solid #e1e8f2; border-radius:11px; background:#fff; cursor:pointer; }.broadcast-option:hover { border-color:#bfd0ec; }.broadcast-option input { position:absolute; opacity:0; pointer-events:none; }.broadcast-option__swatch { width:9px;height:28px;border-radius:99px;background:#0c55ed; }.broadcast-option--success .broadcast-option__swatch { background:#10b981; }.broadcast-option--warning .broadcast-option__swatch { background:#f59e0b; }.broadcast-option--alert .broadcast-option__swatch { background:#ef4444; }.broadcast-option > span:nth-of-type(2) { display:flex; flex-direction:column; flex:1; }.broadcast-option strong { color:#344363; font-size:11px; }.broadcast-option small { margin-top:3px; color:#94a3b8; font-size:8px; }.broadcast-option > i { width:13px; height:13px; border:1px solid #cbd5e1; border-radius:50%; }.broadcast-option--selected { border-color:#8fb2f6; background:#f7faff; box-shadow:0 0 0 2px rgba(12,85,237,.05); }.broadcast-option--selected > i { border:4px solid #0c55ed; }.broadcast-controls { display:flex; align-items:center; justify-content:space-between; gap:18px; margin-top:25px; padding-top:20px; border-top:1px solid #e7edf6; }.switch-row { display:flex; align-items:center; gap:10px; }.switch { position:relative; flex:0 0 auto; width:39px; height:22px; padding:0; border:0; border-radius:99px; background:#d8e0eb; cursor:pointer; transition:.2s; }.switch span { position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 2px 5px rgba(0,0,0,.14); transition:.2s; }.switch--active { background:#10b981; }.switch--active span { transform:translateX(17px); }.switch-row > span { display:flex; flex-direction:column; }.switch-row strong { color:#344363; font-size:11px; }.switch-row small { margin-top:2px;color:#94a3b8;font-size:8px; }
      .broadcast-preview-panel { padding:25px; border:1px solid rgba(12,85,237,.13); border-radius:18px; background:linear-gradient(145deg,#f5f9ff,#eef4ff); box-shadow:0 10px 30px rgba(12,85,237,.06); }.preview-label { display:flex; align-items:center; justify-content:space-between; margin-bottom:15px; }.preview-label span { color:#344363;font-size:12px;font-weight:800; }.preview-label small { color:#8290a8;font-size:9px; }.broadcast-preview { display:flex; align-items:flex-start; gap:11px; padding:13px; border:1px solid #bed4ff; border-radius:11px; color:#0c55ed; background:#eef4ff; box-shadow:0 7px 18px rgba(12,85,237,.07); }.broadcast-preview--success { border-color:#a7f3d0;color:#047857;background:#ecfdf5; }.broadcast-preview--warning { border-color:#fde68a;color:#b45309;background:#fffbeb; }.broadcast-preview--alert { border-color:#fecaca;color:#b91c1c;background:#fef2f2; }.broadcast-preview--inactive { opacity:.45; filter:grayscale(.3); }.broadcast-preview__icon { display:grid;place-items:center;flex:0 0 auto;width:29px;height:29px;border-radius:8px;background:rgba(255,255,255,.72); }.broadcast-preview__icon svg { width:14px; }.broadcast-preview > div { flex:1; }.broadcast-preview > div > span { font-size:8px;font-weight:850;text-transform:uppercase;letter-spacing:.1em; }.broadcast-preview p { margin:4px 0 0;color:#344363;font-size:10px;line-height:1.5; }.broadcast-preview > button { border:0;color:currentColor;background:transparent;cursor:pointer; }.broadcast-preview > button svg { width:12px; }
      .preview-device { margin-top:18px; overflow:hidden; border:1px solid #d7e2f1;border-radius:13px;background:#fff;box-shadow:0 12px 35px rgba(6,20,61,.08); }.preview-device__nav { display:flex;align-items:center;gap:9px;height:35px;padding:0 12px;border-bottom:1px solid #e7edf6; }.preview-device__nav > span { width:35px;height:4px;border-radius:9px;background:#edf1f6; }.preview-device__nav > span:first-of-type { margin-left:auto; }.preview-device__nav i { width:15px;height:15px;border-radius:50%;background:#eef4ff; }.preview-device__content { padding:17px; }.preview-line { width:45%;height:5px;margin-top:7px;border-radius:99px;background:#e7edf5; }.preview-line--title { width:28%;height:8px;margin-top:0;background:#aab7ca; }.preview-cards { display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:16px; }.preview-cards span { height:43px;border:1px solid #e7edf6;border-radius:7px;background:#fbfdff; }.preview-chart { display:flex;align-items:flex-end;gap:8px;height:74px;margin-top:11px;padding:12px;border:1px solid #e7edf6;border-radius:7px;background:#fbfdff; }.preview-chart i { flex:1;border-radius:3px 3px 1px 1px;background:#cfe0ff; }.preview-chart i:nth-child(1){height:30%}.preview-chart i:nth-child(2){height:65%}.preview-chart i:nth-child(3){height:47%}.preview-chart i:nth-child(4){height:85%;background:#0c55ed}.preview-chart i:nth-child(5){height:58%}.broadcast-advice { display:flex;gap:10px;margin:18px 0 0;padding:12px;border:1px solid rgba(12,85,237,.1);border-radius:10px;color:#0c55ed;background:rgba(255,255,255,.62); }.broadcast-advice svg { flex:0 0 auto;width:15px; }.broadcast-advice span { display:flex;flex-direction:column;color:#64748b;font-size:9px;line-height:1.5; }.broadcast-advice strong { margin-bottom:2px;color:#344363;font-size:10px; }
      .ledger-total { min-width:220px;padding:11px 14px;border:1px solid rgba(12,85,237,.12);border-radius:11px;background:#fff;text-align:right; }.ledger-total span { display:block;color:#8290a8;font-size:9px;text-transform:uppercase;letter-spacing:.08em; }.ledger-total strong { display:block;margin-top:4px;color:#06143d;font-size:18px; }.ledger-card table { min-width:1120px; }.align-right { text-align:right; }.transaction-id { color:#475569;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:750; }.email-cell { display:flex;align-items:center;gap:8px; }.email-cell > span { display:grid;place-items:center;width:27px;height:27px;border-radius:8px;color:#0c55ed;background:#eef4ff; }.email-cell svg { width:12px; }.amount-cell { color:#06143d;font-size:12px;font-weight:800;text-align:right; }.receipt-button { color:#0c55ed;border-color:#d0e1fd;background:#f8fbff; }
      .toast { position:fixed; z-index:100; right:22px; bottom:22px; display:flex;align-items:center;gap:10px; max-width:min(390px,calc(100vw - 32px)); min-height:48px;padding:9px 10px 9px 12px;border:1px solid #a7f3d0;border-radius:12px;color:#065f46;background:rgba(236,253,245,.96);backdrop-filter:blur(16px);box-shadow:0 15px 40px rgba(6,20,61,.15);font-size:11px;font-weight:700;animation:toastIn .25s ease both; }.toast > span { display:grid;place-items:center;width:24px;height:24px;border-radius:7px;color:#fff;background:#10b981;font-weight:900; }.toast--error { border-color:#fecaca;color:#991b1b;background:rgba(254,242,242,.97); }.toast--error > span { background:#ef4444; }.toast button { display:grid;place-items:center;margin-left:auto;border:0;color:currentColor;background:transparent;cursor:pointer; }.toast button svg { width:13px; } @keyframes toastIn { from { opacity:0;transform:translateY(8px); } }
      @media (max-width: 1180px) { .metric-card,.metric-card:first-child,.metric-card:nth-child(2) { grid-column:span 4; }.metric-card:nth-child(4),.metric-card:nth-child(5) { grid-column:span 6; }.quick-links a { display:none; } }
      @media (max-width: 900px) { .dashboard-main,.topbar__inner { width:min(100% - 30px,1460px); }.dashboard-main { padding-top:30px; }.page-heading { align-items:flex-start; }.analytics-grid,.broadcast-grid { grid-template-columns:1fr; }.pitch-grid { grid-template-columns:1fr; }.pulse-list { grid-template-columns:repeat(3,1fr); }.metric-card,.metric-card:first-child,.metric-card:nth-child(2),.metric-card:nth-child(4),.metric-card:nth-child(5) { grid-column:span 6; }.metric-card:last-child { grid-column:span 12; }.section-heading--actions { align-items:flex-start;flex-direction:column; }.search-box { width:100%; }.broadcast-preview-panel { min-height:auto; } }
      @media (max-width: 640px) { .gate-card { padding:27px 22px; }.gate-footer { display:none; }.topbar__inner { min-height:66px; }.topbar__brand { gap:9px; }.brand-mark { font-size:20px; }.brand-mark b { font-size:23px; }.confidential-pill { font-size:8px;padding:5px 7px; }.quick-links button { width:37px;padding:0;justify-content:center;font-size:0; }.quick-links button svg { width:15px; }.dashboard-main { width:min(100% - 24px,1460px);padding:28px 0 55px; }.page-heading { flex-direction:column; }.page-heading__actions { width:100%;justify-content:space-between; }.updated-time { align-items:flex-start; }.metrics-grid { gap:10px; }.metric-card,.metric-card:first-child,.metric-card:nth-child(2),.metric-card:nth-child(4),.metric-card:nth-child(5),.metric-card:last-child { grid-column:span 12;min-height:175px; }.tab-list { margin-top:22px; }.tab-panel { padding-top:24px; }.section-heading { flex-direction:column; }.section-heading h2 { font-size:22px; }.analytics-grid > article { min-height:auto;padding:19px; }.pulse-list { grid-template-columns:1fr; }.pulse-list > div { flex-direction:row;align-items:center; }.broadcast-form,.broadcast-preview-panel { padding:18px; }.broadcast-options { grid-template-columns:1fr; }.broadcast-controls { align-items:stretch;flex-direction:column; }.broadcast-controls .primary-button { width:100%; }.pitch-card { padding:18px; }.pitch-card__footer { align-items:flex-start;flex-direction:column; }.feature-button { width:100%;justify-content:center; }.section-stats { width:100%; }.section-stats > span { flex:1; }.ledger-total { width:100%;text-align:left; }.table-summary { align-items:flex-start;flex-direction:column;justify-content:center;gap:7px;padding:10px 16px; }.toast { right:16px;bottom:16px; }.revenue-stats { grid-template-columns:1fr; } }
      @media (prefers-reduced-motion: reduce) { *,*:before,*:after { scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important; } }
    `}</style>
  );
}
