/**
 * @fileoverview Validation utilities for GitHub Users API
 * @module validation
 */

import { ValidationError } from './errors.js';

/**
 * Validation rules accepted by {@link validateInput}.
 */
export interface ValidationRule {
  required?: boolean;
  type?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  minItems?: number;
  maxItems?: number;
  enum?: unknown[];
}

/**
 * Pagination parameters accepted by {@link validatePagination}.
 */
export interface PaginationOptions {
  per_page?: number;
  page?: number;
  since?: number;
}

/**
 * User-update payload accepted by {@link validateUserUpdate}.
 */
export interface UserUpdateData {
  name?: string;
  email?: string | null;
  blog?: string;
  company?: string;
  location?: string;
  bio?: string;
  twitter_username?: string;
  hireable?: boolean;
}

/**
 * Validate general input parameters
 */
export function validateInput(value: unknown, name: string, rules: ValidationRule = {}): void {
  const errors: string[] = [];

  // Required check
  if (rules.required && (value === undefined || value === null || value === '')) {
    errors.push(`${name} is required`);
  }

  // If value is empty and not required, skip further validation
  if (!rules.required && (value === undefined || value === null || value === '')) {
    return;
  }

  // Type validation
  if (rules.type && typeof value !== rules.type) {
    errors.push(`${name} must be of type ${rules.type}`);
  }

  // String validations
  if (typeof value === 'string') {
    if (rules.minLength && value.length < rules.minLength) {
      errors.push(`${name} must be at least ${rules.minLength} characters long`);
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors.push(`${name} must be at most ${rules.maxLength} characters long`);
    }

    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push(`${name} has invalid format`);
    }
  }

  // Number validations
  if (typeof value === 'number') {
    if (rules.min !== undefined && value < rules.min) {
      errors.push(`${name} must be at least ${rules.min}`);
    }

    if (rules.max !== undefined && value > rules.max) {
      errors.push(`${name} must be at most ${rules.max}`);
    }
  }

  // Array validations
  if (Array.isArray(value)) {
    if (rules.minItems && value.length < rules.minItems) {
      errors.push(`${name} must contain at least ${rules.minItems} items`);
    }

    if (rules.maxItems && value.length > rules.maxItems) {
      errors.push(`${name} must contain at most ${rules.maxItems} items`);
    }
  }

  // Enum validation
  if (rules.enum && !rules.enum.includes(value)) {
    errors.push(`${name} must be one of: ${rules.enum.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new ValidationError(`Validation failed for ${name}: ${errors.join(', ')}`);
  }
}

/**
 * Validate email address
 */
export function validateEmail(email: unknown): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  // Basic email regex - GitHub accepts most standard formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate GitHub username
 */
export function validateUsername(username: unknown): boolean {
  if (!username || typeof username !== 'string') {
    return false;
  }

  // GitHub username rules:
  // - Max 39 characters
  // - Alphanumeric characters or single hyphens
  // - Cannot begin or end with a hyphen
  const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
  return usernameRegex.test(username);
}

/**
 * Validate GitHub user ID
 */
export function validateUserId(userId: unknown): boolean {
  const id = parseInt(userId as string);
  return Number.isInteger(id) && id > 0;
}

/**
 * Validate pagination parameters
 */
export function validatePagination(params: PaginationOptions = {}): PaginationOptions {
  const validated: PaginationOptions = {};

  if (params.per_page !== undefined) {
    validateInput(params.per_page, 'per_page', {
      type: 'number',
      min: 1,
      max: 100
    });
    validated.per_page = params.per_page;
  }

  if (params.page !== undefined) {
    validateInput(params.page, 'page', {
      type: 'number',
      min: 1
    });
    validated.page = params.page;
  }

  if (params.since !== undefined) {
    validateInput(params.since, 'since', {
      type: 'number',
      min: 1
    });
    validated.since = params.since;
  }

  return validated;
}

/**
 * Validate user update data
 */
export function validateUserUpdate(userData: UserUpdateData = {}): UserUpdateData {
  const validated: UserUpdateData = {};

  if (userData.name !== undefined) {
    validateInput(userData.name, 'name', {
      type: 'string',
      maxLength: 255
    });
    validated.name = userData.name;
  }

  if (userData.email !== undefined) {
    if (userData.email !== null && !validateEmail(userData.email)) {
      throw new ValidationError('Invalid email address format');
    }
    validated.email = userData.email;
  }

  if (userData.blog !== undefined) {
    validateInput(userData.blog, 'blog', {
      type: 'string',
      maxLength: 255
    });
    validated.blog = userData.blog;
  }

  if (userData.company !== undefined) {
    validateInput(userData.company, 'company', {
      type: 'string',
      maxLength: 255
    });
    validated.company = userData.company;
  }

  if (userData.location !== undefined) {
    validateInput(userData.location, 'location', {
      type: 'string',
      maxLength: 255
    });
    validated.location = userData.location;
  }

  if (userData.bio !== undefined) {
    validateInput(userData.bio, 'bio', {
      type: 'string',
      maxLength: 160
    });
    validated.bio = userData.bio;
  }

  if (userData.twitter_username !== undefined) {
    validateInput(userData.twitter_username, 'twitter_username', {
      type: 'string',
      maxLength: 15
    });
    validated.twitter_username = userData.twitter_username;
  }

  if (userData.hireable !== undefined) {
    validateInput(userData.hireable, 'hireable', {
      type: 'boolean'
    });
    validated.hireable = userData.hireable;
  }

  return validated;
}

/**
 * Validate email addresses for bulk operations
 */
export function validateEmails(emails: unknown): string[] {
  if (!Array.isArray(emails)) {
    throw new ValidationError('Emails must be provided as an array');
  }

  if (emails.length === 0) {
    throw new ValidationError('At least one email address is required');
  }

  if (emails.length > 100) {
    throw new ValidationError('Cannot add more than 100 email addresses at once');
  }

  const validEmails: string[] = [];
  const errors: string[] = [];

  emails.forEach((email: unknown, index: number) => {
    if (!validateEmail(email)) {
      errors.push(`Invalid email at index ${index}: ${String(email)}`);
    } else {
      validEmails.push(email as string);
    }
  });

  if (errors.length > 0) {
    throw new ValidationError(`Email validation failed: ${errors.join(', ')}`);
  }

  return validEmails;
}

/**
 * Validate sort parameters
 */
export function validateSort(sort: string | undefined, allowedValues: string[]): string | undefined {
  if (sort && !allowedValues.includes(sort)) {
    throw new ValidationError(`Invalid sort value. Must be one of: ${allowedValues.join(', ')}`);
  }
  return sort;
}

/**
 * Validate order parameter
 */
export function validateOrder(order: string | undefined): string | undefined {
  const allowedOrders = ['asc', 'desc'];
  if (order && !allowedOrders.includes(order)) {
    throw new ValidationError(`Invalid order value. Must be one of: ${allowedOrders.join(', ')}`);
  }
  return order;
}

/**
 * Sanitize user input to prevent XSS and other issues
 */
export function sanitizeInput(input: unknown): unknown {
  if (typeof input !== 'string') {
    return input;
  }

  // Remove potential script tags and other dangerous content
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}
