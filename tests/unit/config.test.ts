/**
 * Configuration management tests
 */

import { configManager } from '../../src/infrastructure/config/app.config';

describe('Configuration Management', () => {
  beforeEach(() => {
    // Reset any configuration changes
    jest.clearAllMocks();
  });

  describe('Config Loading', () => {
    it('should load configuration successfully', () => {
      const config = configManager.getConfig();

      expect(config).toBeDefined();
      expect(config.server).toBeDefined();
      expect(config.mentraos).toBeDefined();
      expect(config.redis).toBeDefined();
      expect(config.ai).toBeDefined();
      expect(config.security).toBeDefined();
      expect(config.features).toBeDefined();
      expect(config.logging).toBeDefined();
    });

    it('should have valid server configuration', () => {
      const config = configManager.getConfig();

      expect(config.server.port).toBeGreaterThan(0);
      expect(config.server.port).toBeLessThan(65536);
      expect(config.server.host).toBeDefined();
      expect(config.server.nodeEnv).toBeDefined();
    });

    it('should have valid MentraOS configuration', () => {
      const config = configManager.getConfig();

      expect(config.mentraos.packageName).toBeDefined();
      expect(config.mentraos.packageName.length).toBeGreaterThan(0);
      expect(config.mentraos.apiKey).toBeDefined();
      expect(config.mentraos.apiKey.length).toBeGreaterThan(0);
    });

    it('should have valid security configuration', () => {
      const config = configManager.getConfig();

      expect(config.security.jwtSecret).toBeDefined();
      expect(config.security.jwtSecret.length).toBeGreaterThanOrEqual(32);
      expect(config.security.encryptionKey).toBeDefined();
      expect(config.security.encryptionKey.length).toBeGreaterThanOrEqual(32);
      expect(config.security.sessionTimeout).toBeGreaterThan(0);
    });
  });

  describe('Environment Detection', () => {
    it('should correctly identify test environment', () => {
      expect(configManager.isTest()).toBe(true);
      expect(configManager.isDevelopment()).toBe(false);
      expect(configManager.isProduction()).toBe(false);
    });
  });

  describe('Config Access Methods', () => {
    it('should get nested config values', () => {
      const port = configManager.get<number>('server.port');
      const apiKey = configManager.get<string>('mentraos.apiKey');

      expect(typeof port).toBe('number');
      expect(typeof apiKey).toBe('string');
    });

    it('should handle invalid config paths gracefully', () => {
      const invalidValue = configManager.get('invalid.path.here');
      expect(invalidValue).toBeUndefined();
    });
  });

  describe('Feature Flags', () => {
    it('should have default feature flags', () => {
      const config = configManager.getConfig();

      expect(typeof config.features.multiPlatform).toBe('boolean');
      expect(typeof config.features.accessibility).toBe('boolean');
      expect(typeof config.features.spatialUI).toBe('boolean');
      expect(typeof config.features.analytics).toBe('boolean');
    });
  });
});