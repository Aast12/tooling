// Vitest alias target for `cloudflare:workers`. Tests swap in a real Env via
// __setEnvForTesting before invoking handlers.

let current: Record<string, unknown> = {};

export const env = new Proxy({} as Record<string, unknown>, {
  get(_target, prop: string) {
    return current[prop];
  },
  has(_target, prop: string) {
    return prop in current;
  },
  ownKeys() {
    return Reflect.ownKeys(current);
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    return Object.getOwnPropertyDescriptor(current, prop);
  },
});

export function __setEnvForTesting(next: Record<string, unknown>): void {
  current = next;
}

export function __resetEnvForTesting(): void {
  current = {};
}
