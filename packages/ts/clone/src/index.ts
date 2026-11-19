/**
 * @fileoverview Git Repository Management SDK - Main entry point for library usage
 * @module @internal/github-sdk-clone
 * @version 1.0.0
 */

import { GitClient } from './client/GitClient.js';
import type {
  GitClientOptions,
  RepositoryInfo,
  PullResultInfo,
  PushResultInfo,
  StatusResultInfo,
  InitResultInfo,
} from './client/GitClient.js';
import * as operations from './api/operations.js';
import type { SyncResult, OperationClientOptions } from './api/operations.js';
import {
  GitError,
  AuthError,
  ValidationError,
  RepositoryError,
  CloneError,
  NetworkError,
  FileSystemError,
  ConfigError,
  wrapError,
  isErrorType,
  getErrorInfo,
} from './utils/errors.js';
import {
  validateRepository,
  validatePath,
  validateDirectoryName,
  validateGitRef,
  validateGitHubToken,
  validateCloneOptions,
  validateRepositoryOperation,
} from './utils/validation.js';
import {
  GitProgressManager,
  createProgressManager,
  createSilentProgressManager,
  createCLIProgressManager,
  CLONE_STAGES,
} from './utils/progress.js';
import type { ProgressEvent, StageChangeEvent, CompleteEvent } from './utils/progress.js';
import { PACKAGE_NAME, VERSION } from './version.js';

/** Package metadata shape. */
export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  homepage: string;
}

/** Flattened convenience-function options. */
export interface ConvenienceOptions extends OperationClientOptions {
  branch?: string;
  depth?: number;
  bare?: boolean;
  remote?: string;
  rebase?: boolean;
  force?: boolean;
  setUpstream?: boolean;
  onProgress?: (event: ProgressEvent) => void;
  onStageChange?: (event: StageChangeEvent) => void;
  onComplete?: (event: CompleteEvent) => void;
  showProgress?: boolean;
  progressManager?: GitProgressManager;
  autoPush?: boolean;
}

/**
 * Create a new Git Repository Management client
 * @param options - Configuration options
 * @returns Configured Git client
 *
 * @example
 * ```javascript
 * import { createClient } from '@internal/github-sdk-clone';
 *
 * const client = createClient({
 *   baseDir: './my-repos',
 *   token: process.env.GITHUB_TOKEN,
 *   verbose: true
 * });
 *
 * const repo = await client.clone('https://github.com/octocat/Hello-World.git', 'hello-world');
 * console.log(`Cloned: ${repo.name}`);
 * ```
 */
export function createClient(options: GitClientOptions = {}): GitClient {
  return new GitClient(options);
}

/**
 * Default export - GitClient class
 */
export default GitClient;

/**
 * Named exports for direct usage
 */
export {
  // Client
  GitClient,

  // API operations
  operations,

  // Progress management
  GitProgressManager,
  createProgressManager,
  createSilentProgressManager,
  createCLIProgressManager,
  CLONE_STAGES,

  // Error classes
  GitError,
  AuthError,
  ValidationError,
  RepositoryError,
  CloneError,
  NetworkError,
  FileSystemError,
  ConfigError,

  // Error utilities
  wrapError,
  isErrorType,
  getErrorInfo,

  // Validation functions
  validateRepository,
  validatePath,
  validateDirectoryName,
  validateGitRef,
  validateGitHubToken,
  validateCloneOptions,
  validateRepositoryOperation,
};

/**
 * Re-export high-level operations for convenience
 */
export const {
  cloneRepository,
  pullRepository,
  pushRepository,
  getRepositoryStatus,
  listRepositories,
  initRepository,
  syncRepository,
  batchClone,
  batchSync,
  getRepositoryHealth,
} = operations;

/**
 * Convenience method to quickly clone a repository
 * @param repoUrl - Repository URL
 * @param targetDir - Target directory name
 * @param options - Client and clone options
 * @returns Repository data
 */
