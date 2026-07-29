import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const { Pool } = pg;

// Read JSON configuration file at runtime, if it exists
let dbConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'postgres-config.json');
  if (fs.existsSync(configPath)) {
    dbConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('[Postgres] Configuration successfully loaded from postgres-config.json');
  }
} catch (err: any) {
  console.warn('[Postgres] Failed to read postgres-config.json, falling back to defaults:', err.message);
}

// Instantiate pool based on config
const createPoolInstance = (config: any) => {
  if (process.env.DATABASE_URL || config.connectionString) {
    return new Pool({
      connectionString: process.env.DATABASE_URL || config.connectionString,
      max: parseInt(process.env.PGMAX || String(config.max || 10), 10),
      idleTimeoutMillis: parseInt(process.env.PGIDLE_TIMEOUT || String(config.idleTimeoutMillis || 30000), 10),
      connectionTimeoutMillis: parseInt(process.env.PGCONN_TIMEOUT || String(config.connectionTimeoutMillis || 5000), 10),
    });
  }

  return new Pool({
    host: process.env.PGHOST !== undefined ? process.env.PGHOST : (config.host || '127.0.0.1'),
    port: parseInt(process.env.PGPORT !== undefined ? process.env.PGPORT : String(config.port || 5432), 10),
    database: process.env.PGDATABASE !== undefined ? process.env.PGDATABASE : (config.database || 'Errandly'),
    user: process.env.PGUSER !== undefined ? process.env.PGUSER : (config.user || 'postgres'),
    password: process.env.PGPASSWORD !== undefined ? process.env.PGPASSWORD : (config.password !== undefined ? config.password : ''),
    max: parseInt(process.env.PGMAX || String(config.max || 10), 10),
    idleTimeoutMillis: parseInt(process.env.PGIDLE_TIMEOUT || String(config.idleTimeoutMillis || 30000), 10),
    connectionTimeoutMillis: parseInt(process.env.PGCONN_TIMEOUT || String(config.connectionTimeoutMillis || 5000), 10),
  });
};

// Merge configuration: Environment variables take precedence, falling back to postgres-config.json
let pool = createPoolInstance(dbConfig);

// Keep track of database state and fallback to SQLite-like emulator if local connection fails
let isPgOffline = false;

class InMemoryPostgres {
  profiles: any[] = [
    {
      id: 'USR-001',
      balance: 5000.00,
      currency: 'KES',
      name: 'John Doe Errand',
      email: 'ngugimaina4@gmail.com',
      password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'admin',
      backend_admin: 'yes',
      created_at: new Date().toISOString()
    }
  ];
  
  transactions: any[] = [];
  otp_codes: any[] = [];

  txCounter = 1;
  otpCounter = 1;

