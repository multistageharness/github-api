/**
 * @fileoverview Main SDK entry point for the GitHub Git API package.
 * @module @internal/github-sdk-git
 */

// Main SDK export for programmatic usage
export { GitHubClient } from './lib/client.js';
export type { GitHubClientOptions, GitPerson, GitTreeEntry } from './lib/client.js';

// Re-export command classes for advanced usage
export { BlobCommands } from './commands/blob.js';
export { CommitCommands } from './commands/commit.js';
export { RefCommands } from './commands/ref.js';
export { TagCommands } from './commands/tag.js';
export { TreeCommands } from './commands/tree.js';

// Utility exports
export { formatOutput } from './utils/format.js';

// Default export for convenience
import { GitHubClient } from './lib/client.js';
export default GitHubClient;
