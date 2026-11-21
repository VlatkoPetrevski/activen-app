import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCoach, nav, start } from "../support/app.js";

/** Coach journeys: athletes, planner, messages and analytics. */
beforeEach(() => {
  window.location.hash = "";
});

describe("coach workplace (demo)", () => {
  it("shows athletes needing attention, opens one and replies", async () => {
    const { user } = start();
    await asCoach(user);
    expect(await screen.findByRole("heading", { name: "Бара внимание" })).toBeInTheDocument();
    expect(screen.getAllByText("Порака").length).toBeGreaterThan(0);
    // Weekly totals sit between the last activity and the source: "34,5 km / 3 ч 12 мин".
    const headers = [...document.querySelectorAll(".dash-head > span")].map((h) => h.textContent);
    expect(headers.indexOf("Вкупно оваа недела")).toBe(headers.indexOf("Последна активност") + 1);
    expect(headers.indexOf("Извор")).toBe(headers.indexOf("Вкупно оваа недела") + 1);
    expect(screen.getAllByText(/^\/ \d+ (ч \d+ )?мин$/).length).toBeGreaterThan(0);
    // Each athlete is a row that expands to signals, the last message and shortcuts.
    const row = screen.getByRole("button", { name: /^Влатко Петревски/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByRole("region", { name: "Влатко Петревски" });
    expect(within(details).getByRole("link", { name: "Анализи" })).toBeInTheDocument();
    await user.click(within(details).getByRole("link", { name: "Профил" }));
    expect(await screen.findByRole("heading", { name: "План за Влатко" })).toBeInTheDocument();
    // Messages open by themselves when the athlete is waiting for a reply.
    expect(screen.getByRole("button", { name: /^Пораки/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
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
    await asCoach(user);
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
    await asCoach(user);
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
    await asCoach(user);
    await nav(user, "Анализи");
    expect(await screen.findByText("Активни спортисти")).toBeInTheDocument();
    // Each athlete is a compact row that expands in place.
    await screen.findByText("Активни спортисти");
    const rows = [...document.querySelectorAll<HTMLButtonElement>(".roster .segment-head")];
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
    const weekly = await screen.findByRole("button", { name: /^Неделен волумен \(12 нед\.\)/ });
    await user.click(weekly);
    expect(weekly).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("img", { name: /Растојание по недела/ }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^Кондиција, замор и форма/ }));
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
    await asCoach(user);
    await nav(user, "Анализи");
    await screen.findByText("Активни спортисти");
    const rows = [...document.querySelectorAll<HTMLButtonElement>(".roster .segment-head")];
    await user.click(rows[0]!);
    await user.click(screen.getAllByRole("link", { name: /^Анализа: / })[0]!);
    await screen.findByText("Исполнет план (28 д.)");
    await user.click(screen.getByRole("button", { name: "Трчање" }));
    await user.click(screen.getAllByRole("link", { name: /трчање/ })[0]!);
    expect(await screen.findByText("Спортистот не ја споделува GPS мапата.")).toBeInTheDocument();
    expect(screen.getByText("Извор и сензори")).toBeInTheDocument();
  });
});

describe("coach planner editing (demo)", () => {
  it("switches athletes, pages months, plans and edits a session for the athlete", async () => {
    const { user, api } = start();
    const create = vi.spyOn(api, "createAthletePlan");
    const update = vi.spyOn(api, "updateAthletePlan");
    await asCoach(user);
    await nav(user, "Планер");
    const picker = await screen.findByRole("combobox", { name: "Избери спортист" });
    const first = (picker as HTMLSelectElement).value;
    const other = within(picker)
      .getAllByRole("option")
      .find((o) => o.getAttribute("value") !== first)!;
    await user.selectOptions(picker, other);
    await screen.findByRole("heading", { name: /^Недела од/ });

    // Month paging moves the calendar only; "Today" returns the week.
    const month = screen.getByRole("region", { name: "Календар" });
    const title = within(month).getByRole("heading").textContent;
    await user.click(within(month).getByRole("button", { name: /^Следен месец: / }));
    await waitFor(() => expect(within(month).getByRole("heading").textContent).not.toBe(title));
    await user.click(within(month).getByRole("button", { name: /^Претходен месец: / }));
    await waitFor(() => expect(within(month).getByRole("heading").textContent).toBe(title));
    await user.click(screen.getByRole("button", { name: "Следна недела" }));
    await user.click(await screen.findByRole("button", { name: "Денес" }));

    // Plan a session on an empty day of a future week.
    let empty: HTMLElement[] = [];
    for (let i = 0; i < 8 && empty.length === 0; i++) {
      await user.click(screen.getByRole("button", { name: "Следна недела" }));
      await screen.findByRole("heading", { name: /^Недела од/ });
      empty = await screen
        .findAllByRole("button", { name: /^Додај план — / }, { timeout: 300 })
        .catch(() => []);
    }
    await user.click(empty[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Додај тренинг" });
    await user.type(within(dialog).getByLabelText("Опис"), "Темпо 8 km");
    await user.type(within(dialog).getByLabelText("Совет од тренерот"), "Првите 2 km полека");
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0]).toBe(other.getAttribute("value"));
    expect(create.mock.calls[0]![1]).toMatchObject({
      description: "Темпо 8 km",
      notes: "Првите 2 km полека",
    });

    await user.click(await screen.findByRole("button", { name: /Темпо 8 km/ }));
    const edit = await screen.findByRole("dialog", { name: "Измени тренинг" });
    await user.clear(within(edit).getByLabelText("Опис"));
    await user.type(within(edit).getByLabelText("Опис"), "Темпо 10 km");
    await user.click(within(edit).getByRole("button", { name: "Зачувај" }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]![2]).toMatchObject({
      description: "Темпо 10 km",
      expectedVersion: 1,
    });
    expect(await screen.findByRole("button", { name: /Темпо 10 km/ })).toBeInTheDocument();
  });
});
