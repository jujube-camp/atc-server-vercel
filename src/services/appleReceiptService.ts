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
  
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 1000;

  /**
   * Check if status code is retryable (Apple internal errors 21100-21199)
   */
  private static isRetryableStatus(status: number): boolean {
    return status >= 21100 && status <= 21199;
  }

  /**
   * Sleep helper for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

    let lastError: Error | null = null;
    let useSandbox = false;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const url = useSandbox ? this.SANDBOX_URL : this.PRODUCTION_URL;
        const response = await this.sendVerificationRequest(
          url,
          receiptData,
          password,
          logger
        );

        // If status is 21007, receipt is from sandbox, switch to sandbox URL and retry
        if (response.status === 21007) {
          logger.info('[AppleReceipt] Receipt is from sandbox, retrying with sandbox URL');
          useSandbox = true;
          continue;
        }

        // If status is 21008, receipt is from production but sent to sandbox (shouldn't happen with our flow)
        if (response.status === 21008) {
          logger.info('[AppleReceipt] Receipt is from production, retrying with production URL');
          useSandbox = false;
          continue;
        }

        // If retryable error (21100-21199), wait and retry
        if (this.isRetryableStatus(response.status)) {
          logger.warn(
            { status: response.status, attempt, maxRetries: this.MAX_RETRIES },
            '[AppleReceipt] Retryable error from Apple, will retry'
          );
          if (attempt < this.MAX_RETRIES) {
            await this.sleep(this.RETRY_DELAY_MS * attempt);
            continue;
          }
          // Last attempt failed with retryable error
          throw new Error(`Apple server temporarily unavailable (status ${response.status}). Please try again.`);
        }

        return this.parseVerificationResponse(response, logger);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.MAX_RETRIES && !lastError.message.includes('Invalid receipt')) {
          logger.warn(
            { error: lastError.message, attempt, maxRetries: this.MAX_RETRIES },
            '[AppleReceipt] Verification attempt failed, retrying'
          );
          await this.sleep(this.RETRY_DELAY_MS * attempt);
        } else {
          throw lastError;
        }
      }
    }

    throw lastError || new Error('Receipt verification failed after retries');
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

    // Helper: pick the transaction with the latest expires_date_ms (for subscriptions)
    const pickLatestByExpiry = <T extends { expires_date_ms?: string }>(
      items: T[]
    ): T | undefined => {
      if (!items?.length) return undefined;
      return items.reduce((latest, current) => {
        const latestExpires = parseInt(latest.expires_date_ms || '0');
        const currentExpires = parseInt(current.expires_date_ms || '0');
        return currentExpires > latestExpires ? current : latest;
      });
    };

    // Prefer latest_receipt_info (current subscription state from Apple); fall back to receipt.in_app
    // Both arrays are NOT sorted by expiration, so we must pick the transaction with latest expires_date_ms
    let latestInfo = response.latest_receipt_info
      ? pickLatestByExpiry(response.latest_receipt_info)
      : undefined;
    if (latestInfo && response.latest_receipt_info && response.latest_receipt_info.length > 1) {
      logger.info(
        {
          count: response.latest_receipt_info.length,
          selectedTransactionId: latestInfo.transaction_id,
          selectedExpiresDate: latestInfo.expires_date_ms
            ? new Date(parseInt(latestInfo.expires_date_ms)).toISOString()
            : undefined,
        },
        '[AppleReceipt] Selected transaction with latest expiration from latest_receipt_info'
      );
    }
    // Fallback: use receipt.in_app but pick latest by expiry (not [0] - that can be an old renewal)
    const inAppFallback = response.receipt?.in_app?.length
      ? pickLatestByExpiry(response.receipt.in_app)
      : undefined;
    const inAppPurchase = latestInfo || inAppFallback;

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

    // Handle 21100-21199 range (internal data access errors)
    if (status >= 21100 && status <= 21199) {
      return `Apple server internal error (${status}). This is temporary - please try again.`;
    }

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

