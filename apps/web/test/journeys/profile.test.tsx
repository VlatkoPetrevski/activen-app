import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/api/api.js";
import { asAthlete, nav, start } from "../support/app.js";

/** Profile: name, preferences, heart-rate zones, roles, sign-in methods, devices, deletion. */
beforeEach(() => {
  window.location.hash = "";
});

const openProfile = (user: Parameters<typeof nav>[0]) => nav(user, /^Профил \S+$/);
const ERROR = "Нешто тргна наопаку. Обиди се повторно.";

describe("profile account", () => {
  it("renames, saves only real changes, and takes on the coach role", async () => {
    const { user, api } = start();
    await asAthlete(user);
    await openProfile(user);
    const nameRow = await screen.findByRole("button", { name: /^Име/ });
    await user.click(nameRow);
    const input = screen.getByRole("textbox", { name: "Име" });
    const save = screen.getAllByRole("button", { name: "Зачувај" })[0]!;
    expect(save).toBeDisabled();
    await user.clear(input);
    await user.type(input, "   ");
    expect(save).toBeDisabled();
    await user.clear(input);
    await user.type(input, "Влатко П.");
    await user.click(save);
    await waitFor(() => expect(within(nameRow).getByText("Влатко П.")).toBeInTheDocument());

    const addRole = vi.spyOn(api, "addRole");
    await user.click(screen.getByRole("button", { name: /^Улоги/ }));
    await user.click(screen.getByRole("checkbox", { name: "Тренирам и спортисти" }));
    expect(addRole).toHaveBeenCalledWith("coach");
    expect(await screen.findAllByRole("link", { name: "Тренерски приказ" })).not.toHaveLength(0);
  });

  it("never offers to remove the last sign-in method", async () => {
    const { user } = start();
    await asAthlete(user);
    await openProfile(user);
    await user.click(await screen.findByRole("button", { name: /^Начини за најава/ }));
    // Only one method: it cannot be removed, so there is no button.
    expect(screen.queryByRole("button", { name: "Отстрани" })).toBeNull();
  });

  it("signs other devices out and deletes the account only after typing DELETE", async () => {
    const { user, api } = start();
    const now = new Date().toISOString();
    api.sessions = async () => [
      {
        id: "s-1",
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now,
        userAgent: null,
        current: true,
      },
      {
        id: "s-2",
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now,
        userAgent: "Firefox on Linux",
        current: false,
      },
    ];
    const revoke = vi.spyOn(api, "revokeSession");
    const revokeOthers = vi.spyOn(api, "revokeOtherSessions");
    await asAthlete(user);
    await openProfile(user);
    await user.click(await screen.findByRole("button", { name: /^Најавени уреди/ }));
    expect(await screen.findByText("Овој уред")).toBeInTheDocument();
    expect(screen.getByText(/Firefox on Linux/)).toBeInTheDocument();
    const devices = screen.getByText("Овој уред").closest(".list")!;
    await user.click(within(devices as HTMLElement).getByRole("button", { name: "Одјави се" }));
    expect(revoke).toHaveBeenCalledWith("s-2");
    await user.click(screen.getByRole("button", { name: "Одјави ги другите уреди" }));
    expect(revokeOthers).toHaveBeenCalled();

    // A failing action shows the localized error.
    api.revokeOtherSessions = () => Promise.reject(new ApiError(500, "Internal Server Error"));
    await user.click(screen.getByRole("button", { name: "Одјави ги другите уреди" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(ERROR);
    expect(screen.queryByText("Internal Server Error")).toBeNull();

    const remove = screen.getByRole("button", { name: "Избриши" });
    expect(remove).toBeDisabled();
    await user.type(screen.getByLabelText("DELETE"), "delete");
    expect(remove).toBeDisabled();
    await user.clear(screen.getByLabelText("DELETE"));
    await user.type(screen.getByLabelText("DELETE"), "DELETE");
    await user.click(remove);
    expect(
      await screen.findByRole("heading", { name: "Најави се во ActiveN" }),
    ).toBeInTheDocument();
  });
});

describe("profile preferences", () => {
  it("shows five colored zones from the watch, or the athlete's own; max HR and birth date", async () => {
    const { user, api } = start();
    const update = vi.spyOn(api, "updateSettings");
    await asAthlete(user);
    await openProfile(user);
    const section = await screen.findByRole("button", { name: /^HR зони/ });
    // The demo watch (Garmin) sent its zones; five rows by physiology, with ranges.
    await waitFor(() => expect(section).toHaveTextContent("Од Garmin"));
    await user.click(section);
    for (const name of ["Опоравување", "Аеробна основа", "Темпо", "Праг", "VO2max"])
      expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByText("129–144")).toBeInTheDocument();
    expect(screen.getByText("168+")).toBeInTheDocument();
    // Always one app.
    await user.selectOptions(screen.getByLabelText("Апликација"), "polar");
    expect(update).toHaveBeenLastCalledWith({ hrZones: { mode: "vendor", vendor: "polar" } });
    expect(await screen.findByText(/Избраната апликација нема испратено зони/)).toBeInTheDocument();

    // Manual: the bounds start from the zones in use; invalid ones are explained.
    await waitFor(() => expect(screen.getByRole("button", { name: "Рачно" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Рачно" }));
    expect(update).toHaveBeenLastCalledWith({ hrZones: { mode: "manual" } });
    const z2 = await screen.findByLabelText("Почеток на зона 2 (удари/мин)");
    const z3 = screen.getByLabelText("Почеток на зона 3 (удари/мин)");
    await user.clear(z3);
    await user.type(z3, "110");
    await user.click(screen.getByRole("button", { name: "Зачувај зони" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/растат/);
    await user.clear(z2);
    await user.type(z2, "105");
    await user.clear(z3);
    await user.type(z3, "135");
    await user.click(screen.getByRole("button", { name: "Зачувај зони" }));
    expect(await screen.findByText("Зоните се зачувани и важат од денес.")).toBeInTheDocument();
    await waitFor(() => expect(section).toHaveTextContent("Рачно"));

    const maxHr = screen.getByLabelText("Макс. пулс (bpm)");
    update.mockClear();
    // Out of range values are not sent.
    await user.clear(maxHr);
    await user.type(maxHr, "300");
    await user.tab();
    expect(update).not.toHaveBeenCalled();
    await user.clear(maxHr);
    await user.type(maxHr, "188");
    await user.tab();
    expect(update).toHaveBeenLastCalledWith({ maxHeartRate: 188 });
    expect(
      await screen.findByRole("button", { name: "Пресметај од макс. пулс (188)" }),
    ).toBeInTheDocument();
    const birth = screen.getByLabelText("Датум на раѓање");
    await user.type(birth, "1985-04-12");
    await user.tab();
    expect(update).toHaveBeenLastCalledWith({ birthDate: "1985-04-12" });
  });

  it("turns the morning email on at a chosen time and sets the sleep need", async () => {
    const { user, api } = start();
    const update = vi.spyOn(api, "updateSettings");
    await asAthlete(user);
    await openProfile(user);
    const section = await screen.findByRole("button", { name: /^Известувања/ });
    expect(section).toHaveTextContent("Е-пошта исклучена");
    await user.click(section);
    await user.click(screen.getByRole("checkbox", { name: "Утрински брифинг по е-пошта" }));
    expect(update).toHaveBeenLastCalledWith({ briefingReminder: { enabled: true, time: "07:00" } });
    await waitFor(() => expect(section).toHaveTextContent("Е-пошта во 07:00"));
    const time = screen.getByLabelText("Време");
    await waitFor(() => expect(time).toBeEnabled());
    await user.clear(time);
    await user.type(time, "06:15");
    await user.tab();
    expect(update).toHaveBeenLastCalledWith({ briefingReminder: { enabled: true, time: "06:15" } });
    const need = screen.getByLabelText("Потреба од сон (часови)");
    await user.clear(need);
    await user.type(need, "3");
    await user.tab();
    expect(update).not.toHaveBeenCalledWith({ sleepNeedMinutes: 180 });
    await user.clear(need);
    await user.type(need, "7.5");
    await user.tab();
    expect(update).toHaveBeenLastCalledWith({ sleepNeedMinutes: 450 });
  });

  it("changes the time zone and moves data sources both ways", async () => {
    const { user, api } = start();
    const update = vi.spyOn(api, "updateSettings");
    await asAthlete(user);
    await openProfile(user);
    await user.click(await screen.findByRole("button", { name: /^Јазик/ }));
    await user.selectOptions(screen.getByLabelText("Временска зона"), "Europe/Berlin");
    expect(update).toHaveBeenLastCalledWith({ timeZone: "Europe/Berlin" });
    const sources = screen.getByRole("button", { name: /^Извори на податоци/ });
    await user.click(sources);
    const first = sources.textContent!.split("›")[0]!.replace("Извори на податоци", "").trim();
    const down = screen.getByRole("button", { name: `Надолу: ${first}` });
    await waitFor(() => expect(down).toBeEnabled()); // the time zone is still saving
    await user.click(down);
    await waitFor(() => expect(sources.textContent).not.toContain(`податоци${first}`));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: `Нагоре: ${first}` })).toBeEnabled(),
    );
  });
});

describe("coach-tab format settings", () => {
  it("rolls the units back and explains when saving fails", async () => {
    const { user, api } = start();
    await asAthlete(user);
    await nav(user, "Тренер");
    await user.click(await screen.findByRole("button", { name: /Поставки/ }));
    const dialog = await screen.findByRole("dialog", { name: "Поставки за соработката" });
    api.updateSettings = () => Promise.reject(new Error("offline"));
    const us = within(dialog).getByRole("button", { name: "US (mi, °F)" });
    await user.click(us);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(ERROR);
    expect(us).toHaveAttribute("aria-pressed", "false");
  });
});
