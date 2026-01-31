import jwt from 'jsonwebtoken';
import crypto from 'crypto';

/**
 * JWT payload structure for user sessions
 */
export interface JwtPayload {
  telegramUserId: string;
  firstName: string;
  username?: string | undefined;
  iat?: number;
  exp?: number;
}

/**
 * Gets or generates a JWT secret from the bot token.
 * Uses HMAC-SHA256 of the bot token as a secure secret.
 */
export function getJwtSecret(botToken: string): string {
  return crypto.createHash('sha256').update(`jwt_secret_${botToken}`).digest('hex');
}

/**
 * Token expiration time (7 days)
 */
const TOKEN_EXPIRATION = '7d';

/**
 * Creates a JWT token for a user session
 */
export function createToken(payload: Omit<JwtPayload, 'iat' | 'exp'>, secret: string): string {
  return jwt.sign(payload, secret, {
    expiresIn: TOKEN_EXPIRATION,
    algorithm: 'HS256',
  });
}

/**
 * Verifies and decodes a JWT token
 * Returns null if token is invalid or expired
 */
export function verifyToken(token: string, secret: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Extracts token from Authorization header
 * Supports "Bearer <token>" format
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return token.length > 0 ? token : null;
  }

  return null;
}
