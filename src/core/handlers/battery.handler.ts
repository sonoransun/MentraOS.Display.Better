import { AppSession } from '@mentra/sdk';
import { logger } from '../../infrastructure/logging/logger';
import { sessionStore } from '../../infrastructure/storage/session.store';
import { SessionContext } from '../../types';
import ErrorHandler from '../../utils/error-handler';

interface BatteryData {
  level: number; // 0-100
  isCharging: boolean;
  timeRemaining?: number; // minutes
  temperature?: number; // celsius
  voltage?: number;
  health?: 'good' | 'degraded' | 'poor';
  timestamp: Date;
}

interface BatteryAlert {
  type: 'low' | 'critical' | 'charging' | 'full' | 'overheating';
  message: string;
  action?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

class BatteryHandler {
  private readonly lowBatteryThreshold = 20;
  private readonly criticalBatteryThreshold = 5;
  private readonly overheatingThreshold = 45; // celsius
  private lastBatteryLevel: Map<string, number> = new Map();
  private batteryAlertHistory: Map<string, BatteryAlert[]> = new Map();

  constructor() {
    // Initialize with circuit breaker for reliability
    this.handleBatteryUpdate = ErrorHandler.createCircuitBreaker('battery-processing')(
      this.handleBatteryUpdate.bind(this)
    );
  }

  /**
   * Handle battery events from MentraOS glasses
   */
  public async handleBattery(
    session: AppSession,
    sessionId: string,
    data: any
  ): Promise<void> {
    try {
      const batteryData: BatteryData = {
        level: data.level || data.percentage || 0,
        isCharging: data.isCharging || data.charging || false,
        timeRemaining: data.timeRemaining,
        temperature: data.temperature,
        voltage: data.voltage,
        health: data.health || 'good',
        timestamp: new Date(),
      };

      logger.logSystemMetric('battery_level', batteryData.level, batteryData.timestamp);
      logger.logSystemMetric('battery_charging', batteryData.isCharging ? 1 : 0, batteryData.timestamp);

      if (batteryData.temperature !== undefined) {
        logger.logSystemMetric('battery_temperature', batteryData.temperature, batteryData.timestamp);
      }

      // Get session context for user preferences
      const sessionContext = await sessionStore.getSession(sessionId);
      if (!sessionContext) {
        logger.warn('Session not found for battery update', { sessionId });
        return;
      }

      // Process battery update
      await this.handleBatteryUpdate(session, sessionId, sessionContext, batteryData);

      // Store battery metrics for analytics
      await this.storeBatteryMetrics(sessionId, batteryData);

      // Update last known battery level
      this.lastBatteryLevel.set(sessionId, batteryData.level);

    } catch (error) {
      logger.error('Failed to handle battery update', error as Error, { sessionId });
    }
  }

  /**
   * Process battery update with intelligent monitoring
   */
  private async handleBatteryUpdate(
    session: AppSession,
    sessionId: string,
    context: SessionContext,
    data: BatteryData
  ): Promise<void> {
    // Generate alerts based on battery status
    const alerts = await this.generateBatteryAlerts(sessionId, data, context);

    // Show critical alerts to user
    for (const alert of alerts) {
      if (alert.priority === 'critical' || alert.priority === 'high') {
        await this.showBatteryAlert(session, alert, context);
      }
    }

    // Log battery trends for predictive analysis
    await this.analyzeBatteryTrends(sessionId, data);

    // Update session with battery info
    await this.updateSessionBatteryInfo(sessionId, data);
  }

