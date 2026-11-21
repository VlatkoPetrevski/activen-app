import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/api.js";
import { asAthlete, nav, start } from "../support/app.js";

/** The athlete's plan week: navigation, adding, editing, deleting, conflicts and errors. */
beforeEach(() => {
  window.location.hash = "";
});

type User = Parameters<typeof nav>[0];

async function openPlan(user: User) {
  await nav(user, "План");
  const heading = await screen.findByRole("heading", { name: /Недела од/ });
  await screen.findByText(/^Планирано \d+ · реализирано \d+$/);
  return heading;
}

/** Goes forward until a week has an empty day (the demo plans the coming weeks). */
async function weekWithEmptyDay(user: User) {
  for (let i = 0; i < 12; i++) {
    await user.click(screen.getByRole("button", { name: "Следна недела" }));
    await screen.findByText(/^Планирано \d+ · реализирано \d+$/);
    const empty = screen.queryAllByRole("button", { name: /^Додај тренинг — / });
    if (empty.length) return empty;
  }
  throw new Error("no empty day in the next 12 weeks");
}

describe("plan week", () => {
  it("moves between weeks and back to today", async () => {
    const { user } = start();
    await asAthlete(user);
    const heading = await openPlan(user);
    const thisWeek = heading.textContent;
    expect(screen.queryByRole("button", { name: "Денес" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Следна недела" }));
    await waitFor(() => expect(heading.textContent).not.toBe(thisWeek));
    // An empty future day offers a quick add for that date.
    expect(await weekWithEmptyDay(user)).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Денес" }));
    await waitFor(() => expect(heading.textContent).toBe(thisWeek));
    await user.click(screen.getByRole("button", { name: "Претходна недела" }));
    await waitFor(() => expect(heading.textContent).not.toBe(thisWeek));
    expect(await screen.findByText(/^Планирано \d+ · реализирано \d+$/)).toBeInTheDocument();
  });

  it("adds a session on an empty day, then deletes it after confirming", async () => {
    const { user } = start();
    await asAthlete(user);
    await openPlan(user);
    const [emptyDay] = await weekWithEmptyDay(user);
    await user.click(emptyDay!);
    const dialog = await screen.findByRole("dialog", { name: "Додај тренинг" });
    await user.type(within(dialog).getByLabelText("Опис"), "Брдски спринтови");
    await user.type(within(dialog).getByLabelText(/^Растојание/), "6");
    await user.type(within(dialog).getByLabelText("Времетраење (мин)"), "40");
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    const entry = await screen.findByRole("button", { name: /Брдски спринтови/ });
    expect(entry).toHaveTextContent("6 km");

    await user.click(entry);
    const edit = await screen.findByRole("dialog", { name: "Измени тренинг" });
    await user.click(within(edit).getByRole("button", { name: "Избриши" }));
    const confirm = await screen.findByRole("dialog", { name: /Да го отстранам/ });
    await user.click(within(confirm).getByRole("button", { name: "Откажи" }));
    expect(screen.getByRole("dialog", { name: "Измени тренинг" })).toBeInTheDocument();
    await user.click(within(edit).getByRole("button", { name: "Избриши" }));
    await user.click(
      within(await screen.findByRole("dialog", { name: /Да го отстранам/ })).getByRole("button", {
        name: "Избриши",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Брдски спринтови/ })).toBeNull(),
    );
  });

  it("reloads the latest version when someone else changed the session", async () => {
    const { user, api } = start();
    await asAthlete(user);
    await openPlan(user);
    const [first] = await screen.findAllByRole("button", { name: /km|Одмор/ });
    await user.click(first!);
    const dialog = await screen.findByRole("dialog", { name: "Измени тренинг" });
    const refetch = vi.spyOn(api, "calendar");
    api.updatePlan = () => Promise.reject(new ApiError(409, "Conflict"));
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    expect(await within(dialog).findByText(/променет во меѓувреме/)).toBeInTheDocument();
    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "Измени тренинг" })).toBeInTheDocument();
  });

  it("shows localized messages for invalid input and server errors", async () => {
    const { user, api } = start();
    await asAthlete(user);
    await openPlan(user);
    await user.click(screen.getByRole("button", { name: "Додај тренинг" }));
    const dialog = await screen.findByRole("dialog", { name: "Додај тренинг" });
    await user.type(within(dialog).getByLabelText("Опис"), "x");
    api.createPlan = () =>
      Promise.reject(new ApiError(422, "description: String must contain at least 1 character"));
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    expect(
      await within(dialog).findByText("Провери ги внесените податоци и обиди се повторно."),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/String must/)).toBeNull();
    api.createPlan = () => Promise.reject(new ApiError(503, "Service Unavailable"));
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    expect(
      await within(dialog).findByText("Нешто тргна наопаку. Обиди се повторно."),
    ).toBeInTheDocument();
  });

  it("plans a rest day without sport, distance or steps", async () => {
    const { user, api } = start();
    const create = vi.spyOn(api, "createPlan");
    await asAthlete(user);
    await openPlan(user);
    await user.click(screen.getByRole("button", { name: "Додај тренинг" }));
    const dialog = await screen.findByRole("dialog", { name: "Додај тренинг" });
    await user.click(within(dialog).getByRole("button", { name: "Одмор" }));
    await user.click(within(dialog).getByRole("button", { name: "Зачувај" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0]).toMatchObject({
      kind: "rest",
      description: "Одмор",
      plannedActivityType: null,
      plannedDistanceInMeters: null,
      plannedDurationInSeconds: null,
      structure: null,
    });
  });
});
