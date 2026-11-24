import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { asAthlete, nav, start } from "../support/app.js";

/** The athlete's goal: words, the race read from them, Daniels' paces; the coach writes it too. */
beforeEach(() => {
  window.location.hash = "";
});

describe("goal (demo)", () => {
  it("shows the athlete's goal with paces and predicted times, and is edited in words", async () => {
    const { user } = start();
    await asAthlete(user);
    await nav(user, "План");
    const card = (await screen.findByRole("heading", { name: "Цел" })).closest("section")!;
    expect(within(card).getByText("Полумаратон за 1:45")).toBeInTheDocument();
    const paces = within(card).getByRole("list", { name: "Темпа за тренинг" });
    expect(within(paces).getByText("HM").nextSibling).toHaveTextContent("4:59");
    expect(within(card).getByText(/Предвидено \(Daniels VDOT \d+,\d\)/)).toBeInTheDocument();

    await user.click(within(card).getByRole("button", { name: "Измени" }));
    const input = within(card).getByLabelText("Цел со зборови");
    await user.clear(input);
    await user.type(input, "маратон за 3:30");
    expect(within(card).getByText(/Се чита како: Маратон за 3:30:00/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Зачувај" }));
    await waitFor(() => expect(within(card).getByText("маратон за 3:30")).toBeInTheDocument());
    expect(
      within(within(card).getByRole("list", { name: "Темпа за тренинг" })).getByText("M")
        .nextSibling,
    ).toHaveTextContent("4:59");
  });

  it("keeps words without a race and explains that there are no paces", async () => {
    const { user } = start();
    await asAthlete(user);
    await nav(user, "План");
    const card = (await screen.findByRole("heading", { name: "Цел" })).closest("section")!;
    await user.click(within(card).getByRole("button", { name: "Измени" }));
    const input = within(card).getByLabelText("Цел со зборови");
    await user.clear(input);
    await user.type(input, "Да трчам за здравје");
    await user.click(within(card).getByRole("button", { name: "Зачувај" }));
    expect(await within(card).findByText(/нема трка и време/)).toBeInTheDocument();
  });
});
