/**
 * Minimal ambient declaration for `inquirer`.
 *
 * inquirer v9 ships no bundled type declarations and `@types/inquirer` is not
 * installed in this workspace, so we declare just the narrow surface the CLI
 * uses (`prompt`, plus the `confirm` named export referenced by the delete
 * command). This keeps strict mode happy without pulling `any` across the
 * whole import.
 */
declare module 'inquirer' {
  interface Question {
    type?: string;
    name?: string;
    message?: string;
    default?: unknown;
    choices?: unknown;
    validate?: (input: never) => boolean | string;
    [key: string]: unknown;
  }

  interface Inquirer {
    prompt(questions: Question[]): Promise<Record<string, any>>;
  }

  const inquirer: Inquirer;
  export default inquirer;

  /**
   * The `confirm` prompt helper. The repos CLI imports it dynamically and
   * invokes it directly; modeled loosely as the source did.
   */
  export function confirm(options: Record<string, unknown>): Promise<any>;
}
