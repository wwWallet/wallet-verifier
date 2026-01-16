export class KeyValueStore<T> {
  static store: Record<string, unknown> = {};

  constructor() {}

  set(key: string, value: T): void {
    KeyValueStore.store[key] = value;
  }

  get(key: string): T | undefined {
    if (key in KeyValueStore.store) {
      return KeyValueStore.store[key] as T;
    }
    return undefined;
  }

  has(key: string): boolean {
    return key in KeyValueStore.store;
  }

  delete(key: string): boolean {
    return delete KeyValueStore.store[key];
  }
}
