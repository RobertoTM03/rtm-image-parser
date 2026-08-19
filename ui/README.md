# rtm-image-parser UI

Small React + Vite UI for the [rtm-image-parser](../README.md) API:

- **Schemas** tab: browse the seed templates, create new `SchemaDefinition`s
  (from scratch or based on a template), edit an existing schema's JSON
  Schema/field hints (saves as a new version), and view its version history.
- **Extract** tab: pick a document type, upload an image, and see the
  validated JSON result (or the crosscheck mismatch detail on disagreement).

## Running

```bash
cd ui
npm install
cp .env.example .env   # VITE_API_BASE_URL, defaults to http://localhost:3000
npm run dev
```

Requires the API (`../`) to be running and reachable at `VITE_API_BASE_URL`
— see the root README for how to start it (`docker compose up -d --build`).
The API has CORS enabled for all origins in this phase (no auth exists yet),
so no extra configuration is needed to call it from the Vite dev server.

## Build

```bash
npm run build   # type-checks then outputs a static bundle to dist/
```
