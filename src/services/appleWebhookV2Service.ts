import { SignedDataVerifier, Environment, ResponseBodyV2DecodedPayload, NotificationTypeV2 } from '@apple/app-store-server-library';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';
import { MembershipService, MembershipTier } from './membershipService.js';
import { prisma } from '../utils/prisma.js';
import https from 'https';
import { PRODUCT_ID_TO_TIER, getPriceByBillingPeriod, DEFAULT_CURRENCY, SUPPORTED_PRODUCT_IDS } from '../config/pricing.js';

/**
 * Service for handling Apple App Store Server Notifications V2
 * V2 uses JWT signedPayload instead of the old unified_receipt format
 */
export class AppleWebhookV2Service {
  private static verifierProduction: SignedDataVerifier | null = null;
  private static verifierSandbox: SignedDataVerifier | null = null;

  /**
   * Get or create a verifier for the given environment.
   * We cache both PRODUCTION and SANDBOX verifiers so one webhook URL can receive both sandbox and production notifications.
   */
  private static async getVerifier(environment: Environment): Promise<SignedDataVerifier> {
    const cache = environment === Environment.PRODUCTION ? this.verifierProduction : this.verifierSandbox;
    if (cache) return cache;

    const appleRootCA = await this.downloadAppleRootCertificate();
    const bundleId = env.APPLE_CLIENT_ID || 'com.jujubecamp.aviateai';
    const verifier = new SignedDataVerifier(
      [appleRootCA],
      true,
      environment,
      bundleId
    );
    if (environment === Environment.PRODUCTION) {
      this.verifierProduction = verifier;
    } else {
      this.verifierSandbox = verifier;
    }
    return verifier;
  }

