/**
 * GitHub Activity API Type Definitions
 * Generated from OpenAPI specification
 * @module models/types
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
  starred_at?: string;
  user_view_type?: string;
  name?: string | null;
  email?: string | null;
}

export interface Actor {
  id: number;
  login: string;
  display_login?: string;
  gravatar_id: string | null;
  url: string;
  avatar_url: string;
}

export interface Repository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: SimpleUser;
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  archive_url: string;
  assignees_url: string;
  blobs_url: string;
  branches_url: string;
  collaborators_url: string;
  comments_url: string;
  commits_url: string;
  compare_url: string;
  contents_url: string;
  contributors_url: string;
  deployments_url: string;
  downloads_url: string;
  events_url: string;
  forks_url: string;
  git_commits_url: string;
  git_refs_url: string;
  git_tags_url: string;
  git_url: string;
  issue_comment_url: string;
  issue_events_url: string;
  issues_url: string;
  keys_url: string;
  labels_url: string;
  languages_url: string;
  merges_url: string;
  milestones_url: string;
  notifications_url: string;
  pulls_url: string;
  releases_url: string;
  ssh_url: string;
  stargazers_url: string;
  statuses_url: string;
  subscribers_url: string;
  subscription_url: string;
  tags_url: string;
  teams_url: string;
  trees_url: string;
  clone_url: string;
  mirror_url: string | null;
  hooks_url: string;
  svn_url: string;
  homepage: string | null;
  language: string | null;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  size: number;
  default_branch: string;
  open_issues_count: number;
  is_template: boolean;
  topics: string[];
  has_issues: boolean;
  has_projects: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_downloads: boolean;
  has_discussions: boolean;
  archived: boolean;
  disabled: boolean;
  visibility: string;
  pushed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  permissions?: object;
  role_name?: string;
  temp_clone_token?: string;
  allow_forking?: boolean;
  web_commit_signoff_required?: boolean;
  forks?: number;
  open_issues?: number;
  watchers?: number;
  master_branch?: string;
  starred_at?: string;
  anonymous_access_enabled?: boolean;
}

export interface MinimalRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  owner: SimpleUser;
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  archive_url: string;
  assignees_url: string;
  blobs_url: string;
  branches_url: string;
  collaborators_url: string;
  comments_url: string;
  commits_url: string;
  compare_url: string;
  contents_url: string;
  contributors_url: string;
  deployments_url: string;
  downloads_url: string;
  events_url: string;
  forks_url: string;
  git_commits_url: string;
  git_refs_url: string;
  git_tags_url: string;
  git_url: string;
  issue_comment_url: string;
  issue_events_url: string;
  issues_url: string;
  keys_url: string;
  labels_url: string;
  languages_url: string;
  merges_url: string;
  milestones_url: string;
  notifications_url: string;
  pulls_url: string;
  releases_url: string;
  ssh_url: string;
  stargazers_url: string;
  statuses_url: string;
  subscribers_url: string;
  subscription_url: string;
  tags_url: string;
  teams_url: string;
  trees_url: string;
  clone_url: string;
  mirror_url: string | null;
  hooks_url: string;
  svn_url: string;
  homepage: string | null;
  language: string | null;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  size: number;
  default_branch: string;
  open_issues_count: number;
  is_template: boolean;
  topics: string[];
  has_issues: boolean;
  has_projects: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  has_downloads: boolean;
  has_discussions: boolean;
  archived: boolean;
  disabled: boolean;
  visibility: string;
  pushed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EventPayload {
  action?: string;
  issue?: object;
  comment?: object;
  pages?: unknown[];
  push_id?: number;
  size?: number;
  distinct_size?: number;
  ref?: string;
  head?: string;
  before?: string;
  commits?: unknown[];
  ref_type?: string;
  master_branch?: string;
  description?: string;
  pusher_type?: string;
}

export interface Event {
  id: string;
  type: string | null;
  actor: Actor;
  repo: {
    id: string;
    name: string;
    url: string;
  };
  org?: Actor;
  payload: EventPayload;
  public: boolean;
  created_at: string | null;
}

export interface ThreadSubject {
  title: string;
  url: string;
  latest_comment_url: string;
  type: string;
}

export interface Thread {
  id: string;
  repository: MinimalRepository;
  subject: ThreadSubject;
  reason: string;
  unread: boolean;
  updated_at: string;
  last_read_at: string | null;
  url: string;
  subscription_url: string;
}

export interface ThreadSubscription {
  subscribed: boolean;
  ignored: boolean;
  reason: string | null;
  created_at: string | null;
  url: string;
  thread_url?: string;
  repository_url?: string;
}

export interface Feed {
  timeline_url: string;
  user_url: string;
  current_user_public_url?: string;
  current_user_url?: string;
  current_user_actor_url?: string;
  current_user_organization_url?: string;
  current_user_organization_urls?: string[];
  security_advisories_url: string;
  repository_discussions_url?: string;
  repository_discussions_category_url?: string;
  _links: object;
}

export interface Stargazer {
  starred_at: string;
  user: SimpleUser | null;
}

export interface StarredRepository {
  starred_at: string;
  repo: Repository;
}

export interface RepositorySubscription {
  subscribed: boolean;
  ignored: boolean;
  reason: string | null;
  created_at: string | null;
  url: string | null;
  repository_url: string;
}

export interface BasicError {
  message?: string;
  documentation_url?: string;
  url?: string;
  status?: string;
}

export interface ValidationError {
  message: string;
  documentation_url: string;
  errors?: object[];
}

/**
 * Rate limit info attached to HTTP responses.
 */
export interface RateLimit {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
  resource: string;
}

/**
 * Parsed GitHub Link header (rel -> url, plus `${rel}_page` page numbers).
 */
export type PageLinks = Record<string, string | number>;

// Export types for use in other modules
export const Types = {
  SimpleUser: 'SimpleUser',
  Actor: 'Actor',
  Repository: 'Repository',
  MinimalRepository: 'MinimalRepository',
  Event: 'Event',
  EventPayload: 'EventPayload',
  Thread: 'Thread',
  ThreadSubject: 'ThreadSubject',
  ThreadSubscription: 'ThreadSubscription',
  Feed: 'Feed',
  Stargazer: 'Stargazer',
  StarredRepository: 'StarredRepository',
  RepositorySubscription: 'RepositorySubscription',
  BasicError: 'BasicError',
  ValidationError: 'ValidationError'
};
