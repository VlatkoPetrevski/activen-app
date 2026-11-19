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
    const links = await screen.findAllByRole("link", { name: /km/ });
    await user.click(links[0]!);
    expect(await screen.findByRole("heading", { name: "Како помина?" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Анализа" })).toBeInTheDocument();
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
    await user.click(await screen.findByRole("button", { name: "Империјални (mi)" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Империјални (mi)" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Нагоре: Polar" }));
    await user.click(screen.getAllByRole("button", { name: "EN" })[0]!);
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Sign out/ }));
    expect(await screen.findByRole("heading", { name: "Sign in to ActiveN" })).toBeInTheDocument();
  });
});

describe("confirmations", () => {
  it("asks in-app before ending the coaching relationship", async () => {
    const { user } = start();
    await user.click(await screen.findByRole("button", { name: "Пробај како спортист" }));
    await screen.findByRole("heading", { level: 1, name: /Влатко/ });
    await user.click(screen.getAllByRole("link", { name: "Тренер" })[0]!);
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
    expect(screen.getAllByText("Чека твој одговор").length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("link", { name: /Влатко Петревски/ })[0]!);
    expect(await screen.findByRole("heading", { name: "План за Влатко" })).toBeInTheDocument();
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