  /**
   * Download Apple Root CA-G3 certificate
   */
  private static async downloadAppleRootCertificate(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      https.get('https://www.apple.com/certificateauthority/AppleRootCA-G3.cer', (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Handle V2 webhook notification with signedPayload.
   * Tries PRODUCTION verifier first, then SANDBOX, so one URL can receive both sandbox and production notifications.
   */
  static async handleV2Notification(
    signedPayload: string,
    logger: FastifyBaseLogger,
    eventId?: string
  ): Promise<void> {
    let decodedPayload: ResponseBodyV2DecodedPayload;
    try {
      logger.info('[AppleWebhookV2] 🔓 Decoding signedPayload...');
      const prodVerifier = await this.getVerifier(Environment.PRODUCTION);
      try {
        decodedPayload = await prodVerifier.verifyAndDecodeNotification(signedPayload);
      } catch (prodErr) {
        logger.info('[AppleWebhookV2] Production verifier failed, trying Sandbox...');
        const sandboxVerifier = await this.getVerifier(Environment.SANDBOX);
        decodedPayload = await sandboxVerifier.verifyAndDecodeNotification(signedPayload);
      }
      logger.info(
        {
          notificationType: decodedPayload.notificationType,
          notificationUUID: decodedPayload.notificationUUID,
          environment: decodedPayload.data?.environment,
        },
        '[AppleWebhookV2] ✅ Payload decoded successfully'
      );
      if (eventId) {
        await (prisma as any).appleWebhookEvent.update({
          where: { id: eventId },
          data: {
            notificationType: decodedPayload.notificationType,
            notificationUUID: decodedPayload.notificationUUID,
            environment: decodedPayload.data?.environment,
          },
        });
      }
      await this.processV2Notification(decodedPayload, logger);
    } catch (error) {
      logger.error(
        { 
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
          } : error,
        },
        '[AppleWebhookV2] ❌ Failed to decode or process V2 notification'
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
      throw error;
    }
  }

  /**
   * Process decoded V2 notification
   */
  private static async processV2Notification(
    payload: ResponseBodyV2DecodedPayload,
    logger: FastifyBaseLogger
  ): Promise<void> {
    const notificationType = payload.notificationType;
    const data = payload.data;

    if (!data) {
      logger.warn('[AppleWebhookV2] ⚠️ No data in notification');
      return;
    }

    logger.info(
      {
        notificationType,
        bundleId: data.bundleId,
        environment: data.environment,
      },
      '[AppleWebhookV2] 🔄 Processing notification...'
    );

    // Decode transaction info
    const signedTransactionInfo = data.signedTransactionInfo;
    if (!signedTransactionInfo) {
      logger.warn('[AppleWebhookV2] ⚠️ No signedTransactionInfo in notification');
      return;
    }

    const env = payload.data?.environment === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;
    const verifier = await this.getVerifier(env);
    const transactionInfo = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);

    logger.info(
      {
        transactionId: transactionInfo.transactionId,
        originalTransactionId: transactionInfo.originalTransactionId,
        productId: transactionInfo.productId,
        purchaseDate: transactionInfo.purchaseDate,
        expiresDate: transactionInfo.expiresDate,
      },
      '[AppleWebhookV2] 📝 Transaction info decoded'
    );
    if (payload.notificationUUID) {
      await (prisma as any).appleWebhookEvent.updateMany({
        where: { notificationUUID: payload.notificationUUID },
        data: {
          transactionId: transactionInfo.transactionId,
          originalTransactionId: transactionInfo.originalTransactionId,
          productId: transactionInfo.productId,
        },
      });
    }

    // Find user by original transaction ID
    const payment = await prisma.payment.findFirst({
      where: { originalTransactionId: transactionInfo.originalTransactionId },
      include: { membership: { include: { user: true } } },
    });

    if (!payment) {
      logger.warn(
        {
          originalTransactionId: transactionInfo.originalTransactionId,
          transactionId: transactionInfo.transactionId,
        },
        '[AppleWebhookV2] ⚠️ No payment found for transaction - user may not have completed initial purchase yet'
      );
      return;
    }

    const userId = payment.userId;
    const userEmail = payment.membership?.user?.email || 'unknown';
    const productId = transactionInfo.productId;

    if (!productId) {
      logger.warn(
        {
          transactionId: transactionInfo.transactionId,
          originalTransactionId: transactionInfo.originalTransactionId,
        },
        '[AppleWebhookV2] ⚠️ No product ID in transaction info'
      );
      return;
    }

    logger.info(
      {
        userId,
        userEmail,
        originalTransactionId: transactionInfo.originalTransactionId,
        productId,
      },
      '[AppleWebhookV2] ✅ Found payment record for user'
    );

    // Map product ID to tier using centralized config
    const tier = PRODUCT_ID_TO_TIER[productId];
    if (!tier) {
      logger.warn(
        {
          productId,
          supportedProductIds: SUPPORTED_PRODUCT_IDS,
        },
        '[AppleWebhookV2] ⚠️ Unknown product ID'
      );
      return;
    }

    // Convert expiresDate (milliseconds) to Date
    const expiresDate = transactionInfo.expiresDate 
      ? new Date(transactionInfo.expiresDate) 
      : undefined;

    logger.info(
      {
        userId,
        tier,
        productId,
        expiresAt: expiresDate?.toISOString(),
      },
      '[AppleWebhookV2] 📊 Mapped product to membership tier'
    );

    // Handle different notification types
    switch (notificationType) {
      case NotificationTypeV2.DID_RENEW:
      case NotificationTypeV2.SUBSCRIBED:
        logger.info(
          {
            userId,
            productId,
            tier,
            expiresAt: expiresDate?.toISOString(),
            notificationType,
          },
          '[AppleWebhookV2] 💳 Processing subscription renewal/purchase'
        );
        
        if (expiresDate && transactionInfo.transactionId && transactionInfo.originalTransactionId) {
          // Check if this transaction has already been recorded
          const existingPayment = await MembershipService.findPaymentByTransactionId(
            transactionInfo.transactionId
          );

          if (!existingPayment) {
            // Create new payment record for this renewal
            logger.info(
              { 
                transactionId: transactionInfo.transactionId,
                userId 
              },
              '[AppleWebhookV2] 📝 Creating payment record for renewal'
            );

            const amount = getPriceByBillingPeriod(productId);

            await MembershipService.recordPayment(
              userId,
              transactionInfo.transactionId,
              transactionInfo.originalTransactionId,
              productId,
              tier,
              amount,
              DEFAULT_CURRENCY,
              'completed',
              undefined, // No receipt data in webhook
              expiresDate,
              logger
            );

            logger.info(
              { 
                transactionId: transactionInfo.transactionId,
                userId 
              },
              '[AppleWebhookV2] ✅ Payment record created for renewal'
            );
          } else {
            logger.info(
              { 
                transactionId: transactionInfo.transactionId,
                userId 
              },
              '[AppleWebhookV2] ℹ️ Payment record already exists, skipping creation'
            );
          }

          // Update membership
          await MembershipService.updateMembership(userId, tier, expiresDate, logger);
          logger.info(
            { userId, tier, expiresAt: expiresDate.toISOString() },
            '[AppleWebhookV2] ✅ Membership updated successfully'
          );
        } else {
          logger.warn(
            { userId, notificationType },
            '[AppleWebhookV2] ⚠️ No expiration date in renewal notification'
          );
        }
        break;

      case NotificationTypeV2.DID_FAIL_TO_RENEW:
        logger.warn(
          { userId, productId },
          '[AppleWebhookV2] ⚠️ Subscription failed to renew - Apple will retry'
        );
        break;

      case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
        logger.info(
          { userId, productId },
          '[AppleWebhookV2] 🔄 Renewal status changed by user'
        );
        break;

      case NotificationTypeV2.EXPIRED:
        logger.info(
          { userId, productId },
          '[AppleWebhookV2] ⏰ Subscription expired - downgrading to FREE'
        );
        await MembershipService.updateMembership(userId, MembershipTier.FREE, null, logger);
        break;

      case NotificationTypeV2.REFUND:
        logger.info(
          { userId, productId },
          '[AppleWebhookV2] 💸 Subscription refunded - revoking access immediately'
        );
        await MembershipService.updateMembership(userId, MembershipTier.FREE, null, logger);
        logger.info(
          { userId, newTier: MembershipTier.FREE },
          '[AppleWebhookV2] ✅ User downgraded to FREE tier'
        );
        break;

      case NotificationTypeV2.REVOKE:
        logger.info(
          { userId, productId },
          '[AppleWebhookV2] 🚫 Subscription revoked - removing access'
        );
        await MembershipService.updateMembership(userId, MembershipTier.FREE, null, logger);
        break;

      default:
        logger.info(
          {
            notificationType,
            userId,
            productId,
          },
          '[AppleWebhookV2] ℹ️ Unhandled notification type'
        );
    }

    logger.info(
      {
        notificationType,
        userId,
      },
      '[AppleWebhookV2] ✅ Notification processing completed'
    );
  }
}
