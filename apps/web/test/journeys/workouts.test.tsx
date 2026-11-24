import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { asCoach, start } from "../support/app.js";

/** Structured workouts: the description read into a summary, plain text by choice, the setting. */
beforeEach(() => {
  window.location.hash = "";
});

describe("structured workouts (demo)", () => {
  async function openEditor() {
    const { user } = start();
    await asCoach(user);
    await user.click(await screen.findByRole("link", { name: "Планер" }));
    await user.click(await screen.findByRole("button", { name: "Додај тренинг" }));
    const dialog = await screen.findByRole("dialog", { name: "Додај тренинг" });
    return { user, dialog, text: within(dialog).getByLabelText("Опис") };
  }

  it("reads the description into a summary: bar, steps, totals and advice; steps can be corrected", async () => {
    const { user, dialog, text } = await openEditor();
    // The sport comes first, above the description.
    const sports = within(dialog).getByRole("group", { name: "Спорт" });
    expect(within(sports).getByRole("button", { name: "Трчање" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dialog).queryByLabelText(/^Растојание/)).toBeNull();
    await user.type(text, "Загревање 3 km, 8 × 400 m на 3:30, одмор 200 m, смирување 2 km");
    const summary = within(dialog).getByRole("region", { name: "Резиме на тренингот" });
    expect(
      await within(summary).findByText("8 ×", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(
      within(summary).getByRole("img", { name: "Тренингот по зони, по време" }),
    ).toBeInTheDocument();
    // Totals from the description: 3 + 8 × 0.4 + 7 × 0.2 + 2 km.
    expect(within(summary).getByText(/^9,6 km · /)).toBeInTheDocument();
    expect(within(summary).getByText(/^Загреј се 3 km лесно/)).toBeInTheDocument();
    const warm = within(summary).getByLabelText(/^Загревање: Вредност/);
    await user.clear(warm);
    await user.type(warm, "2,5");
    await user.tab();
    expect(within(summary).getByText(/^9,1 km · /)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    expect(
      await screen.findByText(/Загревање 2,5 km · 8 × 400 m @ 3:30 \/km \/ 200 m · Смирување 2 km/),
    ).toBeInTheDocument();
  });

  it("gives a named pace the numbers of the athlete's goal", async () => {
    const { user, dialog, text } = await openEditor();
    // Влатко's goal in the demo: half marathon in 1:45.
    await user.type(text, "Интервали 2k wu + 6x1000 HM pace / 500m jog + 2k CD");
    const summary = within(dialog).getByRole("region", { name: "Резиме на тренингот" });
    // 1:45 for 21.1 km is 4:59 /km: on the step and in the advice.
    expect(
      await within(summary).findAllByText(/HM pace · 4:59 \/km/, undefined, { timeout: 3000 }),
    ).toHaveLength(2);
    expect(within(summary).getByText(/^12,5 km · /)).toBeInTheDocument();
  });

  it("keeps the text as written without a structure when the coach chooses so", async () => {
    const { user, dialog, text } = await openEditor();
    await user.type(text, "6 × 1000 m на 5K темпо, одмор 2 мин");
    const summary = within(dialog).getByRole("region", { name: "Резиме на тренингот" });
    await within(summary).findByText("6 ×", undefined, { timeout: 3000 });
    await user.click(within(dialog).getByRole("button", { name: "Без структура" }));
    expect(within(summary).getByText(/останува само како текст/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 700));
    expect(within(summary).queryByText("6 ×")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
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
    await asCoach(user);
    await user.click((await screen.findAllByRole("link", { name: /^Профил \S+$/ }))[0]!);
    const planning = await screen.findByRole("button", { name: /^Планирање/ });
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
    const summary = within(dialog).getByRole("region", { name: "Резиме на тренингот" });
    expect(within(summary).queryByText("6 ×")).toBeNull();
    expect(within(dialog).getByText(/Со „Структурирај“/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Структурирај" }));
    expect(await within(summary).findByText("6 ×")).toBeInTheDocument();
  });
});
