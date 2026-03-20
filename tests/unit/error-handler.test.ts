/**
 * Error handling tests
 */

import ErrorHandler from '../../src/utils/error-handler';
import { AppError, ValidationError, AuthenticationError, AuthorizationError } from '../../src/types';
import Joi from 'joi';

describe('Error Handler', () => {
  describe('Error Creation Factories', () => {
    it('should create validation errors', () => {
      const error = ErrorHandler.createError.validation('Invalid input', { field: 'email' });

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.context).toEqual({ field: 'email' });
    });

    it('should create authentication errors', () => {
      const error = ErrorHandler.createError.authentication();

      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe('Authentication failed');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('should create authorization errors', () => {
      const error = ErrorHandler.createError.authorization();

      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.message).toBe('Authorization failed');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
    });

    it('should create not found errors', () => {
      const error = ErrorHandler.createError.notFound('User', '123');

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('User with ID 123 not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });

    it('should create rate limit errors', () => {
      const error = ErrorHandler.createError.rateLimit('Custom rate limit message');

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Custom rate limit message');
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.statusCode).toBe(429);
    });

    it('should create service unavailable errors', () => {
      const error = ErrorHandler.createError.serviceUnavailable('Redis', { reason: 'Connection timeout' });

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Redis service is currently unavailable');
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.statusCode).toBe(503);
      expect(error.context?.service).toBe('Redis');
      expect(error.context?.reason).toBe('Connection timeout');
    });

    it('should create AI processing errors', () => {
      const error = ErrorHandler.createError.aiProcessing('image-recognition', 'Model not loaded');

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('AI processing failed for image-recognition: Model not loaded');
      expect(error.code).toBe('AI_PROCESSING_ERROR');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('Input Validation', () => {
    it('should validate valid input successfully', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().min(0).required(),
      });

      const input = { name: 'John', age: 25 };
      const result = ErrorHandler.validateInput(input, schema);

      expect(result).toEqual(input);
    });

    it('should throw validation error for invalid input', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
        age: Joi.number().min(0).required(),
      });

      const input = { name: '', age: -1 };

      expect(() => {
        ErrorHandler.validateInput(input, schema);
      }).toThrow(ValidationError);
    });

    it('should strip unknown fields when stripUnknown is true', () => {
      const schema = Joi.object({
        name: Joi.string().required(),
      });

      const input = { name: 'John', unknownField: 'value' };
      const result = ErrorHandler.validateInput(input, schema, { stripUnknown: true });

      expect(result).toEqual({ name: 'John' });
      expect(result.unknownField).toBeUndefined();
    });
  });

  describe('Async Handler Wrapper', () => {
    it('should handle successful async operations', async () => {
      const mockRequest = {} as any;
      const mockResponse = {} as any;
      const mockNext = jest.fn();

      const asyncFunction = jest.fn().mockResolvedValue('success');
      const wrappedHandler = ErrorHandler.asyncHandler(asyncFunction);

      await wrappedHandler(mockRequest, mockResponse, mockNext);

      expect(asyncFunction).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle async operation errors', async () => {
      const mockRequest = {} as any;
      const mockResponse = {} as any;
      const mockNext = jest.fn();

      const error = new Error('Async operation failed');
      const asyncFunction = jest.fn().mockRejectedValue(error);
      const wrappedHandler = ErrorHandler.asyncHandler(asyncFunction);

      await wrappedHandler(mockRequest, mockResponse, mockNext);

      expect(asyncFunction).toHaveBeenCalledWith(mockRequest, mockResponse, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('Performance Monitoring Wrapper', () => {
    it('should monitor successful operations', async () => {
      const operation = jest.fn().mockResolvedValue('result');
      const monitoredOperation = ErrorHandler.withPerformanceMonitoring('test-operation', operation);

      const result = await monitoredOperation('arg1', 'arg2');

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should monitor failed operations', async () => {
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);
      const monitoredOperation = ErrorHandler.withPerformanceMonitoring('test-operation', operation);

      await expect(monitoredOperation('arg1', 'arg2')).rejects.toThrow('Operation failed');
      expect(operation).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('Circuit Breaker', () => {
    it('should allow operations when circuit is closed', async () => {
      const circuitBreaker = ErrorHandler.createCircuitBreaker('test-operation', {
        failureThreshold: 3,
        resetTimeout: 1000,
      });

      const operation = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should open circuit after failure threshold', async () => {
      const circuitBreaker = ErrorHandler.createCircuitBreaker('test-operation', {
        failureThreshold: 2,
        resetTimeout: 10000, // Long timeout for this test
      });

      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      // First failure
      await expect(circuitBreaker(operation)).rejects.toThrow('Operation failed');

      // Second failure - should open circuit
      await expect(circuitBreaker(operation)).rejects.toThrow('Operation failed');

      // Third attempt - should be blocked by circuit breaker
      await expect(circuitBreaker(operation)).rejects.toThrow('Circuit breaker is open');

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });
});