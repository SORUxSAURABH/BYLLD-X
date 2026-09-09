# BYLLD X production handoff

The application now uses a webhook-authoritative payment flow: the checkout UI
cannot create a Premium subscription. Only a valid, signed Razorpay
`payment.captured` webhook can complete the server-side payment ledger and
activate the 30-day entitlement.

Before launch, set these server-only deployment variables (do not expose them
with a `NEXT_PUBLIC_` prefix):

- `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) for the signed
  webhook fulfillment RPC.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
- `RAZORPAY_WEBHOOK_SECRET` (the existing `PAYMENT_WEBHOOK_SECRET` name is also
  accepted for compatibility).
- A newly generated `ADMIN_SECRET_KEY`; the old embedded default has been
  removed.

Apply all migrations, including
`supabase/migrations/20260909010325_production_hardening.sql`. It enables
Realtime publication for `messages` and `presence`, and hardens the payment
ledger function.

In Razorpay, configure `https://YOUR_DOMAIN/api/payment/webhook` for the
`payment.captured` event using the exact same webhook secret. Run one real test
payment with two separate accounts before publishing: order creation, payment
capture, webhook receipt, Premium activation, a message send, and receipt of
the message in the other browser session.

Do not enable production traffic until the webhook test has activated Premium
without any client-side database write.
