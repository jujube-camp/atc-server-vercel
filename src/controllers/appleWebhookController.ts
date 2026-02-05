import type { FastifyRequest, FastifyReply } from 'fastify';
import { MembershipService, MembershipTier } from '../services/membershipService.js';
import { AppleWebhookV2Service } from '../services/appleWebhookV2Service.js';
import { prisma } from '../utils/prisma.js';
import { env } from '../config/env.js';
import { PRODUCT_ID_TO_TIER, SUPPORTED_PRODUCT_IDS } from '../config/pricing.js';

// V2 Notification format (JWT-based)
interface AppleServerNotificationV2 {
  signedPayload: string;
}

// V1 Notification format (legacy)
interface AppleServerNotificationV1 {
  notification_type?: string;
  password?: string;
  environment?: 'Sandbox' | 'PROD';
  unified_receipt?: {
    latest_receipt_info: Array<{
      product_id: string;
      transaction_id: string;
      original_transaction_id: string;
      purchase_date_ms: string;
      expires_date_ms: string;
      cancellation_date_ms?: string;
    }>;
  };
}

type AppleServerNotification = AppleServerNotificationV1 | AppleServerNotificationV2;

export class AppleWebhookController {
  /**
   * POST /api/v1/webhooks/apple
   * Handle Apple Server-to-Server notifications
   */
  static async handleNotification(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const notification = request.body as AppleServerNotification;
    
    // Detect V2 format (has signedPayload)
    const isV2 = 'signedPayload' in notification && typeof notification.signedPayload === 'string';
    let eventId: string | null = null;
    
    request.server.log.info(
      { 
        isV2,
        hasSignedPayload: isV2,
        hasNotificationType: 'notification_type' in notification,
        bodyKeys: Object.keys(notification),
      },
      '[AppleWebhook] 🔔 Incoming webhook notification from Apple'
    );

    try {
      const startTime = Date.now();

      // Record webhook event (best-effort, non-blocking)
      try {
        const created = await (prisma as any).appleWebhookEvent.create({
          data: {
            version: isV2 ? 'V2' : 'V1',
            notificationType: isV2 ? null : (notification as AppleServerNotificationV1).notification_type ?? null,
            environment: isV2 ? null : (notification as AppleServerNotificationV1).environment ?? null,
            signedPayload: isV2 ? (notification as AppleServerNotificationV2).signedPayload : null,
            payload: notification as any,
            status: 'received',
          },
        });
        eventId = created.id;
      } catch (error) {
        request.server.log.warn({ error }, '[AppleWebhook] Failed to record webhook event');
      }
      
      if (isV2) {
        // Handle V2 format (JWT-based)
        request.server.log.info('[AppleWebhook] 📦 Processing V2 notification (signedPayload)');
        await AppleWebhookV2Service.handleV2Notification(
          (notification as AppleServerNotificationV2).signedPayload,
          request.server.log,
          eventId ?? undefined
        );
      } else {
        // Handle V1 format (legacy unified_receipt)
        request.server.log.info('[AppleWebhook] 📦 Processing V1 notification (unified_receipt)');
        await this.handleV1Notification(notification as AppleServerNotificationV1, request.server.log);
      }
      
      const duration = Date.now() - startTime;
      request.server.log.info(
        { 
          duration: `${duration}ms`,
          version: isV2 ? 'V2' : 'V1',
        },
        '[AppleWebhook] ✅ Notification processed successfully'
      );

      if (eventId) {
        await (prisma as any).appleWebhookEvent.update({
          where: { id: eventId },
          data: {
            status: 'processed',
            processedAt: new Date(),
          },
        });
      }
      
      reply.code(200).send({ status: 'ok' });
    } catch (error) {
      request.server.log.error(
        { 
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error,
        }, 
        '[AppleWebhook] ❌ Failed to process notification'
      );
      if (eventId) {
        await (prisma as any).appleWebhookEvent.update({
          where: { id: eventId },
          data: {
            status: 'error',
            errorMessage: error instanceof Error ? error.message : String(error),
            processedAt: new Date(),
          },
        });
      }
      // Still return 200 to prevent Apple from retrying
      reply.code(200).send({ status: 'error' });
    }
  }

