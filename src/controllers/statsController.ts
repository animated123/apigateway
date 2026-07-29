import { Request, Response } from 'express';
import { query } from '../lib/postgres.ts';

function sanitizeErrorMessage(message: string | null | undefined): string {
  if (!message) return 'An unknown database error occurred.';
  return message;
}

export class StatsController {
  static async getDashboardStats(req: Request, res: Response) {
    console.log("StatsController: Fetching dashboard stats with timeout guard from PostgreSQL...");
    try {
      // Set up a 6-second timeout race to prevent Express hanging on database timeouts
      const queryPromise = query('SELECT amount, status, created_at FROM transactions');

      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error('Database query timed out (exceeded 6000ms threshold)')), 6000);
      });

      const result = await Promise.race([queryPromise, timeoutPromise]);
      const allTransactions = result.rows;

      return StatsController.calculateStats(allTransactions, res);
    } catch (error: any) {
      const errorToLog = error instanceof Error ? { message: error.message, stack: error.stack } : error;
      console.error('Stats Controller Caught Error:', errorToLog);
      
      const rawMessage = error.message || 'Failed to fetch dashboard stats';
      const sanitizedMessage = sanitizeErrorMessage(rawMessage);

      // Return gracefully with a 200 containing degraded/offline state
      return res.status(200).json({
        mpesaVolume: 0,
        successRate: 0,
        dbOperations: 0,
        latency: 'Offline',
        degraded: true,
        error: sanitizedMessage
      });
    }
  }

  private static calculateStats(allTransactions: any[], res: Response) {
    if (!allTransactions || allTransactions.length === 0) {
      return res.status(200).json({
        mpesaVolume: 0,
        successRate: 0,
        dbOperations: 0,
        latency: '12ms'
      });
    }

    const successful = allTransactions.filter(tx => tx.status === 'SUCCESS' || tx.status === 'COMPLETED');
    const totalVolume = successful.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    
    const successRate = allTransactions.length > 0 
      ? (successful.length / allTransactions.length) * 100 
      : 0;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Safe check for timestamps
    const recentOps = allTransactions.filter(tx => {
      const ts = tx.created_at ? new Date(tx.created_at) : null;
      return ts ? ts > yesterday : false;
    }).length;

    return res.status(200).json({
      mpesaVolume: totalVolume,
      successRate: successRate,
      dbOperations: recentOps,
      latency: '12ms'
    });
  }
}