  /**
   * Generate battery alerts based on current status
   */
  private async generateBatteryAlerts(
    sessionId: string,
    data: BatteryData,
    context: SessionContext
  ): Promise<BatteryAlert[]> {
    const alerts: BatteryAlert[] = [];
    const lastLevel = this.lastBatteryLevel.get(sessionId) || 100;
    const alertHistory = this.batteryAlertHistory.get(sessionId) || [];

    // Critical battery level
    if (data.level <= this.criticalBatteryThreshold && !data.isCharging) {
      const alert: BatteryAlert = {
        type: 'critical',
        message: `Critical battery: ${data.level}% remaining. Please charge immediately.`,
        action: 'Find charging cable',
        priority: 'critical',
      };

      if (!this.hasRecentAlert(alertHistory, 'critical', 300000)) { // 5 minutes
        alerts.push(alert);
      }
    }
    // Low battery warning
    else if (data.level <= this.lowBatteryThreshold && !data.isCharging && lastLevel > this.lowBatteryThreshold) {
      const alert: BatteryAlert = {
        type: 'low',
        message: `Low battery: ${data.level}% remaining. Consider charging soon.`,
        action: 'Plan to charge',
        priority: 'high',
      };

      if (!this.hasRecentAlert(alertHistory, 'low', 1800000)) { // 30 minutes
        alerts.push(alert);
      }
    }

    // Charging status changes
    if (data.isCharging !== this.wasCharging(alertHistory)) {
      if (data.isCharging) {
        alerts.push({
          type: 'charging',
          message: `Charging started. Current level: ${data.level}%`,
          priority: 'low',
        });
      } else {
        alerts.push({
          type: 'charging',
          message: `Charging stopped. Current level: ${data.level}%`,
          priority: 'medium',
        });
      }
    }

    // Full battery
    if (data.level >= 95 && data.isCharging && lastLevel < 95) {
      alerts.push({
        type: 'full',
        message: 'Battery fully charged. You can disconnect the charger.',
        priority: 'low',
      });
    }

    // Overheating
    if (data.temperature && data.temperature >= this.overheatingThreshold) {
      const alert: BatteryAlert = {
        type: 'overheating',
        message: `Battery overheating: ${data.temperature}°C. Please allow cooling.`,
        action: 'Reduce usage',
        priority: 'high',
      };

      if (!this.hasRecentAlert(alertHistory, 'overheating', 600000)) { // 10 minutes
        alerts.push(alert);
      }
    }

    // Update alert history
    const updatedHistory = [...alertHistory, ...alerts].slice(-20); // Keep last 20 alerts
    this.batteryAlertHistory.set(sessionId, updatedHistory);

    return alerts;
  }

  /**
   * Show battery alert to user
   */
  private async showBatteryAlert(
    session: AppSession,
    alert: BatteryAlert,
    context: SessionContext
  ): Promise<void> {
    try {
      const color = this.getAlertColor(alert.priority);
      const duration = this.getAlertDuration(alert.priority);

      let displayText = alert.message;
      if (alert.action) {
        displayText += `\n${alert.action}`;
      }

      await session.layouts.showTextWall(displayText, {
        view: 'battery',
        durationMs: duration,
        style: {
          fontSize: context.preferences.accessibility.fontSize,
          color,
          backgroundColor: alert.priority === 'critical' ? 'rgba(244, 67, 54, 0.1)' : undefined,
          border: alert.priority === 'critical' ? '2px solid #f44336' : undefined,
        },
      });

      logger.logSystemMetric(`battery_alert_${alert.type}`, 1);

    } catch (error) {
      logger.error('Failed to show battery alert', error as Error, { alert });
    }
  }

  /**
   * Analyze battery trends for predictive insights
   */
  private async analyzeBatteryTrends(sessionId: string, data: BatteryData): Promise<void> {
    try {
      // Get recent battery metrics for trend analysis
      const recentMetrics = await sessionStore.getMetrics(
        'battery_level',
        new Date(Date.now() - 3600000) // Last hour
      );

      if (recentMetrics.length < 2) return;

      // Calculate discharge rate
      const firstReading = recentMetrics[0];
      const lastReading = recentMetrics[recentMetrics.length - 1];
      const timeDiff = (lastReading.timestamp.getTime() - firstReading.timestamp.getTime()) / 1000 / 60; // minutes
      const levelDiff = firstReading.value - lastReading.value;

      if (timeDiff > 0 && levelDiff > 0) {
        const dischargeRate = levelDiff / timeDiff; // %/minute

        // Estimate time remaining
        if (data.level > 0 && dischargeRate > 0) {
          const estimatedTimeRemaining = data.level / dischargeRate; // minutes

          logger.logPerformanceMetric('battery_discharge_rate', dischargeRate, '%/min', { sessionId });
          logger.logPerformanceMetric('battery_estimated_time', estimatedTimeRemaining, 'minutes', { sessionId });

          // Store prediction in session cache for other services to use
          await sessionStore.cacheAIContext(sessionId, {
            batteryPrediction: {
              dischargeRate,
              estimatedTimeRemaining,
              confidence: this.calculatePredictionConfidence(recentMetrics),
              timestamp: new Date(),
            },
          }, 3600); // 1 hour TTL
        }
      }

    } catch (error) {
      logger.error('Failed to analyze battery trends', error as Error, { sessionId });
    }
  }

