import { describe, it, expect } from 'vitest';
import { createToken, verifyToken, extractBearerToken, getJwtSecret, JwtPayload } from './jwt.js';

describe('JWT utilities', () => {
  const botToken = 'test-bot-token-12345';
  const secret = getJwtSecret(botToken);

  describe('getJwtSecret', () => {
    it('should generate consistent secret from bot token', () => {
      const secret1 = getJwtSecret(botToken);
      const secret2 = getJwtSecret(botToken);
      expect(secret1).toBe(secret2);
    });

    it('should generate different secrets for different tokens', () => {
      const secret1 = getJwtSecret('token-1');
      const secret2 = getJwtSecret('token-2');
      expect(secret1).not.toBe(secret2);
    });

    it('should return hex string of appropriate length', () => {
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('createToken', () => {
    it('should create a valid JWT token', () => {
      const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
        telegramUserId: '12345',
        firstName: 'John',
        username: 'johndoe',
      };

      const token = createToken(payload, secret);
      expect(token).toBeTruthy();
      expect(token.split('.')).toHaveLength(3);
    });

    it('should handle payload without optional username', () => {
      const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
        telegramUserId: '12345',
        firstName: 'John',
      };

      const token = createToken(payload, secret);
      expect(token).toBeTruthy();
    });
  });

  describe('verifyToken', () => {
    it('should verify and decode a valid token', () => {
      const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
        telegramUserId: '12345',
        firstName: 'John',
        username: 'johndoe',
      };

      const token = createToken(payload, secret);
      const decoded = verifyToken(token, secret);

      expect(decoded).not.toBeNull();
      expect(decoded?.telegramUserId).toBe('12345');
      expect(decoded?.firstName).toBe('John');
      expect(decoded?.username).toBe('johndoe');
      expect(decoded?.iat).toBeDefined();
      expect(decoded?.exp).toBeDefined();
    });

    it('should return null for invalid token', () => {
      const decoded = verifyToken('invalid-token', secret);
      expect(decoded).toBeNull();
    });

    it('should return null for token with wrong secret', () => {
      const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
        telegramUserId: '12345',
        firstName: 'John',
      };

      const token = createToken(payload, secret);
      const decoded = verifyToken(token, 'wrong-secret');
      expect(decoded).toBeNull();
    });

    it('should return null for malformed token', () => {
      expect(verifyToken('', secret)).toBeNull();
      expect(verifyToken('abc.def', secret)).toBeNull();
      expect(verifyToken('abc.def.ghi.jkl', secret)).toBeNull();
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token from Bearer header', () => {
      const token = extractBearerToken('Bearer my-jwt-token');
      expect(token).toBe('my-jwt-token');
    });

    it('should return null for non-Bearer header', () => {
      expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
      expect(extractBearerToken('tg {"id":123}')).toBeNull();
    });

    it('should return null for undefined header', () => {
      expect(extractBearerToken(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractBearerToken('')).toBeNull();
    });

    it('should handle Bearer with empty token', () => {
      expect(extractBearerToken('Bearer ')).toBe('');
    });
  });

  describe('Token roundtrip', () => {
    it('should successfully create and verify token', () => {
      const originalPayload = {
        telegramUserId: '987654321',
        firstName: 'Alice',
        username: 'alice_in_wonderland',
      };

      const token = createToken(originalPayload, secret);
      const decoded = verifyToken(token, secret);

      expect(decoded).not.toBeNull();
      expect(decoded?.telegramUserId).toBe(originalPayload.telegramUserId);
      expect(decoded?.firstName).toBe(originalPayload.firstName);
      expect(decoded?.username).toBe(originalPayload.username);
    });
  });
});
