# BYLLD X

BYLLD X is a mobile-first network for startup founders and investors in India. The current build includes the complete public experience, role-aware product preview, discovery, idea management, network, inbox, Premium checkout preview, private admin entry, legal pages, security headers and a normalized Supabase schema with row-level security.

## Run locally

Requirements: Node.js 22.13+ and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Production services

The deployed public preview contains fictional data and no secrets. To accept real accounts:

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and add the project URL and publishable key.
3. Review and apply the migration under `supabase/migrations`.
4. Enable Google and GitHub providers and configure exact redirect URLs.
5. Add `SUPABASE_SECRET_KEY` (or the legacy service-role key) only to the server environment when enabling live payment fulfillment.
6. Run Supabase security and performance advisors before enabling public registration.

Never put a Supabase secret/service-role key or payment webhook secret in a `NEXT_PUBLIC_` variable.

## Payment status

Checkout automatically uses local mock mode while `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are blank. To enable live monthly checkout, configure both keys, `RAZORPAY_WEBHOOK_SECRET`, and a server-only Supabase secret, then register `/api/payment/webhook` for Razorpay's `payment.captured` event. The verified webhook activates Founder Premium at ₹240/month or Investor Premium at ₹310/month; browser callbacks never grant live Premium directly.

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

See `SECURITY.md` for the launch checklist.

## Deploy on Hostinger

Create a **Node.js / Next.js application** in Hostinger rather than a static website. Use:

- Node.js version: `22`
- Install command: `npm ci`
- Build command: `npm run build`
- Start command: `npm run start`
- Output directory: `.next`

The default build now produces Hostinger's standard `.next` server output. The Cloudflare/Sites adapter remains available through `npm run build:sites`.