  /**
   * Store battery metrics for long-term analysis
   */
  private async storeBatteryMetrics(sessionId: string, data: BatteryData): Promise<void> {
    try {
      const metrics = [
        { name: 'battery_level', value: data.level },
        { name: 'battery_charging', value: data.isCharging ? 1 : 0 },
      ];

      if (data.temperature !== undefined) {
        metrics.push({ name: 'battery_temperature', value: data.temperature });
      }

      if (data.voltage !== undefined) {
        metrics.push({ name: 'battery_voltage', value: data.voltage });
      }

      for (const metric of metrics) {
        await sessionStore.recordMetric(metric.name, metric.value, { sessionId });
      }

    } catch (error) {
      logger.error('Failed to store battery metrics', error as Error, { sessionId });
    }
  }

  /**
   * Update session with current battery information
   */
  private async updateSessionBatteryInfo(sessionId: string, data: BatteryData): Promise<void> {
    try {
      const sessionContext = await sessionStore.getSession(sessionId);
      if (!sessionContext) return;

      // Update environment context with battery info
      if (!sessionContext.state.aiContext.environmentContext.battery) {
        sessionContext.state.aiContext.environmentContext.battery = {};
      }

      sessionContext.state.aiContext.environmentContext.battery = {
        level: data.level,
        isCharging: data.isCharging,
        health: data.health,
        temperature: data.temperature,
        lastUpdate: data.timestamp,
      };

      await sessionStore.updateSession(sessionId, sessionContext);

    } catch (error) {
      logger.error('Failed to update session battery info', error as Error, { sessionId });
    }
  }

  /**
   * Helper methods
   */
  private hasRecentAlert(alertHistory: BatteryAlert[], type: string, withinMs: number): boolean {
    const now = Date.now();
    return alertHistory.some(alert =>
      alert.type === type &&
      (now - new Date(alert.timestamp || 0).getTime()) < withinMs
    );
  }

  private wasCharging(alertHistory: BatteryAlert[]): boolean {
    const chargingAlerts = alertHistory.filter(a => a.type === 'charging').slice(-2);
    if (chargingAlerts.length === 0) return false;

    const lastAlert = chargingAlerts[chargingAlerts.length - 1];
    return lastAlert.message.includes('started');
  }

  private getAlertColor(priority: string): string {
    switch (priority) {
      case 'critical':
        return '#f44336';
      case 'high':
        return '#ff9800';
      case 'medium':
        return '#2196f3';
      case 'low':
        return '#4caf50';
      default:
        return '#ffffff';
    }
  }

  private getAlertDuration(priority: string): number {
    switch (priority) {
      case 'critical':
        return 8000; // 8 seconds
      case 'high':
        return 5000; // 5 seconds
      case 'medium':
        return 3000; // 3 seconds
      case 'low':
        return 2000; // 2 seconds
      default:
        return 3000;
    }
  }

  private calculatePredictionConfidence(metrics: any[]): number {
    if (metrics.length < 3) return 0.3;
    if (metrics.length < 5) return 0.6;
    if (metrics.length < 10) return 0.8;
    return 0.9;
  }

  /**
   * Get battery health summary for a session
   */
  public async getBatteryHealthSummary(sessionId: string): Promise<any> {
    try {
      const recentMetrics = await sessionStore.getMetrics(
        'battery_level',
        new Date(Date.now() - 86400000) // Last 24 hours
      );

      const temperatureMetrics = await sessionStore.getMetrics(
        'battery_temperature',
        new Date(Date.now() - 86400000)
      );

      const chargingMetrics = await sessionStore.getMetrics(
        'battery_charging',
        new Date(Date.now() - 86400000)
      );

      return {
        averageLevel: recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length || 0,
        minLevel: Math.min(...recentMetrics.map(m => m.value)),
        maxLevel: Math.max(...recentMetrics.map(m => m.value)),
        averageTemperature: temperatureMetrics.length > 0
          ? temperatureMetrics.reduce((sum, m) => sum + m.value, 0) / temperatureMetrics.length
          : null,
        chargingCycles: this.countChargingCycles(chargingMetrics),
        dataPoints: recentMetrics.length,
        timespan: '24 hours',
      };

    } catch (error) {
      logger.error('Failed to get battery health summary', error as Error, { sessionId });
      return null;
    }
  }

  private countChargingCycles(chargingMetrics: any[]): number {
    let cycles = 0;
    let wasCharging = false;

    for (const metric of chargingMetrics) {
      const isCharging = metric.value === 1;
      if (isCharging && !wasCharging) {
        cycles++;
      }
      wasCharging = isCharging;
    }

    return cycles;
  }
}

export default BatteryHandler;