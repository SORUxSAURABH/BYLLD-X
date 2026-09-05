"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { AuthUser } from "../../lib/hooks/useAuth";
import { createClient } from "../../lib/supabase/browser";
import { hasSupabaseConfig } from "../../lib/supabase/config";

type Role = "founder" | "investor";

interface ProfileData {
  full_name: string;
  headline: string;
  bio: string;
  location: string;
  website_url: string;
  is_discoverable: boolean;
  completion_percent: number;
  // founder-specific fields
  founder_role: string;
  years_experience: string;
  prior_startups: string;
  startup_name: string;
  startup_stage: string;
  startup_sector: string;
  traction_metric: string;
  pitch_deck_url: string;
  team_size: string;
  funding_goal_inr: string;
  equity_offered: string;
  // investor-specific fields
  firm_name: string;
  investor_type: string;
  min_investment_inr: string;
  max_investment_inr: string;
  target_stages: string[];
  target_sectors: string[];
  value_add_tags: string[];
  deals_per_year: string;
  investment_thesis: string;
}

const FOUNDER_DEFAULT: ProfileData = {
  full_name: "Arjun Mehta",
  headline: "Climate Tech & Clean Energy Founder",
  bio: "Building scalable EV charging and battery telemetry infrastructure for Indian commercial fleets across tier 1 and tier 2 hubs.",
  location: "Bengaluru, India",
  website_url: "https://voltfleet.tech",
  is_discoverable: true,
  completion_percent: 85,
  founder_role: "CEO & Co-founder",
  years_experience: "6",
  prior_startups: "1",
  startup_name: "VoltFleet Energy",
  startup_stage: "Seed / Revenue Stage",
  startup_sector: "ClimateTech & Clean Energy",
  traction_metric: "₹4.5L MRR · 16 fleet pilots active across Bengaluru & Pune",
  pitch_deck_url: "https://deck.voltfleet.tech/preview",
  team_size: "6 full-time engineers & operators",
  funding_goal_inr: "67000",
  equity_offered: "5% - 7.5%",
  firm_name: "",
  investor_type: "",
  min_investment_inr: "20000",
  max_investment_inr: "1000000",
  target_stages: [],
  target_sectors: [],
  value_add_tags: [],
  deals_per_year: "",
  investment_thesis: "",
};

const INVESTOR_DEFAULT: ProfileData = {
  full_name: "Neha Kapoor",
  headline: "Angel Investor & Venture Partner · Mumbai",
  bio: "Backing early-stage B2B SaaS, CleanTech, and consumer brands with sustainable unit economics and passionate founding teams.",
  location: "Mumbai, India",
  website_url: "https://nehakapoor.vc",
  is_discoverable: true,
  completion_percent: 92,
  founder_role: "",
  years_experience: "",
  prior_startups: "0",
  startup_name: "",
  startup_stage: "",
  startup_sector: "",
  traction_metric: "",
  pitch_deck_url: "",
  team_size: "",
  funding_goal_inr: "",
  equity_offered: "",
  firm_name: "Kapoor Ventures / Angel Syndicate",
  investor_type: "Angel Investor & Syndicate Lead",
  min_investment_inr: "50000",
  max_investment_inr: "2500000",
  target_stages: ["Pre-seed", "Seed", "Pre-Series A"],
  target_sectors: ["B2B SaaS", "ClimateTech", "AI & DeepTech", "FinTech"],
  value_add_tags: ["⚡ Go-To-Market & Sales", "🤝 Tier-1 VC Follow-on Intros", "🛠 Tech & System Architecture"],
  deals_per_year: "4 - 6 investments / year",
  investment_thesis: "Backing technical founders building defensible technology in high-growth Indian sectors with demonstrable product-market fit.",
};

const SECTORS_LIST = [
  "B2B SaaS",
  "AI & DeepTech",
  "ClimateTech",
  "FinTech",
  "HealthTech",
  "Consumer & D2C",
  "EdTech",
  "Robotics & Hardware",
  "Supply Chain / Logistics",
];

const STAGES_LIST = [
  "Idea / Pre-MVP",
  "MVP Live",
  "Pre-seed",
  "Seed",
  "Pre-Series A",
  "Growth / Scaling",
];

