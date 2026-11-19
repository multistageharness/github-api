/**
 * Minimal ambient declarations for OPTIONAL dependencies.
 *
 * These packages live in `optionalDependencies` and may be absent at build or
 * runtime. The package MUST type-check and build even when they are not
 * installed, so we model only the tiny surface touched through dynamic
 * `import()` boundaries. Each is intentionally loose — the real value is
 * resolved at runtime via `import('<name>').catch(() => null)`.
 */

declare module 'redis' {
  export interface RedisClientType {
    connect(): Promise<unknown>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, options?: unknown): Promise<unknown>;
    del(key: string): Promise<unknown>;
    quit(): Promise<unknown>;
    [key: string]: unknown;
  }
  export function createClient(options?: unknown): RedisClientType;
  const _default: { createClient: typeof createClient };
  export default _default;
}

declare module 'ioredis' {
  export default class Redis {
    constructor(options?: unknown);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
    del(key: string): Promise<unknown>;
    quit(): Promise<unknown>;
    [key: string]: unknown;
  }
}

declare module 'prom-client' {
  export class Registry {
    metrics(): Promise<string>;
    contentType: string;
    [key: string]: unknown;
  }
  export class Counter {
    constructor(config: unknown);
    inc(value?: number): void;
    [key: string]: unknown;
  }
  export class Gauge {
    constructor(config: unknown);
    set(value: number): void;
    [key: string]: unknown;
  }
  export const register: Registry;
  const _default: {
    Registry: typeof Registry;
    Counter: typeof Counter;
    Gauge: typeof Gauge;
    register: Registry;
  };
  export default _default;
}

declare module '@opentelemetry/api' {
  export const trace: { [key: string]: unknown };
  const _default: { trace: typeof trace };
  export default _default;
}

declare module '@opentelemetry/sdk-node' {
  export class NodeSDK {
    constructor(config?: unknown);
    start(): void;
    shutdown(): Promise<void>;
    [key: string]: unknown;
  }
  const _default: { NodeSDK: typeof NodeSDK };
  export default _default;
}
