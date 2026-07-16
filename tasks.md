# ProdMate — Build Tasks (Shared Ground Truth)

_Last updated: July 16, 2026 (Phase 7 Knowledge Mesh built; pgvector isolation pending live DB)_  
_Source of truth for multi-phase work. Update status as phases complete._

## Status legend

- `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` deferred / blocked on decision

---

## Decisions required (block Phase 2–3+)

| # | Decision | Locked default | Status |
|---|----------|----------------|--------|
| D1 | Backend framework + hosting | Node (Fastify) + Azure Container Apps / App Service | **Confirmed** |
| D2 | Database | PostgreSQL (Azure Database for PostgreSQL) | **Confirmed** |
| D3 | Auth (Phase 3) | **Email + hashed password + HTTP-only session cookie** (simple). No MFA, no refresh-token rotation, no complex IdP for now. Thin provider-agnostic auth interface so Entra SSO can be added later for non-Microsoft/multi-org without rewrite. Internal project — not public SaaS yet. | **Confirmed (simplified)** |
| D4 | Jira auth method | API token + email (OAuth 3LO later) | **Confirmed** |
| D5 | Jira field mapping (`business_value` / `risk_impact`) | Labels (`value:High`, `risk:Medium`, etc.) | **Confirmed** |
| D6 | Knowledge Mesh (Phase 7) timing | After Phase 6 pilot readiness | **Confirmed** |
| D7 | Start phase order | Phase 0 → 1 → … | **Confirmed** |
| D8 | Jira Feature mapping | **(c)** Feature as grouping label on Stories; hierarchy is Epic → Story only | **Confirmed** |
| D9 | Multi-tenancy grain (Phase 4) | **User-level isolation only** (`user_id` on all rows). Org-level multi-tenancy (`orgs` / `org_id`) deferred until multi-company SaaS is a real requirement — not built preemptively. | **Confirmed** |
| D10 | Knowledge Mesh vector store (Phase 7) | **pgvector** on the existing Azure Database for PostgreSQL (D2) — not a separate vector DB. | **Confirmed** |
| D11 | Knowledge Mesh embedding model (Phase 7) | **`gemini-embedding-001`** (text-only, GA). Not `gemini-embedding-2` (multimodal) — no multimodal ingestion requirement. | **Confirmed** |

---

## Phase 0 — Immediate security patch

**Outcome:** App is safe enough that a public build does not leak a shared Gemini key or encourage production ADO PATs in the browser.

**Done when:** Built JS bundle contains no Gemini API key string; tracker credentials are not required for a “demo generate” path (or generate/export clearly gated as non-production).

- [x] Remove client-side embedding of `GEMINI_API_KEY` from Vite `define` / ensure build does not ship the key
- [x] Gate or stub browser-direct Gemini + tracker calls with clear “not for shared/production” messaging
- [x] Add `.env` to `.gitignore` if missing; add `.env.example` placeholders (no secrets)
- [x] Verify: `npm run build` + search dist for key patterns → none found

---

## Phase 1 — Design tokens + light theme + Tailwind build

**Outcome:** Clean, accessible light UI as default; theming ready for a later dark toggle.

**Done when:** Builds off CDN Tailwind; no hardcoded dark-only palette as the only theme; WCAG AA contrast on primary text/background pairs.

- [x] Install build-time Tailwind + PostCSS; remove CDN script from `index.html`
- [x] Design tokens via CSS variables + Tailwind theme (bg, surface, border, text-primary/secondary, accent)
- [x] Convert components to token-based classes; light as default
- [x] Fix/remove missing `/index.css` reference as part of this phase
- [x] Verify: `npm run build` succeeds; visual check of login + main layout

---

## Phase 2 — Tracker abstraction + Jira adapter

**Outcome:** Export works with ADO and Jira; next tracker needs only a new adapter.

**Done when:** ADO behavior unchanged behind interface; Jira export works against a test project; settings UI switches provider.

- [x] Define `WorkItemTrackerAdapter` interface
- [x] Refactor `adoService.ts` → `AzureDevOpsAdapter` (preserve parent/dependency/priority)
- [x] Implement `JiraAdapter` (Jira Cloud REST API v3; D4 email+token; D5 labels; D8c feature labels)
- [x] Settings UI: provider picker + connection test
- [x] Document path for next adapter (`services/trackers/ADDING_A_TRACKER.md`)
- [~] Live tracker export — CODE COMPLETE, NOT LIVE-VERIFIED. No ADO/Jira test credentials available as of 2026-07-16. Do not treat as done until a real export has been run and evidence (work item IDs/URLs) shown. Revisit before any production deployment or before Phase 8 pilot.

