import { MembershipTier } from '../services/membershipService.js';

/**
 * Centralized pricing configuration for the application.
 * All payment-related constants should be defined here to avoid hardcoding.
 */

// Product ID definitions
export const PRODUCT_IDS = {
  MONTHLY: 'com.aviateai.premium.monthly.trial',
  YEARLY: 'com.aviateai.premium.yearly',
} as const;

// Price definitions (in USD)
export const PRICES = {
  MONTHLY: 29.99,
  YEARLY: 69.99,
} as const;

// Currency
export const DEFAULT_CURRENCY = 'USD';

// Product ID to MembershipTier mapping (includes legacy IDs for backwards compatibility)
// PRODUCT_IDS.YEARLY === 'com.aviateai.premium.yearly', so do not duplicate
export const PRODUCT_ID_TO_TIER: Record<string, MembershipTier> = {
  [PRODUCT_IDS.MONTHLY]: MembershipTier.PREMIUM,
  [PRODUCT_IDS.YEARLY]: MembershipTier.PREMIUM,
  'com.aviateai.premium.monthly': MembershipTier.PREMIUM,
  'com.aviateai.golden.monthly': MembershipTier.PREMIUM,
  'com.aviateai.golden.yearly': MembershipTier.PREMIUM,
};

// Supported product IDs array (for validation)
export const SUPPORTED_PRODUCT_IDS = Object.values(PRODUCT_IDS);

/**
 * Get price by product ID
 * @param productId - The Apple product ID
 * @returns The price in USD, or undefined if product not found
 */
export function getPriceByProductId(productId: string): number | undefined {
  if (productId === PRODUCT_IDS.MONTHLY) {
    return PRICES.MONTHLY;
  }
  if (productId === PRODUCT_IDS.YEARLY) {
    return PRICES.YEARLY;
  }
  return undefined;
}

/**
 * Get price by billing period
 * @param productId - The Apple product ID
 * @returns The price in USD
 */
export function getPriceByBillingPeriod(productId: string): number {
  const isYearly = productId.includes('.yearly');
  return isYearly ? PRICES.YEARLY : PRICES.MONTHLY;
}

/**
 * Get tier by product ID
 * @param productId - The Apple product ID
 * @returns The membership tier, or undefined if product not found
 */
export function getTierByProductId(productId: string): MembershipTier | undefined {
  return PRODUCT_ID_TO_TIER[productId];
}

/**
 * Check if a product ID is supported
 * @param productId - The Apple product ID
 * @returns true if the product ID is supported
 */
export function isValidProductId(productId: string): boolean {
  return productId in PRODUCT_ID_TO_TIER;
}
