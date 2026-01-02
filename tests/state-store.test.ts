/**
 * State store tests
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";

import { createStateStore } from "../src/utils/state-store.ts";

const TEST_FILE = "/tmp/aw-analyzer-test-state.json";

beforeEach(() => {
  if (existsSync(TEST_FILE)) rmSync(TEST_FILE);
});

afterEach(() => {
  if (existsSync(TEST_FILE)) rmSync(TEST_FILE);
});

describe("createStateStore", () => {
  test("returns empty for non-existent file", async () => {
    const store = createStateStore(TEST_FILE);
    const result = await store.get<string>("key");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBeUndefined();
  });

  test("persists and retrieves values", async () => {
    const store = createStateStore(TEST_FILE);
    await store.set("key", "value");
    const result = await store.get<string>("key");
    expect(result.isOk() && result.value).toBe("value");
  });

  test("persists across instances", async () => {
    const store1 = createStateStore(TEST_FILE);
    await store1.set("key", { data: "test" });

    const store2 = createStateStore(TEST_FILE);
    const result = await store2.get<{ data: string }>("key");
    expect(result.isOk() && result.value?.data).toBe("test");
  });

  test("setTime and getTime work", async () => {
    const store = createStateStore(TEST_FILE);
    const now = Date.now();
    await store.setTime("ts", now);
    const result = await store.getTime("ts");
    expect(result.isOk() && result.value).toBe(now);
  });

  test("clear removes all state", async () => {
    const store = createStateStore(TEST_FILE);
    await store.set("key1", "v1");
    await store.set("key2", "v2");
    await store.clear();

    const r1 = await store.get<string>("key1");
    const r2 = await store.get<string>("key2");
    expect(r1.isOk() && r1.value).toBeUndefined();
    expect(r2.isOk() && r2.value).toBeUndefined();
  });
});