---

## Phase 3 — Minimal backend

**Outcome:** Secrets leave the browser; real auth gates the product; ADO CORS issue gone.

**Done when:** No secrets client-side; auth required for generate/export; trackers called server-to-server.

- [x] Scaffold backend (Fastify + pg) per D1
- [x] Proxy Gemini: `POST /api/generate`
- [x] Proxy trackers: `POST /api/export` (+ connection test)
- [x] Encrypt tracker credentials at rest (**AES-256-GCM**; key = `CREDENTIALS_ENCRYPTION_KEY` env var — Phase 3 trade-off; Key Vault later)
- [x] Real auth per D3: email + hashed password + HTTP-only session (no MFA / refresh-token rotation)
- [x] Session cookie: `HttpOnly`, `Secure` in production, **`SameSite=Lax`**
- [x] Password hashing: **bcrypt cost 12** (explicit in `backend/src/auth/password.ts`)
- [x] Sanitize/escape content before HTML/description fields (`shared/htmlEscape.ts`, reused by ADO adapters)
- [x] Verify: frontend `npm run build` green; backend `tsc --noEmit` green; unauthenticated generate requires running Postgres (manual: expect 401)

---

## Phase 4 — Data layer (user isolation; org multi-tenancy deferred — D9)

**Outcome:** In API mode, history and settings live in Postgres; two users cannot see each other’s data via the API.

**Done when:** Two authenticated users’ data are provably isolated via API calls (not only DB constraints).

- [x] Decision D9: no `orgs` / `org_id` — scope by `user_id` only
- [x] Add `audit_logs` (keep existing users/sessions/tracker_configs/generations)
- [x] API-mode history off `localStorage` → `GET /api/history` from `generations`
- [x] Settings already server-side in API mode; demo localStorage path unchanged
- [x] Scope queries by `user_id` (generate/export/history/tracker already; keep enforcing)
- [x] Verify: user A cannot read user B’s history or tracker settings via API (**passed** 2026-07-16: `npx tsx scripts/isolation-smoke.ts` against embedded Postgres — B history=0, A history=1, no leak)

---

## Phase 5 — UX fixes

**Outcome:** Users can review before export; failures don’t lose work; no dead export UI.

**Done when:** Each behavior below is demonstrable.

- [x] Review/edit step between Generate and Export (no auto-export)
- [x] Keep results + history if export fails; allow retry-export
- [x] Wire or remove `ADOExportModal.tsx` — **removed** (2026-07-16): ADO-only PAT form duplicated Settings and broke API-mode secret model; review UI lives on ResultsDisplay instead. `adoService.ts` kept as ADO surface.
- [x] History delete/clear
- [x] Cancel for long-running generate/export — AbortController + late-resolve guards; demo generate uses Gemini `abortSignal`; demo export loop checks signal and returns partial `created[]` via `ExportAbortedError`; **cancel never rolls back tracker items already created** (demo or API). API-mode cancel aborts the client fetch only — server export may continue; UI discloses this.
- [x] Make `User.role` functional or remove it — kept as **profile label** (login + Header display + DB); not RBAC
- [x] Verify: frontend `npm run build` + backend `tsc --noEmit` green (manual UI walkthrough recommended; live tracker export still Phase 2 [~])

---

## Phase 6 — Housekeeping

**Outcome:** Repo is maintainable and matches reality.

**Done when:** Lint + type-check clean; basic tests pass; README accurate.

- [x] Fix README to match codebase
- [x] Flatten nested duplicate folder
- [x] Resolve Vite vs AI Studio dual setup (pick one) — Vite/npm only; removed `metadata.json`
- [x] Remove unused imports; fix `useEffect`/`useCallback` deps
- [x] Add ESLint + basic tests (tracker adapter contract + history isolation SQL)
- [x] Verify: `npm run lint` / `tsc` / tests green

---

## Phase 7 — Knowledge Mesh

**Outcome:** User memory — docs ingested once, retrieved automatically; never cross-user (D9: `user_id` isolation, not `org_id`).

**Done when:** One user’s docs never appear in another user’s retrieval.

