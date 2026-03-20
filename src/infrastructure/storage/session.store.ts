import Redis from 'ioredis';
import { SessionContext, SessionState, UserPreferences, DeviceCapabilities } from '../../types';
import { configManager } from '../config/app.config';
import { logger } from '../logging/logger';

interface StoredSession {
  context: SessionContext;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

class SessionStore {
  private static instance: SessionStore;
  private redis: Redis;
  private readonly keyPrefix = 'session:';
  private readonly userKeyPrefix = 'user:';
  private readonly defaultTTL = 86400; // 24 hours in seconds

  private constructor() {
    const config = configManager.getConfig();

    this.redis = new Redis(config.redis.url, {
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    this.setupEventHandlers();
  }

  public static getInstance(): SessionStore {
    if (!SessionStore.instance) {
      SessionStore.instance = new SessionStore();
    }
    return SessionStore.instance;
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('Connected to Redis', { component: 'session-store' });
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', error, { component: 'session-store' });
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed', { component: 'session-store' });
    });

    this.redis.on('reconnecting', (delay) => {
      logger.info('Reconnecting to Redis', { component: 'session-store', delay });
    });
  }

  // Session management
  public async createSession(sessionId: string, userId: string, context: Partial<SessionContext>): Promise<SessionContext> {
    const now = new Date();
    const sessionContext: SessionContext = {
      sessionId,
      userId,
      deviceType: context.deviceType || 'glasses',
      capabilities: context.capabilities || this.getDefaultCapabilities(),
      preferences: context.preferences || await this.getUserPreferences(userId),
      state: {
        isActive: true,
        connectedAt: now,
        lastActivity: now,
        currentView: { type: 'main', content: null },
        aiContext: {
          conversationHistory: [],
          environmentContext: this.getDefaultEnvironmentContext(),
        },
      },
    };

    const storedSession: StoredSession = {
      context: sessionContext,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + configManager.getConfig().security.sessionTimeout),
    };

    const key = this.getSessionKey(sessionId);
    await this.redis.setex(key, this.defaultTTL, JSON.stringify(storedSession));

    // Index session by user
    await this.redis.sadd(this.getUserSessionsKey(userId), sessionId);

    logger.logSessionEvent('session_created', sessionId, userId, { deviceType: context.deviceType });

    return sessionContext;
  }

  public async getSession(sessionId: string): Promise<SessionContext | null> {
    try {
      const key = this.getSessionKey(sessionId);
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      const storedSession: StoredSession = JSON.parse(data);

      // Check if session has expired
      if (new Date() > new Date(storedSession.expiresAt)) {
        await this.deleteSession(sessionId);
        return null;
      }

      return storedSession.context;
    } catch (error) {
      logger.error('Failed to get session', error as Error, { sessionId });
      return null;
    }
  }

  public async updateSession(sessionId: string, updates: Partial<SessionContext>): Promise<boolean> {
    try {
      const existingSession = await this.getSession(sessionId);
      if (!existingSession) {
        return false;
      }

      const updatedContext: SessionContext = {
        ...existingSession,
        ...updates,
        state: {
          ...existingSession.state,
          ...updates.state,
          lastActivity: new Date(),
        },
      };

      const storedSession: StoredSession = {
        context: updatedContext,
        createdAt: new Date(existingSession.state.connectedAt),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + configManager.getConfig().security.sessionTimeout),
      };

      const key = this.getSessionKey(sessionId);
      await this.redis.setex(key, this.defaultTTL, JSON.stringify(storedSession));

      return true;
    } catch (error) {
      logger.error('Failed to update session', error as Error, { sessionId });
      return false;
    }
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (session) {
        // Remove from user sessions index
        await this.redis.srem(this.getUserSessionsKey(session.userId), sessionId);
      }

      const key = this.getSessionKey(sessionId);
      const deleted = await this.redis.del(key);

      if (deleted && session) {
        logger.logSessionEvent('session_deleted', sessionId, session.userId);
      }

