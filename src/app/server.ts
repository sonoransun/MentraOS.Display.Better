import { AppServer, AppSession, ViewType } from '@mentra/sdk';
import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { configManager, config } from '../infrastructure/config/app.config';
import { logger } from '../infrastructure/logging/logger';
import { sessionStore } from '../infrastructure/storage/session.store';
import { SessionContext, SystemEvents, AppError } from '../types';
import ErrorHandler from '../utils/error-handler';
import TranscriptionHandler from '../core/handlers/transcription.handler';
import BatteryHandler from '../core/handlers/battery.handler';
import { RateLimiterMemory } from 'rate-limiter-flexible';

interface EnhancedAppSession extends AppSession {
  sessionId: string;
  userId: string;
  context: SessionContext;
  startTime: Date;
}

class EnhancedMentraOSApp extends AppServer {
  private app: Application;
  private httpServer: any;
  private io: SocketIOServer;
  private transcriptionHandler: TranscriptionHandler;
  private batteryHandler: BatteryHandler;
  private activeSessions: Map<string, EnhancedAppSession> = new Map();
  private rateLimiter: RateLimiterMemory;

  // Performance monitoring
  private metrics: {
    sessionsCreated: number;
    transcriptionEvents: number;
    batteryEvents: number;
    errors: number;
    uptime: Date;
  };

  constructor() {
    super({
      packageName: config.mentraos.packageName,
      apiKey: config.mentraos.apiKey,
      port: config.server.port,
    });

    this.metrics = {
      sessionsCreated: 0,
      transcriptionEvents: 0,
      batteryEvents: 0,
      errors: 0,
      uptime: new Date(),
    };

    this.initializeApplication();
    this.initializeHandlers();
    this.setupRateLimiting();
    this.setupGracefulShutdown();
  }

