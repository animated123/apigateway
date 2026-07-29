import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PaymentController } from './src/controllers/paymentController.ts';
import { SMSController } from './src/controllers/smsController.ts';
import { StatsController } from './src/controllers/statsController.ts';
import { DBController } from './src/controllers/dbController.ts';
import { AuthController } from './src/controllers/authController.ts';
import { authenticateToken } from './src/middleware/auth.ts';
import { query } from './src/lib/postgres.ts';

// --- Circular Logs Buffer & Console Interceptor ---
interface LogEntry {
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
}

const MAX_LOGS = 300;
let logsBuffer: LogEntry[] = [];

const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

function addLogToBuffer(level: 'log' | 'info' | 'warn' | 'error', args: any[]) {
  const message = args.map(arg => {
    if (arg instanceof Error) {
      return arg.stack || arg.message;
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  logsBuffer.push({
    timestamp: new Date().toISOString(),
    level,
    message
  });

  if (logsBuffer.length > MAX_LOGS) {
    logsBuffer.shift();
  }
}

console.log = (...args: any[]) => {
  originalLog(...args);
  addLogToBuffer('log', args);
};
console.info = (...args: any[]) => {
  originalInfo(...args);
  addLogToBuffer('info', args);
};
console.warn = (...args: any[]) => {
  originalWarn(...args);
  addLogToBuffer('warn', args);
};
console.error = (...args: any[]) => {
  originalError(...args);
  addLogToBuffer('error', args);
};
// --------------------------------------------------

async function startServer() {
  const app = express();

  // Logging Middleware for Cloud Run
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Middlewares
  app.use(cors({ 
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'http://localhost', 
        'capacitor://localhost',
        'http://localhost:3000',
        'http://localhost:5005',
        'http://localhost:5006',
        'https://ais-dev-sfwiwu2qvvdcyzjabft4um-22650132817.europe-west1.run.app',
        'https://ais-pre-sfwiwu2qvvdcyzjabft4um-22650132817.europe-west1.run.app',
        'https://errandly.site/'
      ];
      
      if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('run.app')) {
        callback(null, true);
      } else {
        // Fallback to true for development flexibility, or strictly reject
        callback(null, true); 
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Basic connectivity test (Ping)
  app.get('/ping', (req, res) => res.send('pong'));

  // API Routes
  const apiRouter = express.Router();

  // Payment Routes
  apiRouter.post('/payments/stk-push', PaymentController.stkPush);
  apiRouter.post('/payments/callback', PaymentController.callback);
  apiRouter.post('/payments/paystack/initialize', PaymentController.initializePaystack);
  apiRouter.post('/payments/paystack/stk-push', PaymentController.stkPushPaystack);
  apiRouter.post('/payments/paystack/webhook', PaymentController.paystackWebhook);
  apiRouter.get('/payments/debug/:reference', PaymentController.debugTransaction);
  apiRouter.get('/payments/status', PaymentController.checkStatus);
  apiRouter.post('/payments/cleanup', PaymentController.cleanupStale);

  // Notification Routes (Renamed to use SMSController)
  apiRouter.post('/notifications/send-otp', SMSController.sendOTP);
  apiRouter.post('/notifications/verify-otp', SMSController.verifyOTP);
  apiRouter.post('/notifications/send-email', SMSController.sendTransactionalEmail);
  apiRouter.get('/notifications/send-email', SMSController.sendTransactionalEmail);
  apiRouter.post('/notifications/verify-email', SMSController.verifyEmail);
  apiRouter.get('/notifications/verify-email', SMSController.verifyEmail);
  apiRouter.post('/proxy/verify-email', SMSController.verifyEmail);
  apiRouter.get('/proxy/verify-email', SMSController.verifyEmail);
  apiRouter.post('/proxy/send-email', SMSController.sendTransactionalEmail);
  apiRouter.get('/proxy/send-email', SMSController.sendTransactionalEmail);

  // Health check
  apiRouter.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Dashboard Stats
  apiRouter.get('/stats/dashboard', StatsController.getDashboardStats);

  // Authentication Routes (jsonwebtoken & bcryptjs)
  apiRouter.post('/auth/register', AuthController.register);
  apiRouter.post('/auth/login', AuthController.login);
  apiRouter.post('/auth/send-code', AuthController.sendLoginCode);
  apiRouter.post('/auth/verify-login-code', AuthController.verifyLoginCode);
  apiRouter.get('/auth/me', authenticateToken, AuthController.getMe);

  // Secure endpoints (Requiring valid Authorization Bearer token)
  apiRouter.get('/secure/profiles/me', authenticateToken, AuthController.getMe);
  apiRouter.get('/secure/transactions', authenticateToken, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, error: 'Access unauthorized: user context not found' });
      }
      const result = await query(
        'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC',
        [req.user.userId]
      );
      return res.status(200).json({ success: true, count: result.rows.length, data: result.rows });
    } catch (error: any) {
      console.error('[Secure Endpoint] Failed to retrieve transactions:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to retrieve secure transactions.' });
    }
  });
  apiRouter.get('/secure/stats', authenticateToken, StatsController.getDashboardStats);

  // Supabase Proxy Routes
  apiRouter.post('/db/transactions', DBController.createTransaction);
  apiRouter.get('/db/balance/:userId', DBController.getBalance);
  apiRouter.post('/db/profiles/select', DBController.selectProfile);
  apiRouter.post('/db/transactions/select', DBController.selectTransactions);
  apiRouter.get('/db/query', DBController.queryGeneric);
  apiRouter.post('/db/update', DBController.updateGeneric);
  apiRouter.post('/db/test-connection', DBController.testConnectionAndRunQuery);
  apiRouter.get('/db/config', DBController.getPostgresConfig);
  apiRouter.post('/db/config', DBController.savePostgresConfig);

  // Admin Diagnostics Logs Routes
  apiRouter.get('/admin/logs', (req, res) => {
    res.status(200).json({ logs: logsBuffer });
  });

  apiRouter.post('/admin/logs/clear', (req, res) => {
    logsBuffer = [];
    console.log('[SYSTEM] Circular logs buffer cleared by administrator.');
    res.status(200).json({ success: true, message: 'Logs cleared successfully' });
  });

  // Catch-all for undefined API routes
  apiRouter.all('*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  app.use('/api', apiRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: serve static files from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Required port matching AI Studio environment constraints
  const port = 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`[SYSTEM] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[SYSTEM] Professional Backend running at http://0.0.0.0:${port}`);
  });
}

startServer().catch(err => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