- [x] Confirm timing with user (**D6**) + lock **D10** (pgvector) / **D11** (`gemini-embedding-001`)
- [x] Ingestion → chunk → embed → vector store namespaced by `user_id` (D9)
- [x] Augment generate flow with RAG; keep manual knowledge textarea as fallback when nothing ingested
- [~] Verify: cross-user retrieval isolation test (API-level) — **CODE COMPLETE, NOT LIVE-VERIFIED** (no local Postgres+pgvector; Docker/WSL unavailable). Unit query-shape tests always run. Full HNSW/cosine suite gated on `TEST_DATABASE_URL` (skipped here — not a fake pass).

---

## Phase 8 — Hardening for pilot

**Outcome:** Ready for a real multi-team pilot.

**Done when:** Quotas, audit, basic admin, monitoring in place.

- [x] Per-user rate limits on generate/export (`@fastify/rate-limit`, keyed by `user_id`; env-tunable; Redis deferred)
- [x] Audit logging expanded: nullable `user_id` (`schema_phase8.sql`); `auth.login.failure`, `auth.logout`; retention via `AUDIT_RETENTION_DAYS` + `npm run audit:prune`
- [ ] Basic admin/org invite (only when D9 is revisited — org multi-tenancy)
- [x] Monitoring option A: structured Fastify `onResponse` / `onError` JSON logs + `/api/health` (no new infra)
- [x] **Login timing side-channel:** always bcrypt-compare (dummy hash when email missing)
- [x] Verify: backend `tsc` + tests (timing + isolation); frontend lint/typecheck/tests

---

## Phase 9 — Future Tracker Expansion (queued after Phase 8; not started)

**Outcome:** ProdMate supports the trackers real teams already live in beyond Jira/ADO, without diluting effort on tools with weak backlog-hierarchy fit or conflating tracker export with document/wiki export (a different integration entirely).

**Done when:** The next adapter (per the ranking below) implements `WorkItemTrackerAdapter` to the same bar as Jira/ADO — parent hierarchy, dependency links, value/risk mapping, and a **live-verified** export with evidence (work item IDs/URLs). Do not repeat Phase 2's live-verify gap.

**Tier ranking (Product Owner analysis, 2026-07-16):**

- **Tier 1 — done:** Jira, Azure DevOps.
- **Tier 2 — next candidates.** Strong `WorkItemTrackerAdapter` fit, high overlap with ProdMate's PO/BA target users: ClickUp, Asana, Monday.com, Linear, YouTrack.
- **Tier 3 — enterprise/SAFe.** Best semantic fit of all — natively Epic→Feature→Story, zero mapping compromise — but niche market, not urgent: Rally, VersionOne, Targetprocess.
- **Tier 4 — different integration type, not a tracker adapter.** These are document/wiki targets — exporting a generated backlog here means a formatted requirement doc/wiki page, not tracked work items. Needs its own `DocumentExportAdapter` interface and its own phase; do not conflate with tracker work: Confluence, Notion, SharePoint.
- **Tier 5 — deprioritized.** Weak fit — flat card structure with the same label-workaround problem Jira has for less payoff, or the wrong tool category entirely (strategy/roadmap, retro/session): Trello, Kanbanize, LeanKit, Aha!, Productboard, Roadmunk, ProductPlan, Miro, Mural, Parabol, EasyRetro, Basecamp, Smartsheet. Wrike and Airtable are the exceptions in this tier — decent APIs, worth a second look if targeting smaller/startup teams later.

- [x] Tier ranking documented (this section) — Product Owner analysis, 2026-07-16
- [x] Next-adapter pick: **ClickUp** (Product Owner decision, implementation-level — not escalated). Reasoning: ClickUp's native hierarchy is Space→Folder→List→Task→Subtask — four levels, enough to map Epic→Feature→Story cleanly without the label-workaround Jira needed for its mid-tier grouping (D8c). Asana was the other realistic Tier 2 pick, but its native model is Project→Task→Subtask — one level short of a clean 3-tier mapping, closer to Jira's original problem than ClickUp's. ClickUp also has solid free-tier REST API access, which lowers the risk of repeating Phase 2's live-verify gap (no test credentials available) when this phase is actually built.
- [ ] Scope `ClickUpAdapter`: auth method (API token vs OAuth), `business_value`/`risk_impact` field mapping (custom fields vs tags), List→Task→Subtask ↔ Epic→Feature→Story mapping — not designed yet, starts when this phase is picked up
- [ ] Implement `ClickUpAdapter` behind the existing `WorkItemTrackerAdapter` — no changes to ADO/Jira adapters
- [ ] Settings UI: add ClickUp as a third provider option
- [ ] Verify: live ClickUp test-workspace export with evidence (work item IDs/URLs) — do not mark done on code-completeness alone
- [ ] Revisit Tier 3/4/5 prioritization once the Tier 2 adapter ships and real user demand signal exists

