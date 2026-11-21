import type { IdentityDto, SignInResponse } from "@activen/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiError } from "../src/api/api.js";
import { DemoApi } from "../src/api/demo.js";
import { App } from "../src/app/App.js";

/** The demo data behind the real (email) sign-in flow. */
class EmailFlowApi extends DemoApi {
  sent: string[] = [];
  override providers = async () => ({ google: false, apple: false, email: true });
  override startEmailSignIn = async (email: string) => {
    this.sent.push(email);
  };
  override verifyEmailLink = async (token: string): Promise<IdentityDto[]> => {
    if (token !== "link-token") throw new ApiError(401, "invalid", "invalid");
    return [];
  };
  override verifyEmailSignIn = async (token: string): Promise<SignInResponse> => {
    if (token !== "good-token") throw new ApiError(401, "invalid", "invalid");
    await this.signInDemo("athlete");
    const me = await this.me();
    return {
      tokenType: "Bearer",
      accessToken: "x",
      expiresIn: 900,
      refreshExpiresAt: "",
      user: me.user,
      created: true,
    };
  };
}

function start(path: string) {
  window.history.pushState(null, "", path);
  localStorage.setItem("activen.locale", "mk");
  const api = new EmailFlowApi(() => "mk");
  render(<App api={api} routing="browser" />);
  return { api, user: userEvent.setup() };
}

describe("email sign-in", () => {
  it("requests a link without revealing whether the account exists", async () => {
    const { api, user } = start("/plan");
    await user.type(await screen.findByLabelText("Е-пошта"), "vlatko@example.com");
    await user.click(screen.getByRole("button", { name: "Прати ми линк за најава" }));
    expect(await screen.findByText(/Провери ја поштата/)).toBeInTheDocument();
    expect(api.sent).toEqual(["vlatko@example.com"]);
  });

  it("follows the link, removes the token from the URL and runs onboarding", async () => {
    const { user } = start("/auth/email#token=good-token");
    expect(
      await screen.findByRole("heading", { name: "Добредојде во ActiveN" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    const name = screen.getByLabelText("Како да те викаме?");
    await user.clear(name);
    await user.type(name, "Влатко");
    await user.click(screen.getByLabelText("Тренирам и спортисти (тренер)"));
    await user.click(screen.getByRole("button", { name: "Почни" }));
    expect(await screen.findByRole("heading", { name: "Спортисти" })).toBeInTheDocument();
  });

  it("explains an expired link", async () => {
    start("/auth/email#token=old-token");
    expect(await screen.findByText("Линкот повеќе не важи. Побарај нов.")).toBeInTheDocument();
  });

  it("shows progress for a signed-in athlete", async () => {
    const { user } = start("/auth/email#token=good-token");
    await user.click(await screen.findByRole("button", { name: "Почни" }));
    await user.click((await screen.findAllByRole("link", { name: "Напредок" }))[0]!);
    expect(
      await screen.findByRole("button", { name: /^Неделно растојание \(km\)/ }),
    ).toBeInTheDocument();
    window.history.pushState(null, "", "/does-not-exist");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
  });

  it("answers a link without a token", async () => {
    start("/auth/email");
    expect(await screen.findByRole("alert")).toHaveTextContent("Линкот повеќе не важи");
    expect(screen.getByRole("link", { name: "Најави се во ActiveN" })).toBeInTheDocument();
  });
});

/** The add-email link is opened by a signed-in user. */
async function startSignedIn(path: string) {
  window.history.pushState(null, "", path);
  localStorage.setItem("activen.locale", "mk");
  const api = new EmailFlowApi(() => "mk");
  await api.signInDemo("athlete");
  render(<App api={api} routing="browser" />);
}

describe("adding an email address to an account", () => {
  it("confirms a valid link and removes the token from the URL", async () => {
    await startSignedIn("/auth/link-email#token=link-token");
    expect(await screen.findByText("Е-поштата е додадена на твојата сметка.")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(screen.getByRole("link", { name: "Профил" })).toBeInTheDocument();
  });

  it("explains invalid and missing links", async () => {
    await startSignedIn("/auth/link-email#token=other-token");
    expect(await screen.findByText("Линкот повеќе не важи. Побарај нов.")).toBeInTheDocument();
  });

  it("explains a link without a token", async () => {
    await startSignedIn("/auth/link-email");
    expect(await screen.findByText("Линкот повеќе не важи. Побарај нов.")).toBeInTheDocument();
  });
});