  /**
   * Handle V1 notification (legacy format with unified_receipt)
   */
  private static async handleV1Notification(
    notification: AppleServerNotificationV1,
    logger: any
  ): Promise<void> {
    // Verify the notification is from Apple by checking the password (shared secret)
    const sharedSecret = env.APPLE_SHARED_SECRET;
    if (!sharedSecret) {
      logger.error('[AppleWebhook] ❌ APPLE_SHARED_SECRET not configured - rejecting notification');
      throw new Error('APPLE_SHARED_SECRET not configured');
    }
    
    if (notification.password !== sharedSecret) {
      logger.warn(
        { 
          receivedPassword: notification.password?.substring(0, 8) + '...',
          notificationType: notification.notification_type,
        },
        '[AppleWebhook] ⚠️ Invalid shared secret - rejecting V1 notification'
      );
      throw new Error('Invalid shared secret');
    }
    
    logger.info(
      { 
        notificationType: notification.notification_type,
        environment: notification.environment,
      },
      '[AppleWebhook] ✅ V1 Notification authenticated successfully'
    );

    await this.processNotification(notification, logger);
  }

  /**
   * Process different types of V1 notifications
   */
  private static async processNotification(
    notification: AppleServerNotificationV1,
    logger: any
  ): Promise<void> {
    logger.info(
      { notificationType: notification.notification_type },
      '[AppleWebhook] 🔄 Processing notification...'
    );
    
    const receiptInfoArray = notification.unified_receipt?.latest_receipt_info;
    if (!receiptInfoArray || receiptInfoArray.length === 0) {
      logger.warn('[AppleWebhook] ⚠️ No receipt info in notification');
      return;
    }

    logger.info(
      { receiptCount: receiptInfoArray.length },
      '[AppleWebhook] 📝 Receipt info array received'
    );

    // Find the transaction with the latest expiration date
    // Note: latest_receipt_info array is NOT sorted by expiration date
    let latestReceipt = receiptInfoArray[0];
    if (receiptInfoArray.length > 1) {
      latestReceipt = receiptInfoArray.reduce((latest, current) => {
        const latestExpires = parseInt(latest.expires_date_ms || '0');
        const currentExpires = parseInt(current.expires_date_ms || '0');
        return currentExpires > latestExpires ? current : latest;
      });
      logger.info(
        { 
          count: receiptInfoArray.length,
          selectedTransactionId: latestReceipt.transaction_id,
          selectedExpiresDate: new Date(parseInt(latestReceipt.expires_date_ms)).toISOString()
        },
        '[AppleWebhook] 📌 Found multiple transactions, selected one with latest expiration'
      );
    }

    const originalTransactionId = latestReceipt.original_transaction_id;
    const transactionId = latestReceipt.transaction_id;
    const productId = latestReceipt.product_id;
    
    logger.info(
      { 
        originalTransactionId,
        transactionId,
        productId,
      },
      '[AppleWebhook] 🔍 Looking up payment record...'
    );
    
    // Find user by original transaction ID
    const payment = await MembershipService.findPaymentByOriginalTransactionId(originalTransactionId);

    if (!payment) {
      logger.warn(
        { 
          originalTransactionId,
          transactionId,
          productId,
        },
        '[AppleWebhook] ⚠️ No payment found for transaction - user may not have completed initial purchase verification yet'
      );
      return;
    }

    const userId = payment.userId;
    
    // Get user email for logging
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const userEmail = user?.email || 'unknown';
    
    logger.info(
      { 
        userId,
        userEmail,
        originalTransactionId,
        productId,
      },
      '[AppleWebhook] ✅ Found payment record for user'
    );
    
    // Map product ID to tier using centralized config
    const tier = PRODUCT_ID_TO_TIER[productId];
    if (!tier) {
      logger.warn(
        {
          productId,
          userId,
          supportedProductIds: SUPPORTED_PRODUCT_IDS,
        },
        '[AppleWebhook] ⚠️ Unknown product ID'
      );
      return;
    }
    
    logger.info(
      { 
        userId,
        tier,
        productId,
      },
      '[AppleWebhook] 📊 Mapped product to membership tier'
    );

    const expiresDate = new Date(parseInt(latestReceipt.expires_date_ms));
    
    switch (notification.notification_type) {
      case 'INITIAL_BUY':
      case 'DID_RENEW':
        // Subscription renewed successfully
        logger.info(
          { 
            userId, 
            productId,
            tier,
            expiresAt: expiresDate.toISOString(),
            notificationType: notification.notification_type,
          }, 
          '[AppleWebhook] 💳 Processing subscription renewal/purchase'
        );
        await MembershipService.updateMembership(
          userId,
          tier,
          expiresDate,
          logger
        );
        logger.info(
          { userId, tier, expiresAt: expiresDate.toISOString() },
          '[AppleWebhook] ✅ Membership updated successfully'
        );
        break;

      case 'DID_FAIL_TO_RENEW':
        // Subscription failed to renew (payment issue)
        logger.warn(
          { 
            userId,
            productId,
            expiresAt: expiresDate.toISOString(),
          }, 
          '[AppleWebhook] ⚠️ Subscription failed to renew - Apple will retry, not downgrading yet'
        );
        // Don't immediately downgrade - Apple will retry
        break;

      case 'DID_CHANGE_RENEWAL_STATUS':
        // User turned auto-renewal on or off
        logger.info(
          { 
            userId,
            productId,
            expiresAt: expiresDate.toISOString(),
          }, 
          '[AppleWebhook] 🔄 Renewal status changed by user'
        );
        break;

      case 'CANCEL':
        // User cancelled auto-renewal, but keeps access until expiration
        logger.info(
          { 
            userId,
            productId,
            tier,
            expiresAt: expiresDate.toISOString(),
          }, 
          '[AppleWebhook] 🚫 Subscription cancelled - maintaining access until expiration'
        );
        await MembershipService.updateMembership(
          userId,
          tier,
          expiresDate,
          logger
        );
        logger.info(
          { userId, expiresAt: expiresDate.toISOString() },
          '[AppleWebhook] ✅ Expiration date updated, user retains access'
        );
        break;

      case 'REFUND':
        // Subscription refunded - immediately revoke access
        logger.info(
          { 
            userId,
            productId,
            previousTier: tier,
          }, 
          '[AppleWebhook] 💸 Subscription refunded - revoking access immediately'
        );
        await MembershipService.updateMembership(
          userId,
          MembershipTier.FREE,
          null,
          logger
        );
        logger.info(
          { userId, newTier: MembershipTier.FREE },
          '[AppleWebhook] ✅ User downgraded to FREE tier'
        );
        break;

      case 'DID_CHANGE_RENEWAL_PREF':
        // User upgraded/downgraded subscription
        logger.info(
          { 
            userId,
            productId,
            tier,
            expiresAt: expiresDate.toISOString(),
          }, 
          '[AppleWebhook] 🔀 Subscription plan changed (upgrade/downgrade)'
        );
        await MembershipService.updateMembership(
          userId,
          tier,
          expiresDate,
          logger
        );
        logger.info(
          { userId, tier, expiresAt: expiresDate.toISOString() },
          '[AppleWebhook] ✅ Membership updated to new plan'
        );
        break;

      case 'INTERACTIVE_RENEWAL':
        // User renewed subscription through UI
        logger.info(
          { 
            userId,
            productId,
            tier,
            expiresAt: expiresDate.toISOString(),
          }, 
          '[AppleWebhook] 🔄 Interactive renewal by user'
        );
        await MembershipService.updateMembership(
          userId,
          tier,
          expiresDate,
          logger
        );
        logger.info(
          { userId, tier, expiresAt: expiresDate.toISOString() },
          '[AppleWebhook] ✅ Membership renewed successfully'
        );
        break;

      default:
        logger.warn(
          { 
            notificationType: notification.notification_type,
            userId: userId || 'unknown',
            productId: productId || 'unknown',
          },
          '[AppleWebhook] ⚠️ Unknown notification type received'
        );
    }
    
    logger.info(
      { 
        notificationType: notification.notification_type,
        userId,
      },
      '[AppleWebhook] ✅ Notification processing completed'
    );
  }
}

