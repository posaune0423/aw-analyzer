/**
 * JSON file based state store for persistence across tick executions
 */

import { err, ok, type Result } from "neverthrow";

export type StateError = { type: "read_error" | "write_error"; message: string };
type StateData = Record<string, unknown>;

export type StateStore = {
  get<T>(key: string): Promise<Result<T | undefined, StateError>>;
  set<T>(key: string, value: T): Promise<Result<void, StateError>>;
  getTime(key: string): Promise<Result<number | undefined, StateError>>;
  setTime(key: string, epochMs: number): Promise<Result<void, StateError>>;
  clear(): Promise<Result<void, StateError>>;
};

async function readFile(filePath: string): Promise<Result<StateData, StateError>> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return ok({});

    const text = await file.text();
    if (!text.trim()) return ok({});

    return ok(JSON.parse(text) as StateData);
  } catch {
    return ok({}); // fallback to empty on read error
  }
}

async function writeFile(filePath: string, data: StateData): Promise<Result<void, StateError>> {
  try {
    const tempPath = `${filePath}.tmp`;
    await Bun.write(tempPath, JSON.stringify(data, null, 2));
    const fs = await import("node:fs/promises");
    await fs.rename(tempPath, filePath);
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown write error";
    return err({ type: "write_error", message });
  }
}

export function createStateStore(filePath: string): StateStore {
  let cache: StateData | null = null;

  const load = async (): Promise<StateData> => {
    if (cache !== null) return cache;
    const result = await readFile(filePath);
    cache = result.isOk() ? result.value : {};
    return cache;
  };

  const save = async (): Promise<Result<void, StateError>> => {
    if (cache === null) return ok(undefined);
    return writeFile(filePath, cache);
  };

  return {
    async get<T>(key: string) {
      const data = await load();
      return ok(data[key] as T | undefined);
    },

    async set<T>(key: string, value: T) {
      const data = await load();
      data[key] = value;
      cache = data;
      return save();
    },

    async getTime(key: string) {
      const data = await load();
      const value = data[key];
      return ok(typeof value === "number" ? value : undefined);
    },

    async setTime(key: string, epochMs: number) {
      const data = await load();
      data[key] = epochMs;
      cache = data;
      return save();
    },

    async clear() {
      cache = {};
      return save();
    },
  };
}

// In-memory state store for testing
export function createInMemoryStateStore(): StateStore & { getState: () => Map<string, unknown> } {
  const store = new Map<string, unknown>();

  return {
    getState: () => store,
    async get<T>(key: string) {
      return ok(store.get(key) as T | undefined);
    },
    async set<T>(key: string, value: T) {
      store.set(key, value);
      return ok(undefined);
    },
    async getTime(key: string) {
      const value = store.get(key);
      return ok(typeof value === "number" ? value : undefined);
    },
    async setTime(key: string, epochMs: number) {
      store.set(key, epochMs);
      return ok(undefined);
    },
    async clear() {
      store.clear();
      return ok(undefined);
    },
  };
}
