import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asAthlete, start } from "../support/app.js";

/** Sharing an activity as an image. */
beforeEach(() => {
  window.location.hash = "";
});

describe("share an activity (demo)", () => {
  it("opens the studio, switches template, format and numbers, and adds a photo", async () => {
    const { user } = start();
    await asAthlete(user);
    await user.click(screen.getAllByRole("link", { name: "Активности" })[0]!);
    const runs = await screen.findAllByRole("button", { name: /Скопје — трчање/ });
    await user.click(runs[0]!);
    await user.click(screen.getAllByRole("link", { name: "Детали" })[0]!);
    await user.click(await screen.findByRole("link", { name: "Сподели" }));
    expect(await screen.findByRole("heading", { name: "Сподели" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Преглед на сликата за споделување" }),
    ).toBeInTheDocument();
    // An outdoor run starts on its route; the figure is one tap away.
    expect(screen.getByRole("button", { name: "Рута" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Фигура" }));
    expect(screen.getByRole("button", { name: "Фигура" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Квадрат 1:1" }));
    expect(screen.getByRole("button", { name: "Квадрат 1:1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Up to four numbers: a fifth cannot be added until one is removed.
    const numbers = within(screen.getByRole("group", { name: "Податоци" }));
    expect(screen.getByText("4/4")).toBeInTheDocument();
    const off = numbers
      .getAllByRole("button")
      .find((b) => b.getAttribute("aria-pressed") === "false")!;
    expect(off).toBeDisabled();
    await user.click(numbers.getByRole("button", { name: "Искачување" }));
    expect(screen.getByText("3/4")).toBeInTheDocument();
    expect(off).toBeEnabled();
    // Photo background: asks for a photo first; the photo never leaves the device.
    await user.click(screen.getByRole("button", { name: "Фотографија" }));
    expect(screen.getByText(/не се праќа никаде/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Преземи слика/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Скриј почеток и крај/ })).toBeChecked();
  });
});

type Nav = Omit<Navigator, "canShare" | "share"> & {
  canShare?: ((data: { files: File[] }) => boolean) | undefined;
  share?: ((data: unknown) => Promise<void>) | undefined;
};

async function openStudio(user: Parameters<typeof asAthlete>[0]) {
  await asAthlete(user);
  await user.click(screen.getAllByRole("link", { name: "Активности" })[0]!);
  const runs = await screen.findAllByRole("button", { name: /Скопје — трчање/ });
  await user.click(runs[0]!);
  await user.click(screen.getAllByRole("link", { name: "Детали" })[0]!);
  await user.click(await screen.findByRole("link", { name: "Сподели" }));
  await screen.findByRole("img", { name: "Преглед на сликата за споделување" });
}

describe("share actions", () => {
  const nav = navigator as unknown as Nav;
  const original = { canShare: nav.canShare, share: nav.share };
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  let clicked: HTMLAnchorElement[] = [];

  beforeEach(() => {
    clicked = [];
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(new Blob(["png"], { type: "image/png" }));
    };
    URL.createObjectURL = vi.fn(() => "blob:card");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.toBlob = toBlob;
    nav.canShare = original.canShare;
    nav.share = original.share;
    vi.restoreAllMocks();
  });

  it("downloads a PNG named after the activity when sharing files is unsupported", async () => {
    nav.canShare = undefined as never;
    const { user } = start();
    await openStudio(user);
    expect(screen.queryByRole("button", { name: "Сподели" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /Преземи слика/ }));
    expect(await screen.findByText("Сликата е преземена.")).toBeInTheDocument();
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toMatch(/^activen-.*\.png$/);
  });

  it("shares through the system sheet, ignores a closed sheet, and falls back on failure", async () => {
    const share = vi.fn<(data: unknown) => Promise<void>>(async () => undefined);
    nav.canShare = () => true;
    nav.share = share;
    const { user } = start();
    await openStudio(user);
    await user.click(screen.getByRole("button", { name: "Сподели" }));
    expect(await screen.findByText("Споделено.")).toBeInTheDocument();
    expect((share.mock.calls[0]![0] as { files: File[] }).files[0]!.type).toBe("image/png");

    share.mockRejectedValueOnce(new DOMException("closed", "AbortError"));
    await user.click(screen.getByRole("button", { name: "Сподели" }));
    await waitFor(() => expect(screen.queryByText("Споделено.")).toBeNull());
    expect(clicked).toHaveLength(0);

    share.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    await user.click(screen.getByRole("button", { name: "Сподели" }));
    expect(await screen.findByText("Сликата е преземена.")).toBeInTheDocument();
    expect(clicked).toHaveLength(1);
  });

  it("reports when the browser cannot make the image", async () => {
    nav.canShare = undefined as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(null);
    };
    const { user } = start();
    await openStudio(user);
    await user.click(screen.getByRole("button", { name: /Преземи слика/ }));
    expect(
      await screen.findByText("Сликата не може да се направи во овој прелистувач."),
    ).toBeInTheDocument();
  });

  it("uses an uploaded photo as the background and rejects broken files", async () => {
    let behaviour: "load" | "error" = "load";
    const RealImage = window.Image;
    class FakeImage {
      naturalWidth = 1200;
      naturalHeight = 1600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        setTimeout(() => (behaviour === "load" ? this.onload?.() : this.onerror?.()));
      }
    }
    window.Image = FakeImage as unknown as typeof Image;
    try {
      const { user } = start();
      await openStudio(user);
      await user.click(screen.getByRole("button", { name: "Фотографија" }));
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      behaviour = "error";
      await user.upload(input, new File(["x"], "broken.heic", { type: "image/heic" }));
      expect(
        await screen.findByText("Фотографијата не може да се отвори. Пробај JPG или PNG."),
      ).toBeInTheDocument();
      behaviour = "load";
      await user.upload(input, new File(["x"], "run.jpg", { type: "image/jpeg" }));
      expect(await screen.findByText("Друга фотографија")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Преземи слика/ })).toBeEnabled();
      expect(screen.queryByText(/Фотографијата не може/)).toBeNull();
    } finally {
      window.Image = RealImage;
    }
  });
});
