"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";

function Logo() {
  return (
    <Link href="/" style={{ textDecoration: "none" }}>
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-1.2px",
          color: "#0a0a2e",
        }}
      >
        BYLLD <b style={{ color: "#0c55ed" }}>X</b>
      </span>
    </Link>
  );
}

function OnboardingForm() {
  const router = useRouter();
  const params = useSearchParams();
  const role = params.get("role") === "investor" ? "investor" : "founder";

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Shared fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");

  // Founder fields
  const [startupName, setStartupName] = useState("");
  const [industry, setIndustry] = useState("");
  const [startupStage, setStartupStage] = useState("idea");
  const [startupPitch, setStartupPitch] = useState("");

  // Investor fields
  const [firmName, setFirmName] = useState("");
  const [investmentThesis, setInvestmentThesis] = useState("");
  const [sectorsOfInterest, setSectorsOfInterest] = useState("");
  const [typicalCheckSize, setTypicalCheckSize] = useState("500000");

  const totalSteps = 2;

  async function handleSubmit() {
    if (!fullName.trim() || !phone.trim() || !location.trim()) {
      setError("Please complete your name, phone number, and location.");
      return;
    }

    if (role === "founder" && (!startupName.trim() || !industry.trim() || !startupPitch.trim())) {
      setError("Please complete all founder profile fields.");
      return;
    }
    if (role === "investor" && (!firmName.trim() || !investmentThesis.trim() || !sectorsOfInterest.trim())) {
      setError("Please complete all investor profile fields.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const payload: Record<string, string> = {
        role,
        full_name: fullName.trim(),
        phone: phone.trim(),
        location: location.trim(),
      };

      if (role === "founder") {
        payload.startup_name = startupName.trim();
        payload.industry = industry.trim();
        payload.startup_stage = startupStage;
        payload.startup_pitch = startupPitch.trim();
      } else {
        payload.firm_name = firmName.trim();
        payload.investment_thesis = investmentThesis.trim();
        payload.sectors_of_interest = sectorsOfInterest.trim();
        payload.typical_check_size = typicalCheckSize;
      }

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Something went wrong. Please try again.");
        setSaving(false);
        return;
      }

      try {
        localStorage.setItem("bylld_user_role", role);
      } catch {}

      router.replace(`/dashboard?role=${role}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid rgba(8, 60, 145, 0.18)",
    background: "#ffffff",
    fontSize: 14,
    fontWeight: 500,
    color: "#0a0a2e",
    outline: "none",
    transition: "border-color 0.15s ease, box-shadow 0.15s ease",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: "#334155",
    marginBottom: 6,
    letterSpacing: "0.02em",
  };

  const fieldGroup: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(165deg, #f0f4ff 0%, #e8eeff 40%, #f8fbff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#ffffff",
          borderRadius: 20,
          border: "1px solid rgba(8, 60, 145, 0.12)",
          boxShadow: "0 20px 60px rgba(6, 20, 61, 0.1)",
          padding: "40px 36px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Logo />
          <div
            style={{
              marginTop: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 14px",
              borderRadius: 20,
              background: role === "founder" ? "rgba(12, 85, 237, 0.08)" : "rgba(139, 92, 246, 0.08)",
              border: `1px solid ${role === "founder" ? "rgba(12, 85, 237, 0.2)" : "rgba(139, 92, 246, 0.2)"}`,
              fontSize: 11,
              fontWeight: 800,
              color: role === "founder" ? "#0c55ed" : "#7c3aed",
              letterSpacing: "0.04em",
            }}
          >
            {role === "founder" ? "🚀 FOUNDER ONBOARDING" : "💼 INVESTOR ONBOARDING"}
          </div>
          <h2
            style={{
              margin: "16px 0 6px",
              fontSize: 22,
              fontWeight: 800,
              color: "#0a0a2e",
              lineHeight: 1.3,
            }}
          >
            Complete your profile
          </h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
            {role === "founder"
              ? "Tell us about yourself and your startup so investors can discover you."
              : "Tell us about yourself and your investment focus so founders can find you."}
          </p>
        </div>

        {/* Progress Bar */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
              Step {step} of {totalSteps}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#0c55ed" }}>
              {Math.round((step / totalSteps) * 100)}%
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 4,
              background: "rgba(8, 60, 145, 0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(step / totalSteps) * 100}%`,
                background: "linear-gradient(90deg, #0c55ed, #3b82f6)",
                borderRadius: 4,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div style={fieldGroup}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Arjun Mehta"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Phone Number *</label>
              <input
                style={inputStyle}
                type="tel"
                placeholder="e.g. +91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>City / Location *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Mumbai, India"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <button
              onClick={() => {
                if (!fullName.trim() || !phone.trim() || !location.trim()) {
                  setError("Please complete your name, phone number, and location.");
                  return;
                }
                setError("");
                setStep(2);
              }}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "13px 20px",
                borderRadius: 10,
                background: "linear-gradient(135deg, #0c55ed, #3b82f6)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(12, 85, 237, 0.25)",
                transition: "all 0.15s ease",
              }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: Role-specific Info */}
        {step === 2 && role === "founder" && (
          <div style={fieldGroup}>
            <div>
              <label style={labelStyle}>Startup Name *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. VoltFleet Energy"
                value={startupName}
                onChange={(e) => setStartupName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Industry / Sector *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. CleanTech, SaaS, HealthTech"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Stage *</label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={startupStage}
                onChange={(e) => setStartupStage(e.target.value)}
              >
                <option value="idea">Idea</option>
                <option value="mvp">MVP</option>
                <option value="early_revenue">Early Revenue</option>
                <option value="scaling">Scaling</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>One-line Startup Pitch *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Making electric fleet management affordable for Indian logistics"
                value={startupPitch}
                onChange={(e) => setStartupPitch(e.target.value)}
                maxLength={420}
              />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  padding: "13px 20px",
                  borderRadius: 10,
                  background: "rgba(8, 60, 145, 0.06)",
                  color: "#334155",
                  fontSize: 14,
                  fontWeight: 700,
                  border: "1px solid rgba(8, 60, 145, 0.15)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  flex: 2,
                  padding: "13px 20px",
                  borderRadius: 10,
                  background: saving
                    ? "rgba(12, 85, 237, 0.5)"
                    : "linear-gradient(135deg, #0c55ed, #3b82f6)",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 700,
                  border: "none",
                  cursor: saving ? "wait" : "pointer",
                  boxShadow: "0 4px 14px rgba(12, 85, 237, 0.25)",
                  transition: "all 0.15s ease",
                }}
              >
                {saving ? "Saving..." : "Complete & Enter Dashboard →"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && role === "investor" && (
          <div style={fieldGroup}>
            <div>
              <label style={labelStyle}>Firm / Fund / Angel Name *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Accel Partners, Angel Syndicate"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label style={labelStyle}>Investment Thesis *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Backing technical founders in fintech and climate"
                value={investmentThesis}
                onChange={(e) => setInvestmentThesis(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Sectors of Interest *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="e.g. Fintech, Climate, Enterprise SaaS"
                value={sectorsOfInterest}
                onChange={(e) => setSectorsOfInterest(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Typical Check Size *</label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={typicalCheckSize}
                onChange={(e) => setTypicalCheckSize(e.target.value)}
              >
                <option value="50000">₹50,000</option>
                <option value="100000">₹1,00,000</option>
                <option value="250000">₹2,50,000</option>
                <option value="500000">₹5,00,000</option>
                <option value="1000000">₹10,00,000</option>
                <option value="2500000">₹25,00,000</option>
                <option value="5000000">₹50,00,000</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  flex: 1,
                  padding: "13px 20px",
                  borderRadius: 10,
                  background: "rgba(8, 60, 145, 0.06)",
                  color: "#334155",
                  fontSize: 14,
                  fontWeight: 700,
                  border: "1px solid rgba(8, 60, 145, 0.15)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                style={{
                  flex: 2,
                  padding: "13px 20px",
                  borderRadius: 10,
                  background: saving
                    ? "rgba(12, 85, 237, 0.5)"
                    : "linear-gradient(135deg, #0c55ed, #3b82f6)",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 700,
                  border: "none",
                  cursor: saving ? "wait" : "pointer",
                  boxShadow: "0 4px 14px rgba(12, 85, 237, 0.25)",
                  transition: "all 0.15s ease",
                }}
              >
                {saving ? "Saving..." : "Complete & Enter Dashboard →"}
              </button>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <p
            style={{
              marginTop: 12,
              fontSize: 12,
              color: "#ef4444",
              textAlign: "center",
              fontWeight: 600,
            }}
          >
            {error}
          </p>
        )}

        {/* Footer */}
        <div style={{ marginTop: 28, textAlign: "center" }}>
          <p style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
            Your details are stored securely and used to match you with relevant{" "}
            {role === "founder" ? "investors" : "founders"} on BYLLD X.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#64748b",
            fontSize: 14,
          }}
        >
          Loading…
        </div>
      }
    >
      <OnboardingForm />
    </Suspense>
  );
}
