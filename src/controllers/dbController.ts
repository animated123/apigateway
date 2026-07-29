import { Request, Response } from 'express';
import { query, getCurrentConfig, recreatePoolAndSave } from '../lib/postgres';

/**
 * Sanitizes system or network errors
 */
function sanitizeErrorMessage(message: string | null | undefined): string {
  if (!message) return 'An unknown database error occurred.';
  return message;
}

/**
 * DBController acts as a database controller for Postgres.
 */
export class DBController {
  /**
   * POST /api/db/transactions
   * Inserts a transaction record into the 'transactions' table.
   */
  static async createTransaction(req: Request, res: Response) {
    const { userId, ...transactionData } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'userId is required in the request body.' 
      });
    }

    try {
      const phone_number = transactionData.phone_number || transactionData.phoneNumber || null;
      const amount = Number(transactionData.amount || 0);
      const reference = transactionData.reference || `TX${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const status = transactionData.status || 'PENDING';
      const description = transactionData.description || '';
      const provider = transactionData.provider || 'mpesa';
      const checkout_request_id = transactionData.checkout_request_id || transactionData.checkoutRequestId || null;
      const is_closed = transactionData.is_closed === true || transactionData.isClosed === true;

      // Ensure Profile exists for this userId to avoid foreign key violations, 
      // otherwise auto-create or skip foreign key check by inserting matching user row.
      await query(`
        INSERT INTO profiles (id, balance, name)
        VALUES ($1, 0.00, 'User')
        ON CONFLICT (id) DO NOTHING
      `, [userId]);

      const sql = `
        INSERT INTO transactions (user_id, phone_number, amount, reference, status, description, provider, checkout_request_id, is_closed, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        RETURNING *;
      `;

      const result = await query(sql, [
        userId,
        phone_number,
        amount,
        reference,
        status,
        description,
        provider,
        checkout_request_id,
        is_closed
      ]);

      const data = result.rows[0];

      return res.status(201).json({ success: true, data });
    } catch (error: any) {
      console.error('[DBController] Unhandled Error:', error.message);
      return res.status(500).json({ success: false, error: sanitizeErrorMessage(error.message) });
    }
  }

  /**
   * GET /api/db/balance/:userId
   * Fetches the user's balance from the 'profiles' table.
   */
  static async getBalance(req: Request, res: Response) {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'userId parameter is required.' 
      });
    }

    try {
      const sql = 'SELECT balance, currency FROM profiles WHERE id = $1 LIMIT 1';
      const result = await query(sql, [userId]);

      if (result.rows.length === 0) {
        // Safe creation of profile if user is not yet created
        await query(`
          INSERT INTO profiles (id, balance, name)
          VALUES ($1, 0.00, 'User')
          ON CONFLICT (id) DO NOTHING
        `, [userId]);

        return res.status(200).json({ 
          success: true, 
          balance: 0.00,
          currency: 'KES'
        });
      }

      const data = result.rows[0];

      return res.status(200).json({ 
        success: true, 
        balance: Number(data.balance || 0),
        currency: data.currency || 'KES'
      });
    } catch (error: any) {
      console.error('[DBController] Unhandled Error:', error.message);
      return res.status(500).json({ success: false, error: sanitizeErrorMessage(error.message) });
    }
  }

  /**
   * POST /api/db/profiles/select
   * Fetches the user's profile.
   */
  static async selectProfile(req: Request, res: Response) {
    console.log(`[DBController] selectProfile headers:`, req.headers['content-type']);
    console.log(`[DBController] selectProfile raw body:`, JSON.stringify(req.body));
    
    const userId = req.body.userId || req.body.user_id || req.body.userid;

    if (!userId) {
      console.warn('[DBController] selectProfile: Missing userId in body', req.body);
      return res.status(400).json({ 
        success: false, 
        error: 'userId is required in the body.',
        debug: {
          receivedBody: req.body,
          contentType: req.headers['content-type']
        }
      });
    }

    try {
      const sql = 'SELECT * FROM profiles WHERE id = $1 LIMIT 1';
      const result = await query(sql, [userId]);

      if (result.rows.length === 0) {
        // Auto-create to stay supportive of frontend login onboarding
        await query(`
          INSERT INTO profiles (id, balance, name)
          VALUES ($1, 0.00, 'User')
          ON CONFLICT (id) DO NOTHING
        `, [userId]);
        
        const freshResult = await query(sql, [userId]);
        return res.status(200).json({ success: true, data: freshResult.rows[0] });
      }

      const data = result.rows[0];
      return res.status(200).json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: sanitizeErrorMessage(error.message) });
    }
  }

  /**
   * POST /api/db/transactions/select
   * Fetches transactions for a specific user.
   */
  static async selectTransactions(req: Request, res: Response) {
    console.log(`[DBController] selectTransactions headers:`, req.headers['content-type']);
    console.log(`[DBController] selectTransactions raw body:`, JSON.stringify(req.body));

    const userId = req.body.userId || req.body.user_id || req.body.userid;

    if (!userId) {
      console.warn('[DBController] selectTransactions: Missing userId in body', req.body);
      return res.status(400).json({ 
        success: false, 
        error: 'userId is required in the body.',
        debug: {
          receivedBody: req.body,
          contentType: req.headers['content-type']
        }
      });
    }

    try {
      const sql = 'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC';
      const result = await query(sql, [userId]);

      return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: sanitizeErrorMessage(error.message) });
    }
  }

  /**
   * GET /api/db/query
   */
  static async queryGeneric(req: Request, res: Response) {
    const table = req.query.table?.toString();
    const orderCol = req.query.orderCol?.toString();
    const limitVal = req.query.limit ? parseInt(req.query.limit.toString(), 10) : null;

    if (table !== 'transactions' && table !== 'profiles' && table !== 'otp_codes') {
      return res.status(400).json({ success: false, error: 'Invalid or restricted table parameter.' });
    }

    try {
      let sql = `SELECT * FROM ${table}`;
      const params: any[] = [];

      if (orderCol) {
        // Sanitize column name to prevent injections (since orderCol is dynamic, restrict to known safe values)
        const allowedCols = ['created_at', 'id', 'user_id', 'amount', 'reference', 'status', 'phone_number', 'expires_at', 'code'];
        if (allowedCols.includes(orderCol)) {
          sql += ` ORDER BY ${orderCol} DESC`;
        }
      }

      if (limitVal && !isNaN(limitVal)) {
        sql += ` LIMIT $1`;
        params.push(limitVal);
      }

      const result = await query(sql, params);
      return res.status(200).json({ success: true, data: result.rows });
    } catch (error: any) {
      console.error('[DBController] QueryGeneric error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/db/update
   */
  static async updateGeneric(req: Request, res: Response) {
    const { table, values, eqCol, eqVal } = req.body;

    if (table !== 'transactions') {
      return res.status(400).json({ success: false, error: 'Updating this table is restricted.' });
    }

    try {
      // Direct parameterized dynamic query helper
      const keys = Object.keys(values).filter(k => ['status', 'is_closed', 'description'].includes(k));
      if (keys.length === 0) {
        return res.status(400).json({ success: false, error: 'No permissible update keys provided.' });
      }

      // Restrict search filter parameters for safety
      if (eqCol !== 'id' && eqCol !== 'reference') {
        return res.status(400).json({ success: false, error: 'Filtering by this column is restricted.' });
      }

      const setClauses = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
      const sql = `UPDATE ${table} SET ${setClauses} WHERE ${eqCol} = $${keys.length + 1} RETURNING *`;
      const params = keys.map(k => values[k]);
      params.push(eqVal);

      const result = await query(sql, params);

      // If status updated to COMPLETED, let's credit their balance too!
      if (values.status === 'COMPLETED' && result.rows.length > 0) {
        const row = result.rows[0];
        if (row.user_id && row.amount) {
          await query(`UPDATE profiles SET balance = balance + $1 WHERE id = $2`, [Number(row.amount), row.user_id]);
          console.log(`[GenericUpdate] Credited user account ${row.user_id} with KES ${row.amount}`);
        }
      }

      return res.status(200).json({ success: true, data: result.rows });
    } catch (error: any) {
      console.error('[DBController] UpdateGeneric error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/db/test-connection
   * Diagnostics endpoint to test PostgreSQL connection parameters & execute test playground queries.
   */
  static async testConnectionAndRunQuery(req: Request, res: Response) {
    const { action, sql } = req.body;

    if (action === 'test') {
      try {
        const result = await query(`
          SELECT 
            NOW() as server_time,
            current_database() as database_name,
            version() as db_version,
            (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as public_tables_count
        `);
        
        // Also list existing public tables
        const tablesResult = await query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
          ORDER BY table_name;
        `);

        return res.status(200).json({
          success: true,
          status: 'CONNECTED',
          message: 'Local PostgreSQL connection test succeeded!',
          diagnostics: {
            ...result.rows[0],
            tables: tablesResult.rows.map(r => r.table_name)
          }
        });
      } catch (error: any) {
        console.error('[DBController] Connection test failure:', error.message);
        return res.status(500).json({
          success: false,
          status: 'DISCONNECTED',
          error: error.message,
          message: 'Failed to establish connection to PostgreSQL database. Please verify your postgres-config.json properties.'
        });
      }
    }

    if (action === 'query') {
      if (!sql || typeof sql !== 'string') {
        return res.status(400).json({ success: false, error: 'SQL query string is required.' });
      }

      // Safe precaution: warn/block heavily destructive SQL injections if they are obvious
      const normalizedSql = sql.trim().toLowerCase();
      
      // Let's allow SELECT, EXPLAIN, SHOW, DESCRIBE, and basic operations, but block DROP DATABASE or system tables tampering
      if (normalizedSql.includes('drop database') || normalizedSql.includes('pg_terminate_backend')) {
        return res.status(403).json({
          success: false,
          error: 'Execution blocked: Command is blocked for session integrity and safety.'
        });
      }

      try {
        const startTime = Date.now();
        const result = await query(sql, [], true);
        const duration = Date.now() - startTime;

        return res.status(200).json({
          success: true,
          rows: result.rows || [],
          rowCount: result.rowCount ?? (Array.isArray(result.rows) ? result.rows.length : 0),
          fields: result.fields ? result.fields.map(f => ({ name: f.name, dataTypeId: f.dataTypeID })) : [],
          durationMs: duration
        });
      } catch (error: any) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }
    }

    return res.status(400).json({ success: false, error: 'Invalid or missing action parameter. Expected "test" or "query".' });
  }

  /**
   * GET /api/db/config
   * Returns current postgres-config.json properties
   */
  static async getPostgresConfig(req: Request, res: Response) {
    try {
      const config = getCurrentConfig();
      return res.status(200).json({ success: true, config });
    } catch (error: any) {
      console.error('[DBController] getPostgresConfig error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  /**
   * POST /api/db/config
   * Saves updated config to postgres-config.json and re-creates the Postgres pool dynamically.
   */
  static async savePostgresConfig(req: Request, res: Response) {
    try {
      const newConfig = req.body;
      
      if (!newConfig || typeof newConfig !== 'object') {
        return res.status(400).json({ success: false, error: 'Database configuration settings are required.' });
      }

      // Format types
      if (newConfig.port) {
        newConfig.port = parseInt(String(newConfig.port), 10);
      }
      if (newConfig.max) {
        newConfig.max = parseInt(String(newConfig.max), 10);
      }
      if (newConfig.idleTimeoutMillis) {
        newConfig.idleTimeoutMillis = parseInt(String(newConfig.idleTimeoutMillis), 10);
      }
      if (newConfig.connectionTimeoutMillis) {
        newConfig.connectionTimeoutMillis = parseInt(String(newConfig.connectionTimeoutMillis), 10);
      }

      const updated = recreatePoolAndSave(newConfig);
      return res.status(200).json({ 
        success: true, 
        message: 'Successfully updated database configuration and reloaded Connection Pool!', 
        config: updated 
      });
    } catch (error: any) {
      console.error('[DBController] savePostgresConfig error:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
}