  async query(text: string, params: any[] = []) {
    const cleaned = text.trim().replace(/\s+/g, ' ');
    const lower = cleaned.toLowerCase();

    // Setup helper empty schema tables checks
    if (lower.includes('information_schema.tables')) {
      return { rows: [{ table_name: 'profiles' }, { table_name: 'transactions' }, { table_name: 'otp_codes' }] };
    }

    // 1. SELECT count(*) FROM profiles
    if (lower.startsWith('select count(*) from profiles')) {
      return { rows: [{ count: this.profiles.length }] };
    }

    // 2. SELECT queries on transactions (extremely robust dynamic parsing)
    if (lower.startsWith('select') && lower.includes('from transactions')) {
      let matches = [...this.transactions];
      const whereIdx = lower.indexOf('where');
      
      if (whereIdx !== -1) {
        const whereClause = lower.substring(whereIdx);
        
        // Match: lower(reference) = lower($X)
        if (whereClause.includes('lower(reference) = lower(')) {
          const paramMatch = whereClause.match(/lower\(\$([0-9]+)\)/);
          if (paramMatch) {
            const paramIdx = parseInt(paramMatch[1], 10) - 1;
            const refVal = params[paramIdx]?.toLowerCase();
            matches = this.transactions.filter(t => t.reference?.toLowerCase() === refVal);
          }
        }
        // Match: reference = $X
        else if (whereClause.includes('reference = $')) {
          const paramMatch = whereClause.match(/reference = \$([0-9]+)/);
          if (paramMatch) {
            const paramIdx = parseInt(paramMatch[1], 10) - 1;
            const refVal = params[paramIdx];
            matches = this.transactions.filter(t => t.reference === refVal);
          }
        }
        // Match: user_id = $X
        else if (whereClause.includes('user_id = $')) {
          const paramMatch = whereClause.match(/user_id = \$([0-9]+)/);
          if (paramMatch) {
            const paramIdx = parseInt(paramMatch[1], 10) - 1;
            const userId = params[paramIdx];
            matches = this.transactions.filter(t => t.user_id === userId);
          }
        }
      }
      
      matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { rows: matches };
    }

    // 3. SELECT balance, currency FROM profiles WHERE id = $1 LIMIT 1
    if (lower.includes('select balance, currency from profiles where id = $1') || lower.includes('select balance, currency from profiles where id = $1 limit 1')) {
      const match = this.profiles.find(p => p.id === params[0]);
      return { rows: match ? [match] : [] };
    }

    // 4. SELECT * FROM profiles WHERE LOWER(email) = LOWER($1) LIMIT 1
    if (lower.includes('from profiles where') && (lower.includes('lower(email) = lower($1)') || lower.includes('phone_number = $1'))) {
      const emailVal = params[0]?.toLowerCase();
      const match = this.profiles.find(p => (p.email && p.email.toLowerCase() === emailVal) || p.phone_number === params[0]);
      return { rows: match ? [match] : [] };
    }

    // 5. SELECT * FROM otp_codes WHERE phone_number = $1 AND code = $2 AND expires_at > $3 ORDER BY id DESC LIMIT 1
    if (lower.includes('select * from otp_codes')) {
      if (lower.includes('where phone_number = $1 and code = $2')) {
        const phone = params[0];
        const code = params[1];
        const now = new Date().toISOString();
        const matches = this.otp_codes.filter(o => o.phone_number === phone && o.code === code && o.expires_at > now)
          .sort((a, b) => b.id - a.id);
        return { rows: matches };
      }
      return { rows: this.otp_codes };
    }

    // 6. INSERT INTO profiles
    if (lower.includes('insert into profiles')) {
      // Special handler for auto-created admin profile insert (contains ngugi maine/admin attributes inline)
      if (lower.includes('ngugi maine') || lower.includes('yes')) {
        const id = params[0];
        const email = params[1]?.toLowerCase();
        const existing = this.profiles.find(p => (p.email && p.email.toLowerCase() === email) || p.id === id);
        if (!existing) {
          const newProfile = {
            id,
            name: 'Ngugi Maine',
            email,
            role: 'admin',
            balance: 5000.00,
            currency: 'KES',
            backend_admin: 'yes',
            created_at: new Date().toISOString()
          };
          this.profiles.push(newProfile);
          return { rows: [newProfile] };
        }
        return { rows: [existing] };
      }

      const id = params[0];
      const match = this.profiles.find(p => p.id === id);
      if (!match) {
        let newProfile: any = {
          id,
          balance: params[1] !== undefined ? Number(params[1]) : 0,
          currency: params[2] || 'KES',
          name: params[3] || 'User',
          created_at: new Date().toISOString()
        };
        // Handlers for auth insertions with larger payload arrays
        if (params.length >= 6) {
          newProfile = {
            id: params[0],
            balance: Number(params[1]) || 0,
            currency: params[2] || 'KES',
            name: params[3] || 'User',
            email: params[4],
            password_hash: params[5],
            role: params[6] || 'user',
            created_at: new Date().toISOString()
          };
        }
        this.profiles.push(newProfile);
        return { rows: [newProfile] };
      }
      return { rows: [match] };
    }

    // 7. INSERT INTO transactions
    if (lower.includes('insert into transactions')) {
      const tx: any = {
        id: this.txCounter++,
        user_id: params[0],
        phone_number: params[1],
        amount: Number(params[2] || 0),
        reference: params[3] || `TX-${Math.floor(Date.now() + Math.random() * 1000)}`,
        status: params[4] || 'PENDING',
        description: params[5] || '',
        provider: params[6] || 'mpesa',
        checkout_request_id: params[7],
        is_closed: params[8] === true,
        created_at: new Date().toISOString()
      };
      this.transactions.push(tx);
      return { rows: [tx] };
    }

    // 8. INSERT INTO otp_codes
    if (lower.includes('insert into otp_codes')) {
      if (lower.includes('"email/phone"')) {
        const otp = {
          id: params[0],
          "email/phone": params[1],
          phone_number: params[1],
          code: params[2],
          expires_at: params[3],
          created_at: new Date().toISOString(),
          used: false
        };
        this.otp_codes.push(otp);
        return { rows: [otp] };
      } else {
        const otp = {
          id: 'SESS-' + this.otpCounter++,
          "email/phone": params[0],
          phone_number: params[0],
          code: params[1],
          expires_at: params[2],
          created_at: new Date().toISOString(),
          used: false
        };
        this.otp_codes.push(otp);
        return { rows: [otp] };
      }
    }

    // 8.5 SELECT FROM otp_codes emulator
    if (lower.includes('from otp_codes')) {
      if (lower.includes('where "email/phone" = $1 and expires_at > $2 and used = false')) {
        const val = params[0];
        const nowStr = params[1] || new Date().toISOString();
        const found = this.otp_codes.filter(o => {
          const emailOrPhone = o["email/phone"] || o.phone_number;
          return emailOrPhone === val && o.expires_at > nowStr && !o.used;
        });
        return { rows: found };
      }
      if (lower.includes('where id = $1 and "email/phone" = $2 and code = $3')) {
        const id = params[0];
        const val = params[1];
        const code = params[2];
        const found = this.otp_codes.filter(o => {
          const emailOrPhone = o["email/phone"] || o.phone_number;
          return o.id === id && emailOrPhone === val && o.code === code;
        });
        return { rows: found };
      }
    }

    // 8.6 UPDATE otp_codes emulator
    if (lower.includes('update otp_codes set used = true')) {
      const id = params[0];
      const match = this.otp_codes.find(o => o.id === id);
      if (match) {
        match.used = true;
      }
      return { rows: match ? [match] : [] };
    }

    // 9. UPDATE profiles
    if (lower.includes('update profiles set balance = balance + $1 where id = $2')) {
      const amount = Number(params[0] || 0);
      const id = params[1];
      const match = this.profiles.find(p => p.id === id);
      if (match) {
        match.balance = Number(match.balance || 0) + amount;
      }
      return { rows: match ? [match] : [] };
    }

    // 10. UPDATE transactions (extremely robust dynamic parsing)
    if (lower.startsWith('update transactions') || lower.includes('update transactions')) {
      let matches: any[] = [];
      const whereIdx = lower.indexOf('where');
      
      if (whereIdx !== -1) {
        const whereClause = lower.substring(whereIdx);
        
        // Match: lower(reference) = lower($X)
        if (whereClause.includes('lower(reference) = lower(')) {
          const paramMatch = whereClause.match(/lower\(\$([0-9]+)\)/);
          if (paramMatch) {
            const paramIdx = parseInt(paramMatch[1], 10) - 1;
            const refVal = params[paramIdx]?.toLowerCase();
            matches = this.transactions.filter(t => t.reference?.toLowerCase() === refVal);
          }
        }
        // Match: reference = $X
        else if (whereClause.includes('reference = $')) {
          const paramMatch = whereClause.match(/reference = \$([0-9]+)/);
          if (paramMatch) {
            const paramIdx = parseInt(paramMatch[1], 10) - 1;
            const refVal = params[paramIdx];
            matches = this.transactions.filter(t => t.reference === refVal);
          }
        }
        // Match: id = $X
        else if (whereClause.includes('id = $')) {
          const paramMatch = whereClause.match(/id = \$([0-9]+)/);
          if (paramMatch) {
            const paramIdx = parseInt(paramMatch[1], 10) - 1;
            const idVal = Number(params[paramIdx]);
            matches = this.transactions.filter(t => t.id === idVal);
          }
        }
        // Match: checkout_request_id = $X
        else if (whereClause.includes('checkout_request_id = $')) {
          const paramMatch = whereClause.match(/checkout_request_id = \$([0-9]+)/);
          if (paramMatch) {
            const paramIdx = parseInt(paramMatch[1], 10) - 1;
            const reqIdVal = params[paramIdx];
            matches = this.transactions.filter(t => t.checkout_request_id === reqIdVal);
          }
        }
        // Match: status = 'PENDING' AND is_closed = false AND created_at < $1 (cleanupStale)
        else if (whereClause.includes('status = \'pending\'') && whereClause.includes('created_at < $')) {
          const paramMatch = whereClause.match(/created_at < \$([0-9]+)/);
          if (paramMatch) {
            const paramIdx = parseInt(paramMatch[1], 10) - 1;
            const timeVal = new Date(params[paramIdx]).getTime();
            matches = this.transactions.filter(t => t.status === 'PENDING' && !t.is_closed && new Date(t.created_at).getTime() < timeVal);
          }
        }
      }

      const setIdx = lower.indexOf('set');
      const setClause = whereIdx !== -1 ? lower.substring(setIdx, whereIdx) : lower.substring(setIdx);
      
      const updateMap: Record<string, any> = {};
      const parts = setClause.replace(/^set\s+/, '').split(',');
      for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx !== -1) {
          const col = part.substring(0, eqIdx).trim();
          const valPart = part.substring(eqIdx + 1);
          const dollarMatch = valPart.match(/\$([0-9]+)/);
          if (dollarMatch) {
            const paramIdx = parseInt(dollarMatch[1], 10) - 1;
            if (paramIdx >= 0 && paramIdx < params.length) {
              const paramVal = params[paramIdx];
              if (paramVal !== undefined) {
                updateMap[col] = paramVal;
              }
            }
          }
        }
      }

