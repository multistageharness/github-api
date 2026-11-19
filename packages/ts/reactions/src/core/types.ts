/**
 * Core type definitions for GitHub Reactions API
 * @module core/types
 */

import type { GitHubProxyOptions } from '@internal/github-sdk-fetch-rest-api';

/**
 * The reaction content types supported by the GitHub API.
 */
export type ReactionContent =
  | '+1'
  | '-1'
  | 'laugh'
  | 'confused'
  | 'heart'
  | 'hooray'
  | 'rocket'
  | 'eyes';

/**
 * The reaction content types supported for releases (subset of regular reactions).
 */
export type ReleaseReactionContent =
  | '+1'
  | 'laugh'
  | 'heart'
  | 'hooray'
  | 'rocket'
  | 'eyes';

/**
 * Default pagination options.
 */
export interface PaginationOptions {
  perPage?: number;
  page?: number;
  autoPage?: boolean;
}

/**
 * Logging configuration.
 */
export interface LoggingOptions {
  level?: 'error' | 'warn' | 'info' | 'debug' | 'verbose';
  console?: boolean;
  file?: string;
}

/**
 * Client configuration.
 */
export interface Config extends GitHubProxyOptions {
  token?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  pagination?: PaginationOptions;
  logging?: LoggingOptions;
}

/**
 * A GitHub user as represented in reaction payloads.
 */
export interface SimpleUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string | null;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
  name?: string;
  email?: string;
  starred_at?: string;
  user_view_type?: string;
}

/**
 * A reaction object returned by the GitHub API.
 */
export interface Reaction {
  id: number;
  node_id: string;
  user: SimpleUser | null;
  content: ReactionContent;
  created_at: string;
}

/**
 * A basic GitHub API error body.
 */
export interface BasicError {
  message: string;
  documentation_url?: string;
  url?: string;
  status?: string;
}

/**
 * A single validation error item.
 */
export interface ValidationErrorItem {
  code: string;
  resource?: string;
  field?: string;
  message?: string;
  index?: number;
  value?: string | number | string[] | null;
}

/**
 * A validation error body.
 */
export interface ValidationErrorBody {
  message: string;
  documentation_url: string;
  errors?: ValidationErrorItem[];
}

/**
 * Options when listing reactions.
 */
export interface ListReactionsOptions {
  content?: ReactionContent;
  perPage?: number;
  page?: number;
  autoPage?: boolean;
}

/**
 * Options when listing release reactions.
 */
export interface ListReleaseReactionsOptions {
  content?: ReleaseReactionContent;
  perPage?: number;
  page?: number;
  autoPage?: boolean;
}

/**
 * Options when creating a reaction.
 */
export interface CreateReactionOptions {
  content: ReactionContent;
}

/**
 * Options when creating a release reaction.
 */
export interface CreateReleaseReactionOptions {
  content: ReleaseReactionContent;
}

/**
 * Pagination information.
 */
export interface PaginationInfo {
  page: number;
  perPage: number;
  totalPages?: number;
  totalItems?: number;
  nextUrl?: string;
  prevUrl?: string;
  firstUrl?: string;
  lastUrl?: string;
}

/**
 * A paginated response.
 */
export interface PaginatedResponse<T = unknown> {
  data: T[];
  pagination: PaginationInfo;
}

// Reaction content enum values
export const REACTION_CONTENT = {
  PLUS_ONE: '+1',
  MINUS_ONE: '-1',
  LAUGH: 'laugh',
  CONFUSED: 'confused',
  HEART: 'heart',
  HOORAY: 'hooray',
  ROCKET: 'rocket',
  EYES: 'eyes'
} as const;

// Release reaction content enum values (subset of regular reactions)
export const RELEASE_REACTION_CONTENT = {
  PLUS_ONE: '+1',
  LAUGH: 'laugh',
  HEART: 'heart',
  HOORAY: 'hooray',
  ROCKET: 'rocket',
  EYES: 'eyes'
} as const;

// Export type definitions for runtime use
export const Types = {
  Config: {} as Config,
  Reaction: {} as Reaction,
  SimpleUser: {} as SimpleUser,
  ListReactionsOptions: {} as ListReactionsOptions,
  CreateReactionOptions: {} as CreateReactionOptions,
  PaginatedResponse: {} as PaginatedResponse,
};
