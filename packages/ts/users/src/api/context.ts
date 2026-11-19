/**
 * @fileoverview GitHub Users Context API (Hovercard)
 * @module ContextAPI
 */

import { validateUsername } from '../utils/validation.js';
import { NotFoundError, ValidationError, AuthError } from '../utils/errors.js';
import type { HttpClient, RequestOptions } from '../client/http.js';

// Error objects from the HTTP layer carry a dynamic `.status`; narrowed at call sites.
type ErrorWithStatus = { status?: number };

/**
 * Options accepted by {@link ContextAPI.getForUser}.
 */
export interface ContextOptions extends RequestOptions {
  subject_type?: string;
  subject_id?: string;
}

/**
 * A subject descriptor used by {@link ContextAPI.compareContextAcrossSubjects}.
 */
export interface ContextSubject {
  type: string;
  id: string;
}

/**
 * Per-subject comparison result.
 */
export interface SubjectContextResult {
  subject: ContextSubject;
  hasContext: boolean;
  messageCount: number;
  messages: string[];
  error?: string;
}

/**
 * Result of {@link ContextAPI.compareContextAcrossSubjects}.
 */
export interface ContextComparison {
  username: string;
  subjects: SubjectContextResult[];
  totalSubjects: number;
  subjectsWithContext: number;
}

/**
 * Simplified context summary returned by {@link ContextAPI.getSummary}.
 */
export interface ContextSummary {
  username: string;
  hasContext: boolean;
  messageCount: number;
  messages: string[];
  subjectType: string | null;
  subjectId: string | null;
}

/**
 * A single failed multi-user context lookup.
 */
export interface ContextLookupFailure {
  username: string;
  error: string;
}

/**
 * Result of {@link ContextAPI.getForMultipleUsers}.
 */
export interface MultipleUsersContextResult {
  successful: Array<{ username: string; context: any }>;
  failed: ContextLookupFailure[];
}

/**
 * Context API for user hovercard information
 */
export class ContextAPI {
  http: HttpClient;

  /**
   * Create ContextAPI instance
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Get contextual information for a user
   */
  async getForUser(username: string, options: ContextOptions = {}): Promise<any> {
    if (!validateUsername(username)) {
      throw new ValidationError('Invalid username format');
    }

    const params: Record<string, string> = {};

    // Add subject context if provided
    if (options.subject_type) {
      const validSubjectTypes = ['repository', 'issue', 'pull_request', 'organization'];
      if (!validSubjectTypes.includes(options.subject_type)) {
        throw new ValidationError(`Invalid subject_type. Must be one of: ${validSubjectTypes.join(', ')}`);
      }
      params['subject_type'] = options.subject_type;

      if (options.subject_id) {
        params['subject_id'] = options.subject_id;
      }
    }

    try {
      const response = await this.http.get(`/users/${username}/hovercard`, {
        params,
        ...options
      });

      return response;
    } catch (error) {
      if ((error as ErrorWithStatus).status === 404) {
        throw new NotFoundError(`User '${username}' not found or hovercard not available`);
      }
      if ((error as ErrorWithStatus).status === 401) {
        throw new AuthError('Authentication required for hovercard information');
      }
      throw error;
    }
  }

  /**
   * Get context for user in relation to a repository
   */
  async getForUserInRepository(
    username: string,
    repositoryId: string | number,
    options: ContextOptions = {}
  ): Promise<any> {
    return this.getForUser(username, {
      ...options,
      subject_type: 'repository',
      subject_id: repositoryId.toString()
    });
  }

  /**
   * Get context for user in relation to an organization
   */
  async getForUserInOrganization(
    username: string,
    organizationId: string,
    options: ContextOptions = {}
  ): Promise<any> {
    return this.getForUser(username, {
      ...options,
      subject_type: 'organization',
      subject_id: organizationId.toString()
    });
  }

  /**
   * Get context for user in relation to an issue
   */
  async getForUserInIssue(
    username: string,
    issueId: string | number,
    options: ContextOptions = {}
  ): Promise<any> {
    return this.getForUser(username, {
      ...options,
      subject_type: 'issue',
      subject_id: issueId.toString()
    });
  }

