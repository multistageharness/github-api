#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import chalk from 'chalk';
import dotenv from 'dotenv';

// Opt-in proxy support, registered as an import side effect. Without it, a
// configured HTTPS_PROXY / GITHUB_PROXY makes client construction throw
// `GitHubProxyUnavailableError` — the transport never silently goes direct.
import '@internal/github-sdk-fetch-proxy';
import { createSafeSearchClient } from '@internal/github-sdk-search';

import { promptOrExit as guardPrompt } from './prompt.js';
import { methodFor } from './dispatch.js';
import { buildParams } from './query.js';
import { readTokenFromStream, resolveToken } from './token.js';
import { renderError, renderHuman, renderJson } from './render.js';
import type { SearchItem } from './render.js';
import { HELP_TEXT, UsageError, parseCliArgs, selectMode } from './argv.js';
import {
  GITHUB_DEFAULT_PER_PAGE,
  proxyOptionsFromArgv,
  resolveBaseURL,
  resolveOutputDir,
  resolvePerPage,
} from './config.js';
import { collectFromFlags } from './flags.js';
import type { CollectedSearch } from './flags.js';
import { collectInteractive } from './wizard.js';
import type { PromptGuard } from './wizard.js';
import { writeResult } from './output.js';
import { entryFile, findPackageDir } from './package-dir.js';
// Generated from package.json by scripts/gen-version.mjs: reading package.json at
// runtime needs `import.meta`, which the CommonJS pass of the dual build rejects.
import { PACKAGE_NAME, VERSION } from './version.js';

// Load .env before the first process.env read, from a deterministic location:
// the package directory, never the cwd — a `.env` in whatever directory the user
// happens to be in could redirect GITHUB_API_URL and carry the token elsewhere.
// The directory is found from the running file (see package-dir.ts), so this holds
// from dist/esm/ and dist/cjs/ alike. `GSW_DOTENV=0` skips it (the test suite sets
// this so a developer's own .env cannot change what the end-to-end tests observe).
if (process.env['GSW_DOTENV'] !== '0') {
  const file = entryFile();
  const packageDir = file === undefined ? undefined : findPackageDir(file, PACKAGE_NAME);
  if (packageDir !== undefined) dotenv.config({ path: join(packageDir, '.env') });
}

/** Warnings and notices: stderr, so `--json` stdout stays pipeable. */
const warn = (message: string): void => console.error(chalk.yellow(`warning: ${message}`));

/**
 * Every prompt in this file routes through here. Ctrl-C exits 0 — the real
 * `process.exit` never returns, so a resolved value is always the prompt's own.
 */
const promptOrExit: PromptGuard = <T>(promptFn: () => Promise<T | symbol>) =>
  guardPrompt(promptFn, { clack: p }) as Promise<T>;

async function main(): Promise<void> {
  const argv = parseCliArgs(process.argv.slice(2));

  if (argv.help) {
    console.log(HELP_TEXT);
    return;
  }
  if (argv.version) {
    console.log(VERSION);
    return;
  }

  const json = Boolean(argv.json);
  const interactive = selectMode(argv, {
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
  });
  const proxyOptions = proxyOptionsFromArgv(argv);

  if (argv.token !== undefined && argv['token-stdin']) {
    throw new UsageError('--token and --token-stdin cannot be used together.');
  }
  if (argv.token !== undefined) {
    // Never the value — only the fact that the flag exposes it.
    warn('--token is visible in shell history and `ps`; prefer GITHUB_TOKEN or --token-stdin.');
  }

  const perPageSetting = resolvePerPage(process.env, { warn });
  const baseURL = resolveBaseURL(process.env);

  let collected: CollectedSearch;
  let token: string;
  if (interactive) {
    p.intro(chalk.bgBlack(' github-search-wizard '));
    // Resolved first, so a missing token fails before the user has answered
    // every question rather than after.
    token = await resolveToken({
      flagToken: argv.token,
      env: process.env,
      prompt: () =>
        promptOrExit(() =>
          p.password({
            message: 'GitHub token (input hidden)',
            validate: (v) => (!v || !String(v).trim() ? 'A token is required' : undefined),
          })
        ),
    });
    collected = await collectInteractive({
      clack: p,
      promptOrExit,
      defaultPerPage: perPageSetting.value,
    });
  } else {
    // Flags are validated before the token, so a usage mistake is reported as such.
    collected = collectFromFlags(argv, {
      defaultPerPage: perPageSetting.fromEnv ? perPageSetting.value : undefined,
      warn,
    });
    // Resolved BEFORE the client is constructed and before any search is issued,
    // so a missing token can never produce an HTTP request. No prompt tier here:
    // fail fast rather than block a headless run.
    token = await resolveToken({
      flagToken: argv['token-stdin'] ? await readTokenFromStream(process.stdin) : argv.token,
      env: process.env,
    });
  }
  const { endpoint, q, repositoryId, sort, order, perPage, page } = collected;

  const client = createSafeSearchClient({
    token,
    // Omitted rather than `undefined` when unset, so the SDK keeps its default.
    ...(baseURL === undefined ? {} : { baseURL }),
    ...proxyOptions,
  });
  const method = methodFor(endpoint);
  const params = buildParams({ q, sort, order, perPage, page, repositoryId });

  const spinner = json ? null : p.spinner();
  spinner?.start(`Searching ${endpoint}…`);
  const started = Date.now();

  let result;
  try {
    // A member call, so `this` binds to the client — destructuring would detach it.
    result = await client[method]<SearchItem>(params);
    spinner?.stop(chalk.green(`${endpoint} — ${Date.now() - started} ms`));
  } catch (error) {
    spinner?.stop(chalk.red(`${endpoint} — failed`));
    throw error; // typed rendering belongs to the top-level catch
  } finally {
    await client.close(); // always — even on the throw path
  }

  // Render first: the search succeeded and spent rate-limit budget, so its
  // result must reach the user even if persisting it then fails.
  if (json) {
    renderJson(result);
  } else {
    renderHuman(result, {
      endpoint,
      page: params.page ?? 1,
      perPage: params.per_page ?? GITHUB_DEFAULT_PER_PAGE,
    });
  }

  if (!argv['no-save']) {
    try {
      const savedTo = writeResult(result, {
        endpoint,
        query: params.q,
        params,
        dir: argv['output-dir'] || resolveOutputDir(process.env, homedir()),
      });
      // The sink announces on stderr, never stdout, so `… --json | jq` stays valid.
      console.error(chalk.dim(`saved → ${savedTo}`));
    } catch (error) {
      const e = error as { code?: unknown; message?: unknown } | null | undefined;
      warn(`result not saved (${e?.code ?? e?.message ?? error}). Use --output-dir or --no-save.`);
    }
  }

  if (!json) p.outro(chalk.green('Done.'));
}

main().catch((error: unknown) => {
  const e = error as { message?: unknown; exitCode?: unknown } | null | undefined;
  try {
    renderError(error); // stderr; never a stack trace
  } catch {
    console.error(String(e?.message ?? error));
  }
  process.exit((e?.exitCode ?? 1) as number);
});
