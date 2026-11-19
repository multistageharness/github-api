import type { Capability, Param } from './types';

/* Parameter primitives — `in`: 'path' | 'query' | 'body' | 'accept' */
const owner: Param = { name: 'owner', type: 'string', in: 'path', required: true, eg: 'octocat' };
const repo: Param = { name: 'repo', type: 'string', in: 'path', required: true, eg: 'Hello-World' };
const username: Param = { name: 'username', type: 'string', in: 'path', required: true, eg: 'octocat' };
const org: Param = { name: 'org', type: 'string', in: 'path', required: true, eg: 'github' };
const threadId: Param = { name: 'threadId', type: 'number', in: 'path', required: true, placeholder: 'thread id' };

const page: Param = { name: 'page', type: 'number', in: 'query', min: 1, placeholder: '1' };
const perPage = (max = 100): Param => ({ name: 'per_page', type: 'number', in: 'query', min: 1, max, placeholder: '30' });
const since: Param = { name: 'since', type: 'date', in: 'query', hint: 'ISO-8601' };
const before: Param = { name: 'before', type: 'date', in: 'query', hint: 'ISO-8601' };

const PAGE: Param[] = [page, perPage(100)];

/**
 * Capability registry — one entry per live-API method in the SDK interface.
 * Local (no-endpoint) helpers are intentionally excluded.
 */
