"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, useEffect } from "react";
import { createClient } from "../../lib/supabase/browser";
import { hasSupabaseConfig } from "../../lib/supabase/config";

const supabaseReady = hasSupabaseConfig();

export default function AuthPanel({ mode }: { mode: "signin" | "join" }) {
  const params = useSearchParams();
  const router = useRouter();
  const [role, setRole] = useState<"founder" | "investor">(() => {
    const r = params.get("role");
    if (r === "investor" || r === "founder") return r;
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("bylld_user_role");
      if (saved === "investor" || saved === "founder") return saved;
    }
    return "founder";
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState(() => {
    const err = params.get("error");
    if (!err) return "";
    if (err === "auth_failed") return "Authentication could not be completed. Please try again.";
    if (err === "profile_setup_failed") return "Account setup was interrupted. Please try again.";
    if (err === "role_setup_failed") return "Role assignment issue. Please try again.";
    return "Authentication message: " + err;
  });
  const [loading, setLoading] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const signin = mode === "signin";

  useEffect(() => {
    if (!supabaseReady) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setCurrentEmail(user.email);
    }).catch(() => {});
  }, []);

  async function handleSignOutActive() {
    if (!supabaseReady) return;
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      localStorage.removeItem("bylld_user_role");
      localStorage.removeItem("bylld_auth_user");
      localStorage.removeItem("bylld_profile_founder");
      localStorage.removeItem("bylld_profile_investor");
      setCurrentEmail(null);
      setMessage("Logged out cleanly. You can now create a new account or sign in.");
    } catch {}
  }

  function handleRoleChange(newRole: "founder" | "investor") {
    setRole(newRole);
    try {
      localStorage.setItem("bylld_user_role", newRole);
      document.cookie = `bylld_role=${newRole}; path=/; max-age=${60 * 60 * 24 * 30}`;
    } catch {}
  }

  /* ---------- helpers ---------- */
  function getSiteUrl() {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
    return process.env.NEXT_PUBLIC_SITE_URL || "https://bylldx.in";
  }

  function getRedirectTarget(userRole?: string) {
    const next = params.get("next");
    const r = userRole ?? role;
    if (next && next.startsWith("/dashboard")) {
      return `${next}${next.includes("?") ? "&" : "?"}role=${r}`;
    }
    return `/dashboard?role=${r}`;
  }

  /* ---------- social OAuth ---------- */
  async function handleOAuth(provider: "google" = "google") {
    if (!supabaseReady) {
      setError(
        "Google sign-in requires Supabase credentials. " +
        "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local."
      );
      return;
    }
    setLoading(true);
    setError("");

    try {
      localStorage.setItem("bylld_user_role", role);
      document.cookie = `bylld_role=${role}; path=/; max-age=${60 * 60 * 24 * 30}`;
    } catch {}

    const supabase = createClient();
    const siteUrl = getSiteUrl();
    const callbackUrl = new URL(`${siteUrl}/api/auth/callback`);
    callbackUrl.searchParams.set("next", "/dashboard");
    callbackUrl.searchParams.set("role", role);
    callbackUrl.searchParams.set("origin", siteUrl);
    if (!signin) {
      callbackUrl.searchParams.set("from_join", "true");
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
    // On success, Supabase redirects the browser — no further action needed
  }

  /* ---------- email submit ---------- */
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!supabaseReady) {
      // Preview/mock mode — redirect to dashboard without real auth
      setMessage("Preview mode: opening your private product tour…");
      window.setTimeout(() => router.push(`/dashboard?role=${role}`), 600);
      return;
    }

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const supabase = createClient();

    if (signin) {
      // Clear any prior conflicting session
      try { await supabase.auth.signOut(); } catch {}

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        if (signInError.message.toLowerCase().includes("email not confirmed")) {
          setError("Email not confirmed yet. Please verify your email inbox, or click '1-Click Test' below to test immediately!");
        } else {
          setError(signInError.message);
        }
        setLoading(false);
        return;
      }
      // Returning accounts always use their registered database role.
      const { data: userRecord } = await supabase
        .from("users")
        .select("role, onboarding_completed_at")
        .eq("id", data.user.id)
        .maybeSingle();
      const targetRole = userRecord?.role === "investor" ? "investor" : "founder";
      try {
        localStorage.setItem("bylld_user_role", targetRole);
        document.cookie = `bylld_role=${targetRole}; path=/; max-age=${60 * 60 * 24 * 30}`;
      } catch {}
      router.push(
        userRecord?.onboarding_completed_at
          ? getRedirectTarget(targetRole)
          : `/onboarding?role=${targetRole}`
      );
    } else {
      // Clear any prior conflicting session before registering
      try { await supabase.auth.signOut(); } catch {}

      const fullName = (form.elements.namedItem("fullName") as HTMLInputElement)?.value ?? "";
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
          emailRedirectTo: `${getSiteUrl()}/api/auth/callback?next=/dashboard&role=${role}`,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (data.user && !data.session) {
        // Email confirmation required
        setMessage("Account created! A confirmation link was sent to your email. (Or click '1-Click Test' below to test right now without waiting!)");
        setLoading(false);
        return;
      }
      router.push(`/onboarding?role=${role}`);
    }
  }

  /* ---------- password reset ---------- */
  async function handleForgotPassword(e: React.MouseEvent) {
    e.preventDefault();
    if (!supabaseReady) {
      setError("Password reset requires Supabase credentials.");
      return;
    }
    const emailEl = document.querySelector<HTMLInputElement>("input[type=email]");
    if (!emailEl?.value) {
      setError("Enter your email address first, then click Forgot password.");
      return;
    }
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(emailEl.value, {
      redirectTo: `${getSiteUrl()}/api/auth/callback?next=/profile/reset-password`,
    });
    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage("Password reset link sent! Check your inbox.");
    }
  }

  /* ---------- render ---------- */
  return (
    <main className="auth-page">
      <div className="auth-shell glass">
        {/* Left story panel */}
        <section className="auth-story">
          <Link href="/" className="wordmark">BYLLD <b>X</b></Link>
          <div>
            <h1>
              {signin ? <><span>WELCOME</span><br /><em>BACK.</em></> : <><span>BUILD YOUR</span><br /><em>NEXT MOVE.</em></>}
            </h1>
            <p>
              {signin
                ? "Return to your focused network, opportunities and conversations."
                : "Create the role-specific profile that helps the right people understand your ambition."}
            </p>
          </div>
          <small>Private profiles · Protected ideas · Responsible discovery</small>
        </section>

        {/* Right form panel */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <span className="eyebrow">{signin ? "Secure member access" : "Create your account"}</span>
          <h2>{signin ? "Sign in to BYLLD X" : "Choose your account role"}</h2>
          <p>
            {signin
              ? "Select your role below and continue with Google or your email."
              : "Select your role below to get personalized access for Founders or Investors."}
          </p>

          {currentEmail && (
            <div
              style={{
                background: "rgba(12, 85, 237, 0.08)",
                border: "1px solid rgba(12, 85, 237, 0.25)",
                borderRadius: 10,
                padding: "10px 14px",
                margin: "14px 0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12,
                color: "var(--navy)",
              }}
            >
              <span>Currently signed in as <strong>{currentEmail}</strong></span>
              <button
                type="button"
                onClick={handleSignOutActive}
                style={{
                  background: "none",
                  border: "none",
                  color: "#dc2626",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 12,
                  textDecoration: "underline",
                }}
              >
                Sign out
              </button>
            </div>
          )}

          {/* Prominent Role Selector for BOTH Google and Email */}
          <div style={{ margin: "16px 0 18px" }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", color: "var(--navy)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
              Account Mode:
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                padding: 4,
                background: "rgba(8, 60, 145, 0.05)",
                borderRadius: 12,
                border: "1px solid rgba(8, 60, 145, 0.12)",
              }}
            >
              <button
                type="button"
                onClick={() => handleRoleChange("founder")}
                style={{
                  padding: "11px 12px",
                  borderRadius: 9,
                  border: role === "founder" ? "2px solid #0c55ed" : "1px solid transparent",
                  background: role === "founder" ? "#ffffff" : "transparent",
                  boxShadow: role === "founder" ? "0 4px 12px rgba(12, 85, 237, 0.12)" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 13, color: role === "founder" ? "#0c55ed" : "var(--navy)" }}>
                    🚀 Founder
                  </strong>
                </div>
                <small style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.3 }}>
                  Showcase startups & raise
                </small>
              </button>

              <button
                type="button"
                onClick={() => handleRoleChange("investor")}
                style={{
                  padding: "11px 12px",
                  borderRadius: 9,
                  border: role === "investor" ? "2px solid #0c55ed" : "1px solid transparent",
                  background: role === "investor" ? "#ffffff" : "transparent",
                  boxShadow: role === "investor" ? "0 4px 12px rgba(12, 85, 237, 0.12)" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 13, color: role === "investor" ? "#0c55ed" : "var(--navy)" }}>
                    💼 Investor
                  </strong>
                </div>
                <small style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.3 }}>
                  Discover deals & deploy capital
                </small>
              </button>
            </div>
          </div>

          {/* Social buttons */}
          <div className="social-buttons" style={{ display: "grid", gridTemplateColumns: "1fr", width: "100%" }}>
            <button
              type="button"
              id="btn-google-auth"
              disabled={loading}
              onClick={() => handleOAuth("google")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                fontWeight: 800,
                fontSize: 13,
                width: "100%",
                minHeight: 52,
                height: 52,
                borderRadius: 12,
                border: "1.5px solid rgba(8, 60, 145, 0.2)",
                background: "#ffffff",
                color: "var(--navy)",
                boxShadow: "0 4px 12px rgba(8, 60, 145, 0.06)",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Continue with Google as <span style={{ color: "#0c55ed" }}>{role === "founder" ? "Founder" : "Investor"}</span></span>
            </button>
          </div>

          <div className="divider">OR CONTINUE WITH EMAIL</div>

          {/* Fields */}
          {!signin && (
            <label className="field">
              <span>Full name</span>
              <input name="fullName" required autoComplete="name" placeholder="Your full name" />
            </label>
          )}
          <label className="field">
            <span>Email address</span>
            <input name="email" required type="email" autoComplete="email" placeholder="you@example.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              required
              minLength={8}
              type="password"
              autoComplete={signin ? "current-password" : "new-password"}
              placeholder="Minimum 8 characters"
            />
          </label>

          {/* Consent */}
          {!signin && (
            <label className="consent">
              <input type="checkbox" required />
              <span>
                I accept the <Link href="/terms">Terms of Service</Link> and{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </span>
            </label>
          )}

          {/* Submit */}
          <button className="button" type="submit" id="btn-email-submit" disabled={loading}>
            {loading ? "Please wait…" : signin ? "Sign in →" : "Create account →"}
          </button>

          {/* Feedback messages */}
          {error && (
            <p role="alert" style={{ color: "#e53935", fontWeight: 700, marginBottom: 0, fontSize: 13 }}>
              {error}
            </p>
          )}
          {message && (
            <p role="status" style={{ color: "#0c55ed", fontWeight: 700, marginBottom: 0 }}>
              {message}
            </p>
          )}

          {/* Footer links */}
          <div className="auth-links">
            {signin ? (
              <>
                <Link href="/join">Create an account</Link>
                <a href="#" id="btn-forgot-password" onClick={handleForgotPassword}>
                  Forgot password?
                </a>
              </>
            ) : (
              <>
                <Link href="/signin">Already have an account?</Link>
                <Link href="/">Back home</Link>
              </>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
