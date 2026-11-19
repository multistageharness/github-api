/**
 * @fileoverview Main Git Repository Management Client using simple-git
 * @module GitClient
 */

import { simpleGit } from 'simple-git';
import type {
  SimpleGit,
  SimpleGitOptions,
  PullResult,
  PushResult,
  StatusResult,
  BranchSummary,
  RemoteWithRefs,
  DefaultLogFields,
  SimpleGitProgressEvent,
} from 'simple-git';
import { join, resolve, basename } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { GitError, ValidationError } from '../utils/errors.js';
import { validateRepository, validatePath } from '../utils/validation.js';
import {
  createSilentProgressManager,
  CLONE_STAGES,
  GitProgressManager,
} from '../utils/progress.js';
import type { ProgressEvent, StageChangeEvent, CompleteEvent } from '../utils/progress.js';

/**
 * Fixed sentinel GitHub expects in the password half of a token-authenticated
 * clone URL; the token itself goes in the username half. Not a credential.
 */
const OAUTH_BASIC_SENTINEL = 'x-oauth-basic';

/** Options accepted by the {@link GitClient} constructor. */
export interface GitClientOptions {
  baseDir?: string;
  token?: string;
  gitOptions?: Partial<SimpleGitOptions>;
  verbose?: boolean;
  timeout?: number;
}

/** Options for {@link GitClient.clone}. */
export interface CloneOptions {
  bare?: boolean;
  branch?: string;
  depth?: number;
  /** Legacy progress callback (deprecated, use progressManager). */
  progress?: (progress: string) => void;
  progressManager?: GitProgressManager;
  onProgress?: (event: ProgressEvent) => void;
  onStageChange?: (event: StageChangeEvent) => void;
  onComplete?: (event: CompleteEvent) => void;
}

/** Options for {@link GitClient.pull}. */
export interface PullOptions {
  remote?: string;
  branch?: string;
  rebase?: boolean;
}

/** Options for {@link GitClient.push}. */
export interface PushOptions {
  remote?: string;
  branch?: string;
  force?: boolean;
  setUpstream?: boolean;
}

/** Options for {@link GitClient.init}. */
export interface InitOptions {
  bare?: boolean;
}

/** Result of {@link GitClient.clone}. */
export interface RepositoryInfo {
  name: string;
  path: string;
  url?: string;
  branch?: string;
  status?: StatusResult;
  remotes?: RemoteWithRefs[];
  branches?: BranchSummary;
  recentCommits?: DefaultLogFields[];
  clonedAt?: string;
  initializedAt?: string;
  lastUpdated?: string;
}

/** Result of {@link GitClient.pull}. */
export interface PullResultInfo {
  name: string;
  path: string;
  result: PullResult;
  status: StatusResult;
  pulledAt: string;
}

/** Result of {@link GitClient.push}. */
export interface PushResultInfo {
  name: string;
  path: string;
  result: PushResult;
  status: StatusResult;
  pushedAt: string;
}

/** Result of {@link GitClient.status} / {@link GitClient.listRepositories}. */
export interface StatusResultInfo {
  name: string;
  path: string;
  branch?: string;
  status: StatusResult;
  remotes: RemoteWithRefs[];
  branches: BranchSummary;
  recentCommits: DefaultLogFields[];
  lastUpdated: string;
}

/** Result of {@link GitClient.init}. */
export interface InitResultInfo {
  name: string;
  path: string;
  bare: boolean;
  initializedAt: string;
}

/**
 * Whether a clone URL points at github.com itself. A substring check would hand
 * the token to `github.com.attacker.example` or `notgithub.com`.
 */
function isGitHubDotComUrl(repoUrl: string): boolean {
  if (repoUrl.startsWith('git@github.com:')) return true;
  try {
    const url = new URL(repoUrl);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'github.com';
  } catch {
    return false;
  }
}

/**
 * Main Git Repository Management Client
 *
 * @example
 * ```javascript
 * import { GitClient } from '@internal/github-sdk-clone';
 *
 * const client = new GitClient({
 *   baseDir: './repositories',
 *   token: process.env.GITHUB_TOKEN
 * });
 *
 * await client.clone('https://github.com/octocat/Hello-World.git', 'hello-world');
 * await client.pull('hello-world');
 * await client.push('hello-world');
 * ```
 */
export class GitClient {
  readonly baseDir: string;
  readonly token?: string;
  readonly verbose: boolean;
  readonly timeout: number;
  readonly git: SimpleGit;

  /**
   * Create a new Git repository management client
   * @param options - Configuration options
   */
  constructor(options: GitClientOptions = {}) {
    this.baseDir = resolve(options.baseDir || './repositories');
    this.token = options.token || process.env['GITHUB_TOKEN'];
    this.verbose = options.verbose || false;
    this.timeout = options.timeout || 300000; // 5 minutes default

    // Ensure base directory exists
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }

    // Configure simple-git with base directory
    this.git = simpleGit({
      baseDir: this.baseDir,
      binary: 'git',
      maxConcurrentProcesses: 6,
      timeout: {
        block: this.timeout,
      },
      ...options.gitOptions,
    });

