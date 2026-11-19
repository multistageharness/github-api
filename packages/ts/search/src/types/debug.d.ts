/**
 * Minimal ambient declaration for `debug`.
 *
 * `debug` ships no bundled type declarations and `@types/debug` is not installed
 * in this workspace. We declare only the narrow surface used here: the factory
 * returns a logger function that accepts a format string plus varargs. This
 * keeps strict mode happy without pulling `any` across the import.
 */
declare module 'debug' {
  interface Debugger {
    (formatter: unknown, ...args: unknown[]): void;
    enabled: boolean;
    namespace: string;
  }

  function debug(namespace: string): Debugger;

  export default debug;
}
