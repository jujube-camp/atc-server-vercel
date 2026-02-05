import { prisma } from '../utils/prisma.js';
import type { FastifyBaseLogger } from 'fastify';
import { logger as defaultLogger } from '../utils/logger.js';

/**
 * Payment modes for the app
 * - FREEMIUM: Free basic features, pay for premium (current default)
 * - PAYWALL: Force subscription (with trial option) before using app
 */
export type PaymentMode = 'FREEMIUM' | 'PAYWALL';

// Config keys
export const CONFIG_KEYS = {
  PAYMENT_MODE: 'payment_mode',
} as const;

export class AppConfigService {
  /**
   * Get a config value by key
   */
  static async getConfig(
    key: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<string | null> {
    try {
      const config = await prisma.appConfig.findUnique({
        where: { key },
      });
      return config?.value ?? null;
    } catch (error) {
      logger.error({ error, key }, '[AppConfigService] Failed to get config');
      return null;
    }
  }

  /**
   * Set a config value
   */
  static async setConfig(
    key: string,
    value: string,
    description?: string,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<boolean> {
    try {
      await prisma.appConfig.upsert({
        where: { key },
        update: { value, description },
        create: { key, value, description },
      });
      logger.info({ key, value }, '[AppConfigService] Config updated');
      return true;
    } catch (error) {
      logger.error({ error, key, value }, '[AppConfigService] Failed to set config');
      return false;
    }
  }

  /**
   * Get the current payment mode
   * Default: FREEMIUM
   */
  static async getPaymentMode(
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<PaymentMode> {
    const value = await this.getConfig(CONFIG_KEYS.PAYMENT_MODE, logger);

    // Validate and return
    if (value === 'PAYWALL') {
      return 'PAYWALL';
    }
    return 'FREEMIUM'; // Default
  }

  /**
   * Set the payment mode
   */
  static async setPaymentMode(
    mode: PaymentMode,
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<boolean> {
    return this.setConfig(
      CONFIG_KEYS.PAYMENT_MODE,
      mode,
      'Payment mode: FREEMIUM (free basic features, pay for premium) or PAYWALL (force subscription with trial before using app)',
      logger
    );
  }

  /**
   * Check if the app requires subscription before use (PAYWALL mode)
   */
  static async requiresSubscription(
    logger: FastifyBaseLogger = defaultLogger
  ): Promise<boolean> {
    const mode = await this.getPaymentMode(logger);
    return mode === 'PAYWALL';
  }
}
