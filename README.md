# VENETO — menu and administration

The existing storefront layout and source file are preserved. The Node.js server injects an API bridge at runtime to connect its menu and Baghdad delivery checkout to persistent SQLite storage.

## Deploy on Railway

A Railway configuration is provided in `railway.json`. The service runs `npm install` / `npm start` and uses `/api/health` for its health check.

1. Sign in to Railway, create a project, and select **Deploy from GitHub repo**. Connect GitHub and choose `hcnmkkos2-lab/Veneto`.
2. In the service settings, add a Volume mounted at `/data` and set `DATA_DIR=/data`. The volume is required to persist the SQLite database and sessions through redeploys.
3. Set private service variables in Railway: `NODE_ENV=production`, `DATA_DIR=/data`, `OWNER_EMAIL` (the manager's email), `SESSION_SECRET` (random, 32+ characters), and `VENETO_SETUP_TOKEN` (a temporary random token).
4. Generate the secrets in Railway or locally using a secure random generator. Never commit or share the session secret, setup token, password, or technical PIN.
5. Deploy and wait for `/api/health` to pass. Railway provides a public domain in service settings. The menu is at `/` and administration at `/admin`.
6. Use the private setup token from Railway's Variables page to create the first owner. After setup, remove `VENETO_SETUP_TOKEN` and redeploy. Set the 8-digit technical PIN inside the owner dashboard.

Do not run multiple service replicas against the same SQLite file. Railway volumes are attached to a service and persist independently of the ephemeral deployment filesystem. Confirm current Railway plan/usage costs in your dashboard before deploying.

## Local development

Node.js 20+ required:

```sh
npm install
npm start
```

See [SECURITY-SETUP.md](SECURITY-SETUP.md). GitHub Pages alone cannot run the server or database.