      if (setClause.includes('is_closed = false')) updateMap['is_closed'] = false;
      if (setClause.includes('is_closed = true')) updateMap['is_closed'] = true;
      if (setClause.includes("status = 'failed'")) updateMap['status'] = 'FAILED';
      if (setClause.includes("status = 'completed'")) updateMap['status'] = 'COMPLETED';

      for (const match of matches) {
        for (const [col, val] of Object.entries(updateMap)) {
          match[col] = val;
        }
        if (setClause.includes('closed_at =') || setClause.includes('closed_at = current_timestamp') || setClause.includes('closed_at = case') || match.is_closed) {
          match.closed_at = new Date().toISOString();
        }
      }

      return { rows: matches };
    }

    // 11. DELETE FROM otp_codes
    if (lower.includes('delete from otp_codes')) {
      if (lower.includes('where phone_number = $1')) {
        const phone = params[0];
        this.otp_codes = this.otp_codes.filter(o => o.phone_number !== phone);
      } else if (lower.includes('where id = $1')) {
        const id = params[0];
        this.otp_codes = this.otp_codes.filter(o => o.id !== id);
      }
      return { rows: [] };
    }

    // 12. Profiles details fetches
    if (lower.includes('from profiles where id = $1')) {
      const id = params[0];
      const match = this.profiles.find(p => p.id === id);
      return { rows: match ? [match] : [] };
    }

    return { rows: [] };
  }
}

