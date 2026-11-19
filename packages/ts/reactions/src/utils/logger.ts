/**
 * Logging utilities
 * @module utils/logger
 */

import winston from 'winston';
import type { LoggingOptions } from '../core/types.js';

/**
 * Options accepted by {@link createLogger}.
 */
export interface CreateLoggerOptions {
  level?: string;
  console?: boolean;
  file?: string;
}

/**
 * Create a Winston logger instance
 */
export function createLogger(options: CreateLoggerOptions = {}): winston.Logger {
  const { level = 'info', console: logToConsole = true, file } = options;

  const transports: winston.transport[] = [];

  if (logToConsole) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        ),
      })
    );
  }

  if (file) {
    transports.push(
      new winston.transports.File({
        filename: file,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      })
    );
  }

  return winston.createLogger({
    level,
    transports,
    exitOnError: false,
  });
}

/**
 * Setup logger based on configuration
 */
export function setupLogger(config: LoggingOptions = {}): winston.Logger {
  return createLogger({
    level: config.level || 'info',
    console: config.console !== false,
    file: config.file,
  });
}
