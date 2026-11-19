/**
 * @fileoverview High-level Git operations API built on GitClient
 * @module operations
 */

import { GitClient } from '../client/GitClient.js';
import type {
  GitClientOptions,
  CloneOptions,
  PullOptions,
  PushOptions,
  InitOptions,
  RepositoryInfo,
  PullResultInfo,
  PushResultInfo,
  StatusResultInfo,
  InitResultInfo
} from '../client/GitClient.js';
import { GitError } from '../utils/errors.js';
import {
  createSilentProgressManager,
  createCLIProgressManager,
  GitProgressManager
} from '../utils/progress.js';
import type {
  ProgressEvent,
  StageChangeEvent,
  CompleteEvent
} from '../utils/progress.js';

/** Client configuration subset accepted by operation options. */
export interface OperationClientOptions {
  token?: string;
  baseDir?: string;
  verbose?: boolean;
  timeout?: number;
}

/** Options for {@link cloneRepository}. */
export interface CloneOperationOptions {
  client?: OperationClientOptions;
  clone?: CloneOptions;
  onProgress?: (event: ProgressEvent) => void;
  onStageChange?: (event: StageChangeEvent) => void;
  onComplete?: (event: CompleteEvent) => void;
  showProgress?: boolean;
  progressManager?: GitProgressManager;
}

/** Options for {@link pullRepository}. */
export interface PullOperationOptions {
  client?: OperationClientOptions;
  pull?: PullOptions;
}

/** Options for {@link pushRepository}. */
export interface PushOperationOptions {
  client?: OperationClientOptions;
  push?: PushOptions;
}

/** Options for {@link getRepositoryStatus}. */
export interface StatusOperationOptions {
  client?: OperationClientOptions;
}

/** Options for {@link listRepositories}. */
export interface ListOperationOptions {
  client?: OperationClientOptions;
}

/** Options for {@link initRepository}. */
export interface InitOperationOptions {
  client?: OperationClientOptions;
  init?: InitOptions;
}

/** Options for {@link syncRepository}. */
export interface SyncOperationOptions {
  client?: OperationClientOptions;
  pull?: PullOptions;
  push?: PushOptions;
  autoPush?: boolean;
}

/** Result of {@link syncRepository}. */
export interface SyncResult {
  name: string;
  path: string;
  pull: PullResultInfo;
  push?: PushResultInfo;
  syncedAt: string;
}

/** Result of a batch operation. */
export interface BatchResult<T> {
  successful: T[];
  failed: Array<{ repoUrl?: string; repoName?: string; error: string }>;
  total: number;
  successCount: number;
  errorCount: number;
}

/** Options for {@link batchClone}. */
export interface BatchCloneOptions {
  client?: OperationClientOptions;
  clone?: CloneOptions;
  onProgress?: (repoUrl: string, progress: ProgressEvent) => void;
  onComplete?: (repoUrl: string, result: RepositoryInfo | null, error: Error | null) => void;
  concurrency?: number;
}

/** Options for {@link batchSync}. */
export interface BatchSyncOptions {
  client?: OperationClientOptions;
  pull?: PullOptions;
  push?: PushOptions;
  autoPush?: boolean;
  onComplete?: (repoName: string, result: SyncResult | null, error: Error | null) => void;
  concurrency?: number;
}

/** Result of {@link getRepositoryHealth}. */
export interface RepositoryHealth {
  name: string;
  path: string;
  healthy: boolean;
  issues: string[];
  recommendations: string[];
  lastChecked: string;
}

/** Internal shape used to accumulate per-repo errors in batch operations. */
interface BatchErrorInfo {
  repoUrl?: string;
  repoName?: string;
  error: string;
}

/**
 * Create a GitClient instance with provided options
 * @param options - Client configuration options
 * @returns Configured GitClient instance
 */
function createClient(options: GitClientOptions = {}): GitClient {
  return new GitClient(options);
}

/**
 * Clone a repository with progress tracking and error handling
 * @param repoUrl - Repository URL to clone
 * @param targetDir - Target directory name
 * @param options - Operation options
 * @returns Repository information
 */