    // Configure authentication if token is provided
    if (this.token) {
      this._configureAuth();
    }
  }

  /**
   * Configure Git authentication using GitHub token
   */
  private _configureAuth(): void {
    // Set up credential helper for GitHub authentication
    this.git.addConfig('credential.helper', 'store --file=.git-credentials');
  }

  /**
   * Get authenticated repository URL
   * @param repoUrl - Repository URL
   * @returns Authenticated URL
   */
  _getAuthenticatedUrl(repoUrl: string): string {
    if (!this.token || !isGitHubDotComUrl(repoUrl)) {
      return repoUrl;
    }

    // Convert to authenticated HTTPS URL. Only a trailing `.git` is stripped:
    // `owner/my.github.io.git` must not lose the `.git` inside its name.
    const url = new URL(
      repoUrl.replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '')
    );
    url.username = this.token;
    url.password = OAUTH_BASIC_SENTINEL;

    return url.toString() + '.git';
  }

  /**
   * Get repository path
   * @param repoName - Repository name or path
   * @returns Full repository path
   */
  _getRepoPath(repoName: string): string {
    if (repoName.startsWith('/') || repoName.includes(':')) {
      return resolve(repoName);
    }
    return join(this.baseDir, repoName);
  }

  /**
   * Clone a repository
   * @param repoUrl - Repository URL to clone
   * @param targetDir - Target directory name (defaults to repo name)
   * @param options - Clone options
   * @returns Repository information
   */
  async clone(
    repoUrl: string,
    targetDir?: string,
    options: CloneOptions = {}
  ): Promise<RepositoryInfo> {
    let progressManager: GitProgressManager | null = null;

    try {
      validateRepository(repoUrl);

      // Extract repo name if targetDir not provided
      if (!targetDir) {
        targetDir = basename(repoUrl.replace('.git', ''));
      }

      const repoPath = this._getRepoPath(targetDir);

      // Check if directory already exists
      if (existsSync(repoPath)) {
        throw new ValidationError(`Directory '${targetDir}' already exists`);
      }

      // Set up progress tracking
      progressManager =
        options.progressManager ||
        createSilentProgressManager({
          onProgress: options.onProgress,
          onStageChange: options.onStageChange,
          onComplete: options.onComplete,
        });

      const operationId = `clone-${targetDir}-${Date.now()}`;
      progressManager.start(operationId, `Cloning ${targetDir}`, 100);

      const authUrl = this._getAuthenticatedUrl(repoUrl);
      const cloneOptions: string[] = [];

      // Add clone options
      if (options.bare) cloneOptions.push('--bare');
      if (options.branch) cloneOptions.push('--branch', options.branch);
      if (options.depth) cloneOptions.push('--depth', options.depth.toString());

      // Add progress reporting if git supports it
      cloneOptions.push('--progress');

      progressManager.setStage(CLONE_STAGES.INITIALIZING, 'Preparing clone operation...');
      progressManager.update(10);

      if (this.verbose) {
        console.log(`Cloning ${repoUrl} to ${targetDir}...`);
      }

      progressManager.setStage(CLONE_STAGES.CLONING, 'Cloning repository...');
      progressManager.update(20);

      // Create git instance with progress handler.
      // simple-git invokes `progress` with a SimpleGitProgressEvent object; the
      // manager's parser stringifies its argument (matching the original .mjs
      // behavior) so we bridge the typed event through to that string parser.
      const gitProgress = progressManager.createGitProgressCallback();
      const gitWithProgress = simpleGit({
        baseDir: this.baseDir,
        binary: 'git',
        progress: (event: SimpleGitProgressEvent) => gitProgress(event as unknown as string),
      });

      // Perform clone
      await gitWithProgress.clone(authUrl, targetDir, cloneOptions);

      progressManager.setStage(CLONE_STAGES.CHECKING_OUT, 'Finalizing...');
      progressManager.update(90);

      const repoGit = simpleGit(repoPath);

      // git persists the clone URL as `origin`. When it carried the token, put
      // the caller's URL back so the token never lands in .git/config or in
      // the `remotes` this method returns (and a CLI then prints).
      if (authUrl !== repoUrl) {
        await repoGit.remote(['set-url', 'origin', repoUrl]);
      }

      // Get repository information
      const [status, remotes, branches] = await Promise.all([
        repoGit.status(),
        repoGit.getRemotes(true),
        repoGit.branch(['-a']),
      ]);

      const result: RepositoryInfo = {
        name: targetDir,
        path: repoPath,
        url: repoUrl,
        branch: status.current ?? undefined,
        status: status,
        remotes: remotes,
        branches: branches,
        clonedAt: new Date().toISOString(),
      };

      progressManager.complete(result);

      // Support legacy progress callback
      if (options.progress && typeof options.progress === 'function') {
        options.progress('Clone completed successfully');
      }

      return result;
    } catch (error) {
      if (progressManager) {
        progressManager.error(error as Error);
      }

      // Support legacy progress callback for errors
      if (options.progress && typeof options.progress === 'function') {
        options.progress(`Clone failed: ${(error as Error).message}`);
      }

      throw new GitError(`Clone failed: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Pull latest changes from remote
   * @param repoName - Repository name or path
   * @param options - Pull options
   * @returns Pull result
   */
  async pull(repoName: string, options: PullOptions = {}): Promise<PullResultInfo> {
    try {
      const repoPath = this._getRepoPath(repoName);
      validatePath(repoPath);

      const repoGit = simpleGit(repoPath);
      const remote = options.remote || 'origin';
      const branch = options.branch;

      if (this.verbose) {
        console.log(`Pulling changes for ${repoName}...`);
      }

      // Perform pull
      const pullOptions: string[] = [];
      if (options.rebase) pullOptions.push('--rebase');

      const result = branch
        ? await repoGit.pull(remote, branch, pullOptions)
        : await repoGit.pull(remote, undefined, pullOptions);

      // Get updated status
      const status = await repoGit.status();

      return {
        name: basename(repoPath),
        path: repoPath,
        result: result,
        status: status,
        pulledAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new GitError(`Pull failed: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Push changes to remote
   * @param repoName - Repository name or path
   * @param options - Push options
   * @returns Push result
   */
  async push(repoName: string, options: PushOptions = {}): Promise<PushResultInfo> {
    try {
      const repoPath = this._getRepoPath(repoName);
      validatePath(repoPath);

      const repoGit = simpleGit(repoPath);
      const remote = options.remote || 'origin';
      const branch = options.branch;

      if (this.verbose) {
        console.log(`Pushing changes for ${repoName}...`);
      }

      // Build push arguments
      const pushArgs: string[] = [remote];
      if (branch) pushArgs.push(branch);

      const pushOptions: string[] = [];
      if (options.force) pushOptions.push('--force');
      if (options.setUpstream) pushOptions.push('--set-upstream');

      // Perform push. The original passed (pushArgs, pushOptions) as two arrays;
      // simple-git merges both into a single argv, so we pass the equivalent
      // combined options array (identical resulting git command).
      const result = await repoGit.push([...pushArgs, ...pushOptions]);

      // Get updated status
      const status = await repoGit.status();

      return {
        name: basename(repoPath),
        path: repoPath,
        result: result,
        status: status,
        pushedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new GitError(`Push failed: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * Get repository status
   * @param repoName - Repository name or path
   * @returns Repository status and information
   */
  async status(repoName: string): Promise<StatusResultInfo> {
    try {
      const repoPath = this._getRepoPath(repoName);
      validatePath(repoPath);

      const repoGit = simpleGit(repoPath);

      const [status, remotes, branches, log] = await Promise.all([
        repoGit.status(),
        repoGit.getRemotes(true),
        repoGit.branch(['-a']),
        repoGit.log({ maxCount: 5 }),
      ]);

      return {
        name: basename(repoPath),
        path: repoPath,
        branch: status.current ?? undefined,
        status: status,
        remotes: remotes,
        branches: branches,
        recentCommits: [...log.all],
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      throw new GitError(`Status check failed: ${(error as Error).message}`, error as Error);
    }
  }

  /**
   * List all managed repositories
   * @returns Array of repository information
   */
  async listRepositories(): Promise<StatusResultInfo[]> {
    try {
      const { readdir, stat } = await import('fs/promises');

      if (!existsSync(this.baseDir)) {
        return [];
      }

      const entries = await readdir(this.baseDir);
      const repositories: StatusResultInfo[] = [];

      for (const entry of entries) {
        const entryPath = join(this.baseDir, entry);
        const stats = await stat(entryPath);

        if (stats.isDirectory()) {
          const gitDir = join(entryPath, '.git');
          if (existsSync(gitDir)) {
            try {
              const repoInfo = await this.status(entry);
              repositories.push(repoInfo);
            } catch {
              // Skip invalid repositories
              if (this.verbose) {
                console.warn(`Skipping invalid repository: ${entry}`);
              }
            }
          }
        }
      }

      return repositories;
    } catch (error) {
      throw new GitError(
        `Failed to list repositories: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Initialize a new repository
   * @param repoName - Repository name
   * @param options - Init options
   * @returns Repository information
   */
  async init(repoName: string, options: InitOptions = {}): Promise<InitResultInfo> {
    try {
      const repoPath = this._getRepoPath(repoName);

      if (existsSync(repoPath)) {
        throw new ValidationError(`Directory '${repoName}' already exists`);
      }

      mkdirSync(repoPath, { recursive: true });

      const repoGit = simpleGit(repoPath);
      const initOptions: string[] = options.bare ? ['--bare'] : [];

      await repoGit.init(initOptions);

      if (this.verbose) {
        console.log(`Initialized repository: ${repoName}`);
      }

      return {
        name: repoName,
        path: repoPath,
        bare: options.bare || false,
        initializedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new GitError(`Init failed: ${(error as Error).message}`, error as Error);
    }
  }
}
