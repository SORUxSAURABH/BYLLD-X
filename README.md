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
5. Implement the server transaction layer for weekly counters, connection state, message permissions, subscription expiry and verified payment webhooks.
6. Run Supabase security and performance advisors before enabling public registration.

Never put a Supabase secret/service-role key or payment webhook secret in a `NEXT_PUBLIC_` variable.

## Payment status

Checkout is intentionally in mock/test mode. No real payment provider is represented as active. A provider adapter can later support UPI, cards, net banking and wallets after merchant credentials and signed webhook verification are configured.

## Verification

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit --omit=dev
```

See `SECURITY.md` for the launch checklist.
