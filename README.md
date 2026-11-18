# ActiveN

Training planning, coach–athlete workplace and multi-vendor activity analytics
(Strava, Garmin, Polar, Suunto, COROS, …).

## Status

Increment 1: domain rules, i18n (mk/en), PostgreSQL schema with repositories, and the NestJS API
skeleton (health, reference data, OpenAPI). See [docs/roadmap.md](docs/roadmap.md).

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
```

Requires Node.js ≥ 22 and pnpm 10.

## Layout

| Path              | Purpose                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain` | Framework-free business rules: HR zones, pace & formatting, period summaries, plan-to-activity matching, Activities report rows, multi-source merge, vendor data-sharing policy |
| `packages/i18n`   | Locales (mk, en), locale negotiation, ICU messages, locale- and unit-aware formatting                                                                                           |
| `packages/db`     | Drizzle schema and migrations, repositories (idempotent upserts, plan versioning, sync-event leases, coach consent + audit), integration tests on real PostgreSQL               |
| `apps/api`        | NestJS REST API: health probes, reference data, RFC 9457 errors, OpenAPI at `/docs`                                                                                             |
| `docs/`           | Architecture, ADRs, roadmap, open questions (Macedonian)                                                                                                                        |

## Documentation

- [Architecture](docs/architecture.md)
- [Decision records](docs/adr)
- [Open questions](docs/open-questions.md)