---

## Phase 10 — Performance & UI Polish (queued after Phase 8; not started)

**Outcome:** A PO using this daily never hits a stall, a silent freeze, or a rough/inconsistent-looking screen — the product feels fast and trustworthy end to end.

**Done when:** Every checklist item below is demonstrable, not just claimed.

**Performance:**

- [ ] Audit every user action (generate, export, retry, history load/delete, tracker connection test) for anything that blocks the UI thread or leaves the user staring at a spinner with no feedback for more than ~1-2s without a progress indicator or step-by-step status — extend Phase 5's export progress-indicator pattern everywhere long operations exist, don't leave gaps
- [ ] Long-running operations (generate, export) get real server-side timeout + retry/circuit-breaker behavior — nothing hangs indefinitely waiting on Gemini or a tracker API with no ceiling
- [-] **Escalate, do not decide alone:** if closing the "nothing hangs" gap requires new infra (e.g. a job queue like BullMQ/Redis for generate/export instead of a synchronous request) — that has real cost/ops implications and goes to the human before committing, per standing escalation rules. Everything else in this phase is Product-Owner-decided.
- [ ] History list paginated or virtualized before it degrades at scale (Phase 5 added delete; confirm the list itself doesn't slow down first — don't wait until delete is the only lever)
- [ ] Confirm Phase 4's `user_id`-scoped queries (`generations`, `tracker_configs`, `audit_logs`) are actually indexed — state explicitly what's indexed vs assumed, cite the actual index, don't take it on faith
- [ ] Optimistic UI where safe (e.g. history delete feels instant, rolls back on failure) instead of a round-trip wait per interaction
- [ ] Quick pass on React state structure in `App.tsx` / `ResultsDisplay` for obvious re-render storms — e.g. whole-tree re-render on every keystroke in the Phase 5 review/edit step

**UI/UX polish:**

- [ ] Consistent spacing and typography scale across every screen — audit ALL components against the Phase 1 design tokens, not just the ones that got attention during feature phases
- [ ] Every async state has a real UI treatment: loading, empty, error, and success — no screen ever shows nothing or a raw error string
- [ ] Responsive layout verified at minimum tablet width — untested by any phase so far
- [ ] Basic accessibility: keyboard navigation works for login, generate, review, export; visible focus states; form inputs have proper labels — not covered in any phase yet
- [ ] Form/validation feedback is clear and immediate (settings, login, input area) — no silent failures on bad input
- [ ] Consistent iconography and button/component styling — no visual drift between components built in different phases

---

## Phase reports

### Phase 0 — 2026-07-16
1. **Outcome:** Shared builds no longer ship a Gemini key; browser Gemini/ADO calls are gated behind an explicit insecure local flag.
2. **What changed:** Removed Vite `define` for API keys; added `config/runtimeFlags.ts`; gated `geminiService` / `adoService`; banner + Settings/Input disables; `.env.example` + `.gitignore` env rules.
3. **How verified:** `npm run build` (no Gemini env); searched `dist/` — no `AIza…` key material (only UI help text mentioning flag names).
4. **Research applied:** Vite env docs — only `VITE_*` vars are client-exposed; production builds without the key leave `import.meta.env.VITE_GEMINI_API_KEY` empty.
5. **Overrideable decisions:** Local demos still opt in via `.env.local` with `VITE_ALLOW_INSECURE_CLIENT_LLM=true` (known trade-off until Phase 3).
6. **What's next:** Phase 1 light theme + Tailwind build-time.

### Phase 1 — 2026-07-16
1. **Outcome:** Default UI is a clean light theme with semantic design tokens; Tailwind is build-time (no CDN).
2. **What changed:** Added `tailwindcss` + `@tailwindcss/vite`; real `index.css` with `:root` / `.dark` tokens; stripped CDN + AI Studio import map from `index.html`; converted all components + `App.tsx` to semantic classes (`bg-background`, `bg-surface`, `text-foreground`, etc.).
3. **How verified:** `npm run build` succeeded; dist CSS includes light token values (`#f8fafc` / `#0f172a`); no `cdn.tailwindcss.com` in dist HTML; Phase 0 key check still clean.
4. **Research applied:** Tailwind v4 + Vite — official `@tailwindcss/vite` plugin and `@import "tailwindcss"` + `@theme inline` (tailwindcss.com docs).
5. **Overrideable decisions:** Kept indigo accent for brand continuity; dark tokens exist but no toggle UI yet; AI Studio `metadata.json` left for Phase 6 housekeeping.
6. **What's next:** Phase 2 tracker abstraction + Jira (or pause for user direction).

