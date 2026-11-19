/**
 * Minimal ambient declaration for `js-yaml`.
 *
 * `js-yaml` v4 ships no bundled type declarations and `@types/js-yaml` is not a
 * dependency of this package, so we declare only the narrow surface the
 * formatter uses (`dump`, plus `load` for symmetry). This keeps strict mode
 * happy without pulling `any` across the whole import.
 */
declare module 'js-yaml' {
  export function dump(obj: unknown, options?: Record<string, unknown>): string;
  export function load(input: string, options?: Record<string, unknown>): unknown;

  const yaml: {
    dump(obj: unknown, options?: Record<string, unknown>): string;
    load(input: string, options?: Record<string, unknown>): unknown;
  };
  export default yaml;
}
