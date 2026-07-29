import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Interface representing standard session details stored in JWT
 */
export interface DecodedUser {
  userId: string;
  email: string;
  role: string;
}

// Extend Express namespace globally to include `user` in Request type definitions
declare global {
  namespace Express {
    interface Request {
      user?: DecodedUser;
    }
  }
}

/**
 * Middleware: Extracts JWT from Authorization header, validates it, and attaches info to req.user.
 * Rejects requests with 401 Unauthorized status if token is invalid, expired, or missing.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  
  // Extract token from 'Bearer <token>' pattern
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access unauthorized: Token is missing from the Authorization Bearer header.'
    });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('[Error] JWT_SECRET is not configured in environment variables.');
    return res.status(401).json({
      success: false,
      error: 'Access unauthorized: Authentication configuration is missing.'
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as DecodedUser;
    
    // Attach decoded session details directly to request context
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    next();
  } catch (error: any) {
    console.warn('[Auth Middleware] Verification failed:', error.message);
    
    const isExpired = error.name === 'TokenExpiredError';
    const detailMsg = isExpired 
      ? 'Access unauthorized: Token has expired.' 
      : 'Access unauthorized: Token is invalid or tampered with.';

    return res.status(401).json({
      success: false,
      error: detailMsg
    });
  }
}