const inMemDb = new InMemoryPostgres();

pool.on('error', (err) => {
  console.error('[Postgres] Unexpected error on idle client:', err);
});

export const pgPool = pool;

/**
 * Get current postgres-config.json
 */
export function getCurrentConfig() {
  const configPath = path.join(process.cwd(), 'postgres-config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
      return dbConfig;
    }
  }
  return dbConfig;
}

/**
 * Re-create the PostgreSQL pool dynamically and rewrite postgres-config.json
 */
export function recreatePoolAndSave(newConfig: any) {
  const configPath = path.join(process.cwd(), 'postgres-config.json');
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
  
  const oldPool = pool;
  dbConfig = newConfig;
  pool = createPoolInstance(dbConfig);
  isPgOffline = false; // Reset to attempt connection with new details
  
  // Instantly re-verify and trigger schema check on the newly configured database
  initializeDatabaseSchema().catch(err => {
    console.error('[Postgres Config Update] Failed to auto-initialize schema on new config:', err.message);
  });
  
  pool.on('error', (err) => {
    console.error('[Postgres] Unexpected error on idle client in reloaded pool:', err);
  });
  
  oldPool.end().catch(e => console.warn('[Postgres] Error ending old pool:', e.message));
  console.log('[Postgres] Dynamic configuration saved and Connection Pool re-created successfully.');
  return dbConfig;
}

/**
 * Execute a query with connection pooling helper.
 */
