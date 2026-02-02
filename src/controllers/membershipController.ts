import type { FastifyRequest, FastifyReply } from 'fastify';
import { MembershipService, MembershipTier } from '../services/membershipService.js';
import { AppleReceiptService } from '../services/appleReceiptService.js';
import { PushNotificationService } from '../services/pushNotificationService.js';
import { prisma } from '../utils/prisma.js';

export class MembershipController {
  /**
   * GET /api/v1/membership
   * Get current user's membership info (optional authentication)
   * Returns default FREE tier if not authenticated
   */
  static async getMembership(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request.user as any)?.userId;
    
    // If not authenticated, return default FREE tier
    if (!userId) {
      return reply.send({
        membership: {
          tier: MembershipTier.FREE,
          expiresAt: null,
          isActive: true,
          subscriptionType: null,
        },
        limits: {
          maxTrainingSessions: 2,
          maxRecordingAnalyses: 0,
          trainingSessionsUsed: 0,
          recordingAnalysesUsed: 0,
          trainingSessionsResetAt: null,
          recordingAnalysesResetAt: null,
        },
      });
    }
    
    const membership = await MembershipService.getMembership(userId, request.server.log);
    const limits = await MembershipService.getUsageLimits(userId);

    // Get subscription type from latest payment
    let subscriptionType: 'monthly' | 'yearly' | null = null;
    if (membership.tier !== MembershipTier.FREE) {
      try {
        const payments = await MembershipService.getPaymentHistory(userId);
        if (payments.length > 0) {
          const latestPayment = payments[0];
          subscriptionType = latestPayment.productId.includes('.yearly') ? 'yearly' : 'monthly';
        }
      } catch (error) {
        request.server.log.warn({ error, userId }, '[MembershipController] Failed to get payment history for subscription type');
        // Continue without subscription type - it's optional
      }
    }

