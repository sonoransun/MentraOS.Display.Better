import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError, AuthenticationError, AuthorizationError } from '../types';
import { logger } from '../infrastructure/logging/logger';
import { configManager } from '../infrastructure/config/app.config';

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    statusCode: number;
    timestamp: string;
    requestId?: string;
    details?: any;
  };
}

class ErrorHandler {
  /**
   * Global error handler middleware for Express
   */
  public static handleError(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (res.headersSent) {
      return next(error);
    }

    const requestId = req.headers['x-request-id'] as string;

    // Handle different types of errors
    if (error instanceof AppError) {
      ErrorHandler.handleAppError(error, res, requestId);
    } else if (error instanceof SyntaxError && 'body' in error) {
      ErrorHandler.handleJsonParseError(error, res, requestId);
    } else if (error.name === 'ValidationError') {
      ErrorHandler.handleValidationError(error, res, requestId);
    } else if (error.name === 'UnauthorizedError') {
      ErrorHandler.handleUnauthorizedError(error, res, requestId);
    } else {
      ErrorHandler.handleUnknownError(error, res, requestId);
    }
  }

  /**
   * Handle application-specific errors
   */
  private static handleAppError(error: AppError, res: Response, requestId?: string): void {
    logger.error('Application error', error, {
      component: 'error-handler',
      requestId,
      statusCode: error.statusCode,
      code: error.code,
      context: error.context,
    });

    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        timestamp: new Date().toISOString(),
        requestId,
        ...(configManager.isDevelopment() && { details: error.context }),
      },
    };

    res.status(error.statusCode).json(response);
  }

  /**
   * Handle JSON parsing errors
   */
  private static handleJsonParseError(error: SyntaxError, res: Response, requestId?: string): void {
    logger.warn('JSON parse error', error, {
      component: 'error-handler',
      requestId,
    });

    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'JSON_PARSE_ERROR',
        message: 'Invalid JSON in request body',
        statusCode: 400,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    res.status(400).json(response);
  }

  /**
   * Handle validation errors
   */
  private static handleValidationError(error: Error, res: Response, requestId?: string): void {
    logger.warn('Validation error', error, {
      component: 'error-handler',
      requestId,
    });

    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        statusCode: 400,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    res.status(400).json(response);
  }

  /**
   * Handle unauthorized errors
   */
  private static handleUnauthorizedError(error: Error, res: Response, requestId?: string): void {
    logger.warn('Unauthorized error', error, {
      component: 'error-handler',
      requestId,
    });

    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        statusCode: 401,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };

    res.status(401).json(response);
  }

  /**
   * Handle unknown errors
   */
  private static handleUnknownError(error: Error, res: Response, requestId?: string): void {
    logger.error('Unknown error', error, {
      component: 'error-handler',
      requestId,
      stack: error.stack,
    });

    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: configManager.isDevelopment()
          ? error.message
          : 'An unexpected error occurred',
        statusCode: 500,
        timestamp: new Date().toISOString(),
        requestId,
        ...(configManager.isDevelopment() && {
          details: {
            stack: error.stack,
            name: error.name
          }
        }),
      },
    };

    res.status(500).json(response);
  }

  /**
   * Async wrapper for route handlers
   */
  public static asyncHandler<T = any>(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
  ) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Handle unhandled promise rejections
   */
  public static handleUnhandledRejection(reason: any, promise: Promise<any>): void {
    logger.fatal('Unhandled promise rejection', reason, {
      component: 'error-handler',
      promise: promise.toString(),
    });

    // In production, we might want to gracefully shutdown
    if (configManager.isProduction()) {
      console.error('Unhandled promise rejection. Shutting down gracefully...');
      process.exit(1);
    }
  }

  /**
   * Handle uncaught exceptions
   */
  public static handleUncaughtException(error: Error): void {
    logger.fatal('Uncaught exception', error, {
      component: 'error-handler',
      stack: error.stack,
    });

    console.error('Uncaught exception. Shutting down...');
    process.exit(1);
  }

  /**
   * Validate and sanitize user input
   */
  public static validateInput<T>(
    input: any,
    schema: any,
    options: { stripUnknown?: boolean } = {}
  ): T {
    const { error, value } = schema.validate(input, {
      abortEarly: false,
      stripUnknown: options.stripUnknown ?? true,
      ...options,
    });

    if (error) {
      const details = error.details.map((detail: any) => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      throw new ValidationError('Input validation failed', { details });
    }

    return value as T;
  }

  /**
   * Create application-specific error factories
   */
  public static createError = {
    validation: (message: string, context?: any) =>
      new ValidationError(message, context),

    authentication: (message?: string, context?: any) =>
      new AuthenticationError(message, context),

    authorization: (message?: string, context?: any) =>
      new AuthorizationError(message, context),

    notFound: (resource: string, id?: string) =>
      new AppError(
        `${resource}${id ? ` with ID ${id}` : ''} not found`,
        'NOT_FOUND',
        404,
        { resource, id }
      ),

    conflict: (message: string, context?: any) =>
      new AppError(message, 'CONFLICT', 409, context),

    rateLimit: (message?: string) =>
      new AppError(
        message || 'Too many requests',
        'RATE_LIMIT_EXCEEDED',
        429
      ),

    serviceUnavailable: (service: string, context?: any) =>
      new AppError(
        `${service} service is currently unavailable`,
        'SERVICE_UNAVAILABLE',
        503,
        { service, ...context }
      ),

    aiProcessing: (operation: string, reason?: string) =>
      new AppError(
        `AI processing failed for ${operation}${reason ? `: ${reason}` : ''}`,
        'AI_PROCESSING_ERROR',
        500,
        { operation, reason }
      ),
  };

  /**
   * Performance monitoring wrapper
   */
  public static withPerformanceMonitoring<T extends any[], R>(
    operation: string,
    fn: (...args: T) => R | Promise<R>
  ) {
    return async (...args: T): Promise<R> => {
      const timer = logger.time(operation);
      const startMemory = process.memoryUsage();

      try {
        const result = await fn(...args);
        timer();

        const endMemory = process.memoryUsage();
        const memoryDelta = {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
        };

        logger.logPerformanceMetric(`${operation}_memory`, memoryDelta.heapUsed, 'bytes');

        return result;
      } catch (error) {
        timer();
        logger.error(`Operation failed: ${operation}`, error as Error);
        throw error;
      }
    };
  }

  /**
   * Circuit breaker pattern implementation
   */
  public static createCircuitBreaker(
    operation: string,
    options: {
      failureThreshold?: number;
      resetTimeout?: number;
      monitoringWindow?: number;
    } = {}
  ) {
    const {
      failureThreshold = 5,
      resetTimeout = 60000, // 1 minute
      monitoringWindow = 60000, // 1 minute
    } = options;

    let failures = 0;
    let lastFailureTime = 0;
    let state: 'closed' | 'open' | 'half-open' = 'closed';

    return async <T>(fn: () => Promise<T>): Promise<T> => {
      const now = Date.now();

      // Reset failure count if monitoring window has passed
      if (now - lastFailureTime > monitoringWindow) {
        failures = 0;
        if (state === 'open') {
          state = 'half-open';
        }
      }

      // If circuit is open and reset timeout hasn't passed
      if (state === 'open' && now - lastFailureTime < resetTimeout) {
        throw ErrorHandler.createError.serviceUnavailable(
          `Circuit breaker is open for ${operation}`
        );
      }

      try {
        const result = await fn();

        // Success - reset circuit if it was half-open
        if (state === 'half-open') {
          state = 'closed';
          failures = 0;
        }

        return result;
      } catch (error) {
        failures++;
        lastFailureTime = now;

        if (failures >= failureThreshold) {
          state = 'open';
          logger.warn(`Circuit breaker opened for ${operation}`, {
            component: 'circuit-breaker',
            operation,
            failures,
            failureThreshold,
          });
        }

        throw error;
      }
    };
  }
}

// Set up global error handlers
process.on('unhandledRejection', ErrorHandler.handleUnhandledRejection);
process.on('uncaughtException', ErrorHandler.handleUncaughtException);

export default ErrorHandler;