# VENETO administration backend — deployment and security setup

## Architecture

This project now includes a Node.js/Express API, SQLite persistence, and an admin dashboard. The server injects `storefront-api.js` at response time into the existing storefront; the original `index.html` design file is preserved. The bridge loads products and Baghdad delivery zones, manages the cart and checkout, displays zone fees, and submits orders to the server. Product prices and delivery charges are recalculated server-side.

SQLite stores admins, invitations, products, areas, orders, technical settings, audit events, and sessions. Store `DATA_DIR` on a persistent host volume. GitHub Pages cannot run this backend or persist orders.

## Run and deploy

Requires Node.js 20+. On a Node.js host with HTTPS and a persistent disk, configure these environment secrets (never commit them):

- `NODE_ENV=production`
- `DATA_DIR` pointing to the persistent mounted volume
- `SESSION_SECRET` (random, at least 32 characters)
- `OWNER_EMAIL` (the primary administrator's email)
- `VENETO_SETUP_TOKEN` (temporary, one-time bootstrap secret)
- `PORT` if required by the provider

Generate secrets locally (for example `openssl rand -hex 32`). Install and start with `npm install` and `npm start`; visit `/` for the menu and `/admin` for management.

First owner setup is available only while no admin exists. The email must equal `OWNER_EMAIL`, and setup token must equal `VENETO_SETUP_TOKEN`. Choose a password of at least 12 characters. Remove the bootstrap token from the host after claiming the owner. Never send passwords, setup tokens, session secrets, or the technical PIN in chat or commit them to the repo. The owner can issue one-use, 24-hour admin invitations and set the hashed 8-digit technical PIN in the dashboard.

## Included features

- Orders persisted and grouped as new, preparing, delivered, cancelled.
- Customer contact, chosen Baghdad area, item snapshot, subtotal, delivery and total displayed for admins.
- Current delivery defaults: Sadr City 2,000 IQD; Hay Ur 1,000 IQD; other areas unset and shown as pending, not zero.
- Technical management for product names/prices/images/visibility and Baghdad delivery fees; changes are audit-logged.
- Rate-limited login/PIN, bcrypt password/PIN hashes, HTTP-only session cookies, CSRF checks, and server-side validation.

## Deployment status

Files are prepared for deployment, but the backend is not running on GitHub and no live service exists until deployed to a Node-capable provider with persistent storage. The personal admin email has not yet been provided. After sharing the email, set it as `OWNER_EMAIL` in the hosting dashboard; the bootstrap/session secrets must be generated and configured there, not in source.