    reply.send({
      membership: {
        tier: membership.tier,
        expiresAt: membership.expiresAt,
        isActive: MembershipService.isMembershipActive(membership),
        subscriptionType,
      },
      limits,
    });
  }

  /**
   * POST /api/v1/membership/verify-payment
   * Verify and process Apple payment
   */
  static async verifyPayment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request.user as any).userId;
    const body = request.body as {
      transactionId: string;
      productId: string;
      receiptData: string;
      deviceId?: string;
      deviceName?: string;
      deviceModel?: string;
    };
    
    // Log received body for debugging
    request.log.info(
      { 
        body: { 
          transactionId: body.transactionId, 
          productId: body.productId,
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          deviceModel: body.deviceModel,
          receiptDataLength: body.receiptData?.length 
        } 
      },
      '[MembershipController] verifyPayment request received'
    );
    
    const { transactionId, productId, receiptData, deviceId, deviceName, deviceModel } = body;

    // Validate device info for premium purchases
    if (!deviceId) {
      request.log.warn({ body: request.body }, '[MembershipController] Device ID missing in request');
      return reply.code(400).send({ error: 'Device ID is required' });
    }

    // Map product IDs to tiers (support both monthly and yearly)
    const productIdToTier: Record<string, MembershipTier> = {
      'com.aviateai.premium.monthly': MembershipTier.PREMIUM,
      'com.aviateai.premium.yearly': MembershipTier.PREMIUM,
      // Legacy product IDs for backwards compatibility
      'com.aviateai.golden.monthly': MembershipTier.PREMIUM,
      'com.aviateai.golden.yearly': MembershipTier.PREMIUM,
    };

    const tier = productIdToTier[productId];
    if (!tier) {
      return reply.code(400).send({ error: 'Invalid product ID' });
    }

    try {
      // First verify the receipt to get Apple's transaction IDs
      // This is necessary because the client's transactionId might differ from Apple's
      request.server.log.info(
        { clientTransactionId: transactionId, productId, userId }, 
        '[MembershipController] Verifying receipt with Apple (early check for deduplication)'
      );
      
      const verifiedReceipt = await AppleReceiptService.verifyReceipt(
        receiptData,
        request.server.log
      );

      request.server.log.info(
        { 
          verifiedReceipt: {
            productId: verifiedReceipt.productId,
            transactionId: verifiedReceipt.transactionId,
            originalTransactionId: verifiedReceipt.originalTransactionId,
            expiresDate: verifiedReceipt.expiresDate,
            isCancelled: verifiedReceipt.isCancelled,
            environment: verifiedReceipt.environment
          },
          requestData: { productId, transactionId }
        },
        '[MembershipController] Receipt verified, checking for existing payment'
      );

      // Check if original_transaction_id is already bound to another user
      const paymentByOriginalTxId = await MembershipService.findPaymentByOriginalTransactionId(
        verifiedReceipt.originalTransactionId
      );
      
      if (paymentByOriginalTxId && paymentByOriginalTxId.userId !== userId) {
        request.server.log.warn(
          { 
            originalTransactionId: verifiedReceipt.originalTransactionId,
            currentUserId: userId, 
            existingUserId: paymentByOriginalTxId.userId 
          },
          '[MembershipController] Original transaction ID already bound to another user'
        );
        return reply.code(403).send({ 
          error: 'This subscription is already associated with another account. Each Apple ID subscription can only be used by one account.' 
        });
      }

      // Check if this transaction has already been processed
      // Use Apple's transaction ID for the check
      const existingPayment = await MembershipService.findPaymentByTransactionId(
        verifiedReceipt.transactionId
      );
      
      if (existingPayment) {
        // Security: Verify the transaction belongs to the current user
        if (existingPayment.userId !== userId) {
          request.server.log.warn(
            { 
              appleTransactionId: verifiedReceipt.transactionId,
              userId, 
              existingPaymentUserId: existingPayment.userId 
            },
            '[MembershipController] Transaction ID belongs to different user'
          );
          return reply.code(403).send({ error: 'This transaction does not belong to your account' });
        }

        request.server.log.info(
          { 
            appleTransactionId: verifiedReceipt.transactionId,
            clientTransactionId: transactionId,
            userId 
          },
          '[MembershipController] Transaction already processed (duplicate request)'
        );
        
        // Return success with current membership status
        const membership = await MembershipService.getMembership(userId);
        const subscriptionType = existingPayment.productId.includes('.yearly') ? 'yearly' : 'monthly';
        return reply.send({
          success: true,
          membership: {
            tier: membership.tier,
            expiresAt: membership.expiresAt,
            isActive: MembershipService.isMembershipActive(membership),
            subscriptionType,
          },
        });
      }

      // Validate the receipt matches the request (already verified above)
      if (verifiedReceipt.productId !== productId) {
        request.server.log.warn(
          { expected: productId, actual: verifiedReceipt.productId },
          '[MembershipController] Product ID mismatch'
        );
        return reply.code(400).send({ error: 'Receipt product ID does not match' });
      }

      // In sandbox environment, the transactionId from the client might not match
      // the one returned by Apple. We'll use the one from Apple's receipt instead.
      // Check if either the transactionId or originalTransactionId matches
      const transactionMatches = 
        verifiedReceipt.transactionId === transactionId ||
        verifiedReceipt.originalTransactionId === transactionId;
      
      if (!transactionMatches) {
        request.server.log.warn(
          { 
            clientTransactionId: transactionId,
            appleTransactionId: verifiedReceipt.transactionId,
            appleOriginalTransactionId: verifiedReceipt.originalTransactionId,
            environment: verifiedReceipt.environment
          },
          '[MembershipController] Transaction ID mismatch - neither transactionId nor originalTransactionId matches'
        );
        
        // In sandbox environment, be more lenient - just log warning but continue
        if (verifiedReceipt.environment === 'Sandbox') {
          request.server.log.info(
            { environment: 'Sandbox' },
            '[MembershipController] Sandbox environment detected - proceeding despite transaction ID mismatch'
          );
        } else {
          return reply.code(400).send({ error: 'Receipt transaction ID does not match' });
        }
      }

      // Check if subscription is active
      // Note: A cancelled subscription is still active until its expiration date
      if (!AppleReceiptService.isSubscriptionActive(verifiedReceipt)) {
        const reason = verifiedReceipt.isCancelled ? 'cancelled and expired' : 'expired';
        request.server.log.warn(
          { 
            transactionId, 
            expiresDate: verifiedReceipt.expiresDate,
            isCancelled: verifiedReceipt.isCancelled 
          },
          `[MembershipController] Subscription is ${reason}`
        );
        return reply.code(400).send({ 
          error: verifiedReceipt.isCancelled 
            ? 'This subscription has been cancelled and expired' 
            : 'This subscription has expired' 
        });
      }

      // Calculate price based on product ID (for logging)
      const isYearly = productId.includes('.yearly');
      const amount = isYearly ? 69.99 : 14.99;

      // Use the transaction ID from Apple's receipt (not the client's)
      // This ensures consistency with Apple's records
      const appleTransactionId = verifiedReceipt.transactionId;
      
      request.server.log.info(
        { 
          clientTransactionId: transactionId,
          appleTransactionId,
          willUseTransactionId: appleTransactionId
        },
        '[MembershipController] Using Apple transaction ID for payment record'
      );

      // Record payment with expiration date from Apple's receipt
      await MembershipService.recordPayment(
        userId,
        appleTransactionId, // Use Apple's transaction ID
        verifiedReceipt.originalTransactionId,
        productId,
        tier,
        amount,
        'USD',
        'completed',
        receiptData,
        verifiedReceipt.expiresDate || null,
        request.server.log,
        deviceId,
        deviceName,
        deviceModel
      );

      // Set this device as the active device
      await MembershipService.updateUserActiveDevice(userId, deviceId, deviceName, request.server.log);

      const membership = await MembershipService.getMembership(userId, request.server.log);
      const subscriptionType = productId.includes('.yearly') ? 'yearly' : 'monthly';
      
      request.server.log.info(
        { 
          userId, 
          transactionId,
          tier: membership.tier,
          expiresAt: membership.expiresAt,
          subscriptionType
        },
        '[MembershipController] Payment processed successfully'
      );
      
      reply.send({
        success: true,
        membership: {
          tier: membership.tier,
          expiresAt: membership.expiresAt,
          isActive: MembershipService.isMembershipActive(membership),
          subscriptionType,
        },
      });
    } catch (error) {
      request.server.log.error(
        { 
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error,
          userId,
          transactionId,
          productId
        }, 
        '[MembershipController] Failed to process payment'
      );
      reply.code(500).send({ 
        error: 'Failed to process payment',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/membership/limits
   * Get usage limits for current user
   */
  static async getLimits(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request.user as any).userId;
    const limits = await MembershipService.getUsageLimits(userId);
    reply.send(limits);
  }

  /**
   * GET /api/v1/membership/check-access
   * Check if user can access a specific feature
   */
  static async checkAccess(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request.user as any).userId;
    const { feature, icao, trainingMode } = request.query as {
      feature: 'liveatc' | 'training_mode' | 'recording_upload' | 'recording_analysis';
      icao?: string;
      trainingMode?: string;
    };

    const membership = await MembershipService.getMembership(userId, request.server.log);

    let canAccess = false;
    if (feature === 'liveatc' && icao) {
      canAccess = await MembershipService.canAccessAirport(membership, icao);
    } else if (feature === 'training_mode' && trainingMode) {
      canAccess = await MembershipService.canAccessTrainingMode(membership, trainingMode);
    } else {
      canAccess = MembershipService.canAccessFeature(membership, feature);
    }

    reply.send({ canAccess });
  }

  /**
   * GET /api/v1/membership/plans
   * Get available membership plans
   */
  static async getPlans(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const plans = await MembershipService.getMembershipPlans();
    reply.send({ plans });
  }

  /**
   * GET /api/v1/membership/history
   * Get user's subscription history
   */
  static async getHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request.user as any).userId;
    
    try {
      const payments = await MembershipService.getPaymentHistory(userId);
      reply.send({ payments });
    } catch (error) {
      request.server.log.error({ error }, '[MembershipController] Failed to get payment history');
      reply.code(500).send({ error: 'Failed to get payment history' });
    }
  }

  /**
   * POST /api/v1/membership/restore
   * Restore purchases from Apple receipt
   */
  static async restorePurchases(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = (request.user as any).userId;
    const { receiptData, deviceId, deviceName, deviceModel } = request.body as {
      receiptData: string;
      deviceId?: string;
      deviceName?: string;
      deviceModel?: string;
    };

    if (!receiptData) {
      return reply.code(400).send({ error: 'Receipt data is required' });
    }

    if (!deviceId) {
      return reply.code(400).send({ error: 'Device ID is required' });
    }

    try {
      request.server.log.info({ userId }, '[MembershipController] Restoring purchases');
      
      // Verify receipt with Apple
      const verifiedReceipt = await AppleReceiptService.verifyReceipt(
        receiptData,
        request.server.log
      );

      request.server.log.info(
        { 
          userId,
          productId: verifiedReceipt.productId,
          expiresDate: verifiedReceipt.expiresDate,
          isCancelled: verifiedReceipt.isCancelled,
          isActive: AppleReceiptService.isSubscriptionActive(verifiedReceipt),
        },
        '[MembershipController] Receipt verification result'
      );

      // Check if subscription is still active
      if (!AppleReceiptService.isSubscriptionActive(verifiedReceipt)) {
        const expiresDate = verifiedReceipt.expiresDate;
        const hasExpired = expiresDate && expiresDate < new Date();
        
        let errorMessage = 'No active subscription found. ';
        if (hasExpired) {
          errorMessage += `Your subscription expired on ${expiresDate.toLocaleDateString()}. Please renew your subscription.`;
        } else if (verifiedReceipt.isCancelled) {
          errorMessage += 'Your subscription has been cancelled.';
        } else {
          errorMessage += 'Please check your subscription status in the App Store.';
        }
        
        return reply.code(400).send({ 
          error: errorMessage,
          expiresDate: verifiedReceipt.expiresDate,
          isCancelled: verifiedReceipt.isCancelled,
        });
      }

      // Map product ID to tier
      const productIdToTier: Record<string, MembershipTier> = {
        'com.aviateai.premium.monthly': MembershipTier.PREMIUM,
        'com.aviateai.premium.yearly': MembershipTier.PREMIUM,
        'com.aviateai.golden.monthly': MembershipTier.PREMIUM,
        'com.aviateai.golden.yearly': MembershipTier.PREMIUM,
      };

      const tier = productIdToTier[verifiedReceipt.productId];
      if (!tier) {
        return reply.code(400).send({ error: 'Unknown product ID' });
      }

      // Check if original_transaction_id is already bound to another user
      const paymentByOriginalTxId = await MembershipService.findPaymentByOriginalTransactionId(
        verifiedReceipt.originalTransactionId
      );

      if (paymentByOriginalTxId && paymentByOriginalTxId.userId !== userId) {
        request.server.log.warn(
          { 
            originalTransactionId: verifiedReceipt.originalTransactionId,
            currentUserId: userId, 
            existingUserId: paymentByOriginalTxId.userId 
          },
          '[MembershipController] Restore denied - subscription belongs to different user'
        );
        return reply.code(403).send({ 
          error: 'This subscription is already associated with another account. Each subscription can only be used by one account.' 
        });
      }

      // Get user's current active device
      const user = await MembershipService.getUserById(userId);

      // If switching devices, invalidate old device sessions and send notification
      if (user && user.activeDeviceId && user.activeDeviceId !== deviceId) {
        // Deactivate all sessions on the old device
        await prisma.authSession.updateMany({
          where: {
            userId,
            deviceId: user.activeDeviceId,
            isActive: true,
          },
          data: {
            isActive: false,
          },
        });

        request.server.log.info(
          { 
            userId, 
            oldDeviceId: user.activeDeviceId, 
            newDeviceId: deviceId 
          },
          '[MembershipController] Deactivated sessions on old device due to device switch'
        );

        // Send push notification to old device
        await PushNotificationService.sendSessionInvalidatedNotification(
          userId,
          user.activeDeviceId,
          deviceName,
          request.server.log
        );
      }

      // Security: Check if this transaction already belongs to another user
      // This prevents users from restoring purchases made by other accounts on the same device
      const existingPayment = await MembershipService.findPaymentByTransactionId(
        verifiedReceipt.transactionId
      );

      if (existingPayment) {
        // If the transaction exists and belongs to a different user, deny the restore
        if (existingPayment.userId !== userId) {
          request.server.log.warn(
            { 
              transactionId: verifiedReceipt.transactionId,
              originalTransactionId: verifiedReceipt.originalTransactionId,
              currentUserId: userId, 
              existingUserId: existingPayment.userId 
            },
            '[MembershipController] Restore denied - transaction belongs to different user'
          );
          return reply.code(403).send({ 
            error: 'This subscription is already associated with another account. Each subscription can only be used by one account.' 
          });
        }

        // Transaction belongs to current user - this is a valid restore
        request.server.log.info(
          { 
            transactionId: verifiedReceipt.transactionId,
            userId 
          },
          '[MembershipController] Valid restore - transaction belongs to current user'
        );
      } else {
        // No existing payment record - this is the first time this transaction is being processed
        // Record the payment to establish ownership
        request.server.log.info(
          { 
            transactionId: verifiedReceipt.transactionId,
            userId 
          },
          '[MembershipController] First time processing this transaction - recording payment'
        );

        const isYearly = verifiedReceipt.productId.includes('.yearly');
        const amount = isYearly ? 69.99 : 14.99;

        await MembershipService.recordPayment(
          userId,
          verifiedReceipt.transactionId,
          verifiedReceipt.originalTransactionId,
          verifiedReceipt.productId,
          tier,
          amount,
          'USD',
          'completed',
          receiptData,
          verifiedReceipt.expiresDate || null,
          request.server.log,
          deviceId,
          deviceName,
          deviceModel
        );
      }

      // Update user's active device (allow device switching)
      await MembershipService.updateUserActiveDevice(userId, deviceId, deviceName, request.server.log);

      // Update membership with expiration date from Apple receipt
      request.server.log.info(
        { 
          userId, 
          tier, 
          expiresDate: verifiedReceipt.expiresDate,
          productId: verifiedReceipt.productId 
        },
        '[MembershipController] Updating membership with Apple receipt expiration'
      );
      
      await MembershipService.updateMembership(
        userId,
        tier,
        verifiedReceipt.expiresDate || null,
        request.server.log
      );

      const membership = await MembershipService.getMembership(userId, request.server.log);
      
      // Get subscription type from product ID
      const subscriptionType = verifiedReceipt.productId.includes('.yearly') ? 'yearly' : 'monthly';
      
      reply.send({
        success: true,
        membership: {
          tier: membership.tier,
          expiresAt: membership.expiresAt,
          isActive: MembershipService.isMembershipActive(membership),
          subscriptionType,
        },
      });
    } catch (error) {
      request.server.log.error({ error }, '[MembershipController] Failed to restore purchases');
      reply.code(500).send({ error: 'Failed to restore purchases' });
    }
  }
}


