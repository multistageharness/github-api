/**
 * Minimal ambient declaration for `inquirer`.
 *
 * inquirer v9 ships no bundled type declarations and `@types/inquirer` is not
 * installed in this workspace. The reactions CLI imports the default export
 * (faithfully preserved from the source `.mjs`) but does not currently invoke
 * it, so only the narrow `prompt` surface is declared. This keeps strict mode
 * happy without pulling `any` across the whole import.
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
    prompt(questions: Question[]): Promise<Record<string, unknown>>;
  }

  const inquirer: Inquirer;
  export default inquirer;
}
