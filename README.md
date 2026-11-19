# ActiveN

Training planning, coach–athlete workplace and multi-vendor activity analytics
(Strava, Garmin, Polar, Suunto, COROS, …).

## Status

Increment 3 — first complete version: the web app (athlete and coach) on the API with sign-in, plan,
activities and check-ins, progress, coach workplace (invitations, consent, signals, planner, messages),
and a demo mode with sample data. See [docs/roadmap.md](docs/roadmap.md).

## Getting started

```bash
pnpm install
cp .env.example .env
docker compose up -d db                          # PostgreSQL 16
export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
pnpm verify                                      # format → lint → build → typecheck → tests

pnpm build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/activen_dev pnpm --filter @activen/db db:migrate
DATABASE_URL=postgres://postgres:postgres@localhost:5432/activen_dev node apps/api/dist/main.js
# → http://localhost:3000/docs
# Email sign-in in development: POST /v1/auth/email/start, the link is written to the API log.

pnpm --filter @activen/web dev                   # http://localhost:5173 (proxies /v1 to :3000)
pnpm --filter @activen/web build:demo            # self-contained demo with sample data (dist/)
DATABASE_URL=… pnpm --filter @activen/db seed:demo you@example.com   # demo training block for an account
```

Requires Node.js ≥ 22 and pnpm 10.

## Layout

| Path                 | Purpose                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain`    | Framework-free business rules: HR zones, pace & formatting, period summaries, plan-to-activity matching, Activities report rows, multi-source merge, vendor data-sharing policy |
| `packages/i18n`      | Locales (mk, en), locale negotiation, ICU messages, locale- and unit-aware formatting                                                                                           |
| `packages/db`        | Drizzle schema and migrations, repositories (idempotent upserts, plan versioning, sync-event leases, coach consent + audit), integration tests on real PostgreSQL               |
| `packages/contracts` | API contract for server and clients: response types, view builders, demo data; zod request schemas at `/requests`                                                               |
| `apps/web`           | Vite + React PWA (ADR-0011): athlete (Today, Plan, Activities, Progress, Coach, Profile) and coach workplace; HTTP and demo modes                                               |
| `apps/api`           | NestJS REST API: auth (ADR-0010), `/v1/me` profile, roles, settings, sign-in methods and sessions; health, reference data, RFC 9457 errors, OpenAPI at `/docs`                  |
| `docs/`              | Architecture, ADRs, roadmap, open questions (Macedonian)                                                                                                                        |

## Documentation

- [Architecture](docs/architecture.md)
- [Decision records](docs/adr)
- [Open questions](docs/open-questions.md)
