#!/usr/bin/env node

/**
 * @fileoverview GitHub Git API command-line interface.
 * @module cli
 */

import {
  validateProxyFlagsOrExit,
  proxyFlagsFromArgv,
  proxyOptionsFrom,
  registerProxyOptions,
} from '@internal/github-sdk-fetch-proxy';
import { DEFAULT_BASE_URL } from '@internal/github-sdk-fetch-rest-api';
import { program } from 'commander';
import { config } from 'dotenv';
import { BlobCommands } from './commands/blob.js';
import { CommitCommands } from './commands/commit.js';
import { RefCommands } from './commands/ref.js';
import { TagCommands } from './commands/tag.js';
import { TreeCommands } from './commands/tree.js';
import { GitHubClient } from './lib/client.js';
import { VERSION } from './version.js';

config();

program
  .name('github-git')
  .description('GitHub Git API CLI')
  .version(VERSION)
  .option('-t, --token <token>', 'GitHub API token', process.env['GITHUB_TOKEN'])
  .option('--api-url <url>', 'GitHub API base URL', DEFAULT_BASE_URL);

// The three proxy flags, registered from one place so `--proxy` means the same
// thing in every binary in this repository (PRD 0002, R8, RK6).
registerProxyOptions(program);
// Checked here, before commander routes to a subcommand: two contradictory
// flags, or a value that cannot be a proxy URL, must not surface as an unknown
// command or a stack trace (R8, R9).
validateProxyFlagsOrExit();

// This client is built at module scope, because the subcommands below are
// registered with it. Commander has not parsed anything yet at this point, so
// the flags are read straight off `process.argv` — otherwise a `--proxy` on the
// command line would be dropped silently (PRD 0002, R8).
const client = new GitHubClient({
  token: process.env['GITHUB_TOKEN'],
  baseUrl: process.env['GITHUB_API_URL'] || DEFAULT_BASE_URL,
  ...proxyOptionsFrom(proxyFlagsFromArgv())
});

// Blob commands
const blobCmd = program.command('blob').description('Manage Git blobs');
new BlobCommands(client).register(blobCmd);

// Commit commands
const commitCmd = program.command('commit').description('Manage Git commits');
new CommitCommands(client).register(commitCmd);

// Reference commands
const refCmd = program.command('ref').description('Manage Git references');
new RefCommands(client).register(refCmd);

// Tag commands
const tagCmd = program.command('tag').description('Manage Git tags');
new TagCommands(client).register(tagCmd);

// Tree commands
const treeCmd = program.command('tree').description('Manage Git trees');
new TreeCommands(client).register(treeCmd);

program.parse();
