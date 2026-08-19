# rtm-image-parser

Reusable document extraction microservice. Upload a document image (ticket,
invoice, ...), it gets processed by one or more vision-capable LLMs (Azure
OpenAI, Gemini), the outputs are crosschecked against each other and
validated against a configurable JSON Schema, and a structured JSON result is
returned.

## Architecture

Hexagonal (ports & adapters):

```
src/
  domain/        # pure business logic: pipeline orchestration, crosscheck,
                  # schema versioning rules. No framework/DB/LLM SDK imports.
    entities/
    ports/        # LLMVisionProviderPort, SchemaRepositoryPort, ExtractionLogRepositoryPort
    services/
  adapters/       # concrete implementations of the ports above
    llm/azure-openai/
    llm/gemini/
    validation/   # ajv JSON Schema validator, injected into the domain as a plain function
    persistence/postgres/
    http/         # Fastify routes/controllers
  config/         # loads and validates .env — the ONLY place process.env is read
```

The domain never imports from `adapters/`, `pg`, `kysely`, `fastify`, `ajv`,
or any LLM SDK. Adapters depend on domain ports, never the reverse.

## Requirements

- Node.js 20+
- Docker + Docker Compose (recommended way to run everything, including Postgres)

## Environment variables

Copy `.env.example` to `.env` and fill in values:

| Variable | Required when | Notes |
|---|---|---|
| `EXTRACTION_MODELS` | always | Comma-separated model ids for the pipeline, e.g. `azure-gpt-4o,gemini-1.5-pro`. Only `azure-*` and `gemini-*` ids are supported; unrecognized ids are logged as a warning and skipped at startup. If none of the listed ids are recognized, the service fails to start. |
| `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION`, `AZURE_OPENAI_DEPLOYMENT_NAME` | an `azure-*` model is in `EXTRACTION_MODELS` | |
| `GEMINI_API_KEY`, `GEMINI_MODEL_NAME` | a `gemini-*` model is in `EXTRACTION_MODELS` | |
| `CROSSCHECK_THRESHOLD` | always (defaults to `0.9`) | Minimum fraction of matching fields for a multi-model result to be accepted. |
| `CROSSCHECK_NUMERIC_TOLERANCE` | always (defaults to `0.01`) | Relative tolerance used when comparing numeric fields across models. |
| `MAX_RETRIES_PER_MODEL` | always (defaults to `2`) | Retries per model when its output fails schema validation, before dropping that model. |
| `LLM_REQUEST_TIMEOUT_MS` | always (defaults to `30000`) | Per-request timeout for LLM provider calls. |
| `MAX_IMAGE_SIZE_MB` | always (defaults to `10`) | |
| `ALLOWED_MIME_TYPES` | always (defaults to `image/jpeg,image/png,image/webp`) | |
| `DATABASE_URL` | always | |
| `PORT` | always (defaults to `3000`) | |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | only used by `docker-compose.yml` to provision the `db` service | |

Only `src/config/` reads `process.env`; every other module receives a typed
`Config` object.

## Running with Docker (recommended)

```bash
cp .env.example .env
# fill in AZURE_OPENAI_* and/or GEMINI_* credentials for the models you listed
# in EXTRACTION_MODELS

docker compose up -d --build
```

This starts `db` (Postgres, with a healthcheck gating `api`'s startup) and
`api` (this service). `DATABASE_URL` in `.env` is meant for host-side tooling
(see below); the `api` container gets a compose-network-correct
`DATABASE_URL` (pointing at `db`) via an override in `docker-compose.yml`,
built from the same `POSTGRES_*` variables — no duplicated credentials.

Run database migrations (creates tables + seeds the `ticket`/`factura`
templates):

```bash
docker compose run --rm api npm run migrate:up
```

Check it's up:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/v1/templates
```

## Running locally without Docker

```bash
npm install
cp .env.example .env   # DATABASE_URL here should point at localhost:5432
docker compose up -d db
npm run migrate:up
npm run dev
```

## Tests

```bash
npm test
```

Unit tests run with no external dependencies. Integration tests (Postgres
adapters + HTTP endpoints) need a reachable database — start one with
`docker compose up -d db` (and run migrations) first; they set
`TEST_DATABASE_URL`/`DATABASE_URL` from `.env` and skip cleanly (with a
console warning) if no database is reachable.

## API

### `POST /v1/extract`

Accepts either `multipart/form-data` (`image` file field + `document_type`
field) or JSON:

```json
{
  "imageBase64": "...",
  "mimeType": "image/png",
  "documentType": "ticket"
}
```

Input (mime type, size, and whether `document_type` has an active schema) is
validated before any LLM is called. Before calling any model, the pipeline
also checks for a previous **successful** result for the same image (sha256
of the raw bytes) + `document_type` + active schema version; on a hit it
returns that result directly (`metadata.cached: true`, no LLM calls made).

**200 OK** — result accepted (single model, multiple models that agreed above
`CROSSCHECK_THRESHOLD`, or a cache hit):

```json
{
  "data": { "merchant": "Acme", "total": 42.5, "currency": "EUR" },
  "metadata": {
    "modelsUsed": ["azure-gpt-4o", "gemini-1.5-pro"],
    "modelsDropped": [],
    "confidence": 1,
    "processingTimeMs": 842,
    "schemaVersion": 1,
    "cached": false
  }
}
```

**400 Bad Request** — invalid mime type, image too large, or unknown
`document_type`. No LLM was called.

**422 Unprocessable Entity** — models disagreed beyond the configured
threshold; no winner is invented:

```json
{
  "error": "crosscheck_discordant",
  "score": 0.5,
  "mismatches": [
    { "field": "total", "kind": "value_mismatch", "values": { "azure-gpt-4o": 42.5, "gemini-1.5-pro": 45.0 } }
  ],
  "metadata": { "...": "..." }
}
```

**502 Bad Gateway** — every configured model failed to produce schema-valid
output after retries.

### Schema registry

```
GET    /v1/templates
POST   /v1/schemas                       { documentType, basedOnTemplate?, schema?, fieldHints? }
GET    /v1/schemas/:document_type
PUT    /v1/schemas/:document_type        { schema?, fieldHints? }   # inserts a new version, never overwrites
GET    /v1/schemas/:document_type/versions
```

## Out of scope for this phase

- **Authentication**: not implemented. `src/adapters/http/plugins/auth.placeholder.ts`
  is a no-op `preHandler` hook already wired into every route — a real auth
  check can be added there later without touching route definitions.
- **Visual schema form builder / schema import-export**: not implemented. The
  `SchemaTemplate`/`SchemaDefinition` data model does not need to change to
  add these later.
