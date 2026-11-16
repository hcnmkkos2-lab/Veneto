# VENETO — menu and administration

The existing storefront remains the public entry point. Start the Node.js API server to connect the menu, cart, Baghdad delivery areas, and checkout to persistent SQLite storage:

```sh
npm install
npm start
```

Configure `SESSION_SECRET`, `OWNER_EMAIL`, `VENETO_SETUP_TOKEN`, and a persistent `DATA_DIR` on a Node.js host. Setup details and security/deployment requirements are in [SECURITY-SETUP.md](SECURITY-SETUP.md). The admin dashboard is `/admin`.

GitHub Pages is static hosting only and cannot run this backend or persist customer orders. Deploy the application on a Node-capable service with a persistent volume and HTTPS. The storefront bridge is injected by the server, so the existing `index.html` design file is not modified.
