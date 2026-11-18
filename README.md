# ActiveN

Training planning, coach–athlete workplace and multi-vendor activity analytics
(Strava, Garmin, Polar, Suunto, COROS, …).

## Status

Increment 0: monorepo, architecture documentation and the pure domain layer
(`packages/domain`) with unit tests. See [docs/roadmap.md](docs/roadmap.md).

## Getting started

```bash
pnpm install
pnpm verify   # format check → lint → typecheck → unit tests with coverage
```

Requires Node.js ≥ 22 and pnpm 10.

## Layout

| Path              | Purpose                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain` | Framework-free business rules: HR zones, pace & formatting, period summaries, plan-to-activity matching, Activities report rows, multi-source merge, vendor data-sharing policy |
| `packages/i18n`   | Locales (mk, en), locale negotiation, ICU messages, locale- and unit-aware formatting                                                                                           |
| `apps/`           | API, worker and web apps (upcoming increments)                                                                                                                                  |
| `docs/`           | Architecture, ADRs, roadmap, open questions (Macedonian)                                                                                                                        |

## Documentation

- [Architecture](docs/architecture.md)
- [Decision records](docs/adr)
- [Open questions](docs/open-questions.md)
