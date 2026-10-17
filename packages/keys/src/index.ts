import { inspect } from "node:util";

const REDACTED = "[redacted key]";

/**
 * A key in memory. Serialising or printing it gives a marker, never the key,
 * so a key handed to a logger, a manifest or an error message stays out of
 * them. Only `reveal` returns the bytes, for the request header that needs them.
 */
export class Secret {
  readonly #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}

/** Where keys live, by name (a source ID). There is no way to list them or read one back over the API. */
export interface KeyStore {
  get(name: string): Promise<Secret | null>;
  has(name: string): Promise<boolean>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

const SERVICE = "reasontrace";

/**
 * The OS keychain: Keychain on macOS, Credential Manager on Windows, the
 * Secret Service on Linux. The native binding loads on first use, so code that
 * never touches the keychain (tests, a machine without one) doesn't load it.
 */
export function keychainStore(service = SERVICE): KeyStore {
  const entry = async (name: string) => {
    const { AsyncEntry } = await import("@napi-rs/keyring");
    return new AsyncEntry(service, name);
  };
  return {
    async get(name) {
      const value = await (await entry(name)).getPassword();
      return value ? new Secret(value) : null;
    },
    async has(name) {
      return Boolean(await (await entry(name)).getPassword());
    },
    async set(name, value) {
      await (await entry(name)).setPassword(value);
    },
    async delete(name) {
      await (await entry(name)).deletePassword();
    },
  };
}

/** Keys held in memory for the life of the process, for tests. */
export function memoryStore(initial: Record<string, string> = {}): KeyStore {
  const keys = new Map(Object.entries(initial));
  return {
    async get(name) {
      const value = keys.get(name);
      return value ? new Secret(value) : null;
    },
    async has(name) {
      return keys.has(name);
    },
    async set(name, value) {
      keys.set(name, value);
    },
    async delete(name) {
      keys.delete(name);
    },
  };
}

/**
 * `text` with every occurrence of the key replaced by the marker. Use it on
 * provider error messages before recording them: some echo the key they were sent.
 */
export function redact(text: string, secret: Secret | null): string {
  const value = secret?.reveal();
  return value ? text.split(value).join(REDACTED) : text;
}
