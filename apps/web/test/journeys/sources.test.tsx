import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asAthlete, nav, start } from "../support/app.js";

/** Profile › Sources › Connected apps (the demo simulates Polar Flow's approval). */
beforeEach(() => {
  window.location.hash = "";
});

async function openSources(user: Parameters<typeof nav>[0]) {
  await nav(user, /^Профил \S+$/);
  await user.click(await screen.findByRole("button", { name: /^Извори на податоци/ }));
  return screen.findByText("Поврзани апликации");
}

describe("connected apps", () => {
  it("connects Polar, syncs and disconnects after confirming", async () => {
    const { user, api } = start();
    await asAthlete(user);
    await openSources(user);
    const row = (await screen.findByText("Polar", { selector: "strong" })).closest("li")!;
    expect(within(row as HTMLElement).getByText(/Не е поврзано/)).toBeInTheDocument();

    await user.click(within(row as HTMLElement).getByRole("button", { name: /Поврзи/ }));
    // Back from Polar Flow: the result and the open Sources section.
    expect(
      await screen.findByText(/Polar е поврзан\. Тренинзите од последните 30 дена/),
    ).toBeInTheDocument();
    const connected = (await screen.findByText("Polar", { selector: "strong" })).closest(
      "li",
    )! as HTMLElement;
    await waitFor(() =>
      expect(within(connected).getByText(/Поврзано · синхронизирано/)).toBeInTheDocument(),
    );

    await user.click(within(connected).getByRole("button", { name: "Синхронизирај" }));
    expect(await within(connected).findByText("Нема нови тренинзи.")).toBeInTheDocument();

    vi.spyOn(api, "syncPolar").mockRejectedValueOnce(new Error("503"));
    await user.click(await within(connected).findByRole("button", { name: "Синхронизирај" }));
    expect(await within(connected).findByRole("alert")).toHaveTextContent(
      "Polar моментално не одговара",
    );

    const disconnect = vi.spyOn(api, "disconnectPolar");
    await waitFor(() =>
      expect(within(connected).getByRole("button", { name: "Прекини" })).toBeEnabled(),
    );
    await user.click(within(connected).getByRole("button", { name: "Прекини" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Качените датотеки остануваат.");
    await user.click(within(dialog).getByRole("button", { name: "Откажи" }));
    expect(disconnect).not.toHaveBeenCalled();
    await user.click(within(connected).getByRole("button", { name: "Прекини" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Прекини" }),
    );
    expect(await screen.findByText("Врската со Polar е прекината.")).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });

  it("explains why connecting did not work and when the app is not available", async () => {
    const { user, api } = start();
    vi.spyOn(api, "connections").mockResolvedValue([
      {
        vendor: "polar",
        available: false,
        connected: false,
        status: null,
        connectedAt: null,
        lastSyncAt: null,
        lastError: null,
      },
    ]);
    await asAthlete(user);
    await openSources(user);
    const row = (await screen.findByText("Polar", { selector: "strong" })).closest(
      "li",
    )! as HTMLElement;
    expect(within(row).getByText(/Наскоро/)).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Поврзи/ })).toBeNull();
  });

  it("reports a failed start of the connection", async () => {
    const { user, api } = start();
    vi.spyOn(api, "connectPolar").mockRejectedValue(new Error("503"));
    await asAthlete(user);
    await openSources(user);
    const row = (await screen.findByText("Polar", { selector: "strong" })).closest(
      "li",
    )! as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /Поврзи/ }));
    expect(await within(row).findByRole("alert")).toHaveTextContent(
      "Поврзувањето со Polar не можеше да започне.",
    );
  });
});
