/**
 * Google Identity Services and Sign in with Apple JS: load the provider script on demand and
 * obtain an ID token bound to a fresh nonce (the API verifies signature, audience and nonce).
 */

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  let p = loaded.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
    loaded.set(src, p);
  }
  return p;
}

interface GoogleId {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        nonce: string;
        callback(response: { credential: string }): void;
        ux_mode?: "popup";
        use_fedcm_for_prompt?: boolean;
      }): void;
      renderButton(el: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

/** Renders Google's own button (required by Google's branding rules) into `el`. */
export async function renderGoogleButton(
  el: HTMLElement,
  clientId: string,
  locale: string,
  onToken: (idToken: string, nonce: string) => void,
): Promise<void> {
  await loadScript("https://accounts.google.com/gsi/client");
  const google = (window as unknown as { google: GoogleId }).google;
  const nonce = newNonce();
  google.accounts.id.initialize({
    client_id: clientId,
    nonce,
    ux_mode: "popup",
    use_fedcm_for_prompt: true,
    callback: (r) => onToken(r.credential, nonce),
  });
  google.accounts.id.renderButton(el, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "pill",
    width: el.clientWidth || 320,
    locale,
    text: "continue_with",
  });
}

interface AppleId {
  auth: {
    init(options: {
      clientId: string;
      scope: string;
      redirectURI: string;
      nonce: string;
      usePopup: boolean;
    }): void;
    signIn(): Promise<{
      authorization: { id_token: string };
      user?: { name?: { firstName?: string; lastName?: string } };
    }>;
  };
}

/** Opens the Apple popup; resolves with the identity token, nonce and (first time only) the name. */
export async function signInWithApple(
  clientId: string,
): Promise<{ idToken: string; nonce: string; name?: string }> {
  await loadScript(
    "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
  );
  const AppleID = (window as unknown as { AppleID: AppleId }).AppleID;
  const nonce = newNonce();
  AppleID.auth.init({
    clientId,
    scope: "name email",
    redirectURI: window.location.origin + "/sign-in",
    nonce,
    usePopup: true,
  });
  const res = await AppleID.auth.signIn();
  const n = res.user?.name;
  const name = [n?.firstName, n?.lastName].filter(Boolean).join(" ") || undefined;
  return { idToken: res.authorization.id_token, nonce, ...(name ? { name } : {}) };
}
