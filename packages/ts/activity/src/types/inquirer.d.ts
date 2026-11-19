/**
 * Minimal ambient declaration for `inquirer`.
 *
 * inquirer v9 ships no bundled type declarations and `@types/inquirer` is not
 * installed in this workspace, so we declare just the narrow surface the CLI
 * uses (`prompt`). This keeps strict mode happy without pulling `any` across the
 * whole import.
 */
declare module 'inquirer' {
  interface Question {
    type?: string;
    name?: string;
    message?: string;
    default?: unknown;
    [key: string]: unknown;
  }

  interface Inquirer {
    prompt(questions: Question[]): Promise<Record<string, any>>;
  }

  const inquirer: Inquirer;
  export default inquirer;
}
