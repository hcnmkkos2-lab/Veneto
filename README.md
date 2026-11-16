# VENETO — menu and administration

The existing storefront layout and source file are preserved. The Node.js server injects an API bridge at runtime to connect its menu and Baghdad delivery checkout to persistent SQLite storage.

## Deployment on Render

A Render Blueprint is provided in `render.yaml`. It defines a Node web service in Frankfurt, health check, and a persistent disk mounted at `/var/data`. The service uses Render's paid Starter plan because persistent disks are required for SQLite durability; verify current pricing in Render before creating the service.

1. Sign in to Render and connect your GitHub account.
2. Choose **New → Blueprint**, select `hcnmkkos2-lab/Veneto`, and deploy the `render.yaml` configuration.
3. When prompted, provide `OWNER_EMAIL` as `hcnmkkso1@gmail.com`. Render generates the session and initial setup secrets from the Blueprint.
4. Wait for the service build and `/api/health` check to pass. Open the generated `onrender.com` URL; `/` is the menu and `/admin` is the admin setup/login page.
5. Use the bootstrap token shown only in the Render environment settings to create the owner account, then remove `VENETO_SETUP_TOKEN` from the service environment and redeploy.
6. In the owner dashboard, set the eight-digit technical PIN. Do not send passwords, bootstrap tokens, session secrets, or the PIN through chat or commit them to Git.

The persistent volume stores SQLite data across restarts and deployments. Do not deploy the same SQLite database to multiple service instances.

## Local development

Node.js 20+ required:

```sh
npm install
npm start
```

See [SECURITY-SETUP.md](SECURITY-SETUP.md) for authentication and operations details. This repository change prepares deployment but does not itself create a Render account/service; the owner must authorize the GitHub connection and confirm deployment in Render.
