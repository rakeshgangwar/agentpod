type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  component: string;
  message: string;
  context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

class Logger {
  private component: string;
  private service = 'agentpod-api';

  constructor(component: string) {
    this.component = component;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      component: this.component,
      message,
      ...(context && Object.keys(context).length > 0 ? { context } : {}),
    };

    const output = formatLog(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  child(additionalContext: LogContext): Logger {
    const childLogger = new Logger(this.component);
    const originalLog = childLogger.log.bind(childLogger);
    
    childLogger.log = (level: LogLevel, message: string, context?: LogContext) => {
      originalLog(level, message, { ...additionalContext, ...context });
    };
    
    return childLogger;
  }
}

export function createLogger(component: string): Logger {
  return new Logger(component);
}

export function logRequest(
  logger: Logger,
  method: string,
  path: string,
  status: number,
  durationMs: number,
  userId?: string,
  requestId?: string
): void {
  const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
  
  logger[level](`${method} ${path} ${status}`, {
    method,
    path,
    status,
    durationMs,
    userId,
    requestId,
  });
}

export type { Logger };
