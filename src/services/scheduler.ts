import { query } from '../lib/postgres.ts';

export class BackgroundScheduler {
  private static isRunning = false;
  private static intervals: NodeJS.Timeout[] = [];

  /**
   * Start all persistent background workers on the Action Server
   */
  static start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log('[Scheduler] 🚀 Starting Errandly Action Server Background Workers & Cron Jobs...');

    // 1. Stale Errand Auto-Cancel Worker (Runs every 10 minutes)
    const staleErrandsTimer = setInterval(async () => {
      await this.runStaleErrandsCleanup();
    }, 10 * 60 * 1000);
    this.intervals.push(staleErrandsTimer);

    // 2. Runner Application Reminders (Runs every 1 hour)
    const runnerApplicationsTimer = setInterval(async () => {
      await this.runRunnerApplicationReminders();
    }, 60 * 60 * 1000);
    this.intervals.push(runnerApplicationsTimer);

    // 3. DB Health & Metrics Ping (Runs every 10 minutes)
    const dbHealthTimer = setInterval(async () => {
      await this.runDbHealthCheck();
    }, 10 * 60 * 1000);
    this.intervals.push(dbHealthTimer);

    // 4. Stale Pending Payments Cleanup (Runs every 10 minutes)
    const paymentsCleanupTimer = setInterval(async () => {
      await this.runStalePaymentsCleanup();
    }, 10 * 60 * 1000);
    this.intervals.push(paymentsCleanupTimer);

    // Run initial health check shortly after startup
    setTimeout(() => {
      this.runDbHealthCheck().catch(err => console.warn('[Scheduler] Initial health check warning:', err.message));
    }, 5000);
  }

  /**
   * Stop all background workers cleanly
   */
  static stop() {
    this.intervals.forEach(timer => clearInterval(timer));
    this.intervals = [];
    this.isRunning = false;
    console.log('[Scheduler] Background workers stopped.');
  }

  /**
   * Worker 1: Auto-cancel or expire errands older than 24 hours without an assigned runner
   */
  private static async runStaleErrandsCleanup() {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      // If an errands table exists in the database
      const checkTable = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'errands'
        );
      `);

      if (checkTable.rows[0]?.exists) {
        const updateRes = await query(`
          UPDATE errands
          SET status = 'EXPIRED',
              updated_at = CURRENT_TIMESTAMP
          WHERE status = 'OPEN' 
            AND (runner_id IS NULL OR runner_id = '') 
            AND created_at < $1
          RETURNING id;
        `, [twentyFourHoursAgo]);

        if (updateRes.rows.length > 0) {
          console.log(`[Scheduler] ⏰ Auto-expired ${updateRes.rows.length} stale unassigned errands (>24h old).`);
        }
      }
    } catch (err: any) {
      console.warn('[Scheduler] Stale errand worker non-critical notice:', err.message);
    }
  }

  /**
   * Worker 2: Check for pending runner applications older than 48 hours
   */
  private static async runRunnerApplicationReminders() {
    try {
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const checkTable = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'runner_applications'
        );
      `);

      if (checkTable.rows[0]?.exists) {
        const pendingRes = await query(`
          SELECT id, user_id, email, phone, created_at 
          FROM runner_applications
          WHERE status = 'PENDING' AND created_at < $1
          LIMIT 20;
        `, [fortyEightHoursAgo]);

        if (pendingRes.rows.length > 0) {
          console.log(`[Scheduler] 📋 Notice: Found ${pendingRes.rows.length} pending runner applications older than 48 hours awaiting review.`);
        }
      }
    } catch (err: any) {
      console.warn('[Scheduler] Runner application worker notice:', err.message);
    }
  }

  /**
   * Worker 3: Periodic DB Health Ping & Metrics
   */
  private static async runDbHealthCheck() {
    try {
      const startTime = Date.now();
      const result = await query('SELECT 1 as ping, NOW() as server_time');
      const latencyMs = Date.now() - startTime;

      console.log(`[Scheduler] 💚 PostgreSQL Health Check OK (${latencyMs}ms latency at ${result.rows[0]?.server_time})`);
    } catch (err: any) {
      console.error('[Scheduler] 🔴 Database health ping failed:', err.message);
    }
  }

  /**
   * Worker 4: Stale Pending Payment Auto-Timeout (>15 mins)
   */
  private static async runStalePaymentsCleanup() {
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      const result = await query(`
        UPDATE transactions
        SET status = 'FAILED',
            is_closed = true,
            description = 'Transaction timed out (no completion callback within 15 minutes)',
            closed_at = CURRENT_TIMESTAMP
        WHERE status = 'PENDING' AND is_closed = false AND created_at < $1
        RETURNING id, reference;
      `, [fifteenMinutesAgo]);

      if (result.rows.length > 0) {
        console.log(`[Scheduler] ⏱️ Cleaned up ${result.rows.length} timed-out pending payment transactions.`);
      }
    } catch (err: any) {
      console.warn('[Scheduler] Payment cleanup worker notice:', err.message);
    }
  }
}
