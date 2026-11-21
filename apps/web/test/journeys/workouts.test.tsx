import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { asCoach, start } from "../support/app.js";

/** Structured workouts: suggestions while writing, accept or keep plain text, the setting. */
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
    expect(within(dialog).queryByRole("region", { name: "Предлог" })).toBeNull();
    expect(within(dialog).getByText(/Со „Структурирај“/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Структурирај" }));
    expect(await within(dialog).findByRole("region", { name: "Предлог" })).toBeInTheDocument();
  });
});
