import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newNonce, renderGoogleButton, signInWithApple } from "../src/auth/social.js";

/** Provider SDKs are loaded on demand; here the "script" loads instantly and installs a fake. */
const w = window as unknown as Record<string, unknown>;
let loads: string[] = [];
let fail = false;

beforeEach(() => {
  loads = [];
  fail = false;
  vi.spyOn(document.head, "appendChild").mockImplementation(<T extends Node>(node: T) => {
    const script = node as unknown as HTMLScriptElement;
    loads.push(script.src);
    setTimeout(() =>
      fail ? script.onerror?.(new Event("error")) : script.onload?.(new Event("load")),
    );
    return node;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  delete w.google;
  delete w.AppleID;
});

describe("social sign-in", () => {
  it("makes 128-bit random hex nonces", () => {
    const a = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(a);
  });

  it("renders Google's button bound to a fresh nonce and loads the script once", async () => {
    let options: {
      nonce: string;
      client_id: string;
      callback(r: { credential: string }): void;
    } | null = null;
    const renderButton = vi.fn();
    w.google = {
      accounts: { id: { initialize: (o: typeof options) => (options = o), renderButton } },
    };
    const onToken = vi.fn();
    const el = document.createElement("div");
    await renderGoogleButton(el, "client-1", "mk", onToken);
    await renderGoogleButton(el, "client-1", "mk", onToken);
    expect(loads).toEqual(["https://accounts.google.com/gsi/client"]);
    expect(options!.client_id).toBe("client-1");
    expect(renderButton).toHaveBeenCalledWith(
      el,
      expect.objectContaining({ locale: "mk", width: 320 }),
    );
    options!.callback({ credential: "id-token" });
    expect(onToken).toHaveBeenCalledWith("id-token", options!.nonce);
  });

  it("returns Apple's token with the nonce and the name given on first sign-in", async () => {
    let init: { nonce: string; redirectURI: string; usePopup: boolean } | null = null;
    const signIn = vi
      .fn()
      .mockResolvedValueOnce({
        authorization: { id_token: "apple-token" },
        user: { name: { firstName: "Vlatko", lastName: "P." } },
      })
      .mockResolvedValueOnce({ authorization: { id_token: "again" } });
    w.AppleID = { auth: { init: (o: typeof init) => (init = o), signIn } };
    const first = await signInWithApple("app.activen.web");
    expect(first).toEqual({ idToken: "apple-token", nonce: init!.nonce, name: "Vlatko P." });
    expect(init).toMatchObject({
      usePopup: true,
      redirectURI: `${window.location.origin}/sign-in`,
    });
    // Apple sends the name only the first time.
    expect(await signInWithApple("app.activen.web")).not.toHaveProperty("name");
  });

  it("reports a script that cannot load", async () => {
    fail = true;
    vi.resetModules();
    const fresh = await import("../src/auth/social.js");
    await expect(fresh.signInWithApple("x")).rejects.toThrow(/Failed to load/);
  });
});
