/**
 * Test setup configuration
 */

import 'dotenv/config';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.PACKAGE_NAME = 'org.test.app';
process.env.MENTRAOS_API_KEY = 'test-api-key';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing-purposes';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidDate(): R;
      toBeValidSessionId(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidDate(received: any) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    return {
      message: () =>
        pass
          ? `Expected ${received} not to be a valid date`
          : `Expected ${received} to be a valid date`,
      pass,
    };
  },

  toBeValidSessionId(received: any) {
    const pass = typeof received === 'string' && received.length > 0;
    return {
      message: () =>
        pass
          ? `Expected ${received} not to be a valid session ID`
          : `Expected ${received} to be a valid session ID`,
      pass,
    };
  },
});

export {};