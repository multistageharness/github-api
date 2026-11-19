/**
 * @fileoverview Input validation helpers. Faithful TypeScript port of the
 * source `utils/validation.mjs`.
 * @module utils/validation
 */

export function validateOptions(
  options: Record<string, unknown>,
  allowedKeys: string[]
): boolean {
  const invalidKeys = Object.keys(options).filter((key) => !allowedKeys.includes(key));

  if (invalidKeys.length > 0) {
    console.warn(`Warning: Invalid options provided: ${invalidKeys.join(', ')}`);
  }

  return true;
}

export function validateRequiredFields(
  data: Record<string, unknown>,
  requiredFields: string[]
): boolean {
  const missing = requiredFields.filter((field) => !data[field]);

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  return true;
}

export function validateEnum(
  value: unknown,
  enumValues: unknown[],
  fieldName: string
): boolean {
  if (!enumValues.includes(value)) {
    throw new Error(`Invalid value for ${fieldName}: must be one of ${enumValues.join(', ')}`);
  }

  return true;
}

/**
 * Options accepted by {@link validateString}.
 */
export interface ValidateStringOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

export function validateString(
  value: unknown,
  fieldName: string,
  options: ValidateStringOptions = {}
): boolean {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  if (options.minLength && value.length < options.minLength) {
    throw new Error(`${fieldName} must be at least ${options.minLength} characters long`);
  }

  if (options.maxLength && value.length > options.maxLength) {
    throw new Error(`${fieldName} must not exceed ${options.maxLength} characters`);
  }

  if (options.pattern && !options.pattern.test(value)) {
    throw new Error(`${fieldName} has invalid format`);
  }

  return true;
}

/**
 * Options accepted by {@link validateInteger}.
 */
export interface ValidateIntegerOptions {
  min?: number;
  max?: number;
}

export function validateInteger(
  value: unknown,
  fieldName: string,
  options: ValidateIntegerOptions = {}
): boolean {
  if (!Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }

  const num = value as number;

  if (options.min !== undefined && num < options.min) {
    throw new Error(`${fieldName} must be at least ${options.min}`);
  }

  if (options.max !== undefined && num > options.max) {
    throw new Error(`${fieldName} must not exceed ${options.max}`);
  }

  return true;
}

export function validateUrl(value: string, fieldName: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    throw new Error(`${fieldName} must be a valid URL`);
  }
}

export function validateEmail(value: string, fieldName: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(value)) {
    throw new Error(`${fieldName} must be a valid email address`);
  }

  return true;
}

export function sanitizeInput(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  return value
    .trim()
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ');
}