      return deleted > 0;
    } catch (error) {
      logger.error('Failed to delete session', error as Error, { sessionId });
      return false;
    }
  }

  public async getUserSessions(userId: string): Promise<string[]> {
    try {
      const sessionIds = await this.redis.smembers(this.getUserSessionsKey(userId));

      // Validate sessions still exist and aren't expired
      const validSessions: string[] = [];
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          validSessions.push(sessionId);
        } else {
          // Remove invalid session from index
          await this.redis.srem(this.getUserSessionsKey(userId), sessionId);
        }
      }

      return validSessions;
    } catch (error) {
      logger.error('Failed to get user sessions', error as Error, { userId });
      return [];
    }
  }

  // User preferences management
  public async getUserPreferences(userId: string): Promise<UserPreferences> {
    try {
      const key = this.getUserKey(userId, 'preferences');
      const data = await this.redis.get(key);

      if (data) {
        return JSON.parse(data);
      }

      // Return default preferences if none exist
      return this.getDefaultUserPreferences();
    } catch (error) {
      logger.error('Failed to get user preferences', error as Error, { userId });
      return this.getDefaultUserPreferences();
    }
  }

  public async setUserPreferences(userId: string, preferences: UserPreferences): Promise<boolean> {
    try {
      const key = this.getUserKey(userId, 'preferences');
      await this.redis.setex(key, this.defaultTTL * 30, JSON.stringify(preferences)); // 30 days TTL

      logger.logUserAction('preferences_updated', 'system', userId, { preferences });
      return true;
    } catch (error) {
      logger.error('Failed to set user preferences', error as Error, { userId });
      return false;
    }
  }

  // Cache management for AI context
  public async cacheAIContext(sessionId: string, context: any, ttl: number = 3600): Promise<boolean> {
    try {
      const key = this.getAIContextKey(sessionId);
      await this.redis.setex(key, ttl, JSON.stringify(context));
      return true;
    } catch (error) {
      logger.error('Failed to cache AI context', error as Error, { sessionId });
      return false;
    }
  }

  public async getAIContext(sessionId: string): Promise<any | null> {
    try {
      const key = this.getAIContextKey(sessionId);
      const data = await this.redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get AI context', error as Error, { sessionId });
      return null;
    }
  }

  // Analytics and metrics
  public async recordMetric(metric: string, value: number, labels?: Record<string, string>): Promise<boolean> {
    try {
      const key = `metrics:${metric}:${Date.now()}`;
      const data = { value, labels, timestamp: new Date() };
      await this.redis.setex(key, 86400, JSON.stringify(data)); // 24 hours TTL
      return true;
    } catch (error) {
      logger.error('Failed to record metric', error as Error, { metric, value });
      return false;
    }
  }

  public async getMetrics(metric: string, since: Date): Promise<Array<{ value: number; labels?: Record<string, string>; timestamp: Date }>> {
    try {
      const pattern = `metrics:${metric}:*`;
      const keys = await this.redis.keys(pattern);

      const metrics: Array<{ value: number; labels?: Record<string, string>; timestamp: Date }> = [];

      for (const key of keys) {
        const timestamp = parseInt(key.split(':')[2]);
        if (timestamp >= since.getTime()) {
          const data = await this.redis.get(key);
          if (data) {
            metrics.push(JSON.parse(data));
          }
        }
      }

      return metrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      logger.error('Failed to get metrics', error as Error, { metric });
      return [];
    }
  }

  // Health check
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis health check failed', error as Error);
      return false;
    }
  }

  // Cleanup expired sessions
  public async cleanupExpiredSessions(): Promise<number> {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      let cleaned = 0;

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const storedSession: StoredSession = JSON.parse(data);
          if (new Date() > new Date(storedSession.expiresAt)) {
            const sessionId = key.replace(this.keyPrefix, '');
            await this.deleteSession(sessionId);
            cleaned++;
          }
        }
      }

      logger.info('Cleaned up expired sessions', { component: 'session-store', cleaned });
      return cleaned;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', error as Error);
      return 0;
    }
  }

  // Private helper methods
  private getSessionKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  private getUserSessionsKey(userId: string): string {
    return `${this.userKeyPrefix}${userId}:sessions`;
  }

  private getUserKey(userId: string, suffix: string): string {
    return `${this.userKeyPrefix}${userId}:${suffix}`;
  }

  private getAIContextKey(sessionId: string): string {
    return `ai:context:${sessionId}`;
  }

  private getDefaultCapabilities(): DeviceCapabilities {
    return {
      hasCamera: true,
      hasMicrophone: true,
      hasDisplay: true,
      hasSpeakers: true,
      hasEyeTracking: false,
      hasGestureRecognition: false,
      supports3D: true,
      supportsHaptics: false,
    };
  }

  private getDefaultUserPreferences(): UserPreferences {
    return {
      language: 'en',
      voiceEnabled: true,
      visualTheme: 'auto',
      accessibility: {
        fontSize: 'medium',
        highContrast: false,
        voiceNavigation: false,
        eyeTracking: false,
        gestureNavigation: false,
        spatialAudio: false,
      },
      privacy: {
        dataCollection: 'standard',
        biometricAuth: false,
        locationTracking: false,
        usageAnalytics: true,
        personalizedContent: true,
      },
      ai: {
        autoTranslation: false,
        contextAwareness: true,
        predictiveAssistance: true,
        emotionRecognition: false,
        objectRecognition: true,
      },
    };
  }

  private getDefaultEnvironmentContext(): any {
    return {
      ambientSound: {
        volume: 0,
        frequency: { low: 0, mid: 0, high: 0 },
        noiseLevel: 0,
        speechPresent: false,
      },
      lighting: {
        ambientIntensity: 0.5,
        primaryDirection: { x: 0, y: 1, z: 0 },
        colorTemperature: 6500,
      },
      activity: {
        type: 'unknown',
        confidence: 0,
        movement: {
          acceleration: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        },
      },
    };
  }

  // Graceful shutdown
  public async disconnect(): Promise<void> {
    await this.redis.disconnect();
    logger.info('Disconnected from Redis', { component: 'session-store' });
  }
}

// Export singleton instance
export const sessionStore = SessionStore.getInstance();
export default SessionStore;