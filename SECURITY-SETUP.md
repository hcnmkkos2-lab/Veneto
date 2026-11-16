# VENETO backend deployment and security

## Architecture

This project includes a Node.js/Express API, SQLite persistence, and an admin dashboard. The server injects `storefront-api.js` at response time into the existing storefront; the original `index.html` design file is preserved. The bridge loads products and Baghdad delivery zones, manages cart/checkout, displays zone fees, and submits orders to the server. Product prices and delivery charges are recalculated server-side.

SQLite stores admins, invitations, products, areas, orders, technical settings, audit events, and sessions. The database and session store must be on persistent storage. GitHub Pages cannot run the backend or persist orders.

## Railway deployment

`railway.json` configures the Node service build/start commands and `/api/health` check. To deploy:

1. Create a Railway project from the GitHub repository.
2. Attach a persistent Volume to the service, mounted at `/data`; set `DATA_DIR=/data`.
3. Configure private variables: `NODE_ENV=production`, `OWNER_EMAIL` (owner's email), `SESSION_SECRET` (random, at least 32 characters), and temporary `VENETO_SETUP_TOKEN` (random).
4. Deploy and check health; access the storefront at `/` and admin at `/admin`.
5. Claim the first owner using the configured email and temporary setup token; then remove `VENETO_SETUP_TOKEN` from service variables and redeploy. Set the technical 8-digit PIN in the owner dashboard.

Never commit or send passwords, setup tokens, session secrets, or the technical PIN. Configure them only in Railway's private Variables settings. Check the current Railway subscription and usage charges before provisioning. SQLite is intended for a single service instance here; do not scale multiple writers against the same DB volume.

## Included features

- Orders saved persistently and grouped as new, preparing, delivered, and cancelled.
- Customer contact, chosen Baghdad neighborhood, product snapshot, quantities, subtotal, delivery charge, and total visible in `/admin`.
- Server-side price and fee calculations. Sadr City is 2,000 IQD and Hay Ur is 1,000 IQD; unknown product prices or area fees remain unset and require confirmation.
- Technical management for products and Baghdad delivery areas; changes are audit-logged.
- Rate-limited login/PIN, bcrypt password/PIN hashes, HTTP-only production cookies, CSRF checks, and server-side validation.

The repository is configured for Railway but does not itself create a Railway account or deploy a live service. A repository owner must connect GitHub, attach the volume, set private variables, review costs, and deploy. No live URL exists until those steps complete.
