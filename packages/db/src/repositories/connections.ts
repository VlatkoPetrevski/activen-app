import type { Vendor } from "@activen/domain";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { dailyWellness, sourceActivities, vendorConnections } from "../schema.js";

export type ConnectionStatus = "active" | "revoked" | "error";

export interface VendorConnection {
  id: string;
  userId: string;
  vendor: Vendor;
  /** The user's id at the vendor (Polar `x_user_id`). */
  externalUserId: string;
  status: ConnectionStatus;
  /** Encrypted by the API (AES-256-GCM); never stored or logged in clear text. */
  accessTokenEnc: Uint8Array | null;
  tokenExpiresAt: Date | null;
  connectedAt: Date;
  lastSyncAt: Date | null;
  lastError: string | null;
}

export interface ConnectionInput {
  userId: string;
  vendor: Vendor;
  externalUserId: string;
  accessTokenEnc: Uint8Array;
  tokenExpiresAt: Date | null;
  scopes?: string[];
}

type Row = typeof vendorConnections.$inferSelect;

const toConnection = (r: Row): VendorConnection => ({
  id: r.id,
  userId: r.userId,
  vendor: r.vendor,
  externalUserId: r.externalUserId,
  status: r.status,
  accessTokenEnc: r.accessTokenEnc ? new Uint8Array(r.accessTokenEnc) : null,
  tokenExpiresAt: r.tokenExpiresAt,
  connectedAt: r.connectedAt,
  lastSyncAt: r.lastSyncAt,
  lastError: r.lastError,
});

/** Connections to vendor accounts (Polar, Garmin…): one per user and vendor. */
export class ConnectionsRepository {
  constructor(private readonly db: Db) {}

  /** Connects or reconnects; a vendor account can belong to one ActiveN user only. */
  async upsert(input: ConnectionInput): Promise<VendorConnection> {
    const values = {
      userId: input.userId,
      vendor: input.vendor,
      externalUserId: input.externalUserId,
      accessTokenEnc: Buffer.from(input.accessTokenEnc),
      tokenExpiresAt: input.tokenExpiresAt,
      scopes: input.scopes ?? [],
      status: "active" as const,
      lastError: null,
    };
    const [row] = await this.db
      .insert(vendorConnections)
      .values(values)
      .onConflictDoUpdate({
        target: [vendorConnections.userId, vendorConnections.vendor],
        set: { ...values, connectedAt: sql`now()` },
      })
      .returning();
    if (!row) throw new Error("upsert vendor_connections returned no row");
    return toConnection(row);
  }

  async get(userId: string, vendor: Vendor): Promise<VendorConnection | null> {
    const [row] = await this.db
      .select()
      .from(vendorConnections)
      .where(and(eq(vendorConnections.userId, userId), eq(vendorConnections.vendor, vendor)));
    return row ? toConnection(row) : null;
  }

  /** The connection a webhook refers to (the vendor names its own user id). */
  async byExternalUser(vendor: Vendor, externalUserId: string): Promise<VendorConnection | null> {
    const [row] = await this.db
      .select()
      .from(vendorConnections)
      .where(
        and(
          eq(vendorConnections.vendor, vendor),
          eq(vendorConnections.externalUserId, externalUserId),
        ),
      );
    return row ? toConnection(row) : null;
  }

  async list(userId: string): Promise<VendorConnection[]> {
    const rows = await this.db
      .select()
      .from(vendorConnections)
      .where(eq(vendorConnections.userId, userId))
      .orderBy(asc(vendorConnections.connectedAt));
    return rows.map(toConnection);
  }

  /** After a sync: when it ran and its error (null clears a previous one). */
  async markSynced(id: string, error: string | null = null): Promise<void> {
    await this.db
      .update(vendorConnections)
      .set({
        lastSyncAt: sql`now()`,
        lastError: error?.slice(0, 500) ?? null,
        status: error ? "error" : "active",
      })
      .where(eq(vendorConnections.id, id));
  }

  /**
   * Disconnects and removes everything that came through the connection (ADR-0002 §3): the
   * vendor's activities and their details. Files the athlete uploaded stay.
   */
  async remove(userId: string, vendor: Vendor): Promise<number> {
    return this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(sourceActivities)
        .where(and(eq(sourceActivities.userId, userId), eq(sourceActivities.vendor, vendor)))
        .returning({ id: sourceActivities.id });
      await tx
        .delete(dailyWellness)
        .where(and(eq(dailyWellness.userId, userId), eq(dailyWellness.source, vendor)));
      await tx
        .delete(vendorConnections)
        .where(and(eq(vendorConnections.userId, userId), eq(vendorConnections.vendor, vendor)));
      return deleted.length;
    });
  }
}
