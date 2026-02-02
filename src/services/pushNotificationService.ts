import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import type { FastifyBaseLogger } from 'fastify';
import { logger as defaultLogger } from '../utils/logger.js';
import { prisma } from '../utils/prisma.js';

export class PushNotificationService {
  private static expo = new Expo();

  /**
   * Send a push notification to a specific device
   */
  static async sendToDevice(
    pushToken: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<boolean> {
    if (!Expo.isExpoPushToken(pushToken)) {
      logger.warn({ pushToken }, '[PushNotificationService] Invalid Expo push token');
      return false;
    }

    const message: ExpoPushMessage = {
      to: pushToken,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
    };

    try {
      const tickets = await this.expo.sendPushNotificationsAsync([message]);
      
      if (tickets[0].status === 'error') {
        logger.error(
          { error: tickets[0].message, pushToken },
          '[PushNotificationService] Failed to send push notification'
        );
        return false;
      }

      logger.info(
        { pushToken, title },
        '[PushNotificationService] Push notification sent successfully'
      );
      return true;
    } catch (error) {
      logger.error(
        { error, pushToken },
        '[PushNotificationService] Error sending push notification'
      );
      return false;
    }
  }

  /**
   * Send session invalidation notification to a user's device
   */
  static async sendSessionInvalidatedNotification(
    userId: string,
    deviceId: string,
    newDeviceName?: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<void> {
    try {
      // Get user's push token
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { pushToken: true },
      });

      if (!user?.pushToken) {
        logger.info(
          { userId, deviceId },
          '[PushNotificationService] No push token found for user'
        );
        return;
      }

      const deviceInfo = newDeviceName ? ` on ${newDeviceName}` : ' on another device';
      
      await this.sendToDevice(
        user.pushToken,
        'Account Login Alert',
        `Your account has been logged in${deviceInfo}. You have been logged out from this device.`,
        {
          type: 'SESSION_INVALIDATED',
          newDeviceName,
        },
        logger
      );
    } catch (error) {
      logger.error(
        { error, userId, deviceId },
        '[PushNotificationService] Failed to send session invalidation notification'
      );
    }
  }

  /**
   * Update user's push token
   */
  static async updatePushToken(
    userId: string,
    pushToken: string | null,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<void> {
    try {
      // Validate token if provided
      if (pushToken && !Expo.isExpoPushToken(pushToken)) {
        logger.warn({ userId, pushToken }, '[PushNotificationService] Invalid push token format');
        return;
      }

      await prisma.user.update({
        where: { id: userId },
        data: { pushToken },
      });

      logger.info(
        { userId, hasPushToken: !!pushToken },
        '[PushNotificationService] Push token updated'
      );
    } catch (error) {
      logger.error(
        { error, userId },
        '[PushNotificationService] Failed to update push token'
      );
    }
  }

  /**
   * Send device switch notification (for premium users)
   */
  static async sendDeviceSwitchNotification(
    userId: string,
    oldDeviceId: string,
    newDeviceName?: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<void> {
    try {
      // Get all auth sessions for the old device
      const oldSessions = await prisma.authSession.findMany({
        where: {
          userId,
          deviceId: oldDeviceId,
          isActive: true,
        },
        select: { id: true },
      });

      if (oldSessions.length === 0) {
        logger.info(
          { userId, oldDeviceId },
          '[PushNotificationService] No active sessions found for old device'
        );
        return;
      }

      // Send notification
      await this.sendSessionInvalidatedNotification(
        userId,
        oldDeviceId,
        newDeviceName,
        logger
      );
    } catch (error) {
      logger.error(
        { error, userId, oldDeviceId },
        '[PushNotificationService] Failed to send device switch notification'
      );
    }
  }
}
