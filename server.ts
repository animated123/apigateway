import 'dotenv/config';
import dns from 'dns';

// Ensure Node.js resolves IPv4 first globally for outbound TCP connections
if (dns && typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { PaymentController } from './src/controllers/paymentController.ts';
import { SMSController } from './src/controllers/smsController.ts';
import { StatsController } from './src/controllers/statsController.ts';
import { DBController } from './src/controllers/dbController.ts';
import { AuthController } from './src/controllers/authController.ts';
import { EnvController } from './src/controllers/envController.ts';
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
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'http://localhost', 
        'capacitor://localhost',
        'http://localhost:3000',
        'http://localhost:5005',
        'http://localhost:5006',
        'https://ais-dev-sfwiwu2qvvdcyzjabft4um-22650132817.europe-west1.run.app',
        'https://ais-pre-sfwiwu2qvvdcyzjabft4um-22650132817.europe-west1.run.app',
        'https://errandly.site',
        'http://errandly.site',
        'https://www.errandly.site',
        'http://www.errandly.site',
        'https://gateway.errandly.site',
        'http://gateway.errandly.site',
        'https://app.errandly.site',
        'http://app.errandly.site',
        'https://api.errandly.site',
        'http://api.errandly.site'
      ];
      
      const isAllowed = 
        allowedOrigins.includes(origin) ||
        origin.endsWith('errandly.site') ||
        origin.includes('errandly.site') ||
        origin.includes('run.app') ||
        origin.includes('onrender.com') ||
        origin.includes('localhost');

      if (isAllowed) {
        callback(null, true);
      } else {
        // Permissive fallback so client apps and third-party integrations are never blocked
        callback(null, true); 
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-Api-Key',
      'X-CSRF-Token'
    ],
    exposedHeaders: ['Content-Length', 'X-Total-Count', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));

  // Additional CORS fallback headers middleware
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin.includes('errandly.site') || origin.includes('localhost') || origin.includes('run.app'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-Api-Key, X-CSRF-Token');
    }
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Basic connectivity test (Ping)
  app.get('/ping', (req, res) => res.send('pong'));

  // Sub-routers
  const authRouter = express.Router();
  authRouter.post('/register', AuthController.register);
  authRouter.post('/login', AuthController.login);
  authRouter.post('/send-code', AuthController.sendLoginCode);
  authRouter.post('/verify-login-code', AuthController.verifyLoginCode);
  authRouter.get('/me', authenticateToken, AuthController.getMe);

  const paymentRouter = express.Router();
  paymentRouter.post('/stk-push', PaymentController.stkPush);
  paymentRouter.post('/callback', PaymentController.callback);
  paymentRouter.post('/paystack/initialize', PaymentController.initializePaystack);
  paymentRouter.post('/paystack/stk-push', PaymentController.stkPushPaystack);
  paymentRouter.post('/paystack/webhook', PaymentController.paystackWebhook);
  paymentRouter.get('/debug/:reference', PaymentController.debugTransaction);
  paymentRouter.get('/status', PaymentController.checkStatus);
  paymentRouter.post('/cleanup', PaymentController.cleanupStale);

  const notificationRouter = express.Router();
  notificationRouter.post('/send-otp', SMSController.sendOTP);
  notificationRouter.post('/verify-otp', SMSController.verifyOTP);
  notificationRouter.post('/send-email', SMSController.sendTransactionalEmail);
  notificationRouter.get('/send-email', SMSController.sendTransactionalEmail);
  notificationRouter.post('/verify-email', SMSController.verifyEmail);
  notificationRouter.get('/verify-email', SMSController.verifyEmail);

  const dbRouter = express.Router();
  dbRouter.post('/transactions', DBController.createTransaction);
  dbRouter.get('/balance/:userId', DBController.getBalance);
  dbRouter.post('/profiles/select', DBController.selectProfile);
  dbRouter.post('/transactions/select', DBController.selectTransactions);
  dbRouter.get('/query', DBController.queryGeneric);
  dbRouter.post('/update', DBController.updateGeneric);
  dbRouter.post('/test-connection', DBController.testConnectionAndRunQuery);
  dbRouter.get('/config', DBController.getPostgresConfig);
  dbRouter.post('/config', DBController.savePostgresConfig);

  const statsRouter = express.Router();
  statsRouter.get('/dashboard', StatsController.getDashboardStats);

  const secureRouter = express.Router();
  secureRouter.get('/profiles/me', authenticateToken, AuthController.getMe);
  secureRouter.get('/transactions', authenticateToken, async (req, res) => {
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
  secureRouter.get('/stats', authenticateToken, StatsController.getDashboardStats);

  const adminRouter = express.Router();
  adminRouter.get('/logs', (req, res) => {
    res.status(200).json({ logs: logsBuffer });
  });
  adminRouter.post('/logs/clear', (req, res) => {
    logsBuffer = [];
    console.log('[SYSTEM] Circular logs buffer cleared by administrator.');
    res.status(200).json({ success: true, message: 'Logs cleared successfully' });
  });
  adminRouter.post('/env/verify', EnvController.verifyPassword);
  adminRouter.post('/env/change-password', EnvController.changePassword);
  adminRouter.post('/env/get', EnvController.getEnvVars);
  adminRouter.post('/env/update', EnvController.updateEnvVar);
  adminRouter.post('/env/delete', EnvController.deleteEnvVar);

  // Health checks
  const handleHealth = (req: express.Request, res: express.Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  };
  app.get('/health', handleHealth);
  app.get('/api/health', handleHealth);

  // Email/SMS proxy routes
  app.post('/proxy/verify-email', SMSController.verifyEmail);
  app.get('/proxy/verify-email', SMSController.verifyEmail);
  app.post('/proxy/send-email', SMSController.sendTransactionalEmail);
  app.get('/proxy/send-email', SMSController.sendTransactionalEmail);
  app.post('/api/proxy/verify-email', SMSController.verifyEmail);
  app.get('/api/proxy/verify-email', SMSController.verifyEmail);
  app.post('/api/proxy/send-email', SMSController.sendTransactionalEmail);
  app.get('/api/proxy/send-email', SMSController.sendTransactionalEmail);

  // Mount routers to BOTH /api/* and root /*
  // This ensures that whether Nginx passes full paths (/api/auth/send-code) or strips prefixes (/auth/send-code), requests are handled seamlessly.
  app.use('/api/auth', authRouter);
  app.use('/auth', authRouter);

  app.use('/api/payments', paymentRouter);
  app.use('/payments', paymentRouter);

  app.use('/api/notifications', notificationRouter);
  app.use('/notifications', notificationRouter);

  app.use('/api/db', dbRouter);
  app.use('/db', dbRouter);

  app.use('/api/stats', statsRouter);
  app.use('/stats', statsRouter);

  app.use('/api/secure', secureRouter);
  app.use('/secure', secureRouter);

  app.use('/api/admin', adminRouter);
  app.use('/admin', adminRouter);

  // Catch-all for undefined /api/* routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
  });

  // Process crash protection
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION]', reason);
  });

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
    const indexPath = path.join(distPath, 'index.html');
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(200).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Errandly Gateway API</title></head>
            <body style="font-family: sans-serif; background: #0b0f19; color: #f8fafc; padding: 40px; text-align: center;">
              <h2>Errandly API Backend is Active 🚀</h2>
              <p style="color: #94a3b8;">The backend server is running on Port 3000. To render the complete dashboard UI, run <code>npm run build</code> on your server.</p>
              <p><a href="/api/health" style="color: #6366f1;">Check /api/health</a></p>
            </body>
          </html>
        `);
      }
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