  /**
   * Initialize Express application and middleware
   */
  private initializeApplication(): void {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
      },
    });

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
        },
      },
    }));

    this.app.use(cors());

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.headers['x-request-id'] = req.headers['x-request-id'] ||
        `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      const requestLogger = logger.createRequestLogger(req.headers['x-request-id'] as string);

      requestLogger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.logAPICall(req.method, req.url, res.statusCode, duration, {
          requestId: req.headers['x-request-id'] as string,
        });
      });

      next();
    });

    this.setupAPIRoutes();
    this.setupWebSocketHandlers();

    // Global error handler
    this.app.use(ErrorHandler.handleError);
  }

  /**
   * Initialize event handlers
   */
  private initializeHandlers(): void {
    this.transcriptionHandler = new TranscriptionHandler();
    this.batteryHandler = new BatteryHandler();

    logger.info('Event handlers initialized', { component: 'app-server' });
  }

  /**
   * Setup rate limiting
   */
  private setupRateLimiting(): void {
    this.rateLimiter = new RateLimiterMemory({
      keyGenerator: (req) => req.ip || 'unknown',
      points: 100, // Number of requests
      duration: 60, // Per 60 seconds
    });

    this.app.use(async (req, res, next) => {
      try {
        await this.rateLimiter.consume(req.ip || 'unknown');
        next();
      } catch {
        res.status(429).json({
          error: 'Too many requests. Please try again later.',
        });
      }
    });
  }

  /**
   * Setup API routes for multi-platform support
   */
  private setupAPIRoutes(): void {
    // Health check endpoint
    this.app.get('/health', async (req, res) => {
      const redisHealthy = await sessionStore.healthCheck();

      const health = {
        status: redisHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.metrics.uptime.getTime(),
        version: '1.0.0',
        services: {
          redis: redisHealthy ? 'up' : 'down',
          sessions: this.activeSessions.size,
        },
        metrics: this.metrics,
      };

      res.status(redisHealthy ? 200 : 503).json(health);
    });

    // Session management API
    this.app.get('/api/sessions', async (req, res) => {
      try {
        const sessions = Array.from(this.activeSessions.values()).map(session => ({
          sessionId: session.sessionId,
          userId: session.userId,
          deviceType: session.context.deviceType,
          connectedAt: session.startTime,
          isActive: session.context.state.isActive,
        }));

        res.json({ sessions });
      } catch (error) {
        logger.error('Failed to get sessions', error as Error);
        res.status(500).json({ error: 'Failed to retrieve sessions' });
      }
    });

    // Session details API
    this.app.get('/api/sessions/:sessionId', async (req, res) => {
      try {
        const sessionId = req.params.sessionId;
        const session = this.activeSessions.get(sessionId);

        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        const batteryHealth = await this.batteryHandler.getBatteryHealthSummary(sessionId);

        res.json({
          session: {
            sessionId: session.sessionId,
            userId: session.userId,
            context: session.context,
            batteryHealth,
            connectedAt: session.startTime,
          },
        });
      } catch (error) {
        logger.error('Failed to get session details', error as Error, { sessionId: req.params.sessionId });
        res.status(500).json({ error: 'Failed to retrieve session details' });
      }
    });

    // Send message to session API
    this.app.post('/api/sessions/:sessionId/message', async (req, res) => {
      try {
        const sessionId = req.params.sessionId;
        const { message, duration = 3000, style } = req.body;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }

        await session.layouts.showTextWall(message, {
          view: ViewType.MAIN,
          durationMs: duration,
          style,
        });

        logger.logUserAction('api_message_sent', sessionId, 'api', { message });

        res.json({ success: true, message: 'Message sent to glasses' });
      } catch (error) {
        logger.error('Failed to send message to session', error as Error, { sessionId: req.params.sessionId });
        res.status(500).json({ error: 'Failed to send message' });
      }
    });

    // Analytics endpoint
    this.app.get('/api/analytics', async (req, res) => {
      try {
        const since = new Date(req.query.since as string || Date.now() - 86400000); // Default 24h

        const batteryMetrics = await sessionStore.getMetrics('battery_level', since);
        const transcriptionMetrics = await sessionStore.getMetrics('transcription_count', since);

        res.json({
          period: {
            since: since.toISOString(),
            until: new Date().toISOString(),
          },
          metrics: {
            battery: batteryMetrics,
            transcription: transcriptionMetrics,
            system: this.metrics,
          },
        });
      } catch (error) {
        logger.error('Failed to get analytics', error as Error);
        res.status(500).json({ error: 'Failed to retrieve analytics' });
      }
    });

    logger.info('API routes configured', { component: 'app-server' });
  }

  /**
   * Setup WebSocket handlers for real-time communication
   */
  private setupWebSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info('WebSocket client connected', { socketId: socket.id });

      socket.on('join_session', async (data: { sessionId: string }) => {
        const session = this.activeSessions.get(data.sessionId);
        if (session) {
          socket.join(`session_${data.sessionId}`);
          socket.emit('session_joined', {
            sessionId: data.sessionId,
            context: session.context,
          });
        } else {
          socket.emit('error', { message: 'Session not found' });
        }
      });

      socket.on('send_message', async (data: { sessionId: string; message: string }) => {
        const session = this.activeSessions.get(data.sessionId);
        if (session) {
          await session.layouts.showTextWall(data.message, {
            view: ViewType.MAIN,
            durationMs: 3000,
          });

          this.io.to(`session_${data.sessionId}`).emit('message_sent', {
            message: data.message,
            timestamp: new Date(),
          });
        }
      });

      socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected', { socketId: socket.id });
      });
    });

    logger.info('WebSocket handlers configured', { component: 'app-server' });
  }

  /**
   * Enhanced session handler that replaces the original onSession
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    const timer = logger.time('session-creation');

    try {
      // Create enhanced session context
      const sessionContext = await sessionStore.createSession(sessionId, userId, {
        deviceType: 'glasses',
      });

      const enhancedSession: EnhancedAppSession = {
        ...session,
        sessionId,
        userId,
        context: sessionContext,
        startTime: new Date(),
      };

      // Store session
      this.activeSessions.set(sessionId, enhancedSession);
      this.metrics.sessionsCreated++;

      timer();

      logger.logSessionEvent('session_started', sessionId, userId, {
        deviceType: sessionContext.deviceType,
        capabilities: sessionContext.capabilities,
      });

      // Show enhanced welcome message
      await this.showWelcomeMessage(session, sessionContext);

      // Setup event handlers
      await this.setupSessionEventHandlers(session, sessionId, userId, sessionContext);

      // Emit session started event to WebSocket clients
      this.io.emit('session_started', {
        sessionId,
        userId,
        context: sessionContext,
      });

      // Schedule session health check
      this.scheduleSessionHealthCheck(sessionId);

    } catch (error) {
      this.metrics.errors++;
      timer();
      logger.error('Failed to initialize session', error as Error, { sessionId, userId });
      await this.showErrorMessage(session, 'Failed to initialize session. Please try reconnecting.');
    }
  }

  /**
   * Show enhanced welcome message with user preferences
   */
  private async showWelcomeMessage(session: AppSession, context: SessionContext): Promise<void> {
    try {
      const welcomeMessage = `Welcome to Enhanced MentraOS!
