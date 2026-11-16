# VENETO administration backend — deployment and security setup

## Repository inspection / current state

The existing project was a static storefront (`index.html` and `README.md`) with browser-only cart behavior. It had no server, database, or authentication, and GitHub Pages was not enabled. A static GitHub Pages deployment cannot safely store admin credentials, verify the technical PIN, or persist customer orders.

This addition preserves the storefront and provides a Node.js/SQLite backend plus a separate admin dashboard. The SQLite database and session store must be placed on a persistent disk provided by the hosting platform. This repository change alone does not deploy or connect the API to the existing public storefront.

## Run locally

Requires Node.js 20+.

```sh
npm install
```

Set environment variables in the server environment (never commit these values):

- `SESSION_SECRET`: random secret, at least 32 characters.
- `OWNER_EMAIL`: exact email allowed to claim the first owner account.
- `VENETO_SETUP_TOKEN`: one-time bootstrap secret. Generate a long random token, keep it private, and remove/rotate it after the first owner is created.
- `DATA_DIR`: path on persistent disk for the SQLite DB and session store (default `./data`).
- `NODE_ENV=production` and optionally `PORT`.

Example random values can be generated locally with `openssl rand -hex 32`; do not paste them into source files or commit them.

Then start the server:

```sh
npm start
```

Open `/admin`. The first owner is created through the setup form only when the database contains no administrators; the email must match `OWNER_EMAIL` and the one-time token must match `VENETO_SETUP_TOKEN`. Choose a strong password of at least 12 characters. After setup, remove `VENETO_SETUP_TOKEN` from the host environment. Additional admin accounts require a one-use, 24-hour invitation issued by the owner through the admin API.

The primary owner sets an eight-digit technical PIN from the dashboard. The PIN is bcrypt-hashed in the database; it is never included in browser code. Technical unlock lasts 20 minutes, is rate-limited, and technical mutations are written to `audit_log`.

## API scope

- Public menu and delivery-zone data: `GET /api/menu`.
- Customer order submission: `POST /api/orders`; server validates product/zone IDs and computes totals from database prices rather than trusting browser-supplied amounts.
- Admin sessions, first-owner setup and owner-issued invites.
- Admin order list/status management (`new`, `preparing`, `delivered`, `cancelled`).
- Technical product and Baghdad delivery-area management; unavailable prices/fees remain unset, not zero.

Seed values preserve the existing menu names and current Baghdad area names. The example delivery fees are Sadr City 2,000 IQD and Hay Ur 1,000 IQD; other areas are deliberately unset.

## Important integration/deployment limitation

The current `index.html` remains untouched, as requested. Its current checkout is a browser demo and copies order details; it does not yet submit to `/api/orders`. Before real orders can appear in the dashboard, the storefront needs a small integration change to load zones/products from `/api/menu`, submit customer details and cart item IDs to `/api/orders`, and display the server-calculated fee/total. No administrator email or production host was supplied, so production login, persistent storage, order delivery, and end-to-end testing cannot be completed from the repository alone.

Use a Node-capable host with persistent volumes and HTTPS (not GitHub Pages alone). Configure the secrets above there, then connect a suitable domain or reverse proxy. Never use real customer personal data against an unconfigured demo deployment.
