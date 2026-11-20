import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DemoApi } from "../src/api/demo.js";
import { App } from "../src/app/App.js";

function start() {
  window.location.hash = "";
  localStorage.setItem("activen.locale", "mk");
  const api = new DemoApi(() => "mk");
  const user = userEvent.setup();
  render(<App api={api} routing="memory" />);
  return { api, user };
}

beforeEach(() => {
  window.location.hash = "";
});

describe("athlete app (demo)", () => {
  it("signs in and shows today, the plan editor, check-in and messages", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како спортист" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Влатко/ })).toBeInTheDocument();
    expect(await screen.findByText("План за денес")).toBeInTheDocument();
    // Compact segments expand and collapse on the same tap.
    const readiness = await screen.findByRole("button", { name: /Спремност за тренинг: 72/ });
    expect(readiness).toHaveAttribute("aria-expanded", "false");
    await user.click(readiness);
    expect(readiness).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Умерена")).toBeInTheDocument();
    await user.click(readiness);
    expect(readiness).toHaveAttribute("aria-expanded", "false");
    const weather = await screen.findByRole("button", { name: /Делумно облачно/ });
    await user.click(weather);
    expect(screen.getByRole("img", { name: /Денес по часови/ })).toBeInTheDocument();
    // Quick check-in from Today: tapping a number opens the form.
    const quick = screen
      .getByRole("button", { name: /Како помина последниот тренинг/ })
      .closest("form")!;
    await user.click(within(quick).getByRole("button", { name: "4" }));
    expect(
      within(quick).getByRole("button", { name: /Како помина последниот тренинг/ }),
    ).toHaveAttribute("aria-expanded", "true");
    await user.click(within(quick).getByRole("button", { name: "Испрати до Ана" }));
    expect(await within(quick).findByText("Зачувано ✓")).toBeInTheDocument();

    // Plan: edit a session.
    await user.click(screen.getAllByRole("link", { name: "План" })[0]!);
    expect(await screen.findByRole("heading", { name: /Недела од/ })).toBeInTheDocument();
    const entries = await screen.findAllByRole("button", { name: /Одмор/ });
    await user.click(entries[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Измени тренинг" });
    await user.click(within(dialog).getByRole("button", { name: "Тренинг" }));
    await user.clear(within(dialog).getByLabelText("Опис"));
    await user.type(within(dialog).getByLabelText("Опис"), "Лесно 5 km");
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    expect(await screen.findByText("Лесно 5 km")).toBeInTheDocument();

    // Activities → check-in.
    await user.click(screen.getAllByRole("link", { name: "Активности" })[0]!);
    // Filters: running → trail shows none in the demo; back to all runs.
    await user.click(await screen.findByRole("button", { name: "Трчање" }));
    await user.click(screen.getByRole("button", { name: "Трејл" }));
    expect(await screen.findByText("Нема активности во овој период.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Сите трчања" }));
    await user.click(screen.getByRole("button", { name: /^Филтри/ }));
    const filters = await screen.findByRole("dialog", { name: "Филтри" });
    await user.click(within(filters).getByRole("button", { name: "10–21 km" }));
    await user.click(within(filters).getByRole("button", { name: /^Прикажи/ }));
    expect(screen.getByRole("button", { name: /^Филтри/ })).toHaveTextContent("1");
    // A row expands in place with the route map; the same tap closes it.
    const rows = await screen.findAllByRole("button", { name: /km/ });
    const row = rows.find((r) => r.getAttribute("aria-expanded") !== null)!;
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("img", { name: "Рута" })).toBeInTheDocument();
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "false");
    await user.click(row);
    await user.click(await screen.findByRole("link", { name: /Детали/ }));
    expect(await screen.findByRole("heading", { name: "Како помина?" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Анализа" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Рута" })).toBeInTheDocument();
    const checkin = screen.getByRole("button", { name: /Како помина\?/ }).closest("form")!;
    await user.click(within(checkin).getByRole("button", { name: "5" }));
    await user.click(within(checkin).getByRole("button", { name: /Силно/ }));
    await user.type(within(checkin).getByLabelText("Коментар за тренерот"), "Добро");
    await user.click(within(checkin).getByRole("button", { name: "Испрати до Ана" }));
    expect(await screen.findByText("Благодарам! Оценката е зачувана.")).toBeInTheDocument();

    // Coach tab → message.
    await user.click(screen.getAllByRole("link", { name: "Тренер" })[0]!);
    expect(await screen.findByText("Ана Стојанова")).toBeInTheDocument();
    await user.type(await screen.findByLabelText("Напиши порака…"), "Утре ќе одам полека{Enter}");
    expect(await screen.findByText("Утре ќе одам полека")).toBeInTheDocument();
  });

  it("changes settings and language in the profile and signs out", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како спортист" }));
    await screen.findByRole("heading", { level: 1, name: /Влатко/ });
    await user.click(screen.getAllByRole("link", { name: "Профил" })[0]!);
    // Profile sections are collapsed rows with the current value; a tap opens the form.
    const language = await screen.findByRole("button", { name: "Јазик" });
    expect(language).toHaveAttribute("aria-expanded", "false");
    expect(within(language).getByText("MK · Метрички (km, °C)")).toBeInTheDocument();
    await user.click(language);
    await user.click(await screen.findByRole("button", { name: "US (mi, °F)" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "US (mi, °F)" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    // US units apply everywhere: the activity list now shows miles and mile-based filters.
    await user.click(screen.getAllByRole("link", { name: "Активности" })[0]!);
    expect((await screen.findAllByText(/\d mi ·/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Филтри/ }));
    expect(await screen.findByRole("button", { name: "3–6 mi" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getAllByRole("link", { name: "Профил" })[0]!);
    await user.click(screen.getByRole("button", { name: "Извори на податоци" }));
    await user.click(screen.getByRole("button", { name: "Нагоре: Polar" }));
    await user.click(screen.getAllByRole("button", { name: "EN" })[0]!);
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Sign out/ }));
    expect(await screen.findByRole("heading", { name: "Sign in to ActiveN" })).toBeInTheDocument();
  });
});