Voice commands, AI vision, and real-time translation ready.
Battery: Monitoring started
Language: ${context.preferences.language}`;

      await session.layouts.showTextWall(welcomeMessage, {
        view: ViewType.MAIN,
        durationMs: 4000,
        style: {
          fontSize: context.preferences.accessibility.fontSize,
          color: '#4CAF50',
        },
      });

    } catch (error) {
      logger.error('Failed to show welcome message', error as Error);
    }
  }

  /**
   * Setup enhanced event handlers for the session
   */
  private async setupSessionEventHandlers(
    session: AppSession,
    sessionId: string,
    userId: string,
    context: SessionContext
  ): Promise<void> {
    try {
      // Enhanced transcription handler
      session.events.onTranscription(async (data) => {
        this.metrics.transcriptionEvents++;
        await this.transcriptionHandler.handleTranscription(session, sessionId, data);

        // Emit to WebSocket clients
        this.io.to(`session_${sessionId}`).emit('transcription', {
          sessionId,
          text: data.text,
          isFinal: data.isFinal,
          timestamp: new Date(),
        });
      });

      // Enhanced battery handler
      session.events.onGlassesBattery(async (data) => {
        this.metrics.batteryEvents++;
        await this.batteryHandler.handleBattery(session, sessionId, data);

        // Emit to WebSocket clients
        this.io.to(`session_${sessionId}`).emit('battery_update', {
          sessionId,
          level: data.level,
          isCharging: data.isCharging,
          timestamp: new Date(),
        });
      });

      // Add camera handler if available (for future AI vision features)
      if (session.events.onCameraFrame) {
        session.events.onCameraFrame(async (data) => {
          // Will be implemented in Phase 2 with computer vision
          logger.debug('Camera frame received', { sessionId, frameSize: data?.length || 0 });
        });
      }

      logger.info('Session event handlers configured', { sessionId, userId });

    } catch (error) {
      logger.error('Failed to setup session event handlers', error as Error, { sessionId });
    }
  }

  /**
   * Schedule periodic health check for session
   */
  private scheduleSessionHealthCheck(sessionId: string): void {
    const healthCheckInterval = setInterval(async () => {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        clearInterval(healthCheckInterval);
        return;
      }

      try {
        // Update last activity
        session.context.state.lastActivity = new Date();
        await sessionStore.updateSession(sessionId, session.context);

        // Check for session timeout
        const inactiveTime = Date.now() - session.context.state.lastActivity.getTime();
        if (inactiveTime > config.security.sessionTimeout) {
          logger.warn('Session timeout', { sessionId, inactiveTime });
          await this.cleanupSession(sessionId);
          clearInterval(healthCheckInterval);
        }

      } catch (error) {
        logger.error('Session health check failed', error as Error, { sessionId });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Cleanup session when disconnected
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    try {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        const duration = Date.now() - session.startTime.getTime();

        await sessionStore.deleteSession(sessionId);
        this.activeSessions.delete(sessionId);

        logger.logSessionEvent('session_ended', sessionId, session.userId, { duration });

        // Emit session ended event
        this.io.emit('session_ended', {
          sessionId,
          userId: session.userId,
          duration,
        });
      }

    } catch (error) {
      logger.error('Failed to cleanup session', error as Error, { sessionId });
    }
  }

  /**
   * Show error message to user
   */
  private async showErrorMessage(session: AppSession, message: string): Promise<void> {
    try {
      await session.layouts.showTextWall(message, {
        view: ViewType.MAIN,
        durationMs: 5000,
        style: {
          color: '#f44336',
          fontSize: '16px',
        },
      });
    } catch (error) {
      logger.error('Failed to show error message', error as Error);
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        // Close HTTP server
        if (this.httpServer) {
          this.httpServer.close(() => {
            logger.info('HTTP server closed');
          });
        }

        // Close WebSocket server
        if (this.io) {
          this.io.close();
          logger.info('WebSocket server closed');
        }

        // Cleanup all active sessions
        for (const [sessionId] of this.activeSessions) {
          await this.cleanupSession(sessionId);
        }

        // Disconnect from Redis
        await sessionStore.disconnect();

        logger.info('Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        logger.error('Error during graceful shutdown', error as Error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  /**
   * Start the enhanced server
   */
  public async start(): Promise<void> {
    try {
      // Start the MentraOS AppServer
      await super.start();

      // Start the HTTP server for API and WebSocket support
      this.httpServer.listen(config.server.port + 1, () => {
        logger.info('Enhanced MentraOS server started', {
          component: 'app-server',
          mentrosPort: config.server.port,
          httpPort: config.server.port + 1,
          nodeEnv: config.server.nodeEnv,
        });
      });

      // Schedule cleanup of expired sessions
      setInterval(async () => {
        try {
          const cleaned = await sessionStore.cleanupExpiredSessions();
          if (cleaned > 0) {
            logger.info('Cleaned up expired sessions', { cleaned });
          }
        } catch (error) {
          logger.error('Failed to cleanup expired sessions', error as Error);
        }
      }, 300000); // Every 5 minutes

      logger.info('All services started successfully');

    } catch (error) {
      logger.fatal('Failed to start server', error as Error);
      throw error;
    }
  }

  /**
   * Get current metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      activeSessions: this.activeSessions.size,
      uptime: Date.now() - this.metrics.uptime.getTime(),
    };
  }
}

export default EnhancedMentraOSApp;