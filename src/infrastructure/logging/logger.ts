import pino from 'pino';
import { configManager } from '../config/app.config';

interface LogContext {
  sessionId?: string;
  userId?: string;
  component?: string;
  operation?: string;
  requestId?: string;
  duration?: number;
  error?: Error;
  [key: string]: any;
}

class Logger {
  private static instance: Logger;
  private logger: pino.Logger;

  private constructor() {
    const config = configManager.getConfig();

    const loggerOptions: pino.LoggerOptions = {
      level: config.logging.level,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
        log(object) {
          // Extract and format error objects
          if (object.error && object.error instanceof Error) {
            return {
              ...object,
              error: {
                name: object.error.name,
                message: object.error.message,
                stack: object.error.stack,
              },
            };
          }
          return object;
        },
      },
      serializers: {
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
    };

    // Configure transport for development
    if (configManager.isDevelopment() && config.logging.enableConsole) {
      loggerOptions.transport = {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      };
    }

    this.logger = pino(loggerOptions);
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public trace(message: string, context?: LogContext): void {
    this.logger.trace(context, message);
  }

  public debug(message: string, context?: LogContext): void {
    this.logger.debug(context, message);
  }

  public info(message: string, context?: LogContext): void {
    this.logger.info(context, message);
  }

  public warn(message: string, context?: LogContext): void {
    this.logger.warn(context, message);
  }

  public error(message: string, error?: Error, context?: LogContext): void {
    this.logger.error({ ...context, error }, message);
  }

  public fatal(message: string, error?: Error, context?: LogContext): void {
    this.logger.fatal({ ...context, error }, message);
  }

  // Specialized logging methods for different components
  public logSessionEvent(event: string, sessionId: string, userId: string, data?: any): void {
    this.info(`Session event: ${event}`, {
      component: 'session',
      sessionId,
      userId,
      event,
      data,
    });
  }

  public logAIOperation(operation: string, sessionId: string, duration: number, success: boolean, data?: any): void {
    const level = success ? 'info' : 'warn';
    this[level](`AI operation: ${operation} ${success ? 'completed' : 'failed'}`, {
      component: 'ai',
      operation,
      sessionId,
      duration,
      success,
      data,
    });
  }

  public logVisionEvent(event: string, sessionId: string, confidence: number, data?: any): void {
    this.info(`Vision event: ${event}`, {
      component: 'vision',
      event,
      sessionId,
      confidence,
      data,
    });
  }

  public logSecurityEvent(event: string, sessionId?: string, userId?: string, success?: boolean, data?: any): void {
    const level = success === false ? 'warn' : 'info';
    this[level](`Security event: ${event}`, {
      component: 'security',
      event,
      sessionId,
      userId,
      success,
      data,
    });
  }

  public logPerformanceMetric(metric: string, value: number, unit: string, context?: LogContext): void {
    this.info(`Performance metric: ${metric}`, {
      component: 'performance',
      metric,
      value,
      unit,
      ...context,
    });
  }

  public logAPICall(method: string, url: string, statusCode: number, duration: number, context?: LogContext): void {
    const level = statusCode >= 400 ? 'warn' : 'info';
    this[level](`API call: ${method} ${url}`, {
      component: 'api',
      method,
      url,
      statusCode,
      duration,
      ...context,
    });
  }

  public logUserAction(action: string, sessionId: string, userId: string, data?: any): void {
    this.info(`User action: ${action}`, {
      component: 'user',
      action,
      sessionId,
      userId,
      data,
    });
  }

  public logSystemMetric(metric: string, value: number, timestamp?: Date): void {
    this.info(`System metric: ${metric}`, {
      component: 'system',
      metric,
      value,
      timestamp: timestamp || new Date(),
    });
  }

  // Create child logger with persistent context
  public createChild(context: LogContext): pino.Logger {
    return this.logger.child(context);
  }

  // Create request logger for HTTP requests
  public createRequestLogger(requestId: string): pino.Logger {
    return this.logger.child({ requestId, component: 'http' });
  }

  // Performance timing utility
  public time(label: string, context?: LogContext): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.logPerformanceMetric(label, Math.round(duration * 100) / 100, 'ms', context);
    };
  }

  // Async operation wrapper with logging
  public async loggedOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const timer = this.time(operation, context);
    this.debug(`Starting operation: ${operation}`, context);

    try {
      const result = await fn();
      timer();
      this.info(`Operation completed: ${operation}`, context);
      return result;
    } catch (error) {
      timer();
      this.error(`Operation failed: ${operation}`, error as Error, context);
      throw error;
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
export default Logger;