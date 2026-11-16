# VENETO — menu and administration

The existing storefront layout and source file are preserved. A Node.js server injects an API bridge at runtime to connect its menu and Baghdad delivery checkout to persistent SQLite storage.

## Start

Node.js 20+ required. Configure `NODE_ENV`, `DATA_DIR` (persistent disk in production), `SESSION_SECRET`, `OWNER_EMAIL`, and the temporary `VENETO_SETUP_TOKEN` in the host environment. Then run:

```sh
npm install
npm start
```

Open `/` for the storefront and `/admin` for the protected administration dashboard. Read [SECURITY-SETUP.md](SECURITY-SETUP.md) before deployment. GitHub Pages alone cannot run the server or database; use a Node.js host with persistent storage and HTTPS.
