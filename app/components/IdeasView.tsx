"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "../../lib/hooks/useAuth";

interface Idea {
  id: string;
  title: string;
  teaser: string;
  funding_requested_inr: number;
  startup_stage: string;
  status: "draft" | "active" | "archived";
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  problem: string;
  proposed_solution: string;
  supporting_details: string;
}

interface IdeasResponse {
  ideas: Idea[];
  isPremium: boolean;
  maxActiveIdeas: number;
  activeCount: number;
}

const STAGES = [
  { value: "idea", label: "Idea / Concept" },
  { value: "mvp", label: "MVP / Prototype" },
  { value: "early_traction", label: "Early Traction" },
  { value: "scaling", label: "Scaling / Revenue" },
];

function formatINR(amount: number) {
  if (!amount || amount <= 0) return "₹0";
  if (amount >= 100000) {
    const l = amount / 100000;
    return `₹${parseFloat(l.toFixed(2))}L`;
  }
  if (amount >= 1000) {
    const k = amount / 1000;
    return `₹${parseFloat(k.toFixed(1))}k`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

export default function IdeasView({
  authUser,
  notify,
}: {
  authUser: AuthUser | null;
  notify: (s: string) => void;
}) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"active" | "drafts">("active");
  const [maxActive, setMaxActive] = useState(3);
  const [activeCount, setActiveCount] = useState(0);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Form fields
  const [formTitle, setFormTitle] = useState("");
  const [formTeaser, setFormTeaser] = useState("");
  const [formFundingAmount, setFormFundingAmount] = useState("200000");
  const [formStage, setFormStage] = useState("mvp");
  const [formStatus, setFormStatus] = useState<"active" | "draft">("active");
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formProblem, setFormProblem] = useState("");
  const [formSolution, setFormSolution] = useState("");

  const loadIdeas = useCallback(async () => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/ideas");
      if (res.ok) {
        const data: IdeasResponse = await res.json();
        setIdeas(data.ideas ?? []);
        setMaxActive(data.maxActiveIdeas ?? 3);
        setActiveCount(data.activeCount ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  function openCreateModal() {
    setEditingIdea(null);
    setFormTitle("");
    setFormTeaser("");
    setFormFundingAmount("200000");
    setFormStage("mvp");
    setFormStatus("active");
    setFormIsPrimary(ideas.filter((i) => i.status === "active").length === 0);
    setFormProblem("");
    setFormSolution("");
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(idea: Idea) {
    setEditingIdea(idea);
    setFormTitle(idea.title);
    setFormTeaser(idea.teaser);
    setFormFundingAmount(idea.funding_requested_inr.toString());
    setFormStage(idea.startup_stage);
    setFormStatus(idea.status === "active" ? "active" : "draft");
    setFormIsPrimary(idea.is_primary);
    setFormProblem(idea.problem);
    setFormSolution(idea.proposed_solution);
    setFormError("");
    setModalOpen(true);
  }

  async function handleSaveIdea(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (formTitle.trim().length < 2) {
      setFormError("Title must be at least 2 characters.");
      return;
    }
    if (formTeaser.trim().length < 20) {
      setFormError("Teaser summary must be at least 20 characters.");
      return;
    }

    setSaving(true);
    const fundingInr = Math.round(Number(formFundingAmount));
    if (isNaN(fundingInr) || fundingInr < 20000 || fundingInr > 1000000) {
      setFormError("Funding requested must be between ₹20,000 (20k) and ₹10,00,000 (10 Lakhs).");
      setSaving(false);
      return;
    }

    try {
      if (editingIdea) {
        // Update existing idea
        const res = await fetch("/api/ideas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingIdea.id,
            title: formTitle.trim(),
            teaser: formTeaser.trim(),
            funding_requested_inr: fundingInr,
            startup_stage: formStage,
            status: formStatus,
            is_primary: formIsPrimary,
            problem: formProblem.trim(),
            proposed_solution: formSolution.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to save idea");

        notify("Idea updated successfully");
      } else {
        // Create new idea
        const res = await fetch("/api/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle.trim(),
            teaser: formTeaser.trim(),
            funding_requested_inr: fundingInr,
            startup_stage: formStage,
            status: formStatus,
            is_primary: formIsPrimary,
            problem: formProblem.trim(),
            proposed_solution: formSolution.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to create idea");

        notify("New idea published successfully");
      }

      setModalOpen(false);
      await loadIdeas();
    } catch (err: unknown) {
      setFormError((err as Error).message ?? "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  async function handleMakePrimary(id: string) {
    try {
      const res = await fetch("/api/ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "make_primary" }),
      });
      if (res.ok) {
        notify("Primary idea updated");
        await loadIdeas();
      }
    } catch {
      notify("Failed to update primary idea");
    }
  }

  async function handleToggleStatus(id: string) {
    try {
      const res = await fetch("/api/ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "toggle_status" }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify(data.error ?? "Failed to toggle status");
      } else {
        notify(data.status === "active" ? "Idea activated" : "Idea moved to drafts");
        await loadIdeas();
      }
    } catch {
      notify("Failed to change status");
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      const res = await fetch(`/api/ideas?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        notify("Idea deleted");
        await loadIdeas();
      } else {
        notify("Failed to delete idea");
      }
    } catch {
      notify("Network error");
    }
  }

  const activeIdeas = ideas.filter((i) => i.status === "active");
  const draftIdeas = ideas.filter((i) => i.status !== "active");
  const displayedIdeas = activeTab === "active" ? activeIdeas : draftIdeas;

  if (loading) {
    return <div style={{ padding: 40, color: "var(--muted)", fontSize: 13 }}>Loading ideas…</div>;
  }

  return (
    <>
      <div className="app-welcome">
        <div>
          <span className="eyebrow">Founder workspace</span>
          <h2>My Ideas</h2>
          <p>
            {activeCount} of {maxActive} active slots used.{" "}
            {maxActive - activeCount > 0
              ? `${maxActive - activeCount} slot${maxActive - activeCount > 1 ? "s" : ""} remaining.`
              : "Active limit reached. Upgrade for 5 slots."}
          </p>
        </div>
        <button
          className="button button-small"
          onClick={openCreateModal}
          disabled={activeCount >= maxActive && activeTab === "active"}
        >
          New idea +
        </button>
      </div>

      <div className="tabs">
        <button
          className={activeTab === "active" ? "active" : ""}
          onClick={() => setActiveTab("active")}
        >
          Active · {activeIdeas.length}
        </button>
        <button
          className={activeTab === "drafts" ? "active" : ""}
          onClick={() => setActiveTab("drafts")}
        >
          Drafts & Archived · {draftIdeas.length}
        </button>
      </div>

      {displayedIdeas.length === 0 ? (
        <section className="panel glass" style={{ padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>
            {activeTab === "active"
              ? "You don't have any active ideas yet. Create your first idea to get discovered by investors."
              : "No drafts or archived ideas."}
          </p>
          {activeTab === "active" && (
            <button className="button button-small" onClick={openCreateModal}>
              Create your first idea →
            </button>
          )}
        </section>
      ) : (
        <div className="idea-management">
          {displayedIdeas.map((idea) => {
            const isPrimary = idea.is_primary && idea.status === "active";
            return (
              <article
                key={idea.id}
                className={`management-card glass${isPrimary ? " primary" : ""}`}
                style={{ position: "relative" }}
              >
                <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span
                    className={`status-badge${isPrimary ? " gold" : ""}`}
                    style={{
                      background: isPrimary ? "rgba(255,215,0,0.15)" : undefined,
                      color: isPrimary ? "#ffd700" : undefined,
                    }}
                  >
                    {isPrimary ? "✦ PRIMARY IDEA" : idea.status === "active" ? "ACTIVE" : "DRAFT"}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="icon-button"
                      title="Edit idea"
                      onClick={() => openEditModal(idea)}
                      style={{ fontSize: 12, padding: "4px 8px" }}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-button"
                      title="Delete idea"
                      onClick={() => handleDelete(idea.id, idea.title)}
                      style={{ fontSize: 12, padding: "4px 8px", color: "#f87171" }}
                    >
                      ✕
                    </button>
                  </div>
                </header>

                <h3 style={{ fontSize: 18, margin: "0 0 8px" }}>{idea.title}</h3>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, margin: "0 0 14px" }}>
                  {idea.teaser}
                </p>

                <div className="chips" style={{ marginBottom: 14 }}>
                  <i>{STAGES.find((s) => s.value === idea.startup_stage)?.label ?? idea.startup_stage}</i>
                  <i>{formatINR(idea.funding_requested_inr)} requested</i>
                </div>

                <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <strong style={{ fontSize: 14 }}>{formatINR(idea.funding_requested_inr)}</strong>
                  <div style={{ display: "flex", gap: 8 }}>
                    {idea.status === "active" && !idea.is_primary && (
                      <button
                        onClick={() => handleMakePrimary(idea.id)}
                        style={{ fontSize: 11, padding: "5px 9px", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer", color: "inherit" }}
                      >
                        Make primary
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleStatus(idea.id)}
                      style={{ fontSize: 11, padding: "5px 9px", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer", color: "inherit" }}
                    >
                      {idea.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      className="primary"
                      onClick={() => openEditModal(idea)}
                      style={{ fontSize: 11, padding: "5px 10px" }}
                    >
                      Edit
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal for Create/Edit */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(3, 7, 26, 0.82)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="glass"
            style={{
              width: "100%",
              maxWidth: 580,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#08102b",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 19, color: "#ffffff", fontWeight: 800 }}>
                {editingIdea ? "Edit Idea" : "Publish a New Idea"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
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

            {formError && (
              <div
                style={{
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  color: "#fca5a5",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 12,
                  marginBottom: 16,
                }}
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveIdea} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#cbd5e1" }}>
                  Idea Title * (2–120 characters)
                </label>
                <input
                  type="text"
                  placeholder="e.g. VedaGrid, CarbonPulse"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={120}
                  required
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    height: 44,
                    padding: "0 14px",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 10,
                    color: "#ffffff",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#cbd5e1" }}>
                  <label>Public Teaser * (20–420 characters)</label>
                  <span style={{ color: "#94a3b8", fontWeight: 400 }}>{formTeaser.length}/420</span>
                </div>
                <textarea
                  placeholder="A concise, compelling overview visible to discovery..."
                  value={formTeaser}
                  onChange={(e) => setFormTeaser(e.target.value)}
                  maxLength={420}
                  rows={3}
                  required
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 10,
                    color: "#ffffff",
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#cbd5e1" }}>
                    Funding Requested (₹20k – ₹10 Lakhs)
                  </label>
                  <input
                    type="number"
                    min="20000"
                    max="1000000"
                    step="any"
                    value={formFundingAmount}
                    onChange={(e) => setFormFundingAmount(e.target.value)}
                    placeholder="e.g. 67000"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      height: 44,
                      padding: "0 14px",
                      background: "rgba(255,255,255,0.07)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 10,
                      color: "#ffffff",
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
                    <small style={{ color: "#38bdf8", fontSize: 12, fontWeight: 700 }}>
                      {formatINR(Number(formFundingAmount) || 0)} requested
                    </small>
                    <span style={{ color: "#94a3b8", fontSize: 10 }}>Min: ₹20k · Max: ₹10L</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {[
                      { label: "₹20k", val: 20000 },
                      { label: "₹50k", val: 50000 },
                      { label: "₹1L", val: 100000 },
                      { label: "₹2.5L", val: 250000 },
                      { label: "₹5L", val: 500000 },
                      { label: "₹10L", val: 1000000 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setFormFundingAmount(preset.val.toString())}
                        style={{
                          fontSize: 11,
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: Number(formFundingAmount) === preset.val ? "var(--accent, #0c55ed)" : "rgba(255,255,255,0.08)",
                          color: "#ffffff",
                          border: "1px solid rgba(255,255,255,0.15)",
                          cursor: "pointer",
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#cbd5e1" }}>
                    Startup Stage
                  </label>
                  <select
                    value={formStage}
                    onChange={(e) => setFormStage(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      height: 44,
                      padding: "0 14px",
                      background: "#0d1b46",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 10,
                      color: "#ffffff",
                      fontSize: 13,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    {STAGES.map((s) => (
                      <option key={s.value} value={s.value} style={{ background: "#08102b", color: "#ffffff" }}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#cbd5e1" }}>
                  Core Problem (Protected — shown to connections)
                </label>
                <textarea
                  placeholder="What acute pain point are you solving?"
                  value={formProblem}
                  onChange={(e) => setFormProblem(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 10,
                    color: "#ffffff",
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "#cbd5e1" }}>
                  Proposed Solution & Edge
                </label>
                <textarea
                  placeholder="Why does your product win?"
                  value={formSolution}
                  onChange={(e) => setFormSolution(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 10,
                    color: "#ffffff",
                    fontSize: 13,
                    lineHeight: 1.5,
                    resize: "vertical",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "#e2e8f0", cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={formIsPrimary}
                    onChange={(e) => setFormIsPrimary(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#0c55ed", cursor: "pointer" }}
                  />
                  Set as Primary Idea
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "#e2e8f0", cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={formStatus === "active"}
                    onChange={(e) => setFormStatus(e.target.checked ? "active" : "draft")}
                    style={{ width: 16, height: 16, accentColor: "#0c55ed", cursor: "pointer" }}
                  />
                  Publish as Active
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: "9px 18px",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#ffffff",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-small"
                  disabled={saving}
                  style={{
                    background: "#0c55ed",
                    color: "#ffffff",
                    fontWeight: 700,
                    border: "1px solid rgba(255,255,255,0.3)",
                    padding: "9px 20px",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  {saving ? "Saving…" : editingIdea ? "Save Changes" : "Publish Idea →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