export async function query(text: string, params?: any[], bypassEmulator = false): Promise<any> {
  const start = Date.now();
  const isTestQuery = bypassEmulator || text.includes('current_database()') || text.includes('information_schema.tables');

  if (isPgOffline && !isTestQuery) {
    try {
      const res = await inMemDb.query(text, params);
      const duration = Date.now() - start;
      console.log(`[Postgres Emulated] Query Executed:`, { text: text.trim().substring(0, 80), duration: `${duration}ms` });
      return res;
    } catch (error: any) {
      console.error(`[Postgres Emulated] Query Error:`, error.message);
      throw error;
    }
  }

  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[Postgres] Query Executed:`, { text: text.trim().substring(0, 80), duration: `${duration}ms`, rowsCount: res.rowCount });
    
    // Since this real query was successful, if pg was marked offline, restore it to online!
    if (isPgOffline) {
      console.log(`[Postgres Online Sync] Successfully completed query on real PostgreSQL! Restoring real database connection session.`);
      isPgOffline = false;
      initializeDatabaseSchema().catch(err => {
        console.error('[Postgres Online Sync] Failed to auto-initialize schema on restored connection:', err.message);
      });
    }
    return res;
  } catch (error: any) {
    const msg = error.message || '';
    if (isTestQuery) {
      // Propagate the real DB driver error so that user gets accurate connection diagnostic info on the UI
      throw error;
    }
    const lowerMsg = msg.toLowerCase();
    const isConnectionOrAuthError = 
      lowerMsg.includes('econnrefused') || 
      lowerMsg.includes('enotfound') || 
      lowerMsg.includes('timeout') || 
      lowerMsg.includes('connect') || 
      lowerMsg.includes('authentication failed') || 
      lowerMsg.includes('no password') || 
      ((lowerMsg.includes('database') || lowerMsg.includes('role')) && lowerMsg.includes('does not exist')) || 
      lowerMsg.includes('ssl') || 
      lowerMsg.includes('sasl') || 
      lowerMsg.includes('terminated') ||
      lowerMsg.includes('client error') ||
      lowerMsg.includes('unreachable');

    if (isConnectionOrAuthError) {
      console.warn(`[Postgres Offline Fallback] Database connection or authentication failure (${msg}). Activating In-Memory SQL Emulator for local continuous development...`);
      isPgOffline = true;
      const res = await inMemDb.query(text, params);
      return res;
    }
    console.error(`[Postgres] Query Error:`, { text, error: error.message });
    throw error;
  }
}

/**
 * Automatically set up the required schema for the application:
 * tables: 'profiles', 'transactions', 'otp_codes'
 */
export async function initializeDatabaseSchema() {
  console.log('[Postgres] Checking & initializing database schema in "errandly"...');
  try {
    // 1. Create 'profiles' table if it does not exist
    await query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id VARCHAR(255) PRIMARY KEY,
        balance DECIMAL(12, 2) DEFAULT 0.00,
        currency VARCHAR(10) DEFAULT 'KES',
        name VARCHAR(255) DEFAULT '',
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        backend_admin VARCHAR(50) DEFAULT 'no',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Safe migration: Alter profiles table to add email, password_hash, role, backend_admin, phone_number, name if they don't exist in existing DB
    await query(`
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS name VARCHAR(255) DEFAULT '',
      ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS backend_admin VARCHAR(50) DEFAULT 'no',
      ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
    `);

    // Ensure a default sample profile exists for testing transactions if none is there
    const profilesCheck = await query('SELECT count(*) FROM profiles');
    if (parseInt(profilesCheck.rows[0].count, 10) === 0) {
      console.log('[Postgres] Inserting default test user profile...');
      await query(`
        INSERT INTO profiles (id, balance, currency, name, email, backend_admin)
        VALUES ('USR-001', 5000.00, 'KES', 'John Doe Errand', 'ngugimaina4@gmail.com', 'yes')
        ON CONFLICT (id) DO NOTHING;
      `);
    }

    // 2. Create 'transactions' table if it does not exist
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES profiles(id) ON DELETE SET NULL,
        phone_number VARCHAR(50),
        amount DECIMAL(12, 2) NOT NULL,
        reference VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDING',
        description TEXT DEFAULT '',
        checkout_request_id VARCHAR(255),
        is_closed BOOLEAN DEFAULT FALSE,
        provider VARCHAR(50) DEFAULT 'mpesa',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMPTZ
      );
    `);

    // Safe migration: Alter transactions table to add missing columns if they don't exist in existing DB
    await query(`
      ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS checkout_request_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'mpesa',
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    // 3. Drop existing otp_codes if it is standard, to rebuild for customized column requirements
    try {
      // Check if old table with SERIAL ID or phone_number column exists, and recreate
      await query(`DROP TABLE IF EXISTS otp_codes CASCADE;`);
    } catch (e) {
      // ignore
    }

    // Create the fully custom otp_codes table as requested in Step 4
    await query(`
      CREATE TABLE otp_codes (
        id VARCHAR(255) PRIMARY KEY,
        "email/phone" VARCHAR(255) NOT NULL,
        code VARCHAR(20) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        used BOOLEAN DEFAULT FALSE
      );
    `);

    console.log('[Postgres] Schema initialization checked successfully.');
  } catch (err: any) {
    console.error('[Postgres] Schema initialization failed. Continuing anyway, assuming schema is managed elsewhere:', err.message);
  }
}

// Automatically trigger initialization when this module loads on the backend
if (process.env.NODE_ENV !== 'test') {
  initializeDatabaseSchema().catch(err => {
    console.error('[Postgres] Auto-initialization failed:', err);
  });
}