export const CAPABILITIES: Capability[] = [
  // ----- Client ------------------------------------------------------------
  { id: 'client.getRateLimit', module: 'Client', label: 'Get rate limit', method: 'GET', path: '/rate_limit', params: [], note: 'Current rate-limit resources. Cheap — does not count against the limit.' },
  { id: 'client.getAuthenticatedUser', module: 'Client', label: 'Get authenticated user', method: 'GET', path: '/user', params: [], note: 'Requires a token. Same call as the top-bar token test.' },
  { id: 'client.getMeta', module: 'Client', label: 'Get meta', method: 'GET', path: '/meta', params: [], note: 'GitHub service metadata (IP ranges, etc.).' },

  // ----- Events ------------------------------------------------------------
  { id: 'events.listPublic', module: 'Events', label: 'List public events', method: 'GET', path: '/events', params: PAGE },
  { id: 'events.listForRepo', module: 'Events', label: 'List repo events', method: 'GET', path: '/repos/{owner}/{repo}/events', params: [owner, repo, ...PAGE] },
  { id: 'events.listForRepoNetwork', module: 'Events', label: 'List repo network events', method: 'GET', path: '/networks/{owner}/{repo}/events', params: [owner, repo, ...PAGE] },
  { id: 'events.listForOrg', module: 'Events', label: 'List org events', method: 'GET', path: '/orgs/{org}/events', params: [org, ...PAGE] },
  { id: 'events.listForUser', module: 'Events', label: 'List user events', method: 'GET', path: '/users/{username}/events', params: [username, ...PAGE] },
  { id: 'events.listPublicForUser', module: 'Events', label: 'List public user events', method: 'GET', path: '/users/{username}/events/public', params: [username, ...PAGE] },
  { id: 'events.listForUserOrg', module: 'Events', label: 'List user→org events', method: 'GET', path: '/users/{username}/events/orgs/{org}', params: [username, org, ...PAGE] },
  { id: 'events.listReceivedByUser', module: 'Events', label: 'List received events', method: 'GET', path: '/users/{username}/received_events', params: [username, ...PAGE] },
  { id: 'events.listPublicReceivedByUser', module: 'Events', label: 'List public received events', method: 'GET', path: '/users/{username}/received_events/public', params: [username, ...PAGE] },

  // ----- Notifications -----------------------------------------------------
  {
    id: 'notifications.list', module: 'Notifications', label: 'List notifications', method: 'GET', path: '/notifications',
    params: [
      { name: 'all', type: 'boolean', in: 'query', hint: 'include read' },
      { name: 'participating', type: 'boolean', in: 'query' },
      since, before, page, perPage(50),
    ],
    note: 'per_page is clamped to 50 for this endpoint.',
  },
  { id: 'notifications.listForRepo', module: 'Notifications', label: 'List repo notifications', method: 'GET', path: '/repos/{owner}/{repo}/notifications', params: [owner, repo, { name: 'all', type: 'boolean', in: 'query' }, { name: 'participating', type: 'boolean', in: 'query' }, since, before, page, perPage(50)] },
  {
    id: 'notifications.markAsRead', module: 'Notifications', label: 'Mark all as read', method: 'PUT', path: '/notifications', mutating: true,
    params: [{ name: 'last_read_at', type: 'date', in: 'body', hint: 'defaults to now' }, { name: 'read', type: 'boolean', in: 'body', default: true }],
  },
  { id: 'notifications.markRepoAsRead', module: 'Notifications', label: 'Mark repo as read', method: 'PUT', path: '/repos/{owner}/{repo}/notifications', mutating: true, params: [owner, repo, { name: 'last_read_at', type: 'date', in: 'body' }] },
  { id: 'notifications.getThread', module: 'Notifications', label: 'Get thread', method: 'GET', path: '/notifications/threads/{threadId}', params: [threadId] },
  { id: 'notifications.markThreadAsRead', module: 'Notifications', label: 'Mark thread read', method: 'PATCH', path: '/notifications/threads/{threadId}', mutating: true, params: [threadId] },
  { id: 'notifications.markThreadAsDone', module: 'Notifications', label: 'Mark thread done', method: 'DELETE', path: '/notifications/threads/{threadId}', mutating: true, params: [threadId] },
  { id: 'notifications.getThreadSubscription', module: 'Notifications', label: 'Get thread subscription', method: 'GET', path: '/notifications/threads/{threadId}/subscription', params: [threadId] },
  { id: 'notifications.setThreadSubscription', module: 'Notifications', label: 'Set thread subscription', method: 'PUT', path: '/notifications/threads/{threadId}/subscription', mutating: true, params: [threadId, { name: 'ignored', type: 'boolean', in: 'body' }] },
  { id: 'notifications.deleteThreadSubscription', module: 'Notifications', label: 'Delete thread subscription', method: 'DELETE', path: '/notifications/threads/{threadId}/subscription', mutating: true, params: [threadId] },

  // ----- Feeds -------------------------------------------------------------
  { id: 'feeds.getFeeds', module: 'Feeds', label: 'Get feeds', method: 'GET', path: '/feeds', params: [], note: 'Base feed object. Every URL getter in the SDK re-fetches this endpoint.' },

  // ----- Stars -------------------------------------------------------------
  { id: 'stars.listStargazers', module: 'Stars', label: 'List stargazers', method: 'GET', path: '/repos/{owner}/{repo}/stargazers', params: [owner, repo, { name: 'withTimestamps', type: 'accept', in: 'accept', value: 'application/vnd.github.star+json', hint: 'adds starred_at' }, ...PAGE] },
  { id: 'stars.listStarredByUser', module: 'Stars', label: "List user's starred repos", method: 'GET', path: '/users/{username}/starred', params: [username, { name: 'sort', type: 'enum', in: 'query', options: ['created', 'updated'] }, { name: 'direction', type: 'enum', in: 'query', options: ['asc', 'desc'] }, ...PAGE] },
  { id: 'stars.listStarredByAuthUser', module: 'Stars', label: 'List my starred repos', method: 'GET', path: '/user/starred', params: [{ name: 'sort', type: 'enum', in: 'query', options: ['created', 'updated'] }, { name: 'direction', type: 'enum', in: 'query', options: ['asc', 'desc'] }, ...PAGE] },
  { id: 'stars.checkIfStarred', module: 'Stars', label: 'Check if I starred', method: 'GET', path: '/user/starred/{owner}/{repo}', params: [owner, repo], interpret: 'starred', note: '204 → starred, 404 → not starred.' },
  { id: 'stars.starRepo', module: 'Stars', label: 'Star repo', method: 'PUT', path: '/user/starred/{owner}/{repo}', mutating: true, params: [owner, repo] },
  { id: 'stars.unstarRepo', module: 'Stars', label: 'Unstar repo', method: 'DELETE', path: '/user/starred/{owner}/{repo}', mutating: true, params: [owner, repo] },
  { id: 'stars.getStarCount', module: 'Stars', label: 'Get star count', method: 'GET', path: '/repos/{owner}/{repo}', params: [owner, repo], interpret: 'stargazers_count', note: 'Reads stargazers_count off the repo object.' },

  // ----- Watching ----------------------------------------------------------
  { id: 'watching.listWatchers', module: 'Watching', label: 'List watchers', method: 'GET', path: '/repos/{owner}/{repo}/subscribers', params: [owner, repo, ...PAGE] },
  { id: 'watching.listWatchedByUser', module: 'Watching', label: "List user's watched repos", method: 'GET', path: '/users/{username}/subscriptions', params: [username, ...PAGE] },
  { id: 'watching.listWatchedByAuthUser', module: 'Watching', label: 'List my watched repos', method: 'GET', path: '/user/subscriptions', params: PAGE },
  { id: 'watching.getRepoSubscription', module: 'Watching', label: 'Get repo subscription', method: 'GET', path: '/repos/{owner}/{repo}/subscription', params: [owner, repo], allow404: true, note: '404 → not subscribed.' },
  { id: 'watching.setRepoSubscription', module: 'Watching', label: 'Set repo subscription', method: 'PUT', path: '/repos/{owner}/{repo}/subscription', mutating: true, params: [owner, repo, { name: 'subscribed', type: 'boolean', in: 'body' }, { name: 'ignored', type: 'boolean', in: 'body' }] },
  { id: 'watching.deleteRepoSubscription', module: 'Watching', label: 'Delete repo subscription', method: 'DELETE', path: '/repos/{owner}/{repo}/subscription', mutating: true, params: [owner, repo] },
  { id: 'watching.watchRepo', module: 'Watching', label: 'Watch repo', method: 'PUT', path: '/repos/{owner}/{repo}/subscription', mutating: true, params: [owner, repo], fixedBody: { subscribed: true, ignored: false } },
  { id: 'watching.unwatchRepo', module: 'Watching', label: 'Unwatch repo', method: 'DELETE', path: '/repos/{owner}/{repo}/subscription', mutating: true, params: [owner, repo] },
  { id: 'watching.ignoreRepo', module: 'Watching', label: 'Ignore repo', method: 'PUT', path: '/repos/{owner}/{repo}/subscription', mutating: true, params: [owner, repo], fixedBody: { subscribed: false, ignored: true } },
  { id: 'watching.getWatcherCount', module: 'Watching', label: 'Get watcher count', method: 'GET', path: '/repos/{owner}/{repo}', params: [owner, repo], interpret: 'subscribers_count', note: 'Reads subscribers_count off the repo object.' },
];

export const MODULES = ['Client', 'Events', 'Notifications', 'Feeds', 'Stars', 'Watching'] as const;
