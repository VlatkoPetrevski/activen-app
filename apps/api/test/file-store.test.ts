import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertKey, LocalFileStore, MemoryFileStore } from "../src/imports/file-store.js";

const user = "0b7c2a4e-3f51-4d2b-9a8e-1c6d5e4f3a2b";
const key = `${user}/${"a".repeat(64)}.fit`;

describe("file stores", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "activen-files-"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("keeps, reads and deletes originals on disk", async () => {
    const store = new LocalFileStore(dir);
    await store.put(key, new Uint8Array([1, 2, 3]));
    expect(await readdir(join(dir, user))).toEqual([`${"a".repeat(64)}.fit`]);
    expect([...((await store.get(key)) ?? [])]).toEqual([1, 2, 3]);
    await store.delete([key, `${user}/${"b".repeat(64)}.gpx`]);
    expect(await store.get(key)).toBeNull();
  });

  it("refuses keys it did not generate (no path traversal)", async () => {
    const store = new LocalFileStore(dir);
    for (const bad of ["../etc/passwd", `${user}/../../x.fit`, "/abs.fit", `${user}/short.fit`])
      await expect(store.put(bad, new Uint8Array())).rejects.toThrow(/Invalid file key/);
    expect(() => assertKey(key)).not.toThrow();
    const memory = new MemoryFileStore();
    await expect(memory.put("../x", new Uint8Array())).rejects.toThrow();
    await memory.put(key, new Uint8Array([9]));
    expect(await memory.get(key)).toEqual(new Uint8Array([9]));
    await memory.delete([key]);
    expect(await memory.get(key)).toBeNull();
  });
});