### Phase 0 addendum — 2026-07-16
- Insecure client integrations now require **both** `import.meta.env.DEV === true` **and** `VITE_ALLOW_INSECURE_CLIENT_LLM=true`, so a production build cannot enable browser secrets even if `.env` accidentally sets the flag.

### Phase 2 — 2026-07-16
1. **Outcome:** Export can target Azure DevOps or Jira Cloud via a shared adapter; Features on Jira use labels (D8c).
2. **What changed:** Added `services/trackers/` (`WorkItemTrackerAdapter`, ADO + Jira adapters, `exportBacklog`, factory); Settings provider picker; App uses `TrackerConfig` with legacy ADO localStorage migration; `adoService.ts` is a thin compat wrapper; HTML escape on ADO descriptions.
3. **How verified:** `npm run build` succeeded. Live ADO/Jira export against a real project is manual (needs `npm run dev` + insecure flag + credentials).
4. **Research applied:** Jira Cloud REST API v3 create issue + `parent` field; Basic auth email+API token (Atlassian docs); Epic Link deprecated in favor of `parent`.
5. **Overrideable decisions:** Jira story issue type defaults to `"Story"` (configurable); dependency links use Jira `"Blocks"`; Feature labels use `feature:<slug>`, value/risk use `value:*` / `risk:*`.
6. **What's next:** Phase 3 minimal backend (secrets + simple session auth per D3).

### Phase 3 — 2026-07-16
1. **Outcome:** Real email/password sessions gate the API; Gemini key and tracker credentials stay server-side (encrypted at rest).
2. **What changed:** `backend/` Fastify + Postgres; auth (bcrypt cost 12, SameSite=Lax cookie); generate/export/tracker routes; AES-256-GCM via `CREDENTIALS_ENCRYPTION_KEY` env var; `shared/htmlEscape.ts`; frontend `VITE_API_URL` mode.
3. **How verified:** Frontend `npm run build` OK; backend `tsc --noEmit` OK; no Gemini key in frontend bundle. Live 401 + migrate needs local Postgres (Docker unavailable here) — smoke manually.
4. **Research applied:** Fastify cookie/CORS; Node `crypto` AES-256-GCM; bcrypt cost 12.
5. **Overrideable / trade-offs:** Encryption key is an **env var** for Phase 3 (internal). Azure Key Vault = Phase 8. bcrypt not argon2id. SameSite=Lax.
6. **What's next:** Phase 4 — wait for review.

### Phase 4 — 2026-07-16
1. **Outcome:** API-mode history and settings stay user-scoped in Postgres; another authenticated user cannot read them via the API. Org multi-tenancy deferred (D9).
2. **What changed:** `audit_logs` + `writeAudit` on login/register/generate/export/tracker.save; `GET /api/history` from `generations` (`WHERE user_id = $1`); App API mode loads history from API and no longer writes `agile-gen-history-*`; isolation smoke script `backend/scripts/isolation-smoke.ts`.
3. **How verified:** Frontend `npm run build` OK; backend `tsc --noEmit` OK. Live isolation smoke **passed** 2026-07-16 against embedded Postgres.
4. **Research applied:** Idempotent `CREATE TABLE IF NOT EXISTS` additive migration; session-scoped queries only (no `org_id`).
5. **Overrideable / trade-offs:** D9 — user isolation only. Login bcrypt timing side-channel noted for Phase 8 (not fixed). History delete UI deferred to Phase 5.
6. **What's next:** Phase 5.

### Phase 5 — 2026-07-16
1. **Outcome:** Users review/edit the plan before export; export failures keep results and allow retry; dead ADO-only export modal removed; history can be deleted.
2. **What changed:** Split generate vs export in `App.tsx`; editable ResultsDisplay + Export bar; retry on export error; Cancel via AbortController; `DELETE /api/history` (+ `:id`); `/api/export` returns `created[]` with id/url/key; deleted `ADOExportModal.tsx` (explicit); kept `adoService.ts`.
3. **How verified:** Frontend `npm run build` OK; backend `tsc --noEmit` OK. Phase 2 live ADO/Jira still **[~] not live-verified** (no test credentials).
4. **Research applied:** Fetch `AbortSignal` for cancel; structured export refs for future live evidence.
5. **Overrideable / trade-offs:** Role remains a profile label, not RBAC. Cancel does **not** roll back work items already written to ADO/Jira (demo mid-loop abort returns a partial `created[]` list; API cancel only aborts the browser fetch — the server loop may keep creating). Late-resolving cancelled promises are ignored via controller identity guards. Phase 2 live export gap flagged, not closed.
6. **What's next:** Phase 6 housekeeping — wait for review.

