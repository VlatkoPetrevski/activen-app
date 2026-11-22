import { intervalRunFit } from "@activen/importers/testing";
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { pageItems } from "../../src/ui/Pager.js";
import { asAthlete, nav, start } from "../support/app.js";

/** The activity list in pages, entering a workout by hand, and a file that replaces it. */
beforeEach(() => {
  window.location.hash = "";
});

describe("activities list", () => {
  it("shows ten compact lines per page with numbered pages", async () => {
    const { user } = start();
    await asAthlete(user);
    await nav(user, "Активности");
    const lines = await screen.findByRole("list", { name: "Активности" });
    expect(within(lines).getAllByRole("listitem")).toHaveLength(10);
    const pages = screen.getByRole("navigation", { name: "Страници" });
    const first = within(pages).getByRole("button", { name: "Страница 1" });
    expect(first).toHaveAttribute("aria-current", "page");
    expect(within(pages).getByRole("button", { name: "Претходна страница" })).toBeDisabled();
    const firstName = within(lines).getAllByRole("link")[0]!.textContent;
    await user.click(within(pages).getByRole("button", { name: "Страница 2" }));
    expect(within(pages).getByRole("button", { name: "Страница 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(lines).getAllByRole("link")[0]!.textContent).not.toBe(firstName);
    // Another filter starts on the first page again.
    await user.click(screen.getByRole("button", { name: "Трчање" }));
    expect(
      within(screen.getByRole("navigation", { name: "Страници" })).getByRole("button", {
        name: "Страница 1",
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("enters a workout by hand, with its rating; a file of it later takes its place", async () => {
    const { user } = start();
    await asAthlete(user);
    await nav(user, "Активности");
    await user.click(await screen.findByRole("button", { name: "Внеси рачно" }));
    const dialog = await screen.findByRole("dialog", { name: "Внеси активност" });
    // Required: the duration. Explained, not saved.
    await user.click(within(dialog).getByRole("button", { name: "Зачувај активност" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/времетраење/);
    // The fixture run moved to the evening: 18 Nov 2026, 19:00 in Skopje, 31:30.
    await user.clear(within(dialog).getByLabelText("Датум"));
    await user.type(within(dialog).getByLabelText("Датум"), "2026-11-18");
    await user.clear(within(dialog).getByLabelText("Почеток"));
    await user.type(within(dialog).getByLabelText("Почеток"), "19:00");
    await user.type(within(dialog).getByLabelText("Минути"), "31");
    await user.type(within(dialog).getByLabelText("Секунди"), "30");
    await user.type(within(dialog).getByLabelText("Растојание (km)"), "8,2");
    await user.type(within(dialog).getByLabelText("Просечен пулс"), "180");
    await user.type(within(dialog).getByLabelText("Макс. пулс"), "170");
    await user.click(within(dialog).getByRole("button", { name: "Зачувај активност" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/максималниот/);
    await user.clear(within(dialog).getByLabelText("Просечен пулс"));
    await user.type(within(dialog).getByLabelText("Просечен пулс"), "150");
    await user.type(within(dialog).getByLabelText("Име (по избор)"), "Без часовник");
    const effort = within(dialog).getByRole("group", { name: "Напор (RPE)" });
    await user.click(within(effort).getByRole("button", { name: "6" }));
    await user.click(within(dialog).getByRole("button", { name: "Зачувај активност" }));

    // It opens as an activity entered by hand, with the rating.
    expect(await screen.findByRole("heading", { level: 1, name: "Без часовник" })).toBeVisible();
    expect(screen.getByText("Внесено рачно")).toBeInTheDocument();
    expect(screen.getByText("8,2 km")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Детали" })).toBeNull();

    // The watch file of the same run replaces the numbers and keeps the rating.
    await nav(user, "Активности");
    await user.click(await screen.findByRole("button", { name: "Увези" }));
    await user.upload(
      screen.getByTestId("import-input"),
      new File(
        [intervalRunFit({ strap: true, startShiftSeconds: 12 * 3600 }) as Uint8Array<ArrayBuffer>],
        "run.fit",
      ),
    );
    const report = await screen.findByRole("status", { name: /1 увезена/ });
    await user.click(within(report).getByRole("link", { name: "Детали" }));
    await user.click(await screen.findByRole("tab", { name: "Оценка" }));
    const rpe = await screen.findByRole("group", { name: "Напор (RPE)" });
    expect(within(rpe).getByRole("button", { name: "6" })).toHaveAttribute("aria-pressed", "true");
    await nav(user, "Активности");
    await user.click(await screen.findByRole("button", { name: "Сите" }));
    await screen.findByRole("list", { name: "Активности" });
    expect(screen.queryByRole("link", { name: /Без часовник/ })).toBeNull();
  });
});

describe("pageItems", () => {
  it("shows every page when few, otherwise the ends and the neighbours", () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
    expect(pageItems(1, 12)).toEqual([1, 2, 3, 4, "gap", 12]);
    expect(pageItems(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageItems(12, 12)).toEqual([1, "gap", 9, 10, 11, 12]);
  });
});
