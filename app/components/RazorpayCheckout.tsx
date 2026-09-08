"use client";
import { useState } from "react";

interface RazorpayCheckoutProps {
  role: "founder" | "investor";
  onSuccess: (mode: "mock" | "live") => void;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function RazorpayCheckout({ role, onSuccess }: RazorpayCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<"mock" | "live" | null>(null);
  const [invoiceInfo, setInvoiceInfo] = useState<{ invoiceNumber?: string; startsAt?: string; endsAt?: string } | null>(null);
  const price = role === "investor" ? 310 : 240;

  async function waitForWebhookActivation() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await fetch("/api/payment/create-order", { cache: "no-store" });
      if (response.ok) {
        const status = await response.json();
        if (status.isPremium) return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    return false;
  }

  function downloadReceipt() {
    const invNo = invoiceInfo?.invoiceNumber || `BYLLD-${Math.floor(100000 + Math.random() * 900000)}`;
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

  async function handleCheckout() {
    setLoading(true);
    setError("");

    // Create order on server
    const res = await fetch("/api/payment/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mock-role": role,
      },
    });
    const order = await res.json();

    if (!res.ok) {
      setError(order.error ?? "Could not create payment order.");
      setLoading(false);
      return;
    }

    // Mock mode — confirm and activate
    if (order.mock) {
      let invData = null;
      try {
        const confirmRes = await fetch("/api/payment/mock-confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, orderId: order.orderId }),
        });
        invData = await confirmRes.json();
        if (!confirmRes.ok) throw new Error(invData.error ?? "Could not confirm mock checkout");
      } catch (confirmError) {
        setError(confirmError instanceof Error ? confirmError.message : "Could not confirm mock checkout");
        setLoading(false);
        return;
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("bylldx_mock_premium", "true");
        localStorage.setItem("bylldx_mock_premium_expiry", (Date.now() + 30 * 86400000).toString());
      }

      setInvoiceInfo(invData);
      setCheckoutMode("mock");
      setSuccess(true);
      setLoading(false);
      onSuccess("mock");
      return;
    }

    // Load Razorpay script
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      setError("Could not load payment gateway. Check your internet connection.");
      setLoading(false);
      return;
    }

    // Open Razorpay checkout
    const rzp = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "BYLLD X",
      description: `${role === "investor" ? "Investor" : "Founder"} Premium — 1 month`,
      order_id: order.orderId,
      prefill: {
        name: order.userName,
        email: order.userEmail,
      },
      theme: { color: "#0c55ed" },
      handler: async function (response: {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
      }) {
        setLoading(true);
        try {
          const verifyRes = await fetch("/api/payment/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              role,
            }),
          });
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || !verifyData.verified) {
            throw new Error(verifyData.error || "Payment verification failed");
          }

          setInvoiceInfo(verifyData);
          setCheckoutMode("live");
          setSuccess(true);
          setLoading(false);
          onSuccess("live");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Payment verification failed");
          setLoading(false);
        }
      },
      modal: {
        ondismiss: function () {
          setLoading(false);
        },
      },
    });

    // Handle payment failure event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rzp as any).on?.("payment.failed", function (resp: any) {
      setError(resp.error?.description || "Payment failed. Please try again.");
      setLoading(false);
    });

    rzp.open();
  }

  if (success) {
    return (
      <div
        style={{
          padding: "24px",
          background: "rgba(34,197,94,0.1)",
          border: "1px solid rgba(34,197,94,0.3)",
          borderRadius: 14,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8, color: "#22c55e" }}>✓</div>
        <strong style={{ color: "#22c55e", fontSize: 16, display: "block" }}>
          {checkoutMode === "mock" ? "Mock Premium Activated" : "Premium Activated Successfully!"}
        </strong>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 16px" }}>
          Your {role === "founder" ? "Founder" : "Investor"} Premium access is active for 30 days. Limits have been unlocked.
        </p>
        {checkoutMode === "mock" && (
          <button
            onClick={downloadReceipt}
            className="button button-small"
            style={{
              background: "var(--blue, #0c55ed)",
              color: "#ffffff",
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            📄 Download Test Receipt
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        id="btn-razorpay-checkout"
        className="button"
        onClick={handleCheckout}
        disabled={loading}
        style={{ width: "100%", justifyContent: "center", cursor: "pointer" }}
      >
        {loading ? "Processing payment…" : `Pay ₹${price} — Activate Premium →`}
      </button>
      {error && (
        <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{error}</p>
      )}
      <p style={{ fontSize: 10, color: "var(--muted, #94a3b8)", marginTop: 10, lineHeight: 1.6 }}>
        Payments are processed securely via Razorpay (UPI, cards, net banking). When no live keys are configured, checkout activates via instant test confirmation.
      </p>
    </div>
  );
}
