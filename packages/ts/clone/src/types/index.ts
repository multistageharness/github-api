/**
 * Public type surface for `@internal/github-sdk-clone`.
 *
 * Re-exports the interfaces consumers may want to import via the `./types`
 * subpath. The source `.mjs` package shipped a hand-written `types/index.d.ts`;
 * this thin barrel exists so the package.json `./types` export resolves to a
 * real emitted module while reproducing that authoritative type surface.
 */

// Error types
export type {
  ErrorContext,
  ErrorDetails,
  GitErrorJSON,
  ValidationDetails,
} from '../utils/errors.js';

// Validation types
export type {
  RepositoryValidationOptions,
  RepositoryValidationResult,
  PathValidationOptions,
  PathValidationResult,
  DirectoryNameValidationOptions,
  DirectoryNameValidationResult,
  GitRefValidationOptions,
  GitRefValidationResult,
  GitHubTokenValidationResult,
  CloneOptionsValidation,
  RepositoryOperationParams,
  RepositoryOperationValidationResult,
} from '../utils/validation.js';

// Client types
export type {
  GitClientOptions,
  CloneOptions,
  PullOptions,
  PushOptions,
  InitOptions,
  RepositoryInfo,
  PullResultInfo,
  PushResultInfo,
  StatusResultInfo,
  InitResultInfo,
} from '../client/GitClient.js';

// Progress types
export type {
  CloneStage,
  ProgressEvent,
  StageChangeEvent,
  CompleteEvent,
  GitProgressManagerOptions,
} from '../utils/progress.js';

// Operations API types
export type {
  OperationClientOptions,
  CloneOperationOptions,
  PullOperationOptions,
  PushOperationOptions,
  StatusOperationOptions,
  ListOperationOptions,
  InitOperationOptions,
  SyncOperationOptions,
  SyncResult,
  BatchResult,
  BatchCloneOptions,
  BatchSyncOptions,
  RepositoryHealth,
} from '../api/operations.js';
