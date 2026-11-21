# Како се додава нова функционалност

Кодот е поделен така што секоја промена има едно природно место. Бизнис правилата се чисти функции,
договорот е заеднички, а API-то и web-от само ги поврзуваат.

```
packages/domain      правила и пресметки (без I/O, без текст)
packages/contracts   DTO, view builders, Viewer (што гледа кој), zod шеми за барања
packages/i18n        сите текстови (mk + en) и форматирање по единици
packages/db          шема, миграции, repositories
apps/api             контролери (HTTP) → TrainingService → repositories
apps/web             Api интерфејс (HttpApi | DemoApi) → страници → компоненти
```

## Рецепти

### Ново поле во планот, активноста или поставките

1. `packages/domain`: тип и правило. Пример: `PlanEntry.structure`, `AthleteSettings.workoutSuggestions`.
2. `packages/db`: колона во `schema.ts`, нова миграција (`pnpm --filter @activen/db generate`),
   мапирање во repository.
3. `packages/contracts/src/requests.ts`: zod поле. API-то враќа 422 со детали автоматски.
4. `apps/web`: поле во формата. За поставките е доволен еден `save({ ... })` преку
   `useSettingsEditor()`, без нов тек за зачувување.
5. Тестови: unit за правилото, repository тест, API сценарио, web патување.

### Нов endpoint

1. Шема на барањето во `contracts/requests.ts`, тип на одговорот во `contracts/responses.ts`.
2. Метод во контролерот. Тренерските рути ги користат `this.viewer(coachId, athleteId, ...scopes)` или
   `this.access(...)`, никогаш директен пристап.
3. Метод во `Api` интерфејсот (`apps/web/src/api/api.ts`) и во двете имплементации (`HttpApi`,
   `DemoApi`). TypeScript не дозволува да се заборави едната.
4. `web-contract.test.ts` веднаш проверува дали web клиентот и серверот се совпаѓаат.

### Нова согласност (consent scope)

1. `CONSENT_SCOPES` во `contracts/constants.ts` и enum-от во базата.
2. Поле во `Viewer` (`contracts/src/viewer.ts`). Серверот и демото го користат истиот `Viewer`, па
   правилото се пишува еднаш.
3. Текст во i18n (`coach.scope.*`, `consent.missing.*`).
4. Ред во матрицата во `apps/api/test/consent.test.ts`.

### Нов извор на податоци (вендор)

1. Адаптер по примерот на `connections/polar.service.ts`: OAuth, webhook во `sync_events`, а
   податоците (најдобро FIT) низ `ImportService.ingest` со `vendor` на изворот. Заштитата од
   дупликати и спојувањето по приоритет важат автоматски (ADR-0012).
2. Правило за споделување во `domain/source-policy.ts` (`canDisplay`). Пример: Strava не се прикажува на тренер.
3. Contract тестови со снимени одговори од вендорот.

### Нов текст или јазик

Сите текстови се во `packages/i18n/src/messages/ui-*.ts`. Тестот проверува дали mk и en имаат исти
клучеви, валидна ICU синтакса и исти параметри. Текстови од серверот не се прикажуваат на корисникот:
`errorMessageKey()` избира локализирана порака според статусот.

### Нова страница во web-от

- Една страница по датотека, а поголемите делови во своја папка (пример: `pages/profile/`,
  `pages/coach/analytics/`). Рутата се вчитува lazy во `app/routes.tsx`.
- Почетниот приказ е краток, а деталите се на клик: `Segment` (`ui/Segment.tsx`).
- Податоци преку TanStack Query и `QueryView` (вчитување, грешка, повтори).
- Патување во `test/journeys/` по улога и видливо име.

## Начела

- **Едно место за едно правило.** Правилата за согласност се во `Viewer`, за вендори во
  `canDisplay`, оптимистичкото зачувување во `useSettingsEditor`. Ако нешто се повторува на две места,
  се издвојува.
- **Туѓ ID = непостоечки ID.** Секое читање и пишување проверува сопственост (во repository или
  `plan-access.ts`) и враќа 404, за да не се открие дека нешто постои.
- **Серверот е извор на вистина, демото го следи.** Демото користи исти view builders и исти правила.
- **Без тајни во git.** Репото е јавно. Конфигурацијата е во `.env` (шаблон: `.env.example`).
