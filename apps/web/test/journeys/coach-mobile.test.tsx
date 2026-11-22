import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_QUERY } from "../../src/lib/useIsMobile.js";
import { asCoach, start } from "../support/app.js";

/** The coach workplace on a phone: section menu, athlete cards, tabs, list → conversation. */
beforeEach(() => {
  window.location.hash = "";
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query === MOBILE_QUERY,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("coach on a phone (demo)", () => {
  it("switches sections from a menu that folds back up", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    const menu = await screen.findByRole("button", { name: "Спортисти" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Тренерски приказ" })).toBeNull();
    await user.click(menu);
    const nav = screen.getByRole("navigation", { name: "Тренерски приказ" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent?.trim()),
    ).toEqual(["Спортисти", "Анализи", "Планер", "Пораки", "Мој тренинг"]);
    // Escape folds it up; choosing a section folds it up and shows the new section.
    await user.keyboard("{Escape}");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    await user.click(menu);
    await user.click(
      within(screen.getByRole("navigation", { name: "Тренерски приказ" })).getByRole("link", {
        name: "Планер",
      }),
    );
    expect(await screen.findByRole("heading", { level: 1, name: "Планер" })).toBeInTheDocument();
    const planner = screen.getByRole("button", { name: "Планер" });
    expect(planner).toHaveAttribute("aria-expanded", "false");
    // An outside tap folds it up too.
    await user.click(planner);
    await user.click(screen.getByRole("heading", { level: 1, name: "Планер" }));
    expect(planner).toHaveAttribute("aria-expanded", "false");
  });

  it("lists athletes as cards and opens one in tabs", async () => {
    const { user } = start();
    await asCoach(user).catch(() => undefined);
    const card = await screen.findByRole("link", { name: /^Влатко Петревски/ });
    expect(card).toHaveTextContent(/\d\/\d · \d/);
    expect(card).toHaveTextContent("Порака");
    expect(screen.queryByText("Бара внимание")).toBeNull();
    await user.click(card);
    const tabs = await screen.findByRole("tablist", { name: "Влатко Петревски" });
    // Waiting for a reply: the conversation is the first thing shown.
    expect(within(tabs).getByRole("tab", { name: "Пораки" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    await user.click(within(tabs).getByRole("tab", { name: "План" }));
    expect(await screen.findByRole("heading", { name: /Недела од/ })).toBeInTheDocument();
    // Arrow keys move between tabs.
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(within(tabs).getByRole("tab", { name: "Напредок" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{Home}");
    expect(within(tabs).getByRole("tab", { name: "План" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{End}");
    expect(within(tabs).getByRole("tab", { name: "Напредок" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{ArrowLeft}");
    expect(within(tabs).getByRole("tab", { name: "Пораки" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: "Прекини соработка" })).toBeInTheDocument();
  });

  it("messages: the list first, a tap opens the conversation, back returns", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
    await user.click(await screen.findByRole("button", { name: "Спортисти" }));
    await user.click(screen.getByRole("link", { name: "Пораки" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Пораки" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(await screen.findByRole("button", { name: /Мила Стојковска/ }));
    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Мила Стојковска" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Назад: Пораки" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });
});
