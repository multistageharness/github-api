/**
 * Minimal ambient declaration for `inquirer`.
 *
 * inquirer v9 ships no bundled type declarations and `@types/inquirer` is not
 * installed in this workspace, so we declare just the narrow surface the CLI
 * commands use (`prompt` with a single question or an array of questions). This
 * keeps strict mode happy without pulling `any` across the whole import.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prompt(questions: Question[] | Question): Promise<Record<string, any>>;
  }

  const inquirer: Inquirer;
  export default inquirer;
}
