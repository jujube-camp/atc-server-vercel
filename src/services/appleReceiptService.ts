import type { FastifyBaseLogger } from 'fastify';
import { logger as defaultLogger } from '../utils/logger.js';
import { env } from '../config/env.js';

interface AppleReceiptVerificationResponse {
  status: number;
  environment: 'Sandbox' | 'Production';
  receipt: {
    bundle_id: string;
    application_version: string;
    in_app: Array<{
      product_id: string;
      transaction_id: string;
      original_transaction_id: string;
      purchase_date_ms: string;
      expires_date_ms?: string;
      cancellation_date_ms?: string;
    }>;
  };
  latest_receipt_info?: Array<{
    product_id: string;
    transaction_id: string;
    original_transaction_id: string;
    purchase_date_ms: string;
    expires_date_ms: string;
    cancellation_date_ms?: string;
    is_trial_period: string;
    is_in_intro_offer_period: string;
  }>;
  pending_renewal_info?: Array<{
    auto_renew_product_id: string;
    auto_renew_status: string;
    expiration_intent?: string;
  }>;
}

export interface VerifiedReceipt {
  isValid: boolean;
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  purchaseDate: Date;
  expiresDate?: Date;
  isCancelled: boolean;
  isTrialPeriod: boolean;
  environment: 'Sandbox' | 'Production';
}

export class AppleReceiptService {
  private static readonly PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
  private static readonly SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';
  
  /**
   * Verify receipt with Apple's servers
   */
  static async verifyReceipt(
    receiptData: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<VerifiedReceipt> {
    const password = env.APPLE_SHARED_SECRET;
    
    if (!password) {
      throw new Error('APPLE_SHARED_SECRET not configured');
    }

    // Try production first
    let response = await this.sendVerificationRequest(
      this.PRODUCTION_URL,
      receiptData,
      password,
      logger
    );

    // If status is 21007, receipt is from sandbox, retry with sandbox URL
    if (response.status === 21007) {
      logger.info('[AppleReceipt] Receipt is from sandbox, retrying with sandbox URL');
      response = await this.sendVerificationRequest(
        this.SANDBOX_URL,
        receiptData,
        password,
        logger
      );
    }

    return this.parseVerificationResponse(response, logger);
  }

  /**
   * Send verification request to Apple
   */
  private static async sendVerificationRequest(
    url: string,
    receiptData: string,
    password: string,
    logger: FastifyBaseLogger
  ): Promise<AppleReceiptVerificationResponse> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'receipt-data': receiptData,
          password,
          'exclude-old-transactions': true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Apple API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as AppleReceiptVerificationResponse;
      logger.info({ status: data.status, environment: data.environment }, '[AppleReceipt] Verification response');
      
      return data;
    } catch (error) {
      logger.error({ error, url }, '[AppleReceipt] Failed to verify receipt');
      throw new Error('Failed to communicate with Apple verification server');
    }
  }

  /**
   * Parse verification response
   */
  private static parseVerificationResponse(
    response: AppleReceiptVerificationResponse,
    logger: FastifyBaseLogger
  ): VerifiedReceipt {
    // Check status code
    // 0 = valid, 21007 = sandbox receipt sent to production (handled above)
    if (response.status !== 0) {
      logger.warn({ status: response.status }, '[AppleReceipt] Invalid receipt status');
      throw new Error(this.getStatusMessage(response.status));
    }

    // Get the latest transaction info (for subscriptions)
    // Note: latest_receipt_info array is NOT sorted by expiration date,
    // so we need to find the transaction with the latest expires_date_ms
    let latestInfo = response.latest_receipt_info?.[0];
    if (response.latest_receipt_info && response.latest_receipt_info.length > 1) {
      // Find the transaction with the latest expiration date
      latestInfo = response.latest_receipt_info.reduce((latest, current) => {
        const latestExpires = parseInt(latest.expires_date_ms || '0');
        const currentExpires = parseInt(current.expires_date_ms || '0');
        return currentExpires > latestExpires ? current : latest;
      });
      logger.info(
        { 
          count: response.latest_receipt_info.length,
          selectedTransactionId: latestInfo.transaction_id,
          selectedExpiresDate: latestInfo.expires_date_ms 
            ? new Date(parseInt(latestInfo.expires_date_ms)).toISOString() 
            : undefined
        },
        '[AppleReceipt] Found multiple transactions, selected one with latest expiration'
      );
    }
    const inAppPurchase = latestInfo || response.receipt.in_app[0];

    if (!inAppPurchase) {
      throw new Error('No purchase information found in receipt');
    }

    const result: VerifiedReceipt = {
      isValid: true,
      productId: inAppPurchase.product_id,
      transactionId: inAppPurchase.transaction_id,
      originalTransactionId: inAppPurchase.original_transaction_id,
      purchaseDate: new Date(parseInt(inAppPurchase.purchase_date_ms)),
      expiresDate: inAppPurchase.expires_date_ms 
        ? new Date(parseInt(inAppPurchase.expires_date_ms))
        : undefined,
      isCancelled: !!inAppPurchase.cancellation_date_ms,
      isTrialPeriod: latestInfo?.is_trial_period === 'true',
      environment: response.environment,
    };

    logger.info({
      productId: result.productId,
      transactionId: result.transactionId,
      originalTransactionId: result.originalTransactionId,
      expiresDate: result.expiresDate,
      isCancelled: result.isCancelled,
      isTrialPeriod: result.isTrialPeriod,
      environment: result.environment,
      purchaseDate: result.purchaseDate,
    }, '[AppleReceipt] Receipt verified successfully');

    return result;
  }

  /**
   * Get human-readable status message
   */
  private static getStatusMessage(status: number): string {
    const messages: Record<number, string> = {
      21000: 'The App Store could not read the JSON object you provided.',
      21002: 'The data in the receipt-data property was malformed or missing.',
      21003: 'The receipt could not be authenticated.',
      21004: 'The shared secret you provided does not match the shared secret on file for your account.',
      21005: 'The receipt server is not currently available.',
      21006: 'This receipt is valid but the subscription has expired.',
      21007: 'This receipt is from the test environment, but it was sent to the production environment for verification.',
      21008: 'This receipt is from the production environment, but it was sent to the test environment for verification.',
      21010: 'This receipt could not be authorized. Treat this the same as if a purchase was never made.',
    };

    return messages[status] || `Unknown status code: ${status}`;
  }

  /**
   * Check if subscription is currently active
   * Note: A cancelled subscription is still active until its expiration date
   */
  static isSubscriptionActive(verifiedReceipt: VerifiedReceipt): boolean {
    if (!verifiedReceipt.expiresDate) {
      // Non-subscription purchase (shouldn't happen for our use case)
      // If cancelled and no expiration date, treat as inactive
      return !verifiedReceipt.isCancelled;
    }

    // Check if subscription hasn't expired yet
    // Even if cancelled, user keeps access until expiration date
    return verifiedReceipt.expiresDate > new Date();
  }

  /**
   * Calculate expiration date based on product ID
   */
  static calculateExpirationDate(productId: string, purchaseDate: Date): Date {
    const isYearly = productId.includes('.yearly');
    const expirationDate = new Date(purchaseDate);
    
    if (isYearly) {
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);
    } else {
      expirationDate.setMonth(expirationDate.getMonth() + 1);
    }
    
    return expirationDate;
  }
}

