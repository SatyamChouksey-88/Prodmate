# ProdMate backend (Phase 3)

Minimal Fastify API: auth, Gemini proxy, tracker export.

## Quick start

1. Start Postgres **with pgvector** (Phase 7 Knowledge Mesh). The compose file uses `pgvector/pgvector:pg16` — plain `postgres` images will fail `CREATE EXTENSION vector`.

```bash
docker compose up -d
```

Or point `DATABASE_URL` at any Postgres 16+ instance that has the **vector** extension available.

**Azure Flexible Server:** before migrate, add `vector` to the `azure.extensions` allow-list (Azure Portal → Server parameters → `azure.extensions`, or CLI). Without that, `schema_phase7.sql` cannot create the extension.

2. Copy env and fill secrets:

```bash
cp .env.example .env
```

Required:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `GEMINI_API_KEY` | Server-only Gemini key |
| `SESSION_SECRET` | Cookie signing / entropy (≥32 chars) |
| `CREDENTIALS_ENCRYPTION_KEY` | **AES-256-GCM key** for tracker PATs/tokens at rest — base64 of 32 random bytes. Phase 3 keeps this in an env var (internal project). Azure Key Vault is later hardening. |

Generate encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

3. Migrate + run:

```bash
npm install
npm run migrate
npm run dev
```

API listens on `http://localhost:4000` by default.

4. Point the frontend at the API (frontend `.env.local`):

```
VITE_API_URL=http://localhost:4000
```

## Auth (D3)

- Email + password; passwords hashed with **bcrypt cost 12**
- Session cookie `prodmate_session`: `HttpOnly`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`
- No MFA / refresh-token rotation in this phase

## Main routes

- `POST /api/auth/register` | `login` | `logout`
- `GET /api/auth/me`
- `POST /api/generate` (auth required)
- `POST /api/export` (auth required)
- `POST /api/tracker/test` (auth required)
- `GET|PUT /api/tracker/settings` (auth required; secrets encrypted at rest)
- `GET|POST|DELETE /api/knowledge/documents` (auth required; Phase 7 Knowledge Mesh)
- `GET /api/history` | `DELETE /api/history` | `DELETE /api/history/:id`

## Knowledge Mesh (Phase 7)

- Embeddings: `gemini-embedding-001` at **768** dims with **manual L2-normalize**
- Chunking: ~600 tokens, ~12% overlap
- Isolation: every retrieval filters `WHERE user_id = $1` (D9)
- Manual knowledge textarea on the generate form remains override/fallback

### Isolation test

```bash
# Requires real Postgres+pgvector (not embedded-postgres)
set TEST_DATABASE_URL=postgres://prodmate:prodmate@localhost:5432/prodmate
npm test
```

If `TEST_DATABASE_URL` is unset, the pgvector isolation suite is **skipped** (not treated as verified).
