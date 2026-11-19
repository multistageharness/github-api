/**
 * @fileoverview CLI configuration management
 * @module cli/config
 */

import { DEFAULT_BASE_URL } from '@internal/github-sdk-fetch-rest-api';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import inquirer from 'inquirer';
import { ValidationError } from '../utils/errors.js';

const CONFIG_DIR = join(homedir(), '.github-repos');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * CLI output configuration.
 */
export interface OutputConfig {
  format: string;
  colors: boolean;
  verbose: boolean;
}

/**
 * Persisted CLI configuration shape.
 */
export interface CLIConfig {
  token: string | null;
  baseUrl: string;
  timeout: number;
  rateLimiting: {
    enabled: boolean;
    padding: number;
  };
  output: OutputConfig;
  [key: string]: unknown;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CLIConfig = {
  token: null,
  baseUrl: DEFAULT_BASE_URL,
  timeout: 10000,
  rateLimiting: {
    enabled: true,
    padding: 100
  },
  output: {
    format: 'table', // table, json
    colors: true,
    verbose: false
  }
};

/**
 * Load configuration from file
 */
export async function loadConfig(): Promise<CLIConfig> {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG };
    }

    const configData = await readFile(CONFIG_FILE, 'utf8');
    // Config file is arbitrary user-supplied JSON.
    const config = JSON.parse(configData) as Partial<CLIConfig>;

    return { ...DEFAULT_CONFIG, ...config };
  } catch {
    console.warn('Warning: Could not load configuration, using defaults');
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: CLIConfig): Promise<void> {
  try {
    // Ensure config directory exists
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }

    // Don't save sensitive data in plain text (just a warning)
    const configToSave = { ...config };
    if (configToSave.token) {
      console.warn(
        'Warning: Token will be saved in plain text. Consider using environment variables.'
      );
    }

    await writeFile(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
  } catch (error) {
    throw new Error(`Failed to save configuration: ${(error as Error).message}`);
  }
}

/**
 * Interactive configuration setup
 */
export async function setupConfig(): Promise<CLIConfig> {
  console.log('🔧 GitHub Repository CLI Configuration');
  console.log('');

  const currentConfig = await loadConfig();

  const questions = [
    {
      type: 'input',
      name: 'token',
      message: 'GitHub Personal Access Token (leave empty to use environment variable):',
      default: currentConfig.token || '',
      validate: (input: string) => {
        if (!input.trim()) {
          return true; // Allow empty to use env var
        }
        if (input.length < 20) {
          return 'Token appears to be too short';
        }
        if (input.includes(' ')) {
          return 'Token should not contain spaces';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'GitHub API Base URL:',
      default: currentConfig.baseUrl || DEFAULT_BASE_URL,
      validate: (input: string) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    },
    {
      type: 'number',
      name: 'timeout',
      message: 'Request timeout (milliseconds):',
      default: currentConfig.timeout || 10000,
      validate: (input: number) => {
        if (input < 1000 || input > 60000) {
          return 'Timeout must be between 1000 and 60000 milliseconds';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'rateLimitingEnabled',
      message: 'Enable rate limiting protection:',
      default: currentConfig.rateLimiting?.enabled !== false
    },
    {
      type: 'list',
      name: 'outputFormat',
      message: 'Default output format:',
      choices: [
        { name: 'Table (human readable)', value: 'table' },
        { name: 'JSON', value: 'json' }
      ],
      default: currentConfig.output?.format || 'table'
    },
    {
      type: 'confirm',
      name: 'colors',
      message: 'Use colors in output:',
      default: currentConfig.output?.colors !== false
    },
    {
      type: 'confirm',
      name: 'verbose',
      message: 'Enable verbose logging:',
      default: currentConfig.output?.verbose === true
    }
  ];

  const answers = await inquirer.prompt(questions);

  const newConfig: CLIConfig = {
    token: (answers['token'] as string).trim() || null,
    baseUrl: answers['baseUrl'] as string,
    timeout: answers['timeout'] as number,
    rateLimiting: {
      enabled: answers['rateLimitingEnabled'] as boolean,
      padding: 100
    },
    output: {
      format: answers['outputFormat'] as string,
      colors: answers['colors'] as boolean,
      verbose: answers['verbose'] as boolean
    }
  };

  await saveConfig(newConfig);

  console.log('');
  console.log('✅ Configuration saved successfully!');

  if (!newConfig.token && !process.env['GITHUB_TOKEN']) {
    console.log('');
    console.log('⚠️  No token configured. You can:');
    console.log('   - Set GITHUB_TOKEN environment variable');
    console.log('   - Use --token option with commands');
    console.log('   - Run this setup again to save a token');
  }

  return newConfig;
}

/**
 * Update specific configuration value
 */
export async function updateConfigValue(key: string, value: unknown): Promise<CLIConfig> {
  const config = await loadConfig();

  // Handle nested keys like 'output.format'
  const keys = key.split('.');
  let current: Record<string, unknown> = config as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i] as string;
    if (!current[k]) {
      current[k] = {};
    }
    current = current[k] as Record<string, unknown>;
  }

  current[keys[keys.length - 1] as string] = value;

  await saveConfig(config);
  return config;
}

/**
 * Get configuration value
 */
export async function getConfigValue(key: string): Promise<unknown> {
  const config = await loadConfig();

  // Handle nested keys
  const keys = key.split('.');
  let current: unknown = config;

  for (const k of keys) {
    if (current && typeof current === 'object' && k in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Reset configuration to defaults
 */
export async function resetConfig(): Promise<CLIConfig> {
  await saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

/**
 * Validate configuration
 */
export function validateConfig(config: Partial<CLIConfig>): boolean {
  const errors: string[] = [];

  if (config.baseUrl) {
    try {
      new URL(config.baseUrl);
    } catch {
      errors.push('baseUrl must be a valid URL');
    }
  }

  if (config.timeout && (config.timeout < 1000 || config.timeout > 60000)) {
    errors.push('timeout must be between 1000 and 60000 milliseconds');
  }

  if (config.output?.format && !['table', 'json'].includes(config.output.format)) {
    errors.push('output.format must be "table" or "json"');
  }

  if (errors.length > 0) {
    throw new ValidationError(`Configuration validation failed: ${errors.join(', ')}`);
  }

  return true;
}
