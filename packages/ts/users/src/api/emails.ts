/**
 * @fileoverview GitHub Users Email API
 * @module EmailsAPI
 */

import { validateEmails } from '../utils/validation.js';
import { AuthError, ValidationError } from '../utils/errors.js';
import type { HttpClient, RequestOptions } from '../client/http.js';

// Error objects from the HTTP layer carry a dynamic `.status`; narrowed at call sites.
type ErrorWithStatus = { status?: number };

/**
 * Options accepted by {@link EmailsAPI.list}.
 */
export interface EmailListOptions extends RequestOptions {
  per_page?: number;
  page?: number;
}

/**
 * Options accepted by the bulk email helpers.
 */
export interface BulkEmailOptions extends RequestOptions {
  continueOnError?: boolean;
}

/**
 * A single failed bulk email entry.
 */
export interface BulkEmailFailure {
  email: string;
  error: string;
}

/**
 * Result of a bulk add operation.
 */
export interface BulkAddResult {
  successful: any[];
  failed: BulkEmailFailure[];
}

/**
 * Result of a bulk delete operation.
 */
export interface BulkDeleteResult {
  successful: string[];
  failed: BulkEmailFailure[];
}

/**
 * Email statistics returned by {@link EmailsAPI.getStats}.
 */
export interface EmailStats {
  total: number;
  verified: number;
  unverified: number;
  primary: number;
  public: number;
  private: number;
}

/**
 * Emails API for authenticated user email management
 */
export class EmailsAPI {
  http: HttpClient;

  /**
   * Create EmailsAPI instance
   */
  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * List email addresses for the authenticated user
   */
  async list(options: EmailListOptions = {}): Promise<any[]> {
    try {
      const params = {
        per_page: options.per_page || 30,
        page: options.page || 1
      };

      const response = await this.http.get('/user/emails', { params, ...options });
      return Array.isArray(response) ? response : [response];
    } catch (error) {
      if ((error as ErrorWithStatus).status === 401) {
        throw new AuthError('Authentication required. Please provide a valid GitHub token.');
      }
      if ((error as ErrorWithStatus).status === 403) {
        throw new AuthError('Insufficient permissions. This operation requires the `user:email` scope.');
      }
      throw error;
    }
  }

  /**
   * Add an email address for the authenticated user
   */
  async add(emails: string | string[], options: RequestOptions = {}): Promise<any[]> {
    // Normalize to array
    const emailArray = Array.isArray(emails) ? emails : [emails];

    // Validate emails
    const validatedEmails = validateEmails(emailArray);

    try {
      const response = await this.http.post('/user/emails', { emails: validatedEmails }, options);
      return Array.isArray(response) ? response : [response];
    } catch (error) {
      if ((error as ErrorWithStatus).status === 401) {
        throw new AuthError('Authentication required. Please provide a valid GitHub token.');
      }
      if ((error as ErrorWithStatus).status === 403) {
        throw new AuthError('Insufficient permissions. This operation requires the `user` scope.');
      }
      if ((error as ErrorWithStatus).status === 422) {
        throw new ValidationError('Email validation failed. Check that all emails are valid and not already added.');
      }
      throw error;
    }
  }

  /**
   * Delete an email address for the authenticated user
   */
  async delete(emails: string | string[], options: RequestOptions = {}): Promise<void> {
    // Normalize to array
    const emailArray = Array.isArray(emails) ? emails : [emails];

    // Validate emails
    const validatedEmails = validateEmails(emailArray);

    try {
      await this.http.delete('/user/emails', { body: { emails: validatedEmails }, ...options });
    } catch (error) {
      if ((error as ErrorWithStatus).status === 401) {
        throw new AuthError('Authentication required. Please provide a valid GitHub token.');
      }
      if ((error as ErrorWithStatus).status === 403) {
        throw new AuthError('Insufficient permissions. This operation requires the `user` scope.');
      }
      if ((error as ErrorWithStatus).status === 422) {
        throw new ValidationError('Email validation failed. Check that the emails exist and can be deleted.');
      }
      throw error;
    }
  }

  /**
   * Get primary email address
   */
  async getPrimary(options: RequestOptions = {}): Promise<any> {
    const emails = await this.list(options);
    return emails.find((email) => email.primary) || null;
  }

  /**
   * Get all verified email addresses
   */
  async getVerified(options: RequestOptions = {}): Promise<any[]> {
    const emails = await this.list(options);
    return emails.filter((email) => email.verified);
  }

  /**
   * Get all unverified email addresses
   */
  async getUnverified(options: RequestOptions = {}): Promise<any[]> {
    const emails = await this.list(options);
    return emails.filter((email) => !email.verified);
  }

  /**
   * Check if an email address exists for the authenticated user
   */
  async exists(email: string, options: RequestOptions = {}): Promise<boolean> {
    const emails = await this.list(options);
    return emails.some((userEmail) => userEmail.email === email);
  }

  /**
   * Get email statistics
   */
  async getStats(options: RequestOptions = {}): Promise<EmailStats> {
    const emails = await this.list(options);

    return {
      total: emails.length,
      verified: emails.filter((e) => e.verified).length,
      unverified: emails.filter((e) => !e.verified).length,
      primary: emails.filter((e) => e.primary).length,
      public: emails.filter((e) => e.visibility === 'public').length,
      private: emails.filter((e) => e.visibility === 'private').length
    };
  }

  /**
   * Bulk operation to add multiple emails with error handling
   */
  async bulkAdd(emails: string[], options: BulkEmailOptions = {}): Promise<BulkAddResult> {
    if (!options.continueOnError) {
      // Add all at once - faster but all fail if any fail
      const result = await this.add(emails, options);
      return {
        successful: result,
        failed: []
      };
    }

    // Add one by one to handle individual failures
    const successful: any[] = [];
    const failed: BulkEmailFailure[] = [];

    for (const email of emails) {
      try {
        const result = await this.add(email, options);
        successful.push(...result);
      } catch (error) {
        failed.push({
          email,
          error: (error as Error).message
        });
      }
    }

    return { successful, failed };
  }

  /**
   * Bulk operation to delete multiple emails with error handling
   */
  async bulkDelete(emails: string[], options: BulkEmailOptions = {}): Promise<BulkDeleteResult> {
    if (!options.continueOnError) {
      // Delete all at once - faster but all fail if any fail
      await this.delete(emails, options);
      return {
        successful: emails,
        failed: []
      };
    }

    // Delete one by one to handle individual failures
    const successful: string[] = [];
    const failed: BulkEmailFailure[] = [];

    for (const email of emails) {
      try {
        await this.delete(email, options);
        successful.push(email);
      } catch (error) {
        failed.push({
          email,
          error: (error as Error).message
        });
      }
    }

    return { successful, failed };
  }
}

/**
 * List email addresses for the authenticated user
 */
export async function list(http: HttpClient, options: EmailListOptions = {}): Promise<any[]> {
  const api = new EmailsAPI(http);
  return api.list(options);
}

/**
 * Add an email address for the authenticated user
 */
export async function add(
  http: HttpClient,
  emails: string | string[],
  options: RequestOptions = {}
): Promise<any[]> {
  const api = new EmailsAPI(http);
  return api.add(emails, options);
}

/**
 * Delete an email address for the authenticated user
 */
export async function deleteEmails(
  http: HttpClient,
  emails: string | string[],
  options: RequestOptions = {}
): Promise<void> {
  const api = new EmailsAPI(http);
  return api.delete(emails, options);
}
