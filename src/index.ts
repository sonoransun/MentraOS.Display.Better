/**
 * Enhanced MentraOS Smart Glasses Application
 *
 * This application extends the basic MentraOS functionality with:
 * - AI/ML and Computer Vision capabilities
 * - Multi-platform ecosystem support
 * - Advanced accessibility features
 * - 3D spatial UI system
 * - Security and analytics framework
 *
 * Architecture: Service-oriented modular design
 * Platforms: MentraOS Glasses, Web Dashboard, Mobile App, Desktop Tools
 *
 * For setup instructions, see: /docs/setup.md
 * For API documentation, see: /docs/api.md
 */

import 'dotenv/config';
import { configManager } from './infrastructure/config/app.config';
import { logger } from './infrastructure/logging/logger';
import { sessionStore } from './infrastructure/storage/session.store';
import EnhancedMentraOSApp from './app/server';

async function bootstrap(): Promise<void> {
  const startTime = Date.now();

  try {
    logger.info('Starting Enhanced MentraOS Application', {
      component: 'bootstrap',
      nodeEnv: process.env.NODE_ENV,
      version: '1.0.0',
    });

    // Validate configuration
    const config = configManager.getConfig();
    logger.info('Configuration loaded', {
      component: 'bootstrap',
      packageName: config.mentraos.packageName,
      features: config.features,
      nodeEnv: config.server.nodeEnv,
    });

    // Test Redis connection
    const redisHealthy = await sessionStore.healthCheck();
    if (!redisHealthy) {
      logger.warn('Redis connection failed - continuing with degraded functionality', {
        component: 'bootstrap',
      });
    } else {
      logger.info('Redis connection established', {
        component: 'bootstrap',
      });
    }

    // Initialize and start the enhanced application
    const app = new EnhancedMentraOSApp();
    await app.start();

    const bootTime = Date.now() - startTime;
    logger.info('Enhanced MentraOS Application started successfully', {
      component: 'bootstrap',
      bootTime,
      ports: {
        mentraos: config.server.port,
        http: config.server.port + 1,
      },
    });

    // Log startup metrics
    logger.logPerformanceMetric('application_boot_time', bootTime, 'ms');

    // Display startup banner
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║               Enhanced MentraOS Application                  ║
║                                                              ║
║  🚀 Server Status: RUNNING                                   ║
║  🌐 MentraOS Port: ${config.server.port.toString().padEnd(4)}                                   ║
║  📡 HTTP/WebSocket: ${(config.server.port + 1).toString().padEnd(4)}                              ║
║  🔧 Environment: ${config.server.nodeEnv.toUpperCase().padEnd(11)}                          ║
║  📱 Package: ${config.mentraos.packageName.padEnd(24)}       ║
║                                                              ║
║  Features Enabled:                                           ║
║  ${config.features.multiPlatform ? '✅' : '❌'} Multi-Platform Support                             ║
║  ${config.ai.enableVision ? '✅' : '❌'} Computer Vision & AI                              ║
║  ${config.features.accessibility ? '✅' : '❌'} Accessibility Features                            ║
║  ${config.features.spatialUI ? '✅' : '❌'} 3D Spatial UI                                    ║
║  ${config.features.analytics ? '✅' : '❌'} Analytics & Insights                              ║
║                                                              ║
║  🔗 Developer Console: https://console.mentra.glass/         ║
║  📊 Health Check: http://localhost:${(config.server.port + 1).toString()}/health          ║
║  📈 Metrics: http://localhost:${(config.server.port + 1).toString()}/api/analytics    ║
║                                                              ║
║  Ready for MentraOS glasses connection!                      ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Setup periodic metrics reporting
    if (config.features.analytics) {
      setInterval(() => {
        const metrics = (app as any).getMetrics();
        logger.logSystemMetric('active_sessions', metrics.activeSessions);
        logger.logSystemMetric('total_sessions', metrics.sessionsCreated);
        logger.logSystemMetric('total_transcriptions', metrics.transcriptionEvents);
        logger.logSystemMetric('total_battery_events', metrics.batteryEvents);
        logger.logSystemMetric('total_errors', metrics.errors);
      }, 60000); // Every minute
    }

  } catch (error) {
    const bootTime = Date.now() - startTime;
    logger.fatal('Failed to start Enhanced MentraOS Application', error as Error, {
      component: 'bootstrap',
      bootTime,
    });

    console.error(`
╔══════════════════════════════════════════════════════════════╗
║                      STARTUP FAILED                         ║
║                                                              ║
║  ❌ Error: ${(error as Error).message.padEnd(48).slice(0, 48)} ║
║                                                              ║
║  Common Solutions:                                           ║
║  • Check .env file configuration                             ║
║  • Verify MENTRAOS_API_KEY is valid                          ║
║  • Ensure Redis is running (if configured)                   ║
║  • Check port ${configManager.getConfig().server.port.toString()} is not in use                           ║
║                                                              ║
║  For help: https://github.com/mentra/sdk/issues             ║
╚══════════════════════════════════════════════════════════════╝
    `);

    process.exit(1);
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught Exception', error, { component: 'process' });
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled Rejection', reason as Error, {
    component: 'process',
    promise: promise.toString(),
  });
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`, {
    component: 'process',
    signal,
  });

  // Give the application time to cleanup
  setTimeout(() => {
    logger.info('Shutdown complete', { component: 'process' });
    process.exit(0);
  }, 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the application
bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
  process.exit(1);
});