describe("athlete coach tab", () => {
  it("shows the coach, a progress segment and messages; settings hold privacy and format", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како спортист" }));
    await screen.findByRole("heading", { level: 1, name: /Влатко/ });
    await user.click(screen.getAllByRole("link", { name: "Тренер" })[0]!);
    expect(await screen.findByText("Ана Стојанова")).toBeInTheDocument();
    expect(screen.getByText(/^Споделуваш: /)).toBeInTheDocument();
    // Progress: one line collapsed, the week's statistics on expand, collapsed again on tap.
    const progress = screen.getByRole("button", { name: "Прогрес" });
    expect(progress).toHaveAttribute("aria-expanded", "false");
    expect(
      await within(progress).findByText(/^Оваа недела: \d+\/\d+ тренинзи/),
    ).toBeInTheDocument();
    await user.click(progress);
    expect(progress).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Тренинзи")).toBeInTheDocument();
    await user.click(progress);
    expect(progress).toHaveAttribute("aria-expanded", "false");
    // Messages stay as they were.
    expect(screen.getByRole("heading", { name: "Пораки" })).toBeInTheDocument();
    // Settings: privacy (save only when changed) and format (units apply at once).
    await user.click(screen.getByRole("button", { name: /Поставки/ }));
    const dialog = await screen.findByRole("dialog", { name: "Поставки за соработката" });
    const save = within(dialog).getByRole("button", { name: "Зачувај" });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "Рути (GPS)" }));
    expect(save).toBeEnabled();
    await user.click(save);
    expect(await within(dialog).findByText("Зачувано")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "US (mi, °F)" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "US (mi, °F)" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await user.keyboard("{Escape}");
    expect(screen.getByText(/^Споделуваш: .*Рути \(GPS\)/)).toBeInTheDocument();
  });
});

describe("confirmations", () => {
  it("asks in-app before ending the coaching relationship", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како спортист" }));
    await screen.findByRole("heading", { level: 1, name: /Влатко/ });
    await user.click(screen.getAllByRole("link", { name: "Тренер" })[0]!);
    await user.click(await screen.findByRole("button", { name: /Поставки/ }));
    await user.click(await screen.findByRole("button", { name: "Прекини соработка" }));
    const dialog = await screen.findByRole("dialog", { name: /Да ја прекинам соработката/ });
    await user.click(within(dialog).getByRole("button", { name: "Откажи" }));
    expect(screen.getByText("Ана Стојанова")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Прекини соработка" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: /Да ја прекинам/ })).getByRole("button", {
        name: "Прекини соработка",
      }),
    );
    expect(await screen.findByText(/Тренираш самостојно/)).toBeInTheDocument();
  });
});

