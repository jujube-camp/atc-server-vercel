import { randomBytes } from 'crypto';
import { prisma } from '../utils/prisma.js';

export interface RefreshTokenData {
  token: string;
  expiresAt: Date;
}

export class RefreshTokenService {
  /**
   * Generate a new refresh token
   */
  static generateRefreshToken(): RefreshTokenData {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    return {
      token,
      expiresAt,
    };
  }

  /**
   * Store refresh token for a user
   */
  static async storeRefreshToken(
    userId: string,
    refreshTokenData: RefreshTokenData
  ): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: refreshTokenData.token,
        refreshTokenExpiresAt: refreshTokenData.expiresAt,
      },
    });
  }

  /**
   * Verify and get user from refresh token
   */
  static async verifyRefreshToken(refreshToken: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { refreshToken },
      select: { id: true, refreshTokenExpiresAt: true },
    });

    if (!user || !user.refreshTokenExpiresAt) {
      return null;
    }

    // Check if token is expired
    if (user.refreshTokenExpiresAt < new Date()) {
      // Clean up expired token
      await this.revokeRefreshToken(refreshToken);
      return null;
    }

    return user.id;
  }

  /**
   * Revoke refresh token
   */
  static async revokeRefreshToken(refreshToken: string): Promise<void> {
    await prisma.user.updateMany({
      where: { refreshToken },
      data: {
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });
  }

  /**
   * Revoke all refresh tokens for a user
   */
  static async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });
  }

  /**
   * Clean up expired refresh tokens
   */
  static async cleanupExpiredTokens(): Promise<number> {
    const result = await prisma.user.updateMany({
      where: {
        refreshTokenExpiresAt: {
          lt: new Date(),
        },
      },
      data: {
        refreshToken: null,
        refreshTokenExpiresAt: null,
      },
    });

    return result.count;
  }
}
