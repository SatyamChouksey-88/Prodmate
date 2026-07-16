# ProdMate (Agile Story Generator)

AI Shadow Product Owner: turn a requirement into Epics / Features / User Stories with **Gemini**, then export to **Azure DevOps** or **Jira Cloud**.

This repo is a **Vite + React + TypeScript** frontend with an optional **Fastify + Postgres** backend (API mode). Google AI Studio is not used.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite 6, Tailwind CSS v4 |
| LLM | Google Gemini only (`@google/genai`) — server-side in API mode |
| Trackers | Azure DevOps + Jira Cloud via `WorkItemTrackerAdapter` |
| Backend (API mode) | Node.js, Fastify, PostgreSQL, bcrypt sessions |

## Repository layout

```
.
├── App.tsx                 # Main UI (auth, generate → review → export)
├── components/             # Header, Login, InputArea, ResultsDisplay, Settings, History, …
├── services/
│   ├── apiClient.ts        # API mode client (VITE_API_URL)
│   ├── geminiService.ts    # Demo-only browser Gemini (gated; insecure)
│   ├── adoService.ts       # Thin ADO compat wrapper → trackers/
│   └── trackers/           # AzureDevOpsAdapter, JiraAdapter, exportBacklog
├── config/runtimeFlags.ts  # Demo insecure-client gate
├── shared/htmlEscape.ts
├── backend/                # Fastify API (auth, generate, export, history, audit)
├── package.json            # Frontend
└── tasks.md                # Build checklist (may live at workspace parent)
```

## Modes

### API mode (recommended)

1. Start Postgres and the backend (see `backend/README.md`).
2. Frontend `.env.local`:

```
VITE_API_URL=http://localhost:4000
```

3. `npm install && npm run dev` — Gemini key and tracker secrets stay on the server.

### Demo mode (local only)

Without `VITE_API_URL`, the app can call Gemini/trackers from the browser **only** when both are true:

- `npm run dev` (`import.meta.env.DEV`)
- `VITE_ALLOW_INSECURE_CLIENT_LLM=true` in `.env.local`

Not for shared or production builds.

## Scripts (frontend)

```bash
npm install
npm run dev          # Vite dev server
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest
npm run typecheck    # tsc --noEmit
```

## Backend

```bash
cd backend
cp .env.example .env   # fill DATABASE_URL, GEMINI_API_KEY, SESSION_SECRET, CREDENTIALS_ENCRYPTION_KEY
npm install
npm run migrate
npm run dev            # default http://localhost:4000
npm run typecheck
npm test
```

Optional local Postgres without Docker: `npx tsx scripts/start-embedded-pg.ts`

## Trackers

- **Azure DevOps** — Epic → Feature → User Story (behavior preserved via `AzureDevOpsAdapter`; `adoService.ts` is a thin wrapper).
- **Jira Cloud** — Epic → Story; Features are grouping labels (D8). Auth: email + API token (D4).

See `services/trackers/ADDING_A_TRACKER.md`.

## Known gaps

- Live ADO/Jira export against real projects: code complete, **not live-verified** until test credentials exist (see `tasks.md` Phase 2).
- Org-level multi-tenancy deferred (D9); isolation is per `user_id`.

## License

Internal / personal use unless otherwise specified.
