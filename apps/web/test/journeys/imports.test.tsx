import { bytesOf, garminTcx, intervalRunFit } from "@activen/importers/testing";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { batches } from "../../src/training/ImportFiles.js";
import { asAthlete, nav, start } from "../support/app.js";

/** Importing activity files in the demo: the same parsers and duplicate rules as the server. */
beforeEach(() => {
  window.location.hash = "";
});

const file = (name: string, bytes: Uint8Array) =>
  new File([bytes as Uint8Array<ArrayBuffer>], name);

async function openActivities(user: Parameters<typeof nav>[0]) {
  await nav(user, "Активности");
  // Import is an option: the drop zone and the file picker open with "Увези".
  await user.click(await screen.findByRole("button", { name: "Увези" }));
  return screen.findByRole("button", { name: /Избери датотеки \(FIT, GPX, TCX\)/ });
}

describe("importing activity files", () => {
  it("imports a watch file, then refuses the same file and a broken one", async () => {
    const { user } = start();
    await asAthlete(user);
    await openActivities(user);
    const input = screen.getByTestId("import-input");

    await user.upload(input, file("интервали.fit", intervalRunFit({ strap: true })));
    const report = await screen.findByRole("status", { name: /Увоз/ });
    expect(within(report).getByText("1 увезена")).toBeInTheDocument();
    expect(within(report).getByText("интервали.fit")).toBeInTheDocument();
    expect(within(report).getByText(/^Увезено · Трчање · /)).toBeInTheDocument();

    await user.upload(input, [
      file("копија.fit", intervalRunFit({ strap: true })),
      file("белешки.gpx", bytesOf("hello")),
    ]);
    const second = await screen.findByRole("status", { name: /1 веќе постоеше · 1 неуспешна/ });
    expect(
      within(second).getByText("Оваа активност веќе е увезена и не се зачувува двапати."),
    ).toBeInTheDocument();
    expect(within(second).getByText("Не е FIT, GPX или TCX датотека.")).toBeInTheDocument();

    // The activity opens with the file's laps and device.
    await user.click(within(second).getByRole("link", { name: "Детали" }));
    await user.click(await screen.findByRole("tab", { name: "Детали" }));
    expect(await screen.findByText("Forerunner 965")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Интервали/ }));
    expect(screen.getAllByText("Загревање").length).toBeGreaterThan(0);
  });

  it("imports files dropped on the page and closes the report", async () => {
    const { user } = start();
    await asAthlete(user);
    await openActivities(user);
    const page = screen
      .getByRole("heading", { level: 1, name: "Активности" })
      .closest(".drop-area")!;
    const files = [file("trening.tcx", bytesOf(garminTcx()))];
    const dataTransfer = { files, types: ["Files"] };
    fireEvent.dragEnter(page, { dataTransfer });
    expect(await screen.findByText("Пушти ги датотеките за да ги увезеш")).toBeInTheDocument();
    fireEvent.drop(page, { dataTransfer });
    const report = await screen.findByRole("status", { name: /1 увезена/ });
    expect(screen.queryByText("Пушти ги датотеките за да ги увезеш")).toBeNull();
    await user.click(within(report).getByRole("button", { name: "Затвори го извештајот за увоз" }));
    expect(screen.queryByRole("status", { name: /Увоз/ })).toBeNull();
  });

  it("explains a failed upload", async () => {
    const { user, api } = start();
    vi.spyOn(api, "importActivities").mockRejectedValue(new Error("offline"));
    await asAthlete(user);
    await openActivities(user);
    await user.upload(screen.getByTestId("import-input"), file("run.fit", intervalRunFit()));
    expect(await screen.findByRole("alert")).toHaveTextContent("Увозот не успеа");
  });

  it("shows imported files and the source priority in Profile › Sources", async () => {
    const { user } = start();
    await asAthlete(user);
    await nav(user, /^Профил \S+$/);
    const sources = await screen.findByRole("button", { name: /^Извори на податоци/ });
    await user.click(sources);
    expect(await screen.findByText("Уште нема увезени датотеки")).toBeInTheDocument();
    const inputs = screen.getAllByTestId("import-input");
    await user.upload(inputs[inputs.length - 1]!, file("run.fit", intervalRunFit()));
    expect(
      await screen.findByText(/^1 увезена датотека · последно (денес|вчера|\d)/),
    ).toBeInTheDocument();
    expect(screen.getByText("Приоритет")).toBeInTheDocument();
    expect(screen.getByText("FIT / GPX / TCX")).toBeInTheDocument();
  });
});

describe("batches", () => {
  it("splits uploads into server-sized batches", () => {
    expect(batches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches([], 2)).toEqual([]);
    expect(batches(Array.from({ length: 41 }, (_, i) => i)).map((b) => b.length)).toEqual([
      20, 20, 1,
    ]);
  });
});
