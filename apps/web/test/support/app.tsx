import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoApi } from "../../src/api/demo.js";
import { App } from "../../src/app/App.js";

/**
 * Renders the whole app on the in-memory demo API (Macedonian, memory routing). Journeys drive
 * it like a user: by roles and visible names, never by CSS classes or component internals.
 */
export function start() {
  window.location.hash = "";
  localStorage.setItem("activen.locale", "mk");
  const api = new DemoApi(() => "mk");
  const user = userEvent.setup();
  render(<App api={api} routing="memory" />);
  return { api, user };
}

type User = ReturnType<typeof start>["user"];

export async function asAthlete(user: User) {
  await user.click(await screen.findByRole("button", { name: "Пробај како спортист" }));
  await screen.findByRole("heading", { level: 1, name: /Влатко/ });
}

export async function asCoach(user: User) {
  await user.click(await screen.findByRole("button", { name: "Пробај како тренер" }));
  await screen.findByRole("heading", { name: "Бара внимание" });
}

/** Main navigation link (the shell renders it in the side bar and the bottom bar). */
export const nav = async (user: User, name: string | RegExp) =>
  user.click((await screen.findAllByRole("link", { name }))[0]!);