  /**
   * Get context for user in relation to a pull request
   */
  async getForUserInPullRequest(
    username: string,
    pullRequestId: string | number,
    options: ContextOptions = {}
  ): Promise<any> {
    return this.getForUser(username, {
      ...options,
      subject_type: 'pull_request',
      subject_id: pullRequestId.toString()
    });
  }

  /**
   * Get context for multiple users
   */
  async getForMultipleUsers(
    usernames: string[],
    options: ContextOptions & { continueOnError?: boolean } = {}
  ): Promise<MultipleUsersContextResult> {
    const successful: Array<{ username: string; context: any }> = [];
    const failed: ContextLookupFailure[] = [];

    for (const username of usernames) {
      try {
        const context = await this.getForUser(username, options);
        successful.push({
          username,
          context
        });
      } catch (error) {
        if (options.continueOnError) {
          failed.push({
            username,
            error: (error as Error).message
          });
        } else {
          throw error;
        }
      }
    }

    return { successful, failed };
  }

  /**
   * Extract context messages from hovercard response
   */
  extractMessages(hovercardResponse: any): string[] {
    if (!hovercardResponse || !hovercardResponse.contexts) {
      return [];
    }

    return hovercardResponse.contexts.map((context: any) => context.message).filter(Boolean);
  }

  /**
   * Check if user has context in specific subject
   */
  async hasContextInSubject(
    username: string,
    subjectType: string,
    subjectId: string,
    options: ContextOptions = {}
  ): Promise<boolean> {
    try {
      const context = await this.getForUser(username, {
        ...options,
        subject_type: subjectType,
        subject_id: subjectId
      });

      return context && context.contexts && context.contexts.length > 0;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get simplified context summary
   */
  async getSummary(username: string, options: ContextOptions = {}): Promise<ContextSummary> {
    const context = await this.getForUser(username, options);

    const messages = this.extractMessages(context);

    return {
      username,
      hasContext: messages.length > 0,
      messageCount: messages.length,
      messages,
      subjectType: options.subject_type || null,
      subjectId: options.subject_id || null
    };
  }

  /**
   * Compare user context across different subjects
   */
  async compareContextAcrossSubjects(
    username: string,
    subjects: ContextSubject[],
    options: ContextOptions = {}
  ): Promise<ContextComparison> {
    const results: SubjectContextResult[] = [];

    for (const subject of subjects) {
      try {
        const context = await this.getForUser(username, {
          ...options,
          subject_type: subject.type,
          subject_id: subject.id
        });

        results.push({
          subject,
          hasContext: context && context.contexts && context.contexts.length > 0,
          messageCount: context?.contexts?.length || 0,
          messages: this.extractMessages(context)
        });
      } catch (error) {
        results.push({
          subject,
          hasContext: false,
          messageCount: 0,
          messages: [],
          error: (error as Error).message
        });
      }
    }

    return {
      username,
      subjects: results,
      totalSubjects: results.length,
      subjectsWithContext: results.filter((r) => r.hasContext).length
    };
  }
}

/**
 * Get contextual information for a user
 */
export async function getForUser(
  http: HttpClient,
  username: string,
  options: ContextOptions = {}
): Promise<any> {
  const api = new ContextAPI(http);
  return api.getForUser(username, options);
}

/**
 * Get context for user in relation to a repository
 */
export async function getForUserInRepository(
  http: HttpClient,
  username: string,
  repositoryId: string | number,
  options: ContextOptions = {}
): Promise<any> {
  const api = new ContextAPI(http);
  return api.getForUserInRepository(username, repositoryId, options);
}

/**
 * Get context for user in relation to an organization
 */
export async function getForUserInOrganization(
  http: HttpClient,
  username: string,
  organizationId: string,
  options: ContextOptions = {}
): Promise<any> {
  const api = new ContextAPI(http);
  return api.getForUserInOrganization(username, organizationId, options);
}
