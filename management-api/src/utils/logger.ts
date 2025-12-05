/**
 * Simple logger utility
 * Can be replaced with a more sophisticated logging library later
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, context: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
  
  if (data !== undefined) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

export function createLogger(context: string) {
  return {
    debug(message: string, data?: unknown) {
      if (shouldLog('debug')) {
        console.debug(formatMessage('debug', context, message, data));
      }
    },
    
    info(message: string, data?: unknown) {
      if (shouldLog('info')) {
        console.info(formatMessage('info', context, message, data));
      }
    },
    
    warn(message: string, data?: unknown) {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', context, message, data));
      }
    },
    
    error(message: string, data?: unknown) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', context, message, data));
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