export async function clone(
  repoUrl: string,
  targetDir?: string,
  options: ConvenienceOptions = {}
): Promise<RepositoryInfo> {
  return await cloneRepository(repoUrl, targetDir, {
    client: {
      token: options.token,
      baseDir: options.baseDir,
      verbose: options.verbose,
    },
    clone: {
      branch: options.branch,
      depth: options.depth,
      bare: options.bare,
    },
    onProgress: options.onProgress,
    onStageChange: options.onStageChange,
    onComplete: options.onComplete,
    showProgress: options.showProgress,
    progressManager: options.progressManager,
  });
}

/**
 * Convenience method to quickly pull repository updates
 * @param repoName - Repository name or path
 * @param options - Client and pull options
 * @returns Pull result
 */
export async function pull(
  repoName: string,
  options: ConvenienceOptions = {}
): Promise<PullResultInfo> {
  return await pullRepository(repoName, {
    client: {
      token: options.token,
      baseDir: options.baseDir,
      verbose: options.verbose,
    },
    pull: {
      remote: options.remote,
      branch: options.branch,
      rebase: options.rebase,
    },
  });
}

/**
 * Convenience method to quickly push repository changes
 * @param repoName - Repository name or path
 * @param options - Client and push options
 * @returns Push result
 */
export async function push(
  repoName: string,
  options: ConvenienceOptions = {}
): Promise<PushResultInfo> {
  return await pushRepository(repoName, {
    client: {
      token: options.token,
      baseDir: options.baseDir,
      verbose: options.verbose,
    },
    push: {
      remote: options.remote,
      branch: options.branch,
      force: options.force,
      setUpstream: options.setUpstream,
    },
  });
}

/**
 * Convenience method to get repository status
 * @param repoName - Repository name or path
 * @param options - Client options
 * @returns Repository status
 */
export async function status(
  repoName: string,
  options: ConvenienceOptions = {}
): Promise<StatusResultInfo> {
  return await getRepositoryStatus(repoName, {
    client: {
      token: options.token,
      baseDir: options.baseDir,
      verbose: options.verbose,
    },
  });
}

/**
 * Convenience method to list all repositories
 * @param options - Client options
 * @returns Array of repository information
 */
export async function list(options: ConvenienceOptions = {}): Promise<StatusResultInfo[]> {
  return await listRepositories({
    client: {
      token: options.token,
      baseDir: options.baseDir,
      verbose: options.verbose,
    },
  });
}

/**
 * Convenience method to initialize a new repository
 * @param repoName - Repository name
 * @param options - Client and init options
 * @returns Repository information
 */
export async function init(
  repoName: string,
  options: ConvenienceOptions = {}
): Promise<InitResultInfo> {
  return await initRepository(repoName, {
    client: {
      token: options.token,
      baseDir: options.baseDir,
      verbose: options.verbose,
    },
    init: {
      bare: options.bare,
    },
  });
}

/**
 * Convenience method to sync repository (pull + optional push)
 * @param repoName - Repository name or path
 * @param options - Client and sync options
 * @returns Sync result
 */
export async function sync(
  repoName: string,
  options: ConvenienceOptions = {}
): Promise<SyncResult> {
  return await syncRepository(repoName, {
    client: {
      token: options.token,
      baseDir: options.baseDir,
      verbose: options.verbose,
    },
    pull: {
      remote: options.remote,
      branch: options.branch,
      rebase: options.rebase,
    },
    push: {
      remote: options.remote,
      branch: options.branch,
      force: options.force,
    },
    autoPush: options.autoPush,
  });
}

/**
 * Package metadata
 */
export const packageInfo: PackageInfo = {
  name: PACKAGE_NAME,
  version: VERSION,
  description: 'Git Repository Management SDK and CLI - Local git operations with simple-git',
  homepage:
    'https://github.com/multistageharness-com/RCM-github/tree/main/github-api/v100/packages/ts/clone',
};
