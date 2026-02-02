import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../server.js';
import type { FastifyInstance } from 'fastify';

describe('Auth Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `test${Date.now()}@example.com`,
          password: 'testpassword123',
          displayName: 'Test Pilot',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('user');
      expect(body.user).toHaveProperty('id');
      expect(body.user).toHaveProperty('email');
      expect(body.user.displayName).toBe('Test Pilot');
    });

    it('should reject registration with invalid email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'invalid-email',
          password: 'testpassword123',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject registration with short password', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'test@example.com',
          password: 'short',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const testEmail = `login${Date.now()}@example.com`;
    const testPassword = 'testpassword123';

    beforeAll(async () => {
      // Register a user first
      await server.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });
    });

    it('should login with valid credentials', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('user');
    });

    it('should reject login with invalid password', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject login with non-existent email', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'nonexistent@example.com',
          password: 'password123',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