export async function cloneRepository(
  repoUrl: string,
  targetDir?: string,
  options: CloneOperationOptions = {}
): Promise<RepositoryInfo> {
  try {
    const client = createClient(options.client);

    // Create appropriate progress manager
    let progressManager: GitProgressManager;
    if (options.progressManager) {
      progressManager = options.progressManager;
    } else if (options.showProgress) {
      progressManager = createCLIProgressManager({
        onProgress: options.onProgress,
        onStageChange: options.onStageChange,
        onComplete: options.onComplete
      });
    } else {
      progressManager = createSilentProgressManager({
        onProgress: options.onProgress,
        onStageChange: options.onStageChange,
        onComplete: options.onComplete
      });
    }

    const result = await client.clone(repoUrl, targetDir, {
      ...options.clone,
      progressManager,
      onProgress: options.onProgress,
      onStageChange: options.onStageChange,
      onComplete: options.onComplete
    });

    return result;
  } catch (error) {
    throw new GitError(`Clone operation failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * Pull updates for a repository
 * @param repoName - Repository name or path
 * @param options - Operation options
 * @returns Pull result
 */
export async function pullRepository(
  repoName: string,
  options: PullOperationOptions = {}
): Promise<PullResultInfo> {
  try {
    const client = createClient(options.client);
    return await client.pull(repoName, options.pull);
  } catch (error) {
    throw new GitError(`Pull operation failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * Push changes for a repository
 * @param repoName - Repository name or path
 * @param options - Operation options
 * @returns Push result
 */
export async function pushRepository(
  repoName: string,
  options: PushOperationOptions = {}
): Promise<PushResultInfo> {
  try {
    const client = createClient(options.client);
    return await client.push(repoName, options.push);
  } catch (error) {
    throw new GitError(`Push operation failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * Get repository status and information
 * @param repoName - Repository name or path
 * @param options - Operation options
 * @returns Repository status
 */
export async function getRepositoryStatus(
  repoName: string,
  options: StatusOperationOptions = {}
): Promise<StatusResultInfo> {
  try {
    const client = createClient(options.client);
    return await client.status(repoName);
  } catch (error) {
    throw new GitError(`Status operation failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * List all managed repositories
 * @param options - Operation options
 * @returns Array of repository information
 */
export async function listRepositories(
  options: ListOperationOptions = {}
): Promise<StatusResultInfo[]> {
  try {
    const client = createClient(options.client);
    return await client.listRepositories();
  } catch (error) {
    throw new GitError(`List operation failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * Initialize a new repository
 * @param repoName - Repository name
 * @param options - Operation options
 * @returns Repository information
 */
export async function initRepository(
  repoName: string,
  options: InitOperationOptions = {}
): Promise<InitResultInfo> {
  try {
    const client = createClient(options.client);
    return await client.init(repoName, options.init);
  } catch (error) {
    throw new GitError(`Init operation failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * Sync repository (pull then optionally push)
 * @param repoName - Repository name or path
 * @param options - Operation options
 * @returns Sync result
 */
export async function syncRepository(
  repoName: string,
  options: SyncOperationOptions = {}
): Promise<SyncResult> {
  try {
    const client = createClient(options.client);

    // Pull first
    const pullResult = await client.pull(repoName, options.pull);

    const result: SyncResult = {
      name: pullResult.name,
      path: pullResult.path,
      pull: pullResult,
      syncedAt: new Date().toISOString()
    };

    // Auto-push if enabled and there are local changes
    if (options.autoPush) {
      const status = await client.status(repoName);
      if (status.status.ahead > 0) {
        const pushResult = await client.push(repoName, options.push);
        result.push = pushResult;
      }
    }

    return result;
  } catch (error) {
    throw new GitError(`Sync operation failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * Batch clone multiple repositories
 * @param repoUrls - Array of repository URLs
 * @param options - Operation options
 * @returns Array of clone results
 */
export async function batchClone(
  repoUrls: string[],
  options: BatchCloneOptions = {}
): Promise<BatchResult<RepositoryInfo>> {
  try {
    const concurrency = options.concurrency || 3;
    const results: Array<RepositoryInfo | BatchErrorInfo> = [];
    const errors: BatchErrorInfo[] = [];

    // Process repositories in batches
    for (let i = 0; i < repoUrls.length; i += concurrency) {
      const batch = repoUrls.slice(i, i + concurrency);
      const promises = batch.map(async (repoUrl) => {
        try {
          const result = await cloneRepository(repoUrl, undefined, {
            client: options.client,
            clone: options.clone,
            onProgress: options.onProgress
              ? (progress) => {
                  options.onProgress?.(repoUrl, progress);
                }
              : undefined
          });

          if (options.onComplete) {
            options.onComplete(repoUrl, result, null);
          }

          return result;
        } catch (error) {
          const errorInfo: BatchErrorInfo = { repoUrl, error: (error as Error).message };
          errors.push(errorInfo);

          if (options.onComplete) {
            options.onComplete(repoUrl, null, error as Error);
          }

          return errorInfo;
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return {
      successful: results.filter((r): r is RepositoryInfo => !('error' in r)),
      failed: errors,
      total: repoUrls.length,
      successCount: results.length - errors.length,
      errorCount: errors.length
    };
  } catch (error) {
    throw new GitError(`Batch clone failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * Batch sync multiple repositories
 * @param repoNames - Array of repository names
 * @param options - Operation options
 * @returns Array of sync results
 */
export async function batchSync(
  repoNames: string[],
  options: BatchSyncOptions = {}
): Promise<BatchResult<SyncResult>> {
  try {
    const concurrency = options.concurrency || 3;
    const results: Array<SyncResult | BatchErrorInfo> = [];
    const errors: BatchErrorInfo[] = [];

    // Process repositories in batches
    for (let i = 0; i < repoNames.length; i += concurrency) {
      const batch = repoNames.slice(i, i + concurrency);
      const promises = batch.map(async (repoName) => {
        try {
          const result = await syncRepository(repoName, {
            client: options.client,
            pull: options.pull,
            push: options.push,
            autoPush: options.autoPush
          });

          if (options.onComplete) {
            options.onComplete(repoName, result, null);
          }

          return result;
        } catch (error) {
          const errorInfo: BatchErrorInfo = { repoName, error: (error as Error).message };
          errors.push(errorInfo);

          if (options.onComplete) {
            options.onComplete(repoName, null, error as Error);
          }

          return errorInfo;
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    return {
      successful: results.filter((r): r is SyncResult => !('error' in r)),
      failed: errors,
      total: repoNames.length,
      successCount: results.length - errors.length,
      errorCount: errors.length
    };
  } catch (error) {
    throw new GitError(`Batch sync failed: ${(error as Error).message}`, error as Error);
  }
}

/**
 * Get repository health check
 * @param repoName - Repository name or path
 * @param options - Operation options
 * @returns Health check result
 */
export async function getRepositoryHealth(
  repoName: string,
  options: StatusOperationOptions = {}
): Promise<RepositoryHealth> {
  try {
    const client = createClient(options.client);
    const status = await client.status(repoName);

    // Analyze repository health
    const health: RepositoryHealth = {
      name: status.name,
      path: status.path,
      healthy: true,
      issues: [],
      recommendations: [],
      lastChecked: new Date().toISOString()
    };

    // Check for common issues
    if (status.status.conflicted.length > 0) {
      health.healthy = false;
      health.issues.push(`${status.status.conflicted.length} files have merge conflicts`);
      health.recommendations.push('Resolve merge conflicts before proceeding');
    }

    if (status.status.behind > 0) {
      health.issues.push(`${status.status.behind} commits behind remote`);
      health.recommendations.push('Run pull to get latest changes');
    }

    if (status.status.ahead > 0) {
      health.issues.push(`${status.status.ahead} commits ahead of remote`);
      health.recommendations.push('Run push to share your changes');
    }

    if (status.status.modified.length > 0) {
      health.issues.push(`${status.status.modified.length} modified files not staged`);
      health.recommendations.push('Stage and commit your changes');
    }

    return health;
  } catch (error) {
    throw new GitError(`Health check failed: ${(error as Error).message}`, error as Error);
  }
}
