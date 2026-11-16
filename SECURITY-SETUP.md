# VENETO administration backend — deployment and security setup

## Architecture

This project includes a Node.js/Express API, SQLite persistence, and an admin dashboard. The server injects `storefront-api.js` at response time into the existing storefront; the original `index.html` design file is preserved. The bridge loads products and Baghdad delivery zones, manages cart/checkout, displays zone fees, and submits orders to the server. Product prices and delivery charges are recalculated server-side.

SQLite stores admins, invitations, products, areas, orders, technical settings, audit events, and sessions. The database and session store must be on a persistent disk. GitHub Pages cannot run the backend or persist orders.

## Render deployment

`render.yaml` describes a Node web service in Frankfurt with a persistent 1 GB disk at `/var/data`, `DATA_DIR=/var/data`, `/api/health` health check, and production mode. It is configured for Render Starter because Render persistent disks require a paid service plan; check Render's current pricing and disk documentation before deploying.

To deploy, connect the GitHub repository from the Render dashboard and create a Blueprint from `render.yaml`. Render will generate the session secret and temporary bootstrap token. Set `OWNER_EMAIL` to the owner's email (`hcnmkkso1@gmail.com`) in the private Render environment settings. The public GitHub repository does not contain these credentials.

After the service reports healthy, open `/admin`. The one-time first-owner setup requires the configured email and temporary `VENETO_SETUP_TOKEN`. Retrieve the token privately from Render's environment settings, create a strong password (12+ characters), then delete the bootstrap-token environment variable and redeploy. The owner can then configure the eight-digit technical PIN from the dashboard. Never share passwords, session secrets, setup tokens, or the PIN in chat or commit them to source control.

A Render persistent disk retains SQLite and session files across deploys. Do not scale this SQLite service horizontally to multiple instances. If traffic grows, migrate to a managed PostgreSQL database and shared session storage.

## Local run

Requires Node.js 20+:

```sh
npm install
npm start
```

## Features and limits

- Orders saved persistently and grouped as new, preparing, delivered, and cancelled.
- Customer contact, chosen Baghdad neighborhood, product snapshot, quantities, subtotal, delivery charge, and total visible in `/admin`.
- Prices and delivery fees calculated server-side. Sadr City is seeded at 2,000 IQD and Hay Ur at 1,000 IQD; unknown product prices or area fees remain unset and are not assumed to be zero.
- Technical management for products and Baghdad delivery areas; mutations are audit-logged.
- Rate-limited login/PIN, bcrypt password/PIN hashes, HTTP-only production cookies, CSRF checks, and server-side validation.

## Deployment status

The Blueprint configuration is in the repository, but it does not provision a Render service automatically. A repository owner must connect GitHub and confirm the Blueprint in Render, review any plan/disk charges, set the private owner email environment value, and deploy. No live hosted URL exists until those external steps complete.
