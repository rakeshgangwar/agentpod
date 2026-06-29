/**
 * Activity Archival Service
 * 
 * Manages automatic archival of old activity logs.
 * - Archives logs older than 90 days
 * - Anonymizes PII during archival
 * - Runs daily via cron-like scheduling
 * 
 * Design decisions:
 * - Logs are kept for 90 days for audit/support purposes
 * - Archived logs are anonymized but preserve action analytics
 * - Uses simple interval-based scheduling (no external cron dependency)
 */

import { createLogger } from '../../utils/logger.ts';
import { archiveOldLogs, getActivityStats } from '../../models/activity-log.ts';

const log = createLogger('activity-archival');

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_RUN_HOUR = 3; // 3 AM
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check every hour

// =============================================================================
// Archival Service Class
// =============================================================================

class ActivityArchivalService {
  private checkInterval?: ReturnType<typeof setInterval>;
  private lastRunDate: string | null = null;
  private retentionDays: number;
  private runHour: number;
  private isRunning = false;

  constructor(options?: { retentionDays?: number; runHour?: number }) {
    this.retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;
    this.runHour = options?.runHour ?? DEFAULT_RUN_HOUR;
    log.info('Activity Archival Service initialized', { 
      retentionDays: this.retentionDays, 
      runHour: this.runHour 
    });
  }

  // ===========================================================================
  // Service Lifecycle
  // ===========================================================================

  /**
   * Start the archival service
   * Sets up hourly checks to run archival at the configured hour
   */
  start(): void {
    if (this.checkInterval) {
      log.warn('Archival service already started');
      return;
    }

    log.info('Starting activity archival service', { runHour: this.runHour });

    // Check immediately on startup
    this.checkAndRun();

    // Set up hourly check
    this.checkInterval = setInterval(() => {
      this.checkAndRun();
    }, CHECK_INTERVAL_MS);
  }

  /**
   * Stop the archival service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
      log.info('Stopped activity archival service');
    }
  }

  /**
   * Check if it's time to run and execute archival
   */
  private checkAndRun(): void {
    const now = new Date();
    const currentHour = now.getHours();
    const today = now.toISOString().split('T')[0] ?? null;

    // Only run at the configured hour and once per day
    if (currentHour === this.runHour && this.lastRunDate !== today) {
      this.runArchival();
      this.lastRunDate = today;
    }
  }

  // ===========================================================================
  // Archival Operations
  // ===========================================================================

  /**
   * Run the archival process
   * Called automatically at the configured hour or manually via forceRun()
   */
  async runArchival(): Promise<{ archived: number; errors: string[] }> {
    if (this.isRunning) {
      log.warn('Archival already in progress, skipping');
      return { archived: 0, errors: ['Archival already in progress'] };
    }

    this.isRunning = true;
    const errors: string[] = [];
    let archived = 0;

    try {
      log.info('Starting activity log archival', { retentionDays: this.retentionDays });

      // Get stats before archival
      const statsBefore = await getActivityStats();
      const totalBefore = statsBefore.reduce((sum, s) => sum + s.count, 0);

      // Archive old logs
      archived = await archiveOldLogs(this.retentionDays);

      // Get stats after archival
      const statsAfter = await getActivityStats();
      const totalAfter = statsAfter.reduce((sum, s) => sum + s.count, 0);

      log.info('Activity log archival complete', {
        archived,
        totalBefore,
        totalAfter,
        retentionDays: this.retentionDays,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Activity log archival failed', { error: errorMessage });
      errors.push(errorMessage);
    } finally {
      this.isRunning = false;
    }

    return { archived, errors };
  }

  /**
   * Force run archival immediately (for testing or manual trigger)
   */
  async forceRun(): Promise<{ archived: number; errors: string[] }> {
    log.info('Forcing activity archival run');
    return this.runArchival();
  }

  // ===========================================================================
  // Status & Info
  // ===========================================================================

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean;
    lastRunDate: string | null;
    retentionDays: number;
    runHour: number;
    nextRunEstimate: string;
  } {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Calculate next run time
    let nextRun = new Date(now);
    if (currentHour >= this.runHour) {
      // Next run is tomorrow
      nextRun.setDate(nextRun.getDate() + 1);
    }
    nextRun.setHours(this.runHour, 0, 0, 0);

    return {
      running: !!this.checkInterval,
      lastRunDate: this.lastRunDate,
      retentionDays: this.retentionDays,
      runHour: this.runHour,
      nextRunEstimate: nextRun.toISOString(),
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let archivalServiceInstance: ActivityArchivalService | null = null;

/**
 * Get the activity archival service singleton instance
 */
export function getActivityArchivalService(): ActivityArchivalService {
  if (!archivalServiceInstance) {
    archivalServiceInstance = new ActivityArchivalService();
  }
  return archivalServiceInstance;
}

/**
 * Start the archival service
 * Called on API startup
 */
export function startArchivalService(): void {
  getActivityArchivalService().start();
}

/**
 * Stop the archival service
 * Called on API shutdown
 */
export function stopArchivalService(): void {
  getActivityArchivalService().stop();
}

/**
 * Force run archival
 * For manual trigger via admin API
 */
export async function forceArchival(): Promise<{ archived: number; errors: string[] }> {
  return getActivityArchivalService().forceRun();
}

/**
 * Get archival service status
 */
export function getArchivalStatus() {
  return getActivityArchivalService().getStatus();
}