### Phase 6 — 2026-07-16
1. **Outcome:** Repo layout, README, and tooling match the real Vite/npm + Fastify app; lint and tests guard adapter + user isolation.
2. **What changed:** Flattened nested folder; rewrote README (Gemini only; ADO+Jira); removed `metadata.json`; ESLint + Vitest; `exportBacklog` contract tests; embedded-Postgres isolation tests via `history/queries.ts`; App auth `useEffect` no longer calls `handleLogin` before definition.
3. **How verified:** `npm run lint`, `npm run typecheck`, `npm test` (frontend); `backend` `npm run typecheck` + `npm test` — all green.
4. **Research applied:** ESLint 9 flat config + typescript-eslint; Vitest; embedded-postgres for real SQL isolation checks.
5. **Overrideable / trade-offs:** Root ESLint scopes to frontend (backend covered by `tsc` + Vitest). `tasks.md` / analysis docs remain at repo root (may stay untracked).
6. **What's next:** Phase 7 Knowledge Mesh — wait for review (resolve D9 vs org_id first).

### Phase 8 — 2026-07-16
1. **Outcome:** Login no longer leaks email existence via timing; generate/export are per-user rate-limited; audit covers failures/logout with retention prune; structured request logs without new infra.
2. **What changed:** Dummy bcrypt hash always compared on login; `@fastify/rate-limit` (10/hr generate, 30/hr export, env-tunable); `schema_phase8.sql` nullable `audit_logs.user_id`; `auth.login.failure` / `auth.logout`; `AUDIT_RETENTION_DAYS` + `npm run audit:prune`; Fastify `onResponse`/`onError` structured logs (monitoring A).
3. **How verified:** Backend `tsc --noEmit` + Vitest (login timing + isolation); frontend lint/typecheck/tests.
4. **Research applied:** `@fastify/rate-limit` createRateLimit + keyGenerator (official Fastify 5 plugin); bcrypt dummy-hash timing equalization.
5. **Overrideable / trade-offs:** In-memory rate limits (Redis later for multi-instance). Org invite still deferred (D9). Metrics endpoint (B) / OTel (C) skipped until a consumer exists.
6. **What's next:** Phase 7 Knowledge Mesh — confirm vector/embed/chunk choices and D9 vs org_id before building.

### Phase 7 — 2026-07-16
1. **Outcome:** Users ingest docs once; generate retrieves top-k chunks scoped by `user_id`; manual textarea remains override/fallback.
2. **What changed:**
   - `schema_phase7.sql` — `vector` extension; `knowledge_documents` / `knowledge_chunks` (`embedding vector(768)`, HNSW cosine); migrate wired
   - Chunk (~600 tokens, ~12% overlap); `gemini-embedding-001` @ 768 + manual L2-normalize; knowledge routes + RAG in `/api/generate`
   - Frontend Knowledge Mesh panel (API mode); InputArea helper text for textarea fallback
   - docker-compose → `pgvector/pgvector:pg16`; Azure `azure.extensions` noted in READMEs / `.env.example`
   - Always-on query-shape unit tests; HNSW/cosine isolation gated on `TEST_DATABASE_URL`
3. **How verified:** Frontend lint/typecheck/tests green; backend `tsc` + Vitest green (14 passed). **pgvector isolation: SKIPPED** — no Docker on PATH, no WSL, port 5432 closed, Docker Desktop install blocked on admin UAC. Suite did **not** fake-pass on embedded-postgres.
4. **Research applied:** Google embedding-001 non-3072 dims require manual normalize; pgvector cosine `<=>` + HNSW `vector_cosine_ops`.
5. **Overrideable / trade-offs:** 768 dims (storage vs quality); top-k = 5; max 200 chunks per ingest. Live isolation remains open until `TEST_DATABASE_URL` points at real Postgres+pgvector.
6. **What's next:** Re-run backend tests with `TEST_DATABASE_URL` after Docker/`pgvector` is available; then Phase 9 (ClickUp) or other queued work — wait for review.

_Append further reports below._
