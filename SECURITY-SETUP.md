# VENETO administration backend — deployment and security setup

## Current architecture

The repository now includes a Node.js/Express API and SQLite database. The server injects `storefront-api.js` into the existing `index.html` response at runtime; the committed storefront design file itself is not changed. The bridge loads products and Baghdad areas from the API, adds cart actions and customer checkout, and submits orders to the server. Server-side product prices and delivery fees are authoritative.

SQLite holds products, Baghdad delivery zones, orders, admins, invitations, settings, and audit events. The database and session store must live on a persistent disk provided by the hosting service. GitHub Pages cannot run Node.js or save order data.

## Deployment prerequisites

Use Node.js 20+ on a host that supports a persistent volume and HTTPS. Configure these environment variables in the host's secret manager (never commit secret values):

- `NODE_ENV=production`
- `PORT` (normally provided by the platform)
- `DATA_DIR` on a persistent mounted volume
- `SESSION_SECRET`: random value with at least 32 characters
- `OWNER_EMAIL`: exact first-owner email
- `VENETO_SETUP_TOKEN`: temporary random bootstrap secret

Generate private secrets locally, for example `openssl rand -hex 32`. Do not send passwords, bootstrap secrets, or the technical PIN in chat or commit them to Git. The owner email can be provided for setup, but credentials/secrets belong only in the hosting dashboard.

Build/run commands: `npm install` then `npm start`. The process serves the menu at `/` and management at `/admin`.

## Initial owner and access

On the first deployment only, `/admin` shows the owner setup form. The account email must exactly match `OWNER_EMAIL` and the one-time token must match `VENETO_SETUP_TOKEN`; set a strong password of at least 12 characters. After successfully claiming the owner account, remove `VENETO_SETUP_TOKEN` from the host configuration. The setup endpoint is permanently disabled after the first account is created.

The owner can create a time-limited, one-use invitation for other admins. Sessions use HTTP-only, secure (production), same-site cookies and a SQLite session store; password hashes and technical PIN hashes are bcrypt-protected. Login and PIN entry are rate-limited. The owner sets the eight-digit technical PIN in the owner dashboard. It is not present in the browser or source.

## Features

- Orders saved server-side and visible in `/admin`, grouped as new, preparing, delivered, or cancelled.
- Customer name, phone, selected Baghdad neighborhood, item snapshot, quantities, delivery fee, subtotal and total shown to managers.
- Server calculates order totals from current database prices and selected zone, never from client-provided amounts.
- Fees: Sadr City 2,000 IQD and Hay Ur 1,000 IQD. Unset fees/prices stay null and are not incorrectly treated as zero; the buyer sees that the final amount needs confirmation.
- Technical tools manage products and Baghdad zones/fees. Deleting a product is soft-hide, retaining order history. Changes are audit-logged.

## Important operational note

No host or administrator email was supplied, so this repository update cannot deploy the service, create the owner account, or provide a live public preview. Do not collect real customer data until deployed behind HTTPS with secrets configured and persistent storage verified. After sharing the owner email, configure that address as `OWNER_EMAIL` in the hosting provider; do not share passwords or secret PINs here.