const VALUE_ADD_OPTIONS = [
  "⚡ Go-To-Market & Sales",
  "🤝 Tier-1 VC Follow-on Intros",
  "🛠 Tech & System Architecture",
  "🏛 Regulatory & Legal Advisory",
  "🌍 Global Expansion (US / SEA)",
  "👥 Executive Hiring & Team Building",
];

function formatINR(val: string | number) {
  const num = Number(val);
  if (!num || isNaN(num)) return "";
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2).replace(/\.00$/, "")} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2).replace(/\.00$/, "")} Lakhs`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return `₹${num.toLocaleString("en-IN")}`;
}

export default function ProfileEditor({
  role,
  authUser,
  notify,
  onProfileUpdate,
}: {
  role: Role;
  authUser: AuthUser | null;
  notify: (msg: string) => void;
  onProfileUpdate?: (name: string) => void;
}) {
  const isFounder = role === "founder";
  const defaultData = isFounder ? FOUNDER_DEFAULT : INVESTOR_DEFAULT;
  const [form, setForm] = useState<ProfileData>(defaultData);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  /* ---- Load profile on mount ---- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`bylld_profile_${role}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm(parsed);
        if (parsed.full_name && onProfileUpdate) onProfileUpdate(parsed.full_name);
      } else {
        setForm(isFounder ? FOUNDER_DEFAULT : INVESTOR_DEFAULT);
      }
      const savedPhoto = localStorage.getItem(`bylld_photo_${role}`);
      if (savedPhoto) setPhotoUrl(savedPhoto);
    } catch {
      setForm(isFounder ? FOUNDER_DEFAULT : INVESTOR_DEFAULT);
    }

    const isDbBound = Boolean(authUser && authUser.role === role);
    if (!isDbBound) {
      setLoading(false);
      return;
    }

    fetch("/api/profile")
      .then((r) => r.json())
      .then(({ profile, roleProfile, photoUrl: pUrl }) => {
        if (profile) {
          setForm((prev) => ({
            ...prev,
            full_name: profile.full_name ?? prev.full_name,
            headline: profile.headline ?? prev.headline,
            bio: profile.bio ?? prev.bio,
            location: profile.location ?? prev.location,
            website_url: profile.website_url ?? prev.website_url,
            is_discoverable: profile.is_discoverable ?? true,
            completion_percent: profile.completion_percent ?? 85,
          }));
          if (profile.full_name && onProfileUpdate) onProfileUpdate(profile.full_name);
        }
        if (roleProfile) {
          setForm((prev) => ({
            ...prev,
            founder_role: roleProfile.founder_role ?? prev.founder_role,
            years_experience: String(roleProfile.years_experience ?? prev.years_experience),
            prior_startups: String(roleProfile.prior_startups ?? prev.prior_startups),
            investor_type: roleProfile.investor_type ?? prev.investor_type,
            min_investment_inr: String(roleProfile.min_investment_inr ?? prev.min_investment_inr),
            max_investment_inr: String(roleProfile.max_investment_inr ?? prev.max_investment_inr),
            investment_thesis: roleProfile.investment_thesis ?? prev.investment_thesis,
          }));
        }
        if (pUrl) setPhotoUrl(pUrl);
        if (profile?.photo_path) setPhotoPath(profile.photo_path);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authUser, role, isFounder]);

  function set(key: keyof ProfileData, value: string | boolean | string[]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleArrayItem(key: "target_stages" | "target_sectors" | "value_add_tags", item: string) {
    setForm((prev) => {
      const arr = prev[key] || [];
      const updated = arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
      return { ...prev, [key]: updated };
    });
  }

  /* ---- Save handler ---- */
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const filled = [form.full_name, form.headline, form.bio, form.location].filter(Boolean).length;
      const extra = isFounder
        ? (form.startup_name ? 1 : 0) + (form.funding_goal_inr ? 1 : 0)
        : (form.investor_type ? 1 : 0) + (form.min_investment_inr ? 1 : 0);
      const completion_percent = Math.min(100, Math.round(((filled + extra) / 6) * 100));

      if (onProfileUpdate && form.full_name) {
        onProfileUpdate(form.full_name);
      }

      const isDbBound = Boolean(authUser && authUser.role === role);
      if (!isDbBound) {
        const updated = { ...form, completion_percent };
        setForm(updated);
        try {
          localStorage.setItem(`bylld_profile_${role}`, JSON.stringify(updated));
          if (photoUrl) localStorage.setItem(`bylld_photo_${role}`, photoUrl);
        } catch {}
        notify(`${isFounder ? "Founder" : "Investor"} profile saved (Preview Mode) ✓`);
        setSaving(false);
        return;
      }

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          photo_path: photoPath,
          years_experience: form.years_experience ? Number(form.years_experience) : null,
          prior_startups: Number(form.prior_startups) || 0,
          min_investment_inr: form.min_investment_inr ? Number(form.min_investment_inr) : null,
          max_investment_inr: form.max_investment_inr ? Number(form.max_investment_inr) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setForm((prev) => ({ ...prev, completion_percent: data.completion_percent ?? completion_percent }));
      notify("Profile saved to database ✓");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  /* ---- Photo upload ---- */
  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Photo must be less than 2MB");
      return;
    }
    setUploadingPhoto(true);
    setError("");

    try {
      const isDbBound = Boolean(authUser && authUser.role === role);
      if (!isDbBound) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setPhotoUrl(dataUrl);
          try {
            localStorage.setItem(`bylld_photo_${role}`, dataUrl);
          } catch {}
          notify("Profile photo updated ✓");
          setUploadingPhoto(false);
        };
        reader.readAsDataURL(file);
        return;
      }

      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setPhotoUrl(data.photoUrl);
      setPhotoPath(data.path);
      notify("Photo updated ✓");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      if (authUser && authUser.role === role) setUploadingPhoto(false);
    }
  }

  const initials = form.full_name
    ? form.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : isFounder ? "AM" : "NK";
  const displayName = form.full_name || (isFounder ? "Arjun Mehta" : "Neha Kapoor");

  if (loading) {
    return (
      <div style={{ padding: 40, color: "var(--muted)", fontSize: 13 }}>Loading profile…</div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* 1. SEPARATE SAVE ACTION BAR AT TOP */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          padding: "14px 20px",
          background: "rgba(255, 255, 255, 0.8)",
          borderRadius: 14,
          border: "1px solid rgba(8, 60, 145, 0.12)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.03)",
          maxWidth: 820,
        }}
      >
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>
            {isFounder ? "Founder Profile Editor" : "Investor Mandate Editor"}
          </span>
          <small style={{ display: "block", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            Keep your profile up-to-date to get curated matches in Discover.
          </small>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={async () => {
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
            }}
            style={{
              height: 38,
              padding: "0 14px",
              borderRadius: 9,
              fontSize: 11,
              fontWeight: 700,
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#dc2626",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
            title="Log out of account"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
          <button
            className="button button-small"
            type="submit"
            disabled={saving}
            style={{
              background: "linear-gradient(135deg, #115cf1, #0745cb)",
              color: "#ffffff",
              border: "1px solid rgba(255, 255, 255, 0.35)",
              boxShadow: "0 2px 8px rgba(8, 70, 205, 0.22)",
              fontWeight: 800,
              cursor: saving ? "not-allowed" : "pointer",
              height: 38,
              padding: "0 20px",
            }}
          >
            {saving ? "Saving…" : "Save changes ✓"}
          </button>
        </div>
      </div>

      {/* Role Hero Banner (Information Only - No Save Button Inside) */}
      <div
        style={{
          borderRadius: 18,
          padding: "22px 26px",
          marginBottom: 20,
          background: "linear-gradient(135deg, #061e56, #0c4cb4 65%, #0875e1)",
          color: "#ffffff",
          boxShadow: "0 8px 24px rgba(12, 76, 180, 0.18)",
          border: "1px solid rgba(56, 189, 248, 0.3)",
          maxWidth: 820,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: 8,
              background: "rgba(56, 189, 248, 0.2)",
              color: "#7dd3fc",
              border: "1px solid rgba(56, 189, 248, 0.4)",
            }}
          >
            {isFounder ? "🚀 FOUNDER PROFILE · VENTURE SHOWCASE" : "💼 INVESTOR MANDATE · CAPITAL DEPLOYMENT"}
          </span>
          <span style={{ fontSize: 11, opacity: 0.75 }}>
            {isFounder ? "Seeking Backing & Partners" : "Accredited Check Writer"}
          </span>
        </div>
        <h2 style={{ fontSize: 24, margin: "0 0 6px", letterSpacing: "-0.03em" }}>
          {isFounder ? "Startup Showcase & Founder Bio" : "Investment Thesis & Ticket Sizes"}
        </h2>
        <p style={{ margin: 0, fontSize: 12, opacity: 0.82, maxWidth: 660, lineHeight: 1.5 }}>
          {isFounder
            ? "Share your venture traction, funding requirements, and leadership track record with active investors."
            : "Define your investment ticket size, target stages, and value-add superpowers to attract aligned founders."}
        </p>
      </div>

      {error && (
        <p role="alert" style={{ color: "#ef4444", fontWeight: 700, fontSize: 13, marginBottom: 14, padding: "10px 14px", background: "rgba(239, 68, 68, 0.08)", borderRadius: 8, border: "1px solid rgba(239, 68, 68, 0.2)", maxWidth: 820 }}>
          {error}
        </p>
      )}

      {/* 2. AVATAR & IDENTITY PANEL (WITH DEDICATED BUTTON ON RIGHT SIDE) */}
      <section className="panel glass" style={{ maxWidth: 820, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Avatar Photo */}
          <div
            style={{ position: "relative", cursor: "pointer", flexShrink: 0 }}
            onClick={() => fileRef.current?.click()}
            title="Click to update photo"
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Profile photo"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid #0284c7",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                }}
              />
            ) : (
              <div
                className="avatar tone-0"
                style={{
                  width: 64,
                  height: 64,
                  fontSize: 22,
                  fontWeight: 800,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0284c7, #0369a1)",
                  color: "#ffffff",
                  border: "2px solid rgba(255, 255, 255, 0.6)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                }}
              >
                {initials}
              </div>
            )}
            <span
              style={{
                position: "absolute",
                bottom: -2,
                right: -2,
                background: "#0284c7",
                borderRadius: "50%",
                width: 20,
                height: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                color: "#ffffff",
                fontWeight: 800,
                border: "2px solid #ffffff",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              {uploadingPhoto ? "…" : "✎"}
            </span>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={handlePhotoChange}
          />

          {/* User details */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 17, color: "var(--navy)" }}>{displayName}</strong>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "#e0f2fe",
                  color: "#0369a1",
                  border: "1px solid #bae6fd",
                }}
              >
                {isFounder ? "🚀 FOUNDER" : "💼 INVESTOR"}
              </span>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--muted)" }}>
              {isFounder
                ? `${form.founder_role || "Founder"} · ${form.location || "India"}`
                : `${form.investor_type || "Angel Investor"} · ${form.location || "India"}`}
            </p>
          </div>

          {/* DEDICATED CHANGE PROFILE PHOTO BUTTON ON RIGHT SIDE */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingPhoto}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 9,
              fontSize: 11,
              fontWeight: 700,
              background: "rgba(255, 255, 255, 0.85)",
              border: "1px solid rgba(12, 85, 237, 0.22)",
              color: "var(--blue, #0c55ed)",
              cursor: uploadingPhoto ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
          >
            📷 {uploadingPhoto ? "Uploading…" : "Change profile photo"}
          </button>
        </div>

        {/* Completeness Bar */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(8, 60, 145, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
            <span style={{ color: "var(--muted)" }}>Profile Completeness</span>
            <span style={{ fontWeight: 800, color: form.completion_percent >= 80 ? "#16a34a" : "var(--blue)" }}>
              {form.completion_percent}% Ready
            </span>
          </div>
          <div className="progress-bar" style={{ height: 6, background: "rgba(8, 61, 145, 0.08)" }}>
            <span
              style={{
                width: `${form.completion_percent}%`,
                background: "linear-gradient(90deg, #0284c7, #38bdf8)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* IF FOUNDER: VENTURE & TRACTION SHOWCASE SECTION          */}
      {/* ========================================================= */}
      {isFounder ? (
        <>
          {/* Section 1: Startup & Pitch Deck Details */}
          <section
            className="panel glass"
            style={{
              maxWidth: 820,
              marginBottom: 16,
              borderLeft: "4px solid #0284c7",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 className="app-section-title" style={{ margin: 0, fontSize: 15, color: "#0369a1" }}>
                🚀 Startup & Pitch Deck
              </h3>
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>
                Visible to Investors
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Startup / Project Name *</span>
                <input
                  required
                  value={form.startup_name}
                  onChange={(e) => set("startup_name", e.target.value)}
                  placeholder="e.g. VoltFleet Energy"
                  maxLength={100}
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Primary Industry / Sector</span>
                <select
                  value={form.startup_sector}
                  onChange={(e) => set("startup_sector", e.target.value)}
                  style={{
                    height: 44,
                    border: "1px solid rgba(8,60,145,.13)",
                    background: "white",
                    borderRadius: 9,
                    padding: "0 12px",
                    color: "var(--navy)",
                    fontSize: 11,
                  }}
                >
                  {SECTORS_LIST.map((sec) => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Pitch Deck / Demo URL</span>
                <input
                  type="url"
                  value={form.pitch_deck_url}
                  onChange={(e) => set("pitch_deck_url", e.target.value)}
                  placeholder="https://deck.yourstartup.com or Google Slides link"
                />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>One-Line Elevator Pitch</span>
                <input
                  value={form.headline}
                  onChange={(e) => set("headline", e.target.value)}
                  placeholder="e.g. Telematics and fast-charging network for 20,000+ Indian commercial EVs"
                  maxLength={180}
                />
              </label>
            </div>
          </section>

          {/* Section 2: Traction & Fundraising Ask (3. ALIGNED PERFECTLY) */}
          <section
            className="panel glass"
            style={{
              maxWidth: 820,
              marginBottom: 16,
              borderLeft: "4px solid #0284c7",
            }}
          >
            <h3 className="app-section-title" style={{ marginTop: 0, fontSize: 15, color: "#0369a1", marginBottom: 14 }}>
              💰 Fundraising Ask & Milestones
            </h3>

            {/* Row 1: Current Stage & Target Funding Ask aligned side-by-side with identical heights */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Current Startup Stage</span>
                <select
                  value={form.startup_stage}
                  onChange={(e) => set("startup_stage", e.target.value)}
                  style={{
                    height: 44,
                    border: "1px solid rgba(8,60,145,.13)",
                    background: "white",
                    borderRadius: 9,
                    padding: "0 12px",
                    color: "var(--navy)",
                    fontSize: 11,
                  }}
                >
                  {STAGES_LIST.map((stg) => (
                    <option key={stg} value={stg}>{stg}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>
                  Target Raise / Funding Ask (₹)
                  {form.funding_goal_inr && Number(form.funding_goal_inr) > 0 && (
                    <b style={{ color: "var(--blue)", marginLeft: 6 }}>
                      ({formatINR(form.funding_goal_inr)})
                    </b>
                  )}
                </span>
                <input
                  type="number"
                  min={20000}
                  max={100000000}
                  value={form.funding_goal_inr}
                  onChange={(e) => set("funding_goal_inr", e.target.value)}
                  placeholder="e.g. 67000 or 1000000"
                />
              </label>
            </div>

            {/* Quick preset chips for funding ask - neatly positioned without breaking input row alignment */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>Quick Ask Presets:</span>
              {["20000", "67000", "250000", "1000000", "5000000"].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => set("funding_goal_inr", amt)}
                  style={{
                    background: form.funding_goal_inr === amt ? "var(--blue)" : "rgba(12, 85, 237, 0.08)",
                    color: form.funding_goal_inr === amt ? "#ffffff" : "var(--blue)",
                    border: "1px solid rgba(12, 85, 237, 0.2)",
                    borderRadius: 6,
                    padding: "3px 9px",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {formatINR(amt)}
                </button>
              ))}
            </div>

            {/* Row 2: Equity Offered & Team Size */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Equity Offered / Instrument</span>
                <input
                  value={form.equity_offered}
                  onChange={(e) => set("equity_offered", e.target.value)}
                  placeholder="e.g. 5% - 8% equity or SAFE note"
                  maxLength={80}
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Team Size</span>
                <input
                  value={form.team_size}
                  onChange={(e) => set("team_size", e.target.value)}
                  placeholder="e.g. 2 Co-founders + 4 Engineers"
                  maxLength={80}
                />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Key Traction & Metrics</span>
                <input
                  value={form.traction_metric}
                  onChange={(e) => set("traction_metric", e.target.value)}
                  placeholder="e.g. ₹4.5L MRR · 16 fleet pilots active · 45% MoM growth"
                  maxLength={200}
                />
              </label>
            </div>
          </section>

          {/* Section 3: Founder Leadership & Track Record (4. LINKEDIN REMOVED) */}
          <section className="panel glass" style={{ maxWidth: 820, marginBottom: 16 }}>
            <h3 className="app-section-title" style={{ marginTop: 0, fontSize: 15 }}>
              👤 Founder Leadership & Experience
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Full Name *</span>
                <input
                  required
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="Arjun Mehta"
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Founder Role</span>
                <input
                  value={form.founder_role}
                  onChange={(e) => set("founder_role", e.target.value)}
                  placeholder="e.g. CEO & Co-founder"
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Years in Tech / Industry</span>
                <input
                  type="number"
                  min={0}
                  max={80}
                  value={form.years_experience}
                  onChange={(e) => set("years_experience", e.target.value)}
                  placeholder="6"
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Prior Startups Built</span>
                <input
                  type="number"
                  min={0}
                  value={form.prior_startups}
                  onChange={(e) => set("prior_startups", e.target.value)}
                  placeholder="1"
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Location</span>
                <input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Bengaluru, India"
                />
              </label>

              {/* REMOVED LINKEDIN: NOW PURELY WEBSITE / PORTFOLIO */}
              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Website / Portfolio</span>
                <input
                  type="url"
                  value={form.website_url}
                  onChange={(e) => set("website_url", e.target.value)}
                  placeholder="https://arjunmehta.tech"
                />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Founder Bio & Superpower</span>
                <textarea
                  value={form.bio}
                  onChange={(e) => set("bio", e.target.value)}
                  placeholder="Describe your domain expertise, engineering background, and why you are uniquely suited to win this market…"
                  rows={4}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    background: "rgba(255, 255, 255, 0.85)",
                    border: "1px solid rgba(8, 60, 145, 0.16)",
                    borderRadius: 9,
                    padding: "10px 14px",
                    color: "var(--navy)",
                    fontSize: 12,
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                />
              </label>
            </div>
          </section>
        </>
      ) : (
        /* ========================================================= */
        /* IF INVESTOR: MANDATE, CHECK SIZE & THESIS SECTION         */
        /* ========================================================= */
        <>
          {/* Section 1: Investment Mandate & Check Sizes */}
          <section
            className="panel glass"
            style={{
              maxWidth: 820,
              marginBottom: 16,
              borderLeft: "4px solid #0284c7",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 className="app-section-title" style={{ margin: 0, fontSize: 15, color: "var(--navy)" }}>
                💼 Check Sizes & Capital Deployment
              </h3>
              <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>
                Accredited Mandate
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Firm / Fund / Syndicate Name</span>
                <input
                  value={form.firm_name}
                  onChange={(e) => set("firm_name", e.target.value)}
                  placeholder="e.g. Kapoor Ventures / Angel Syndicate"
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Investor Type</span>
                <input
                  value={form.investor_type}
                  onChange={(e) => set("investor_type", e.target.value)}
                  placeholder="e.g. Angel Investor, Micro-VC, Family Office"
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>
                  Min Check Ticket (₹)
                  {form.min_investment_inr && Number(form.min_investment_inr) > 0 && (
                    <b style={{ color: "var(--blue)", marginLeft: 6 }}>
                      ({formatINR(form.min_investment_inr)})
                    </b>
                  )}
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.min_investment_inr}
                  onChange={(e) => set("min_investment_inr", e.target.value)}
                  placeholder="e.g. 50000"
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {["20000", "50000", "200000", "500000"].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => set("min_investment_inr", amt)}
                      style={{
                        background: form.min_investment_inr === amt ? "#0c55ed" : "rgba(12, 85, 237, 0.08)",
                        color: form.min_investment_inr === amt ? "#ffffff" : "#0c55ed",
                        border: "1px solid rgba(12, 85, 237, 0.2)",
                        borderRadius: 6,
                        padding: "2px 7px",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {formatINR(amt)}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>
                  Max Check Ticket (₹)
                  {form.max_investment_inr && Number(form.max_investment_inr) > 0 && (
                    <b style={{ color: "var(--blue)", marginLeft: 6 }}>
                      ({formatINR(form.max_investment_inr)})
                    </b>
                  )}
                </span>
                <input
                  type="number"
                  min={0}
                  value={form.max_investment_inr}
                  onChange={(e) => set("max_investment_inr", e.target.value)}
                  placeholder="e.g. 2500000"
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {["1000000", "2500000", "5000000", "10000000"].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => set("max_investment_inr", amt)}
                      style={{
                        background: form.max_investment_inr === amt ? "#0c55ed" : "rgba(12, 85, 237, 0.08)",
                        color: form.max_investment_inr === amt ? "#ffffff" : "#0c55ed",
                        border: "1px solid rgba(12, 85, 237, 0.2)",
                        borderRadius: 6,
                        padding: "2px 7px",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {formatINR(amt)}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Annual Deal Capacity</span>
                <input
                  value={form.deals_per_year}
                  onChange={(e) => set("deals_per_year", e.target.value)}
                  placeholder="e.g. 4 - 6 investments / year · Direct or Syndicate"
                />
              </label>
            </div>
          </section>

          {/* Section 2: Target Sectors & Stages of Interest */}
          <section
            className="panel glass"
            style={{
              maxWidth: 820,
              marginBottom: 16,
              borderLeft: "4px solid #0284c7",
            }}
          >
            <h3 className="app-section-title" style={{ marginTop: 0, fontSize: 15, color: "var(--navy)" }}>
              🎯 Target Sectors & Stages
            </h3>

            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", display: "block", marginBottom: 8 }}>
                Sectors of Focus (Click to select)
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SECTORS_LIST.map((sec) => {
                  const active = (form.target_sectors || []).includes(sec);
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => toggleArrayItem("target_sectors", sec)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        border: active ? "1px solid #0284c7" : "1px solid rgba(8,60,145,.14)",
                        background: active ? "#e0f2fe" : "rgba(255,255,255,0.7)",
                        color: active ? "#0369a1" : "var(--navy)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {active ? "✓ " : "+ "}
                      {sec}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", display: "block", marginBottom: 8 }}>
                Target Startup Stages
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {STAGES_LIST.map((stg) => {
                  const active = (form.target_stages || []).includes(stg);
                  return (
                    <button
                      key={stg}
                      type="button"
                      onClick={() => toggleArrayItem("target_stages", stg)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        border: active ? "1px solid #0284c7" : "1px solid rgba(8,60,145,.14)",
                        background: active ? "#e0f2fe" : "rgba(255,255,255,0.7)",
                        color: active ? "#0369a1" : "var(--navy)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {active ? "✓ " : "+ "}
                      {stg}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)", display: "block", marginBottom: 8 }}>
                Value-Add Beyond Capital (What you offer founders)
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {VALUE_ADD_OPTIONS.map((opt) => {
                  const active = (form.value_add_tags || []).includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleArrayItem("value_add_tags", opt)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        border: active ? "1px solid #059669" : "1px solid rgba(8,60,145,.14)",
                        background: active ? "#d1fae5" : "rgba(255,255,255,0.7)",
                        color: active ? "#065f46" : "var(--navy)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {active ? "✓ " : "+ "}
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Section 3: Thesis & Personal Background */}
          <section className="panel glass" style={{ maxWidth: 820, marginBottom: 16 }}>
            <h3 className="app-section-title" style={{ marginTop: 0, fontSize: 15 }}>
              📜 Investment Thesis & Background
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Full Name *</span>
                <input
                  required
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="Neha Kapoor"
                />
              </label>

              <label className="field">
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Location</span>
                <input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Mumbai, India"
                />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Professional Headline</span>
                <input
                  value={form.headline}
                  onChange={(e) => set("headline", e.target.value)}
                  placeholder="e.g. Angel Investor & Venture Partner · Backing seed-stage B2B SaaS & CleanTech"
                />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Investment Thesis (For Pitching Founders)</span>
                <textarea
                  value={form.investment_thesis}
                  onChange={(e) => set("investment_thesis", e.target.value)}
                  placeholder="Explain what specific problems, metrics, and founder profiles compel you to write a check…"
                  rows={4}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    background: "rgba(255, 255, 255, 0.85)",
                    border: "1px solid rgba(8, 60, 145, 0.16)",
                    borderRadius: 9,
                    padding: "10px 14px",
                    color: "var(--navy)",
                    fontSize: 12,
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--navy)" }}>Portfolio Website / Substack</span>
                <input
                  type="url"
                  value={form.website_url}
                  onChange={(e) => set("website_url", e.target.value)}
                  placeholder="https://nehakapoor.vc"
                />
              </label>
            </div>
          </section>
        </>
      )}

      {/* Discoverability & Visibility Control */}
      <section className="panel glass" style={{ maxWidth: 820, marginBottom: 20 }}>
        <div
          onClick={() => set("is_discoverable", !form.is_discoverable)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            background: form.is_discoverable
              ? "rgba(2, 132, 199, 0.06)"
              : "rgba(100, 116, 139, 0.06)",
            border: `1px solid ${
              form.is_discoverable
                ? "rgba(2, 132, 199, 0.25)"
                : "rgba(100, 116, 139, 0.2)"
            }`,
            borderRadius: 12,
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <strong style={{ fontSize: 14, color: "var(--navy)" }}>
                {form.is_discoverable
                  ? (isFounder ? "✓ Public to Investors in Discover" : "✓ Open to Pitch Inbound from Founders")
                  : "○ Stealth Mode (Private to existing connections only)"}
              </strong>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: form.is_discoverable ? "#dcfce7" : "#f1f5f9",
                  color: form.is_discoverable ? "#166534" : "#64748b",
                }}
              >
                {form.is_discoverable ? "ACTIVE IN DIRECTORY" : "STEALTH"}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--muted)" }}>
              {form.is_discoverable
                ? (isFounder
                    ? "Your startup card is visible to accredited investors who can send you direct connection requests."
                    : "Your investor mandate is searchable by verified founders who can apply to pitch to your thesis.")
                : "You will not appear in public search or category feeds. Only connections you've already approved can view your full details."}
            </p>
          </div>
          <div
            style={{
              width: 46,
              height: 26,
              borderRadius: 13,
              background: form.is_discoverable
                ? "#0284c7"
                : "#cbd5e1",
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "#ffffff",
                position: "absolute",
                top: 3,
                left: form.is_discoverable ? 23 : 3,
                transition: "left 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
              }}
            />
          </div>
        </div>
      </section>

      {/* 1. SEPARATE BOTTOM SAVE BAR */}
      <div
        style={{
          maxWidth: 820,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 40,
          padding: "16px 20px",
          background: "rgba(255, 255, 255, 0.8)",
          borderRadius: 14,
          border: "1px solid rgba(8, 60, 145, 0.12)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.04)",
        }}
      >
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Changes will reflect across your network and discover cards immediately.
        </span>
        <button
          className="button"
          type="submit"
          disabled={saving}
          style={{
            background: "linear-gradient(135deg, #115cf1, #0745cb)",
            color: "#ffffff",
            border: "1px solid rgba(255, 255, 255, 0.35)",
            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.15)",
            cursor: saving ? "not-allowed" : "pointer",
            fontWeight: 800,
            minHeight: 46,
            padding: "0 28px",
          }}
        >
          {saving ? "Saving…" : isFounder ? "Save Startup Profile →" : "Save Investor Mandate →"}
        </button>
      </div>
    </form>
  );
}
