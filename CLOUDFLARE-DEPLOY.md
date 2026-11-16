# VENETO Cloudflare Workers + D1

The `cloudflare-workers-d1` branch contains a Cloudflare Worker API, D1 migration, customer checkout integration, and admin dashboard API. Follow these steps in order.

## One-time setup

1. In Cloudflare, connect the GitHub repository `hcnmkkos2-lab/Veneto` to a Worker. Choose the `cloudflare-workers-d1` branch (do not deploy the old static-only project).
2. In Worker build settings, set the build command to `npm install` and the deploy command to `npx wrangler deploy`.
3. Set Worker secrets/variables under Settings → Variables and Secrets:
   - `OWNER_EMAIL` (Text): the owner email you will use to sign in.
   - `OWNER_SETUP_TOKEN` (Secret): a unique random token with at least 32 characters. Keep it private; do not send it in chat or commit it.
4. Apply the migration `migrations/0001_initial.sql` to D1 named `veneto-db` using the D1 dashboard's Console (execute the SQL file), or from a local Wrangler CLI: `npm install`, then `npx wrangler d1 migrations apply veneto-db --remote` after authenticating Wrangler with your Cloudflare account.
5. Deploy the Worker. Confirm `/api/health` responds with `{"ok":true}`.
6. Open `/admin`, claim the owner with your email and setup token, and choose a strong password. Remove `OWNER_SETUP_TOKEN` from Worker secrets after setup and redeploy. Set an 8-digit technical PIN in the owner dashboard.
7. Configure product prices and all delivery-area fees in Administration → الإدارة الفنية before accepting live orders. Unset prices intentionally show as “price on request.”

Never share passwords, setup tokens, or Cloudflare API tokens. Do not send live customer orders until a test order is visible in the admin panel and its status can be changed.

## Notes

- This branch is separate from the currently deployed static Worker; it must be selected for deployment or merged first.
- D1 binding is `DB`. The database ID is already configured in `wrangler.json`.
- The deployment source keeps the original Node/SQLite `server.js` for Railway use.
- Cloudflare dashboard interfaces and plan/usage limits can change; confirm current settings in your account.
