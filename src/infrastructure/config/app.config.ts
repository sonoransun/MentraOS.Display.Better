import Joi from 'joi';
import { AppConfig } from '../../types';

// Validation schema for environment variables
const envSchema = Joi.object({
  // Server configuration
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default('localhost'),

  // MentraOS configuration
  PACKAGE_NAME: Joi.string().required(),
  MENTRAOS_API_KEY: Joi.string().required(),

  // Redis configuration
  REDIS_URL: Joi.string().optional(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),

  // AI configuration
  ENABLE_VISION: Joi.boolean().default(true),
  ENABLE_NLP: Joi.boolean().default(true),
  ENABLE_TENSORFLOW: Joi.boolean().default(true),
  AI_MAX_CONCURRENT_REQUESTS: Joi.number().positive().default(10),

  // Security configuration
  JWT_SECRET: Joi.string().min(32).default('your-super-secret-jwt-key-change-in-production'),
  ENCRYPTION_KEY: Joi.string().min(32).default('your-super-secret-encryption-key-change-in-production'),
  ENABLE_BIOMETRIC: Joi.boolean().default(false),
  SESSION_TIMEOUT: Joi.number().positive().default(3600000), // 1 hour in ms

  // Feature flags
  ENABLE_MULTI_PLATFORM: Joi.boolean().default(true),
  ENABLE_ACCESSIBILITY: Joi.boolean().default(true),
  ENABLE_SPATIAL_UI: Joi.boolean().default(true),
  ENABLE_ANALYTICS: Joi.boolean().default(true),

  // Logging configuration
  LOG_LEVEL: Joi.string().valid('trace', 'debug', 'info', 'warn', 'error', 'fatal').default('info'),
  LOG_ENABLE_CONSOLE: Joi.boolean().default(true),
  LOG_ENABLE_FILE: Joi.boolean().default(false),
}).unknown(true);

class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfiguration();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfiguration(): AppConfig {
    const { error, value } = envSchema.validate(process.env, {
      allowUnknown: true,
      stripUnknown: false
    });

    if (error) {
      throw new Error(`Configuration validation error: ${error.details.map(d => d.message).join(', ')}`);
    }

    return {
      server: {
        port: value.PORT,
        host: value.HOST,
        nodeEnv: value.NODE_ENV,
      },
      mentraos: {
        packageName: value.PACKAGE_NAME,
        apiKey: value.MENTRAOS_API_KEY,
      },
      redis: {
        url: value.REDIS_URL || `redis://${value.REDIS_HOST}:${value.REDIS_PORT}`,
        host: value.REDIS_HOST,
        port: value.REDIS_PORT,
        password: value.REDIS_PASSWORD,
      },
      ai: {
        enableVision: value.ENABLE_VISION,
        enableNLP: value.ENABLE_NLP,
        enableTensorFlow: value.ENABLE_TENSORFLOW,
        maxConcurrentRequests: value.AI_MAX_CONCURRENT_REQUESTS,
      },
      security: {
        jwtSecret: value.JWT_SECRET,
        encryptionKey: value.ENCRYPTION_KEY,
        enableBiometric: value.ENABLE_BIOMETRIC,
        sessionTimeout: value.SESSION_TIMEOUT,
      },
      features: {
        multiPlatform: value.ENABLE_MULTI_PLATFORM,
        accessibility: value.ENABLE_ACCESSIBILITY,
        spatialUI: value.ENABLE_SPATIAL_UI,
        analytics: value.ENABLE_ANALYTICS,
      },
      logging: {
        level: value.LOG_LEVEL,
        enableConsole: value.LOG_ENABLE_CONSOLE,
        enableFile: value.LOG_ENABLE_FILE,
      },
    };
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public get<T>(path: string): T {
    return this.getNestedValue(this.config, path);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  public updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public isDevelopment(): boolean {
    return this.config.server.nodeEnv === 'development';
  }

  public isProduction(): boolean {
    return this.config.server.nodeEnv === 'production';
  }

  public isTest(): boolean {
    return this.config.server.nodeEnv === 'test';
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance().getConfig();
export const configManager = ConfigManager.getInstance();
export default ConfigManager;