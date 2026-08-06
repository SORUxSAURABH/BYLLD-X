# BYLLD X security baseline

The public build intentionally contains no production credentials and no client-side admin bypass. The member routes are a fictional-data product preview until a Supabase project is connected.

Before accepting real users:

1. Create a dedicated Supabase project and use its publishable key in the browser. Never expose a secret or service-role key.
2. Apply and review the SQL migration, then run Supabase security and performance advisors.
3. Enable Google and GitHub in Supabase Auth and restrict redirect URLs to exact trusted origins.
4. Validate sessions on the server using verified claims; do not trust browser role values or user-editable metadata.
5. Store permanent roles and admin authorization in protected application data/app metadata, not user metadata.
6. Keep authenticated responses private and non-cacheable; never cache responses containing refreshed auth cookies.
7. Configure rate limiting and CAPTCHA for sign-up, password recovery, reports and connection requests.
8. Verify payment webhooks with a server-only secret and make fulfillment idempotent before enabling real checkout.
9. Use a private storage bucket for profile photos with ownership policies, MIME allowlists and file-size limits.
10. Review the legal drafts with qualified Indian counsel before commercial launch.

The application sends defensive browser headers for clickjacking, MIME sniffing, referrer leakage and unnecessary device permissions. Authenticated profiles and admin/member routes are excluded from indexing.
