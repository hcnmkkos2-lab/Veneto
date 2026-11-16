# VENETO Cloudflare Workers + D1

This branch contains a Cloudflare Workers adaptation of the VENETO storefront and administration API. The D1 schema/migration is in `migrations/0001_initial.sql`.

## Configure deployment

1. In `wrangler.json`, replace `REPLACE_WITH_D1_DATABASE_ID` with the database ID shown in Cloudflare D1 for `veneto-db`.
2. In your GitHub-connected Worker build settings, use `npm install` as the build command and `npx wrangler deploy` as the deploy command. Alternatively run `npm install`, `npm run db:migrate`, and `npm run deploy` from a local machine with Wrangler authenticated.
3. Set Worker secrets/variables in Cloudflare Settings → Variables and Secrets:
   - `OWNER_EMAIL`: owner's email.
   - `OWNER_SETUP_TOKEN`: temporary random setup token, at least 32 characters.
4. Apply the migration to the production D1 database once: `npx wrangler d1 migrations apply veneto-db --remote`.
5. Deploy, open `/admin`, claim the owner with email and setup token, then remove `OWNER_SETUP_TOKEN` from secrets and redeploy. Set an 8-digit technical PIN in the owner dashboard.

Never place credentials or setup tokens in GitHub or public messages. Configure secrets only in Cloudflare. Do not send customer orders until a real test order has been verified in the admin dashboard.

## Important

- This is a separate Cloudflare deployment configuration; the previous static-only Worker is not automatically updated until Cloudflare is connected to this branch or this branch is merged.
- D1 binding name must remain `DB`; static asset binding is `ASSETS`.
- Prices and delivery charges marked unknown must be filled in the technical admin before relying on totals. Only existing configured prices are seeded; unknown prices/fees intentionally remain unset.
- Existing Node/SQLite `server.js` remains unchanged on this branch for Railway compatibility.
- Test authentication, order submission, status updates, management APIs, and mobile layout before real customer use.
