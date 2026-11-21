/**
 * Polar AccessLink v3 (https://www.polar.com/accesslink-api/), the calls ActiveN needs:
 * OAuth2 code exchange, user registration, exercises without transactions and their FIT files.
 * Access tokens do not expire unless revoked; exercises are available for 30 days after upload.
 */
export interface PolarExercise {
  id: string;
  upload_time?: string;
  start_time?: string;
  sport?: string;
}

export class PolarError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PolarError";
  }
}

export const POLAR_AUTHORIZE_URL = "https://flow.polar.com/oauth2/authorization";
export const POLAR_TOKEN_URL = "https://polarremote.com/v2/oauth2/token";
export const POLAR_API = "https://www.polaraccesslink.com";

export class PolarClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  authorizeUrl(state: string, redirectUri: string): string {
    const url = new URL(POLAR_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "accesslink.read_all");
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; polarUserId: string; expiresIn: number | null }> {
    const res = await this.fetchFn(POLAR_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json;charset=UTF-8",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) throw new PolarError(res.status, `Token exchange failed (${res.status})`);
    const body = (await res.json()) as {
      access_token?: string;
      x_user_id?: number | string;
      expires_in?: number;
    };
    if (!body.access_token || body.x_user_id === undefined)
      throw new PolarError(502, "Token response without access_token or x_user_id");
    return {
      accessToken: body.access_token,
      polarUserId: String(body.x_user_id),
      expiresIn: typeof body.expires_in === "number" ? body.expires_in : null,
    };
  }

  /** Registers the user with our client; 409 (already registered) is fine. */
  async registerUser(token: string, memberId: string): Promise<void> {
    const res = await this.call(token, "POST", "/v3/users", { "member-id": memberId });
    if (!res.ok && res.status !== 409)
      throw new PolarError(
        res.status,
        res.status === 403
          ? "Mandatory consents missing in Polar Flow"
          : `Register failed (${res.status})`,
      );
  }

  /** Revokes our access (the athlete disconnected); 404 means it was already gone. */
  async deleteUser(token: string, polarUserId: string): Promise<void> {
    const res = await this.call(token, "DELETE", `/v3/users/${encodeURIComponent(polarUserId)}`);
    if (!res.ok && res.status !== 404)
      throw new PolarError(res.status, `Delete failed (${res.status})`);
  }

  async listExercises(token: string): Promise<PolarExercise[]> {
    const res = await this.call(token, "GET", "/v3/exercises");
    if (res.status === 204) return [];
    if (!res.ok) throw new PolarError(res.status, `List exercises failed (${res.status})`);
    const body = (await res.json()) as PolarExercise[] | null;
    return Array.isArray(body) ? body.filter((e) => typeof e.id === "string") : [];
  }

  async exerciseFit(token: string, exerciseId: string): Promise<Uint8Array> {
    const res = await this.call(
      token,
      "GET",
      `/v3/exercises/${encodeURIComponent(exerciseId)}/fit`,
      undefined,
      "*/*",
    );
    if (!res.ok) throw new PolarError(res.status, `FIT download failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  private call(
    token: string,
    method: string,
    path: string,
    body?: unknown,
    accept = "application/json",
  ) {
    return this.fetchFn(`${POLAR_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
}
