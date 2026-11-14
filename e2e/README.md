# Bundled widget browser tests

These tests drive a temporary published Experience Builder app. They do not run the Front-End Playwright suite.

Live means the runtime window at `/experience/e2e-live/`. The published config has no `__not_publish` flag. The builder Live view button is not used.

The server must already be running:

```
cd Audiom-Esri/ArcGIS/server
npm start -- --port 3000 --https_port 3001
```

The indoor rules and speech strings come from the Front-End dev server on port 3002 (`npm run dev` in Audiom-Front-End).

Then, from the workspace root:

```
node Audiom-Front-End/node_modules/@playwright/test/cli.js test --config Audiom-Esri/e2e/playwright.config.cjs
```

Setup writes `ArcGIS/server/public/apps/e2e-live/` and teardown deletes it. That folder is gitignored. The fixture uses the public Esri Building web map and does not store an API key.

What the suite covers, and which widget features are still missing, is in [missing-features.md](missing-features.md).