import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { asAthlete, start } from "../support/app.js";

/** Athlete journeys: today, plan, activities, check-in, coach tab, profile and settings. */
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
    const readiness = await screen.findByRole("button", { name: /^Спремност за тренинг\s*72/ });
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
    await asAthlete(user);
    await user.click(screen.getAllByRole("link", { name: /^Профил \S+$/ })[0]!);
    // Profile sections are collapsed rows with the current value; a tap opens the form.
    const language = await screen.findByRole("button", { name: /^Јазик/ });
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
    await user.click(screen.getAllByRole("link", { name: /^Профил \S+$/ })[0]!);
    await user.click(screen.getByRole("button", { name: /^Извори на податоци/ }));
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
    await asAthlete(user);
    await user.click(screen.getAllByRole("link", { name: "Тренер" })[0]!);
    expect(await screen.findByText("Ана Стојанова")).toBeInTheDocument();
    expect(screen.getByText(/^Споделуваш: /)).toBeInTheDocument();
    // Progress: one line collapsed, the week's statistics on expand, collapsed again on tap.
    const progress = screen.getByRole("button", { name: /^Прогрес/ });
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
    await asAthlete(user);
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

describe("settings resilience", () => {
  it("shows a change at once and rolls it back when saving fails", async () => {
    const { user, api } = start();
    await asAthlete(user);
    await user.click(screen.getAllByRole("link", { name: /^Профил \S+$/ })[0]!);
    await user.click(await screen.findByRole("button", { name: /^Планирање/ }));
    let fail: (e: Error) => void = () => undefined;
    api.updateSettings = () => new Promise((_, reject) => (fail = reject));
    const box = screen.getByRole("checkbox", { name: /Автоматски предлог на чекори/ });
    await user.click(box);
    expect(box).not.toBeChecked(); // optimistic
    fail(new Error("offline"));
    await waitFor(() => expect(box).toBeChecked()); // rolled back
    expect(screen.getByText("Нешто тргна наопаку. Обиди се повторно.")).toBeInTheDocument();
  });
});
