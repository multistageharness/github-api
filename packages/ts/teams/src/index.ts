/**
 * @fileoverview GitHub Teams SDK - main entry point. Faithful TypeScript port
 * of the source `index.mjs`, preserving the public surface exactly: default
 * export `TeamsClient`, `models` namespace, `createClient` factory, and all
 * named method re-exports from the client.
 * @module @internal/github-sdk-teams
 */

import TeamsClient from './client.js';
import type { TeamsClientOptions } from './client.js';
import * as models from './models/index.js';

export default TeamsClient;
export { models };

export const createClient = (options: TeamsClientOptions = {}): TeamsClient => {
  return new TeamsClient(options);
};

export {
  listTeams,
  createTeam,
  getTeam,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
  getTeamMembership,
  listTeamRepos,
  addTeamRepo,
  removeTeamRepo,
  checkTeamRepo,
  listTeamProjects,
  addTeamProject,
  removeTeamProject,
  checkTeamProject,
  listTeamDiscussions,
  createTeamDiscussion,
  getTeamDiscussion,
  updateTeamDiscussion,
  deleteTeamDiscussion,
  listDiscussionComments,
  createDiscussionComment,
  getDiscussionComment,
  updateDiscussionComment,
  deleteDiscussionComment,
  listChildTeams,
  listTeamsForUser,
  listPendingInvitations,
} from './client.js';