describe("coach workplace (demo)", () => {
  it("shows athletes needing attention, opens one and replies", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    expect(await screen.findByRole("heading", { name: "Бара внимание" })).toBeInTheDocument();
    expect(screen.getAllByText("Порака").length).toBeGreaterThan(0);
    // Weekly totals sit between the last activity and the source: "34,5 km / 3 ч 12 мин".
    const headers = [...document.querySelectorAll(".dash-head > span")].map((h) => h.textContent);
    expect(headers.indexOf("Вкупно оваа недела")).toBe(headers.indexOf("Последна активност") + 1);
    expect(headers.indexOf("Извор")).toBe(headers.indexOf("Вкупно оваа недела") + 1);
    expect(screen.getAllByText(/^\/ \d+ (ч \d+ )?мин$/).length).toBeGreaterThan(0);
    // Each athlete is a row that expands to signals, the last message and shortcuts.
    const row = screen.getByRole("button", { name: "Влатко Петревски" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByRole("region", { name: "Влатко Петревски" });
    expect(within(details).getByRole("link", { name: "Анализи" })).toBeInTheDocument();
    await user.click(within(details).getByRole("link", { name: "Профил" }));
    expect(await screen.findByRole("heading", { name: "План за Влатко" })).toBeInTheDocument();
    // Messages open by themselves when the athlete is waiting for a reply.
    expect(screen.getByRole("button", { name: "Пораки" })).toHaveAttribute("aria-expanded", "true");
    await user.click(await screen.findByRole("button", { name: "Утре полесно" }));
    await waitFor(() => expect(screen.getAllByText("Утре полесно").length).toBeGreaterThan(1));

    await user.click(screen.getByRole("link", { name: "Пораки" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Пораки" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Планер" }));
    expect(await screen.findByLabelText("Избери спортист")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Спортисти" }));
    await user.click(await screen.findByRole("button", { name: /Покани спортист/ }));
    const dialog = await screen.findByRole("dialog", { name: "Покани спортист" });
    await user.type(within(dialog).getByLabelText("Е-пошта"), "nov@example.com");
    await user.click(within(dialog).getByRole("button", { name: "Покани спортист" }));
    expect(await within(dialog).findByText("Поканата е пратена.")).toBeInTheDocument();
  });
});

describe("coach planner and messages (demo)", () => {
  it("compares plan and done, opens activity stats and navigates by calendar", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    await user.click(await screen.findByRole("link", { name: "Планер" }));
    expect(await screen.findByText("План")).toBeInTheDocument();
    expect(screen.getByText("Реализирано")).toBeInTheDocument();
    // Week totals sit under the month calendar.
    expect(await screen.findByText(/^Недела \d+ ноември – \d+ ноември$/)).toBeInTheDocument();
    expect(screen.getByText("Тренинзи")).toBeInTheDocument();
    // The fartlek on Tuesday opens with its intervals and the recording source.
    const done = await screen.findAllByRole("button", { name: /^Статистика: / });
    await user.click(done[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Извор и сензори")).toBeInTheDocument();
    expect(within(dialog).getByText("Forerunner 965")).toBeInTheDocument();
    expect(within(dialog).getByText("Интервали")).toBeInTheDocument();
    expect(within(dialog).getByText(/^\d+ × Интервал$/)).toBeInTheDocument();
    expect(within(dialog).getAllByText("Загревање").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("img", { name: /Интервали/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    // A day of the previous week in the calendar opens that week.
    const heading = screen.getByRole("heading", { name: /^Недела од/ }).textContent;
    await user.click(screen.getByRole("gridcell", { name: /^понеделник, 9 ноември/ }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /^Недела од/ }).textContent).not.toBe(heading),
    );
    expect(screen.getByRole("heading", { name: "Недела од 9 ноември" })).toBeInTheDocument();
  });

  it("shows the week's progress in messages and links to the athlete", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    await user.click(await screen.findByRole("link", { name: "Пораки" }));
    expect(
      await screen.findByText(/^Оваа недела: \d+\/\d+ тренинзи · \d+\/\d+ km$/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Профил на Влатко Петревски" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Влатко Петревски" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Прекини соработка" })).toBeInTheDocument();
  });
});

describe("coach analytics (demo)", () => {
  it("lists the team attention first, expands an athlete and drills into an activity", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    await user.click(await screen.findByRole("link", { name: "Анализи" }));
    expect(await screen.findByText("Активни спортисти")).toBeInTheDocument();
    // Each athlete is a compact row that expands in place.
    const rows = await screen.findAllByRole("button", { name: /^Анализа: / });
    expect(rows.length).toBe(6);
    expect(rows[0]).toHaveAttribute("aria-expanded", "false");
    // The athlete who shares no activities is not judged.
    expect(screen.getByText("Не ги споделува активностите")).toBeInTheDocument();
    await user.click(rows[0]!);
    expect(rows[0]).toHaveAttribute("aria-expanded", "true");
    // Consent is one tap away and explains what is missing.
    await user.click(screen.getAllByRole("button", { name: /^Што споделува / })[0]!);
    const consent = await screen.findByRole("dialog");
    expect(within(consent).getByText("Активности и оценки")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getAllByRole("link", { name: /^Анализа: / })[0]!);
    // Athlete page: key numbers first, charts on demand.
    expect(await screen.findByText("Исполнет план (28 д.)")).toBeInTheDocument();
    const weekly = screen.getByRole("button", { name: "Неделен волумен (12 нед.)" });
    await user.click(weekly);
    expect(weekly).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("img", { name: /Растојание по недела/ }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Кондиција, замор и форма (12 нед.)" }));
    expect(
      screen.getAllByRole("img", { name: "Кондиција, замор и форма (12 нед.)" }).length,
    ).toBeGreaterThan(0);
    // Activities: filter to strength and open one; exercises are listed.
    await user.click(screen.getByRole("button", { name: "Теретана" }));
    const strength = screen.getAllByRole("link", { name: /Сила/ });
    await user.click(strength[0]!);
    expect(await screen.findByText("Вежби")).toBeInTheDocument();
    expect(screen.getByText("Чучањ со тег (goblet)")).toBeInTheDocument();
    expect(screen.getByText(/Нема GPS запис/)).toBeInTheDocument();
  });

  it("hides the map when the athlete does not share GPS", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    await user.click(await screen.findByRole("link", { name: "Анализи" }));
    const rows = await screen.findAllByRole("button", { name: /^Анализа: / });
    await user.click(rows[0]!);
    await user.click(screen.getAllByRole("link", { name: /^Анализа: / })[0]!);
    await screen.findByText("Исполнет план (28 д.)");
    await user.click(screen.getByRole("button", { name: "Трчање" }));
    await user.click(screen.getAllByRole("link", { name: /трчање/ })[0]!);
    expect(await screen.findByText("Спортистот не ја споделува GPS мапата.")).toBeInTheDocument();
    expect(screen.getByText("Извор и сензори")).toBeInTheDocument();
  });
});

describe("share an activity (demo)", () => {
  it("opens the studio, switches template, format and numbers, and adds a photo", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како спортист" }));
    await screen.findByRole("heading", { level: 1, name: /Влатко/ });
    await user.click(screen.getAllByRole("link", { name: "Активности" })[0]!);
    const runs = await screen.findAllByRole("button", { name: /Скопје — трчање/ });
    await user.click(runs[0]!);
    await user.click(screen.getAllByRole("link", { name: "Детали" })[0]!);
    await user.click(await screen.findByRole("link", { name: "Сподели" }));
    expect(await screen.findByRole("heading", { name: "Сподели" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Преглед на сликата за споделување" }),
    ).toBeInTheDocument();
    // An outdoor run starts on its route; the figure is one tap away.
    expect(screen.getByRole("button", { name: "Рута" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Фигура" }));
    expect(screen.getByRole("button", { name: "Фигура" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Квадрат 1:1" }));
    expect(screen.getByRole("button", { name: "Квадрат 1:1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Up to four numbers: a fifth cannot be added until one is removed.
    const numbers = within(screen.getByRole("group", { name: "Податоци" }));
    expect(screen.getByText("4/4")).toBeInTheDocument();
    const off = numbers
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-pressed") === "false")!;
    expect(off).toBeDisabled();
    await user.click(numbers.getByRole("button", { name: "Искачување" }));
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(off).toBeEnabled();
    // Photo background: asks for a photo first; the photo never leaves the device.
    await user.click(screen.getByRole("button", { name: "Фотографија" }));
    expect(screen.getByText(/не се праќа никаде/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Преземи слика/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Скриј почеток и крај/ })).toBeChecked();
  });
});

describe("structured workouts (demo)", () => {
  async function openEditor() {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    await user.click(await screen.findByRole("link", { name: "Планер" }));
    await user.click(await screen.findByRole("button", { name: "Додај тренинг" }));
    const dialog = await screen.findByRole("dialog", { name: "Додај тренинг" });
    return { user, dialog, text: within(dialog).getByLabelText("Опис") };
  }

  it("suggests steps while the coach writes; the coach adjusts and accepts them", async () => {
    const { user, dialog, text } = await openEditor();
    // No button: the suggestion appears by itself after a short pause.
    expect(within(dialog).queryByRole("button", { name: "Структурирај" })).toBeNull();
    await user.type(text, "Загревање 3 km, 8 × 400 m на 3:30, одмор 200 m, смирување 2 km");
    const suggestion = await within(dialog).findByRole(
      "region",
      { name: "Предлог" },
      { timeout: 3000 },
    );
    expect(within(suggestion).getByText("Препознаено автоматски од текстот")).toBeInTheDocument();
    expect(within(suggestion).getByText("8 ×")).toBeInTheDocument();
    expect(within(suggestion).getByText(/само „Зачувај“/)).toBeInTheDocument();
    const warm = within(suggestion).getByLabelText(/^Загревање: Вредност/);
    await user.clear(warm);
    await user.type(warm, "2,5");
    await user.tab();
    await user.click(within(dialog).getByRole("button", { name: "Прифати чекори" }));
    expect(within(dialog).queryByRole("region", { name: "Предлог" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    expect(
      await screen.findByText(/Загревање 2,5 km · 8 × 400 m @ 3:30 \/km \/ 200 m · Смирување 2 km/),
    ).toBeInTheDocument();
  });

  it("saves the text as written when the suggestion is not accepted", async () => {
    const { user, dialog, text } = await openEditor();
    await user.type(text, "6 × 1000 m на 5K темпо, одмор 2 мин");
    await within(dialog).findByRole("region", { name: "Предлог" }, { timeout: 3000 });
    // Discarding hides it for this text; saving keeps only the text.
    await user.click(within(dialog).getByRole("button", { name: "Отфрли" }));
    expect(within(dialog).queryByRole("region", { name: "Предлог" })).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    // The saved plan carries no steps line: it went as plain text.
    const cell = await waitFor(() => {
      const found = screen
        .getAllByText("6 × 1000 m на 5K темпо, одмор 2 мин")
        .map((el) => el.closest(".cmp-plan"))
        .find(Boolean);
      expect(found).toBeTruthy();
      return found;
    });
    expect(cell?.querySelector(".workout-line")).toBeNull();
  });

  it("keeps free text as text", async () => {
    const { user, dialog, text } = await openEditor();
    await user.type(text, "Слободно по чувство");
    expect(
      await within(dialog).findByText(/не е препознаен/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
  });

  it("can be switched off in the profile; then steps come on request", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    await user.click(await screen.findByRole("link", { name: "Профил" }));
    const planning = await screen.findByRole("button", { name: "Планирање" });
    expect(within(planning).getByText("Автоматски предлог: вклучен")).toBeInTheDocument();
    await user.click(planning);
    await user.click(screen.getByRole("checkbox", { name: /Автоматски предлог на чекори/ }));
    await waitFor(() =>
      expect(within(planning).getByText("Автоматски предлог: исклучен")).toBeInTheDocument(),
    );
    await user.click(screen.getAllByRole("link", { name: "Тренерски приказ" })[0]!);
    await user.click(await screen.findByRole("link", { name: "Планер" }));
    await user.click(await screen.findByRole("button", { name: "Додај тренинг" }));
    const dialog = await screen.findByRole("dialog", { name: "Додај тренинг" });
    await user.type(within(dialog).getByLabelText("Опис"), "6 × 1000 m на 5K темпо");
    await new Promise((r) => setTimeout(r, 900));
    expect(within(dialog).queryByRole("region", { name: "Предлог" })).toBeNull();
    expect(within(dialog).getByText(/Со „Структурирај“/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Структурирај" }));
    expect(await within(dialog).findByRole("region", { name: "Предлог" })).toBeInTheDocument();
  });
});
