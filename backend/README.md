# ProdMate backend (Phase 3)

Minimal Fastify API: auth, Gemini proxy, tracker export.

## Quick start

1. Start Postgres (optional compose file included — requires Docker):

```bash
docker compose up -d
```

Or point `DATABASE_URL` at any Postgres 16+ instance.

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
