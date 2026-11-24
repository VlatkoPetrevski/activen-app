import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { asAthlete, nav, start } from "../support/app.js";

/** "Внеси план": pasted text or a week typed by hand, reviewed, then saved. */
beforeEach(() => {
  window.location.hash = "";
});

type User = Parameters<typeof nav>[0];

async function openImport(user: User) {
  await nav(user, "План");
  await screen.findByText(/^Планирано \d+ · реализирано \d+$/);
  await user.click(screen.getByRole("button", { name: "Внеси план" }));
  return screen.findByRole("dialog", { name: "Внеси план" });
}

describe("plan import", () => {
  it("reads pasted text, flags days already planned and replaces them on save", async () => {
    const { user } = start();
    await asAthlete(user);
    const dialog = await openImport(user);
    await user.type(
      within(dialog).getByLabelText("Залепи го планот"),
      "без ден{Enter}Сабота: Увезено долго 21 km{Enter}Недела одмор",
    );
    await user.click(within(dialog).getByRole("button", { name: "Прочитај" }));
    expect(await within(dialog).findByText(/^Прочитани денови: 2\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/„без ден“/)).toBeInTheDocument();
    const desc = within(dialog).getByRole("textbox", { name: /^Опис, / });
    expect(desc).toHaveValue("Увезено долго 21 km");
    // The demo week already has sessions: each such day asks what to do, "Замени" by default.
    const actions = within(dialog).getAllByRole("combobox", { name: /^Што со постојниот/ });
    for (const a of actions) expect(a).toHaveValue("replace");
    await user.click(within(dialog).getByRole("button", { name: /^Зачувај 2 дена$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("button", { name: /Увезено долго 21 km/ })).toHaveTextContent(
      "21 km",
    );
  });

  it("takes a week typed day by day and can skip a day already planned", async () => {
    const { user } = start();
    await asAthlete(user);
    const dialog = await openImport(user);
    await user.click(within(dialog).getByRole("tab", { name: "Рачно по недела" }));
    const cells = within(dialog).getAllByRole("textbox");
    await user.type(cells[0]!, "Рачно 8 km лесно");
    await user.click(within(dialog).getByRole("button", { name: "Додај недела" }));
    expect(within(dialog).getAllByRole("textbox")).toHaveLength(14);
    await user.click(within(dialog).getByRole("button", { name: "Прочитај" }));
    await within(dialog).findByText(/^Прочитани денови: 1\./);
    for (const a of within(dialog).queryAllByRole("combobox", { name: /^Што со постојниот/ }))
      await user.selectOptions(a, "add");
    await user.click(within(dialog).getByRole("button", { name: /^Зачувај 1 дена$/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("button", { name: /Рачно 8 km лесно/ })).toBeInTheDocument();
  });

  it("explains that Word, PDF and images wait for AI reading", async () => {
    const { user } = start();
    await asAthlete(user);
    const dialog = await openImport(user);
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(["x"], "plan.pdf", { type: "application/pdf" }));
    expect(await within(dialog).findByRole("status")).toHaveTextContent(/„plan.pdf“/);
    await user.upload(input, new File(["Ден 1: 5 km"], "plan.txt", { type: "text/plain" }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Залепи го планот")).toHaveValue("Ден 1: 5 km"),
    );
  });
});
